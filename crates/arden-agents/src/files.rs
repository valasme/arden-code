//! The files of a project, for file mentions in the message box (ADR 0052).
//!
//! Arden Code lists a project's folder itself, so that the list works before the project is
//! trusted and before an agent runs in it. Only names are read, never the files' contents. What
//! `.gitignore` and `.ignore` leave out stays out, and so does the `.git` folder. A listing stops at
//! [`ENTRY_LIMIT`] entries, is kept per folder and is made again when it is asked for and more than
//! [`FRESH_FOR`] old. Nothing watches the folder.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use serde::Serialize;
use specta::Type;

/// How many entries a listing holds at most.
pub const ENTRY_LIMIT: usize = 100_000;
/// How long a listing is used before the folder is listed again.
pub const FRESH_FOR: Duration = Duration::from_secs(10);
/// How many matches a query answers at most, the best first.
pub const MATCH_LIMIT: usize = 15;

/// A file or folder of a project that matches what was typed after `@`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileMatch {
    /// The path relative to the project's folder, with `/` between its parts, and at the end of a
    /// folder's.
    pub path: String,
    pub folder: bool,
}

/// The listings of the projects' folders, kept between queries.
#[derive(Debug)]
pub struct ProjectFiles {
    listings: Mutex<HashMap<PathBuf, Arc<Listing>>>,
    entry_limit: usize,
}

impl Default for ProjectFiles {
    fn default() -> Self {
        Self::new()
    }
}

impl ProjectFiles {
    #[must_use]
    pub fn new() -> Self {
        Self::with_limit(ENTRY_LIMIT)
    }

    /// Listings that stop at `entry_limit` entries.
    #[must_use]
    pub fn with_limit(entry_limit: usize) -> Self {
        Self {
            listings: Mutex::new(HashMap::new()),
            entry_limit,
        }
    }

    /// The files and folders of `folder` that match `query`, at most [`MATCH_LIMIT`], the best
    /// first; for a query that ends with `/`, what is in that folder, its folders first. The
    /// folder is listed when it has no listing yet, or its listing was made more than
    /// [`FRESH_FOR`] before `now`.
    #[must_use]
    pub fn matches(&self, folder: &Path, query: &str, now: Instant) -> Vec<FileMatch> {
        let listing = self.listing(folder, now);
        let query = query.to_lowercase();
        if let Some(inside) = query.strip_suffix('/') {
            return contents(&listing.entries, inside.trim_end_matches('/'));
        }
        let mut found: Vec<(u8, &Entry)> = listing
            .entries
            .iter()
            .filter_map(|entry| rank(entry, &query).map(|rank| (rank, entry)))
            .collect();
        found.sort_by(|(rank, entry), (other_rank, other)| {
            rank.cmp(other_rank)
                .then(entry.depth.cmp(&other.depth))
                .then(entry.path.len().cmp(&other.path.len()))
                .then(entry.path.cmp(&other.path))
        });
        found
            .into_iter()
            .take(MATCH_LIMIT)
            .map(|(_, entry)| entry.shown())
            .collect()
    }

    /// The folder's listing, made again when it is missing or no longer fresh. Listing happens
    /// outside the lock, so that one folder never holds up another.
    fn listing(&self, folder: &Path, now: Instant) -> Arc<Listing> {
        let kept = self
            .listings
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(folder)
            .cloned();
        if let Some(listing) = kept
            && now.saturating_duration_since(listing.made) <= FRESH_FOR
        {
            return listing;
        }
        let listing = Arc::new(Listing {
            made: now,
            entries: list(folder, self.entry_limit),
        });
        self.listings
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(folder.to_path_buf(), Arc::clone(&listing));
        listing
    }
}

/// What a folder held when it was listed.
#[derive(Debug)]
struct Listing {
    made: Instant,
    entries: Vec<Entry>,
}

/// What is directly in the folder `inside` (a path in lower case, empty for the project's own
/// folder), its folders first, then by name.
fn contents(entries: &[Entry], inside: &str) -> Vec<FileMatch> {
    let mut found: Vec<&Entry> = entries
        .iter()
        .filter(|entry| entry.lower[..entry.name_at].trim_end_matches('/') == inside)
        .collect();
    found.sort_by(|entry, other| {
        other
            .folder
            .cmp(&entry.folder)
            .then(entry.lower.cmp(&other.lower))
    });
    found
        .into_iter()
        .take(MATCH_LIMIT)
        .map(Entry::shown)
        .collect()
}

/// A file or folder of a listing.
#[derive(Debug)]
struct Entry {
    /// Its path relative to the project's folder, with `/`.
    path: String,
    /// The same, in lower case, for matching.
    lower: String,
    /// Where its name starts in `lower`.
    name_at: usize,
    /// How many folders down it is.
    depth: usize,
    folder: bool,
}

impl Entry {
    fn shown(&self) -> FileMatch {
        FileMatch {
            path: if self.folder {
                format!("{}/", self.path)
            } else {
                self.path.clone()
            },
            folder: self.folder,
        }
    }
}

/// The files and folders in a folder, without what its ignore rules leave out and without `.git`,
/// at most `limit` of them.
fn list(folder: &Path, limit: usize) -> Vec<Entry> {
    let walk = ignore::WalkBuilder::new(folder)
        .hidden(false)
        .require_git(false)
        .follow_links(false)
        .filter_entry(|entry| entry.file_name() != ".git")
        .build();
    walk.filter_map(Result::ok)
        // The project's own folder is not one of its entries.
        .filter(|entry| entry.depth() > 0)
        .filter_map(|entry| {
            let kind = entry.file_type()?;
            if !kind.is_file() && !kind.is_dir() {
                return None;
            }
            let relative = entry.path().strip_prefix(folder).ok()?;
            let parts: Vec<String> = relative
                .components()
                .map(|part| part.as_os_str().to_string_lossy().into_owned())
                .collect();
            let path = parts.join("/");
            let lower = path.to_lowercase();
            let name_at = lower.rfind('/').map_or(0, |at| at + 1);
            Some(Entry {
                lower,
                path,
                name_at,
                depth: parts.len() - 1,
                folder: kind.is_dir(),
            })
        })
        .take(limit)
        .collect()
}

/// How well a file matches the letters typed, in lower case: 0 is the best, nothing is no match.
/// The start of its name comes first, then whole parts of its path, then the letters within its
/// name, then within its path, then the letters in order anywhere in its path.
fn rank(entry: &Entry, query: &str) -> Option<u8> {
    if query.is_empty() {
        return Some(0);
    }
    let path = entry.lower.as_str();
    let name = &path[entry.name_at..];
    if name.starts_with(query) {
        return Some(0);
    }
    if path.starts_with(query) || path.contains(&format!("/{query}")) {
        return Some(1);
    }
    if name.contains(query) {
        return Some(2);
    }
    if path.contains(query) {
        return Some(3);
    }
    let mut letters = path.chars();
    query
        .chars()
        .all(|wanted| letters.any(|letter| letter == wanted))
        .then_some(4)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    /// A project folder with these files, each path relative to it, with `/`.
    fn project(paths: &[&str]) -> tempfile::TempDir {
        let folder = tempfile::tempdir().expect("a temporary folder");
        for path in paths {
            let file = folder.path().join(path);
            fs::create_dir_all(file.parent().expect("a folder")).expect("its folder");
            fs::write(&file, "").expect("the file");
        }
        folder
    }

    fn paths(matches: &[FileMatch]) -> Vec<&str> {
        matches.iter().map(|found| found.path.as_str()).collect()
    }

    #[test]
    fn lists_the_files_that_match_with_paths_relative_to_the_project() {
        let folder = project(&["GLOSSARY.md", "docs/adr/0052-file-mentions.md", "README.md"]);
        let files = ProjectFiles::new();

        let found = files.matches(folder.path(), "glos", Instant::now());

        assert_eq!(paths(&found), ["GLOSSARY.md"]);
        assert_eq!(
            paths(&files.matches(folder.path(), "0052", Instant::now())),
            ["docs/adr/0052-file-mentions.md"]
        );
    }

    #[test]
    fn leaves_out_what_gitignore_and_ignore_leave_out_and_the_git_folder() {
        let folder = project(&[
            ".gitignore",
            ".ignore",
            ".git/config",
            ".github/workflows/ci.yml",
            "target/debug/app.exe",
            "notes/private.md",
            "src/main.rs",
        ]);
        fs::write(folder.path().join(".gitignore"), "target/\n").expect("the rules");
        fs::write(folder.path().join(".ignore"), "notes/\n").expect("the rules");
        let files = ProjectFiles::new();

        let mut found = paths(&files.matches(folder.path(), "", Instant::now()))
            .into_iter()
            .map(str::to_owned)
            .collect::<Vec<_>>();
        found.sort();

        assert_eq!(
            found,
            [
                ".github/",
                ".github/workflows/",
                ".github/workflows/ci.yml",
                ".gitignore",
                ".ignore",
                "src/",
                "src/main.rs"
            ]
        );
    }

    #[test]
    fn lists_folders_too_marked_as_folders_and_ending_with_a_slash() {
        let folder = project(&["docs/adr/0052.md", "README.md"]);
        let files = ProjectFiles::new();

        let found = files.matches(folder.path(), "adr", Instant::now());

        assert_eq!(
            found,
            [
                FileMatch {
                    path: "docs/adr/".into(),
                    folder: true
                },
                FileMatch {
                    path: "docs/adr/0052.md".into(),
                    folder: false
                },
            ]
        );
    }

    #[test]
    fn a_query_that_ends_with_a_slash_lists_what_is_in_that_folder() {
        let folder = project(&[
            "docs/GLOSSARY.md",
            "docs/adr/0052.md",
            "docs/research/notes.md",
            "src/docs/other.md",
        ]);
        let files = ProjectFiles::new();

        let found = files.matches(folder.path(), "Docs/", Instant::now());

        assert_eq!(
            paths(&found),
            ["docs/adr/", "docs/research/", "docs/GLOSSARY.md"]
        );
    }

    #[test]
    fn answers_at_most_fifteen_matches() {
        let names: Vec<String> = (0..40).map(|at| format!("src/part{at}.rs")).collect();
        let folder = project(&names.iter().map(String::as_str).collect::<Vec<_>>());
        let files = ProjectFiles::new();

        assert_eq!(
            files.matches(folder.path(), "part", Instant::now()).len(),
            MATCH_LIMIT
        );
    }

    #[test]
    fn puts_the_start_of_a_name_first_then_whole_parts_of_the_path_then_letters_in_order() {
        let folder = project(&[
            "docs/catalogue.md",
            "src/features/cat/view.ts",
            "src/catalog.ts",
            "scattered.txt",
            "c/a/t.md",
        ]);
        let files = ProjectFiles::new();

        let found = files.matches(folder.path(), "cat", Instant::now());

        assert_eq!(
            paths(&found),
            [
                "src/catalog.ts",
                "docs/catalogue.md",
                "src/features/cat/",
                "src/features/cat/view.ts",
                "scattered.txt",
                "src/features/",
                "c/a/t.md",
            ]
        );
    }

    #[test]
    fn matches_without_regard_to_case_and_across_folders() {
        let folder = project(&["apps/desktop/src/MessageBox.tsx", "README.md"]);
        let files = ProjectFiles::new();

        assert_eq!(
            paths(&files.matches(folder.path(), "messagebox", Instant::now())),
            ["apps/desktop/src/MessageBox.tsx"]
        );
        assert_eq!(
            paths(&files.matches(folder.path(), "desktop/src/mes", Instant::now())),
            ["apps/desktop/src/MessageBox.tsx"]
        );
    }

    #[test]
    fn stops_listing_at_the_entry_limit() {
        let names: Vec<String> = (0..30).map(|at| format!("file{at:02}.txt")).collect();
        let folder = project(&names.iter().map(String::as_str).collect::<Vec<_>>());
        let files = ProjectFiles::with_limit(10);

        // Every entry of the listing matches an empty query, and there are fewer than 15.
        assert_eq!(files.matches(folder.path(), "", Instant::now()).len(), 10);
    }

    #[test]
    fn lists_the_folder_again_once_its_listing_is_more_than_ten_seconds_old() {
        let folder = project(&["first.md"]);
        let files = ProjectFiles::new();
        let start = Instant::now();
        assert!(files.matches(folder.path(), "second", start).is_empty());
        fs::write(folder.path().join("second.md"), "").expect("a new file");

        let soon = files.matches(folder.path(), "second", start + Duration::from_secs(5));
        let later = files.matches(folder.path(), "second", start + Duration::from_secs(11));

        assert!(soon.is_empty(), "the listing is still fresh");
        assert_eq!(paths(&later), ["second.md"]);
    }

    #[test]
    fn a_folder_that_does_not_exist_has_no_files() {
        let files = ProjectFiles::new();

        assert!(
            files
                .matches(Path::new(r"C:\definitely\not\here"), "", Instant::now())
                .is_empty()
        );
    }
}

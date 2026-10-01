//! Which links from an agent's reply may be opened, and which need the person's say-so.
//!
//! An agent's text can hold any link. Opening one hands it to Windows, and some kinds of link
//! start programs or leak the person's credentials. So a link is opened straight away only when it
//! is a web address; other kinds ask first; and a few kinds are never opened.
//!
//! The UI applies the same rules to draw a link (`linkKind.ts`); `link-cases.json` holds the
//! cases both sides are tested against. Rust decides again when a link is opened, so a page that
//! was tampered with cannot open more than the rules allow.

/// What may be done with a link.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinkKind {
    /// A web address: opened in the default browser.
    Open,
    /// Something Windows would hand to another program: opened only after the person confirms.
    Confirm,
    /// Never opened.
    Blocked,
}

/// How long a link may be. Longer ones are not links a person wrote.
const MAX_LENGTH: usize = 2048;

/// Kinds of link that run script, show content of the page's own, or start Windows' repair and
/// search tools with an attacker's arguments.
const BLOCKED_SCHEMES: &[&str] = &[
    "javascript",
    "vbscript",
    "data",
    "blob",
    "about",
    "view-source",
    "ms-msdt",
    "ms-officecmd",
    "ms-appinstaller",
    "search-ms",
    "search",
];

/// Files that Windows would run, or that run something when opened.
const PROGRAM_EXTENSIONS: &[&str] = &[
    "exe",
    "com",
    "bat",
    "cmd",
    "scr",
    "pif",
    "msi",
    "msp",
    "msix",
    "appx",
    "application",
    "gadget",
    "ps1",
    "psm1",
    "vbs",
    "vbe",
    "js",
    "jse",
    "wsf",
    "wsh",
    "hta",
    "lnk",
    "url",
    "reg",
    "inf",
    "cpl",
    "dll",
    "jar",
];

/// The kind of link, decided from its text alone.
#[must_use]
pub fn classify(link: &str) -> LinkKind {
    let link = link.trim();
    if link.is_empty() || link.len() > MAX_LENGTH || link.chars().any(char::is_control) {
        return LinkKind::Blocked;
    }
    let Some((scheme, rest)) = link.split_once(':') else {
        return LinkKind::Blocked;
    };
    let starts_well = scheme
        .chars()
        .next()
        .is_some_and(|c| c.is_ascii_alphabetic());
    let valid = scheme
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'));
    if !starts_well || !valid {
        return LinkKind::Blocked;
    }
    let scheme = scheme.to_ascii_lowercase();
    if BLOCKED_SCHEMES.contains(&scheme.as_str()) {
        return LinkKind::Blocked;
    }
    match scheme.as_str() {
        "http" | "https" => web_address(rest),
        "file" => file_link(rest),
        _ => LinkKind::Confirm,
    }
}

/// `http:` and `https:` links need `//` and a host.
fn web_address(rest: &str) -> LinkKind {
    let Some(after) = rest.strip_prefix("//") else {
        return LinkKind::Blocked;
    };
    let host = after
        .split(['/', '?', '#'])
        .next()
        .unwrap_or_default()
        .rsplit('@')
        .next()
        .unwrap_or_default();
    if host.is_empty() || host.starts_with(':') {
        LinkKind::Blocked
    } else {
        LinkKind::Open
    }
}

/// A `file:` link to a document on this computer may be opened after asking. A link to another
/// computer (Windows would send the person's credentials to it) or to a program never is.
fn file_link(rest: &str) -> LinkKind {
    let Some(after) = rest.strip_prefix("//") else {
        return LinkKind::Blocked;
    };
    let (host, path) = after.split_once('/').unwrap_or((after, ""));
    if !host.is_empty() && !host.eq_ignore_ascii_case("localhost") {
        return LinkKind::Blocked;
    }
    let path = path.split(['?', '#']).next().unwrap_or_default();
    let name = path.rsplit(['/', '\\']).next().unwrap_or_default();
    let extension = name
        .rsplit_once('.')
        .map(|(_, extension)| extension.trim_end().to_ascii_lowercase());
    match extension {
        Some(extension) if PROGRAM_EXTENSIONS.contains(&extension.as_str()) => LinkKind::Blocked,
        // A folder or a file without an extension: Windows would open it in Explorer, or ask.
        _ => LinkKind::Confirm,
    }
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use super::*;

    #[derive(Deserialize)]
    struct Case {
        link: String,
        kind: String,
    }

    #[test]
    fn every_case_in_the_shared_list_is_classified_as_written() {
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../link-cases.json")).expect("the list of cases");

        assert!(cases.len() > 30, "the list covers many kinds of link");
        for case in cases {
            let kind = match classify(&case.link) {
                LinkKind::Open => "open",
                LinkKind::Confirm => "confirm",
                LinkKind::Blocked => "blocked",
            };
            assert_eq!(kind, case.kind, "{}", case.link);
        }
    }

    #[test]
    fn a_very_long_link_is_blocked() {
        let link = format!("https://example.com/{}", "a".repeat(MAX_LENGTH));

        assert_eq!(classify(&link), LinkKind::Blocked);
    }
}

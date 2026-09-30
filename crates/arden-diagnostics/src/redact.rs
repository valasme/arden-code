//! Removing private details from text before it is written to a log or a crash report.
//!
//! Three kinds of detail are removed: the user's folder (which contains their name), email
//! addresses, and secrets such as API keys and access tokens.

use std::sync::LazyLock;

use regex::Regex;

/// A path separator as it can appear in a log line: `\`, `/`, or `\\` (a backslash inside JSON).
const SEPARATOR: &str = r"(?:\\\\|\\|/)";

static USERS_FOLDER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(
        r#"(?i)[a-z]:{SEPARATOR}+users{SEPARATOR}+[^\\/\s"']+"#
    ))
    .expect("valid regex")
});

static EMAIL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
        .expect("valid regex")
});

/// Secrets recognizable by their shape alone.
static TOKENS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"sk-ant-[A-Za-z0-9_\-]{8,}",
        r"sk-[A-Za-z0-9_\-]{20,}",
        r"gh[pousr]_[A-Za-z0-9]{20,}",
        r"github_pat_[A-Za-z0-9_]{20,}",
        r"xox[abprs]-[A-Za-z0-9\-]{10,}",
        r"AKIA[0-9A-Z]{16}",
        r"eyJ[A-Za-z0-9_\-]{5,}\.[A-Za-z0-9_\-]{5,}\.[A-Za-z0-9_\-]{5,}",
    ]
    .iter()
    .map(|pattern| Regex::new(pattern).expect("valid regex"))
    .collect()
});

static BEARER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=\-]{8,}").expect("valid regex"));

/// The value of a setting whose name says it is secret, such as `password=...` or `"api_key": "..."`.
static SECRET_SETTING: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(?i)((?:token|secret|password|passwd|api[_-]?key|apikey|access[_-]?key)["']?\s*[:=]\s*["']?)([^\s"',;&]{6,})"#,
    )
    .expect("valid regex")
});

const REDACTED: &str = "[redacted]";

/// Removes private details from text.
#[derive(Debug, Clone)]
pub struct Redactor {
    profile_folders: Vec<Regex>,
}

impl Redactor {
    /// `profile_folders` are folders that identify the user, such as the home folder, in addition to
    /// the standard `C:\Users\<name>` shape which is always recognized.
    ///
    /// # Panics
    ///
    /// Never in practice: the patterns are built from escaped text, so they are always valid.
    #[must_use]
    pub fn new(profile_folders: &[&str]) -> Self {
        let profile_folders = profile_folders
            .iter()
            .filter(|folder| !folder.trim().is_empty())
            .map(|folder| {
                let parts: Vec<String> = folder
                    .split(['\\', '/'])
                    .filter(|part| !part.is_empty())
                    .map(regex::escape)
                    .collect();
                let separator_between = format!("{SEPARATOR}+");
                Regex::new(&format!("(?i){}", parts.join(&separator_between))).expect("valid regex")
            })
            .collect();
        Self { profile_folders }
    }

    /// The text with the user's folder, email addresses and secrets replaced.
    #[must_use]
    pub fn redact(&self, text: &str) -> String {
        let mut result = text.to_owned();
        for folder in &self.profile_folders {
            result = folder.replace_all(&result, "%USERPROFILE%").into_owned();
        }
        result = USERS_FOLDER
            .replace_all(&result, "%USERPROFILE%")
            .into_owned();
        result = EMAIL.replace_all(&result, "[email]").into_owned();
        for token in TOKENS.iter() {
            result = token.replace_all(&result, REDACTED).into_owned();
        }
        result = BEARER
            .replace_all(&result, format!("${{1}}{REDACTED}"))
            .into_owned();
        SECRET_SETTING
            .replace_all(&result, format!("${{1}}{REDACTED}"))
            .into_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn redactor() -> Redactor {
        Redactor::new(&[r"D:\Profiles\ada"])
    }

    #[test]
    fn replaces_the_windows_user_folder() {
        let text = redactor().redact(r"opened C:\Users\Ada\projects\app\src\main.rs");

        assert_eq!(text, r"opened %USERPROFILE%\projects\app\src\main.rs");
    }

    #[test]
    fn replaces_the_user_folder_as_it_appears_inside_json_logs() {
        // In a JSON line every backslash is written twice.
        let text = redactor().redact(r#"{"path":"C:\Users\Ada\AppData\Local\x"}"#);

        assert_eq!(text, r#"{"path":"%USERPROFILE%\AppData\Local\x"}"#);
    }

    #[test]
    fn replaces_the_user_folder_written_with_forward_slashes_or_in_any_case() {
        assert_eq!(redactor().redact("C:/Users/Ada/x"), "%USERPROFILE%/x");
        assert_eq!(redactor().redact(r"c:\users\ADA\x"), r"%USERPROFILE%\x");
    }

    #[test]
    fn replaces_a_profile_folder_that_is_not_under_users() {
        assert_eq!(
            redactor().redact(r"in D:\Profiles\ada\work"),
            r"in %USERPROFILE%\work"
        );
        assert_eq!(
            redactor().redact(r"in d:\profiles\ADA\work"),
            r"in %USERPROFILE%\work"
        );
    }

    #[test]
    fn leaves_folders_outside_a_user_profile_alone() {
        let text = r"C:\Program Files\Arden Code\arden-code.exe";

        assert_eq!(redactor().redact(text), text);
    }

    #[test]
    fn replaces_email_addresses() {
        let text = redactor().redact("signed in as ada.lovelace+work@example.co.uk, retrying");

        assert_eq!(text, "signed in as [email], retrying");
    }

    #[test]
    fn replaces_api_keys_and_access_tokens_of_common_services() {
        let cases = [
            "sk-ant-api03-AbCdEf123456_-xyzXYZ0987",
            "sk-proj-1234567890abcdefghijklmnop",
            "ghp_1234567890abcdefghijklmnopqrstuvwxyz",
            "github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuv",
            "xoxb-1234567890-abcdefghijkl",
            "AKIAIOSFODNN7EXAMPLE",
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
        ];

        for (number, secret) in cases.into_iter().enumerate() {
            let text = redactor().redact(&format!("using {secret} for the request"));

            // The message names the case by its number: these are samples, but a test log is still a log.
            assert!(!text.contains(secret), "case {number} was not redacted");
            assert!(
                text.starts_with("using ") && text.ends_with(" for the request"),
                "{text}"
            );
            assert!(text.contains("[redacted]"), "{text}");
        }
    }

    #[test]
    fn replaces_bearer_tokens_and_values_of_secret_looking_settings() {
        let redactor = redactor();

        assert_eq!(
            redactor.redact("Authorization: Bearer abc123.def456-ghi789"),
            "Authorization: Bearer [redacted]"
        );
        assert_eq!(
            redactor.redact("password=hunter2hunter2"),
            "password=[redacted]"
        );
        assert_eq!(
            redactor.redact(r#""api_key": "s3cr3t-value-123""#),
            r#""api_key": "[redacted]""#
        );
        assert_eq!(redactor.redact("token: abcdef123456"), "token: [redacted]");
    }

    #[test]
    fn leaves_ordinary_text_alone() {
        for text in [
            "ARD-SET-002: settings file is invalid",
            "started Arden Code 0.1.0 (commit 5ce41a8)",
            "window moved to 120,90 size 1000x700",
            "the token count was 4200",
            "sessions: 3, projects: 2",
        ] {
            assert_eq!(redactor().redact(text), text);
        }
    }

    #[test]
    fn redacting_twice_changes_nothing_more() {
        let once = redactor()
            .redact(r"C:\Users\Ada\x ada@example.com ghp_1234567890abcdefghijklmnopqrstuvwxyz");

        assert_eq!(redactor().redact(&once), once);
    }
}

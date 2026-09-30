//! Domain types and identity constants shared by every Arden Code crate.

pub mod error;
pub mod paths;
pub mod reset;

use serde::Serialize;
use specta::Type;

/// The product name shown in the window title and in Task Manager.
pub const APP_NAME: &str = "Arden Code";

/// The permanent application identifier. It keys the data folders, notifications and updates,
/// so it must never change.
pub const APP_IDENTIFIER: &str = "io.github.valasme.arden";

/// What the app knows about itself.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    /// The short id of the commit this build was made from, or `unknown`.
    pub commit: String,
    /// The date of that commit as `YYYY-MM-DD`, or `unknown`.
    pub build_date: String,
}

/// Returns the product name and the version this build was compiled from.
#[must_use]
pub fn app_info() -> AppInfo {
    AppInfo {
        name: APP_NAME.to_owned(),
        version: env!("CARGO_PKG_VERSION").to_owned(),
        commit: env!("ARDEN_BUILD_COMMIT").to_owned(),
        build_date: env!("ARDEN_BUILD_DATE").to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_reports_the_product_name() {
        assert_eq!(app_info().name, "Arden Code");
    }

    #[test]
    fn app_info_says_which_commit_and_day_the_build_is_from() {
        let info = app_info();

        // In a checkout these are a commit id and a date; without git they say so.
        assert!(!info.commit.is_empty());
        let date_ok = info.build_date == "unknown"
            || (info.build_date.len() == 10
                && info.build_date.chars().filter(|c| *c == '-').count() == 2);
        assert!(date_ok, "unexpected date {}", info.build_date);
        assert!(
            info.commit == "unknown" || info.commit.chars().all(|c| c.is_ascii_hexdigit()),
            "unexpected commit {}",
            info.commit
        );
    }

    #[test]
    fn app_info_reports_a_semantic_version() {
        let version = app_info().version;
        let parts: Vec<&str> = version.split('.').collect();
        assert_eq!(parts.len(), 3, "expected MAJOR.MINOR.PATCH, got {version}");
        assert!(
            parts.iter().all(|part| part.parse::<u32>().is_ok()),
            "non-numeric part in {version}"
        );
    }
}

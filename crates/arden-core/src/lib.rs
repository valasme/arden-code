//! Domain types and identity constants shared by every Arden Code crate.

pub mod paths;

use serde::Serialize;
use specta::Type;

/// The product name shown in the window title and in Task Manager.
pub const APP_NAME: &str = "Arden Code";

/// The permanent application identifier. It keys the data folders, notifications and updates,
/// so it must never change.
pub const APP_IDENTIFIER: &str = "io.github.valasme.arden";

/// What the app knows about itself.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

/// Returns the product name and the version this build was compiled from.
#[must_use]
pub fn app_info() -> AppInfo {
    AppInfo {
        name: APP_NAME.to_owned(),
        version: env!("CARGO_PKG_VERSION").to_owned(),
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

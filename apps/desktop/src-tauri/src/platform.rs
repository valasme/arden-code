//! The platform the app runs on (ADR 0057): Windows 11 x64 or Linux x64. Each has a crate of its
//! own for what only it does; the rest of the app asks through here.

#[cfg(target_os = "linux")]
pub use arden_linux::{preferences, process};
#[cfg(windows)]
pub use arden_windows::{preferences, process};

/// Where the page finds which platform it runs on. `src/lib/platform.ts` reads the same name; a
/// contract test checks that they agree.
pub const PLATFORM_GLOBAL: &str = "__ARDEN_PLATFORM__";

/// The platform's name, as the page and the About page use it.
#[cfg(windows)]
pub const NAME: &str = "windows";
/// The platform's name, as the page and the About page use it.
#[cfg(target_os = "linux")]
pub const NAME: &str = "linux";

/// The platform as people name it, for the About page and bug reports.
#[cfg(windows)]
pub const SYSTEM_NAME: &str = "Windows";
/// The platform as people name it, for the About page and bug reports.
#[cfg(target_os = "linux")]
pub const SYSTEM_NAME: &str = "Linux";

/// The web engine that draws the window on this platform.
#[cfg(windows)]
pub const WEB_ENGINE_NAME: &str = "WebView2";
/// The web engine that draws the window on this platform.
#[cfg(target_os = "linux")]
pub const WEB_ENGINE_NAME: &str = "WebKitGTK";

/// The version of the system, such as `Windows 11 24H2 (build 26100.1234)` or
/// `Ubuntu 24.04.5 LTS (Linux 6.8.0-45-generic)`.
#[must_use]
pub fn system_version() -> String {
    #[cfg(windows)]
    return arden_windows::preferences::windows_version();
    #[cfg(target_os = "linux")]
    return arden_linux::system::linux_version();
}

/// A script that runs before the page's own code and tells it which platform it runs on.
#[must_use]
pub fn platform_script() -> String {
    format!("window.{PLATFORM_GLOBAL} = \"{NAME}\";")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_page_is_told_the_platform_by_name() {
        assert_eq!(
            platform_script(),
            format!("window.__ARDEN_PLATFORM__ = \"{NAME}\";")
        );
        assert!(["windows", "linux"].contains(&NAME));
    }

    #[test]
    fn the_system_is_named_after_the_platform() {
        assert!(
            system_version().starts_with(SYSTEM_NAME)
                || cfg!(target_os = "linux") && system_version().contains("Linux"),
            "{}",
            system_version()
        );
    }
}

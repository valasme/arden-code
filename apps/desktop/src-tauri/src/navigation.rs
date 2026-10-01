//! Keeps the window on the app's own pages.
//!
//! A link in an agent's reply must never turn the app's window into a browser: the page would be
//! the internet's, with the power of the app's own commands. Links are opened by Windows in the
//! default browser instead (`open_link`). This is the second lock behind the page's own handling.

use tauri::Url;
use tauri::plugin::{Builder, TauriPlugin};

/// Whether the address is one of the app's own pages.
fn is_own_page(url: &Url) -> bool {
    match url.scheme() {
        "tauri" => true,
        "http" | "https" => match url.host_str() {
            Some("tauri.localhost" | "ipc.localhost") => true,
            // The development server, never in a release build.
            Some("localhost") => cfg!(debug_assertions) && url.port() == Some(1420),
            _ => false,
        },
        "about" => url.as_str() == "about:blank",
        _ => false,
    }
}

/// A plugin that refuses every navigation away from the app's own pages.
#[must_use]
pub fn guard() -> TauriPlugin<tauri::Wry> {
    Builder::new("navigation-guard")
        .on_navigation(|_webview, url| {
            let allowed = is_own_page(url);
            if !allowed {
                tracing::warn!(
                    scheme = url.scheme(),
                    "a navigation away from the app was refused"
                );
            }
            allowed
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn own(address: &str) -> bool {
        is_own_page(&Url::parse(address).expect("an address"))
    }

    #[test]
    fn the_apps_own_pages_are_allowed() {
        assert!(own("http://tauri.localhost/"));
        assert!(own("http://tauri.localhost/settings/general"));
        assert!(own("https://tauri.localhost/"));
        assert!(own("tauri://localhost/"));
        assert!(own("about:blank"));
    }

    #[test]
    fn the_development_server_is_allowed_in_a_debug_build_only() {
        assert_eq!(own("http://localhost:1420/"), cfg!(debug_assertions));
        assert!(!own("http://localhost:8080/"));
    }

    #[test]
    fn everything_else_is_refused() {
        assert!(!own("https://example.com/"));
        assert!(!own("http://tauri.localhost.evil.example/"));
        assert!(!own("http://evil.example/tauri.localhost"));
        assert!(!own("file:///C:/Windows/notepad.exe"));
        assert!(!own("javascript:alert(1)"));
        assert!(!own("data:text/html,hi"));
        assert!(!own("about:srcdoc"));
        assert!(!own("mailto:hello@example.com"));
    }
}

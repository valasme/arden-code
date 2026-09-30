//! Contracts between the Rust app crate, its Tauri configuration and the generated UI bindings.

use std::fs;
use std::path::{Path, PathBuf};

fn crate_dir() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
}

fn read_tauri_conf() -> serde_json::Value {
    let text = fs::read_to_string(crate_dir().join("tauri.conf.json"))
        .expect("tauri.conf.json is readable");
    serde_json::from_str(&text).expect("tauri.conf.json is valid JSON")
}

#[test]
fn tauri_config_matches_the_product_identity() {
    let conf = read_tauri_conf();
    assert_eq!(conf["productName"], arden_core::APP_NAME);
    assert_eq!(conf["identifier"], arden_core::APP_IDENTIFIER);
    assert_eq!(conf["mainBinaryName"], "arden-code");
    assert_eq!(conf["app"]["windows"][0]["title"], arden_core::APP_NAME);
}

#[test]
fn tauri_config_uses_the_isolation_pattern() {
    let conf = read_tauri_conf();
    assert_eq!(conf["app"]["security"]["pattern"]["use"], "isolation");
}

#[test]
fn tauri_config_sets_a_strict_content_security_policy() {
    let conf = read_tauri_conf();
    let csp = conf["app"]["security"]["csp"]
        .as_str()
        .expect("csp is a string");
    assert!(csp.contains("default-src 'self'"), "csp: {csp}");
    assert!(!csp.contains("unsafe-eval"), "csp: {csp}");
    assert!(
        !csp.contains("https:"),
        "csp must not allow remote origins: {csp}"
    );
    // Tauri reaches Rust through this local origin on Windows; nothing else may be remote.
    assert!(
        !csp.replace("http://ipc.localhost", "").contains("http:"),
        "csp must not allow remote origins: {csp}"
    );
}

#[test]
fn committed_bindings_match_the_rust_commands() {
    let generated: PathBuf = std::env::temp_dir().join("arden-code-bindings-drift-check.ts");
    arden_desktop_lib::export_bindings(&generated).expect("bindings export");

    let committed = crate_dir().join("../src/ipc/bindings.ts");
    let expected = fs::read_to_string(&generated).expect("generated bindings are readable");
    let actual = fs::read_to_string(&committed)
        .expect("apps/desktop/src/ipc/bindings.ts exists; run `pnpm bindings`");

    assert_eq!(
        actual.replace("\r\n", "\n"),
        expected.replace("\r\n", "\n"),
        "bindings.ts has drifted from the Rust commands; run `pnpm bindings` and commit the result"
    );
}

#[test]
fn committed_defaults_match_the_settings_defaults() {
    let committed = crate_dir().join("../src/ipc/defaults.gen.ts");
    let actual = fs::read_to_string(&committed)
        .expect("apps/desktop/src/ipc/defaults.gen.ts exists; run `pnpm bindings`");

    assert_eq!(
        actual.replace("\r\n", "\n"),
        arden_desktop_lib::defaults_module(),
        "defaults.gen.ts has drifted from the settings defaults; run `pnpm bindings` and commit the result"
    );
}

/// The value of a token in the first rule that starts with `selector`, such as `:root` or `.dark`.
fn token(css: &str, selector: &str, name: &str) -> String {
    let rule = &css[css.find(&format!("{selector} {{")).expect("rule exists")..];
    let rule = &rule[..rule.find("\n}").expect("rule ends")];
    let start = rule.find(&format!("{name}:")).expect("token exists") + name.len() + 1;
    let value = &rule[start
        ..rule[start..]
            .find(';')
            .map(|end| start + end)
            .expect("token ends")];
    value.trim().to_owned()
}

/// A neutral `oklch(L 0 0)` color as 0 to 255 gray, using the standard `OKLab` and `sRGB` formulas.
// The value is clamped to 0..=255 before the cast, so it can neither truncate nor lose a sign.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn neutral_oklch_to_gray(value: &str) -> u8 {
    let inner = value
        .strip_prefix("oklch(")
        .and_then(|v| v.strip_suffix(')'))
        .expect("oklch()");
    let parts: Vec<&str> = inner.split_whitespace().collect();
    assert_eq!(
        &parts[1..],
        ["0", "0"],
        "only neutral colors are supported: {value}"
    );
    let lightness: f64 = parts[0].parse().expect("lightness is a number");
    let linear = lightness.powi(3);
    let encoded = if linear <= 0.003_130_8 {
        12.92 * linear
    } else {
        1.055 * linear.powf(1.0 / 2.4) - 0.055
    };
    (encoded * 255.0).round().clamp(0.0, 255.0) as u8
}

#[test]
fn startup_background_matches_the_theme_background_token() {
    // If these drift apart, the window flashes the wrong color before the UI has drawn.
    let css = fs::read_to_string(crate_dir().join("../src/styles/tokens.css"))
        .expect("tokens.css exists");
    for (dark, selector) in [(false, ":root"), (true, ".dark")] {
        let gray = neutral_oklch_to_gray(&token(&css, selector, "--background"));
        assert_eq!(
            arden_desktop_lib::startup_background(dark),
            (gray, gray, gray, 255),
            "{selector}"
        );
    }
}

#[test]
fn startup_background_is_white_in_light_and_near_black_in_dark() {
    assert_eq!(
        arden_desktop_lib::startup_background(false),
        (255, 255, 255, 255)
    );
    assert_eq!(
        arden_desktop_lib::startup_background(true),
        (10, 10, 10, 255)
    );
}

#[test]
fn the_main_window_starts_hidden_until_the_ui_has_drawn() {
    let conf = read_tauri_conf();
    assert_eq!(conf["app"]["windows"][0]["visible"], false);
}

#[test]
fn the_main_window_draws_its_own_title_bar() {
    let conf = read_tauri_conf();
    assert_eq!(conf["app"]["windows"][0]["decorations"], false);
}

#[test]
fn every_error_code_has_its_words_in_the_ui() {
    use strum::IntoEnumIterator;

    let text = fs::read_to_string(crate_dir().join("../src/i18n/locales/en-US.json"))
        .expect("en-US.json exists");
    let strings: serde_json::Value = serde_json::from_str(&text).expect("en-US.json is JSON");

    for code in arden_core::error::ErrorCode::iter() {
        for part in ["what", "why", "action"] {
            let words = &strings["errors"][code.as_str()][part];
            assert!(
                words.as_str().is_some_and(|words| !words.is_empty()),
                "errors.{}.{part} is missing from en-US.json",
                code.as_str()
            );
        }
    }
}

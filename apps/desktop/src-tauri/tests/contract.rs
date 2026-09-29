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

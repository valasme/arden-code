fn main() {
    // Test and example executables link Tauri too. Windows only starts them when they carry the
    // Common Controls v6 manifest that tauri-build adds to the real binary.
    for target in ["tests", "examples"] {
        println!("cargo:rustc-link-arg-{target}=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg-{target}=/MANIFESTDEPENDENCY:type='win32' \
             name='Microsoft.Windows.Common-Controls' version='6.0.0.0' \
             processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"
        );
    }
    tauri_build::build();
}

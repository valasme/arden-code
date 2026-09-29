//! Regenerates `apps/desktop/src/ipc/bindings.ts` from the Rust commands. Run with `pnpm bindings`.

use std::path::Path;

fn main() {
    let target = Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/ipc/bindings.ts");
    arden_desktop_lib::export_bindings(&target).expect("failed to export bindings");
    println!("wrote {}", target.display());
}

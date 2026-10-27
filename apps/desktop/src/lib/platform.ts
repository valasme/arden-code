/**
 * Where Rust says which platform the page runs on, in a script that runs before the page's own code
 * (`platform_script` in `platform.rs`). Both sides must use the same name; a contract test checks.
 */
export const PLATFORM_GLOBAL = "__ARDEN_PLATFORM__";

/** The platforms Arden Code runs on (ADR 0057). */
export type Platform = "windows" | "linux";

/**
 * The platform the page runs on. The page is one design, and the frame follows the platform (ADR
 * 0060). A page that Rust told nothing, such as in a browser or a component test, is drawn as on
 * Windows.
 */
export function currentPlatform(): Platform {
  return Reflect.get(globalThis, PLATFORM_GLOBAL) === "linux" ? "linux" : "windows";
}

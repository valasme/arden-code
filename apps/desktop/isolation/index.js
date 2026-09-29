// Tauri's isolation pattern: every call from the UI to Rust passes through this hook first.
// Later tickets validate payloads here. For now it lets valid messages through unchanged.
window.__TAURI_ISOLATION_HOOK__ = (payload) => payload;

import type { Settings } from "@/ipc/bindings";

/**
 * The settings to show where there is no Rust to ask, such as a plain browser during development.
 * Inside the app, Rust is the only source of settings and their defaults.
 */
export const defaultSettings: Settings = { version: 1, appearance: { theme: "system" } };

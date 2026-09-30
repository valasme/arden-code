import { isTauri } from "@tauri-apps/api/core";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";

/**
 * The system clipboard. Inside the app it goes through Rust, which needs no permission prompt; in a
 * plain browser during development it falls back to the browser's own clipboard.
 */
export async function writeClipboard(text: string): Promise<void> {
  if (isTauri()) await writeText(text);
  else await navigator.clipboard.writeText(text);
}

export async function readClipboard(): Promise<string> {
  return isTauri() ? readText() : navigator.clipboard.readText();
}

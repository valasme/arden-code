import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Resolves once the browser has drawn a frame with everything currently on the page. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    // The first callback runs just before the frame is drawn; the second runs after it.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

/**
 * The window starts hidden so it never shows a blank or wrong-theme frame. Call this once the theme
 * is applied and the first screen is rendered; it shows the window after that frame is drawn. Rust
 * has usually shown it already, when the page finished loading (`show_when_first_loaded`), and this
 * then does nothing; it shows the window when Rust could not hand the page its first frame.
 */
export async function showWindowWhenPainted(): Promise<void> {
  if (!isTauri()) return;
  await nextPaint();
  await getCurrentWindow().show();
}

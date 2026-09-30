import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** The page's own timeline gets this mark when the window is shown. The start-up measurement reads it. */
export const windowShownMark = "arden:window-shown";

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
 * is applied and the first screen is rendered; it shows the window after that frame is drawn.
 */
export async function showWindowWhenPainted(): Promise<void> {
  if (!isTauri()) return;
  await nextPaint();
  await getCurrentWindow().show();
  performance.mark(windowShownMark);
}

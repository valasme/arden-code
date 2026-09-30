import { isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";

import { commands } from "@/ipc/bindings";
import { showNoticeToast } from "@/lib/errorToasts";

/**
 * Tells the person when the web engine that draws the window stopped and the page was reloaded.
 * Rust reloads the page by itself; the reloaded page asks whether that happened. Draws nothing.
 */
export function WebEngineNotice() {
  useEffect(() => {
    if (!isTauri()) return;
    commands
      .takeWebEngineNotice()
      .then((notice) => {
        if (notice) showNoticeToast(notice);
      })
      .catch(() => {});
  }, []);

  return null;
}

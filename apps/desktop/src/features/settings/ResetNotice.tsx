import { isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";

import { commands } from "@/ipc/bindings";
import { showNoticeToast } from "@/lib/errorToasts";

/**
 * Tells the person when the reset they asked for could not finish. Rust tries it before the window
 * is made, and keeps the settings and the request when something stops it; the page asks once.
 * Draws nothing.
 */
export function ResetNotice() {
  useEffect(() => {
    if (!isTauri()) return;
    commands
      .takeResetNotice()
      .then((notice) => {
        if (notice) showNoticeToast(notice);
      })
      .catch(() => {});
  }, []);

  return null;
}

import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useState } from "react";

import { useTauriListener } from "./useTauriListener";

/** Whether the window is maximized, kept up to date as the user resizes it. */
export function useWindowMaximized(): boolean {
  const [maximized, setMaximized] = useState(false);

  useTauriListener(() => {
    const current = getCurrentWindow();
    const refresh = () => {
      current
        .isMaximized()
        .then(setMaximized)
        .catch(() => {});
    };
    refresh();
    return current.onResized(refresh);
  });

  return maximized;
}

/** Runs an action on the app's window. Outside Tauri, such as in a browser, there is no window. */
function onWindow(action: (window: ReturnType<typeof getCurrentWindow>) => Promise<void>) {
  return isTauri() ? action(getCurrentWindow()) : Promise.resolve();
}

/** The window's own controls, for the buttons in the title bar. */
export const windowControls = {
  minimize: () => onWindow((window) => window.minimize()),
  toggleMaximize: () => onWindow((window) => window.toggleMaximize()),
  close: () => onWindow((window) => window.close()),
};

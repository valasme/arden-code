import { isTauri } from "@tauri-apps/api/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { defaultSettings } from "./features/settings/defaults";
import { commands, type Settings } from "./ipc/bindings";
import { applyTheme } from "./lib/theme";
import { showWindowWhenPainted } from "./lib/window";
import "./styles/global.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("index.html is missing the #root element");
}

// The theme comes from the settings, which are read before the first render, so the first frame the
// user sees is already the right one.
async function readSettings(): Promise<Settings> {
  if (!isTauri()) return defaultSettings;
  try {
    return await commands.getSettings();
  } catch {
    return defaultSettings;
  }
}

const settings = await readSettings();
applyTheme(settings.appearance.theme);
createRoot(container).render(
  <StrictMode>
    <App initialSettings={settings} />
  </StrictMode>,
);
showWindowWhenPainted().catch(() => {
  // If showing fails, the Rust side shows the window after a few seconds anyway.
});

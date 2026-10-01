import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import {
  motionIsReduced,
  paintAppearance,
  paintMotion,
  windowsReducesMotion,
} from "./lib/appearance";
import { readFirstFrame } from "./lib/firstFrame";
import { applyTheme } from "./lib/theme";
import { showWindowWhenPainted } from "./lib/window";
import "./styles/global.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("index.html is missing the #root element");
}

// The appearance comes from the settings, which are known before the first render, so the first
// frame the user sees is already the right one.
const { settings, systemPreferences } = await readFirstFrame();
applyTheme(settings.appearance.theme);
paintAppearance(document.documentElement, settings.appearance, systemPreferences.textScalePercent);
paintMotion(
  document.documentElement,
  motionIsReduced(settings.appearance.reduceMotion, windowsReducesMotion()),
);
createRoot(container).render(
  <StrictMode>
    <App initialSettings={settings} initialSystemPreferences={systemPreferences} />
  </StrictMode>,
);
showWindowWhenPainted().catch(() => {
  // If showing fails, the Rust side shows the window after a few seconds anyway.
});

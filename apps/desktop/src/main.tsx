import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { applyTheme } from "./lib/theme";
import { showWindowWhenPainted } from "./lib/window";
import "./styles/global.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("index.html is missing the #root element");
}

// The theme is on the page before the first render, and the window stays hidden until that frame is
// drawn, so the user never sees a blank or wrong-theme window.
applyTheme("system");
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
showWindowWhenPainted().catch(() => {
  // If showing fails, the Rust side shows the window after a few seconds anyway.
});

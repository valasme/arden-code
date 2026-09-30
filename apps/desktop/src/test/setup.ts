import "@testing-library/jest-dom/vitest";
import "@/i18n";

import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// A slow machine, such as a CI runner, may take a while to draw a page in a real browser.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  clearMocks();
});

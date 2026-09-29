import { defineConfig } from "@playwright/test";

// Screenshot and interaction tests of the design system page, in a plain browser. The Rust side is
// not needed: the page makes no calls to it.
export default defineConfig({
  testDir: "./visual",
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:1420",
    viewport: { width: 1100, height: 900 },
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  webServer: {
    command: "pnpm dev:web",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});

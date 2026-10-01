import { defineConfig } from "@playwright/test";

// The installer tests need the installer that `tauri build` makes, so they are not part of the
// ordinary end-to-end run: see e2e/installer.spec.ts.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "installer.spec.ts",
  workers: 1,
  timeout: 180_000,
  reporter: [["list"]],
});

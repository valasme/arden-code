import { defineConfig } from "@playwright/test";

// These tests drive the real desktop app: see e2e/fixtures.ts.
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  reporter: [["list"]],
});

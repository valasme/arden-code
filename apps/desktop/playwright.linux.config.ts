import { defineConfig } from "@playwright/test";

// These tests drive the real desktop app on Linux, through WebDriver: see e2e-linux/fixtures.ts
// and ADR 0063. They use Playwright as a test runner only; no browser of its own is started.
export default defineConfig({
  testDir: "./e2e-linux",
  retries: 0,
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  maxFailures: process.env["CI"] ? 5 : 0,
  reporter: [["list"]],
});

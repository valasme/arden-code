import { defineConfig } from "@playwright/test";

// These tests drive the real desktop app: see e2e/fixtures.ts.
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  // When the app cannot be started at all, every test would wait for its own timeout: stop early.
  maxFailures: process.env["CI"] ? 5 : 0,
  reporter: [["list"]],
});

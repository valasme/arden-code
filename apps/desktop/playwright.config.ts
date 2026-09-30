import { defineConfig } from "@playwright/test";

// These tests drive the real desktop app: see e2e/fixtures.ts.
export default defineConfig({
  testDir: "./e2e",
  // Needs the installer that tauri build makes: see e2e/installer.spec.ts.
  testIgnore: ["installer.spec.ts"],
  // The real app on a shared machine is now and then slow to start: a failure that does not come
  // back on a second try is reported as flaky, and one that does is a failure.
  retries: process.env["CI"] ? 1 : 0,
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  // When the app cannot be started at all, every test would wait for its own timeout: stop early.
  maxFailures: process.env["CI"] ? 5 : 0,
  reporter: [["list"]],
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Some tests compare rendered images pixel by pixel. That is slow on a CI machine, and slower
    // still when the UI tests run beside them.
    testTimeout: 120_000,
  },
});

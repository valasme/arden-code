import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Some tests compare rendered images pixel by pixel, which is slow on CI machines.
    testTimeout: 30_000,
  },
});

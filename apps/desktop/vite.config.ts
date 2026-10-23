import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// The Tauri CLI starts this dev server and expects it on a fixed port.
const devPort = 1420;
// Vitest runs this config for its own servers too, and sets VITEST when it does.
const underVitest = process.env["VITEST"] !== undefined;

export default defineConfig({
  plugins: [
    // Pages load on demand in the app. In tests they load up front: on demand, the first test to
    // open a page also waits for Vite to compile it, which on a busy CI machine can take longer than
    // the test waits for anything.
    tanstackRouter({ target: "react", autoCodeSplitting: !underVitest }),
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  resolve: { tsconfigPaths: true },
  // Dependencies used by component tests are bundled up front. Discovering them mid-run makes Vite
  // reload the browser, which breaks tests on a cold cache.
  optimizeDeps: {
    include: [
      "@tanstack/react-query",
      "@tanstack/react-router",
      "@tauri-apps/api/core",
      "@tauri-apps/api/mocks",
      "@tauri-apps/api/window",
      "@testing-library/jest-dom/vitest",
      "@testing-library/react",
      "class-variance-authority",
      "cn",
      "i18next",
      "lucide-react",
      "motion/react",
      "motion/react-m",
      "radix-ui",
      "react",
      "react-dom/client",
      "react-resizable-panels",
      "react-i18next",
      "@streamdown/code",
      "sonner",
      "streamdown",
      "zod",
      "zustand",
    ],
  },
  clearScreen: false,
  server: {
    port: devPort,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
    // Vite compiles a module the first time the page asks for it, and finds its imports only then.
    // A page's code loads when it is first opened, so the first new session after `pnpm dev` waited
    // for its modules to compile one level of imports at a time: over a second (#176). The dev
    // server compiles the app's own modules as it starts instead. Tests load pages up front anyway.
    warmup: {
      clientFiles: underVitest
        ? []
        : ["./src/**/*.{ts,tsx}", "!./src/**/*.test.{ts,tsx}", "!./src/test/**"],
    },
  },
  build: { target: "chrome120", sourcemap: true },
  test: {
    globals: true,
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "e2e/**/*.test.ts"],
        },
      },
      {
        // Components run in a real Chromium, the same engine family as WebView2.
        extends: true,
        test: {
          name: "components",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./src/test/setup.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});

import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// The Tauri CLI starts this dev server and expects it on a fixed port.
const devPort = 1420;

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
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
      "axe-core",
      "class-variance-authority",
      "cn",
      "i18next",
      "lucide-react",
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
  server: { port: devPort, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
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
          include: ["src/**/*.test.ts"],
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

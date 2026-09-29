import { defineConfig } from "i18next-cli";

export default defineConfig({
  locales: ["en-US"],
  extract: {
    input: ["src/**/*.{ts,tsx}"],
    ignore: [
      "src/**/*.test.{ts,tsx}",
      "src/test/**",
      "src/ipc/bindings.ts",
      "src/routeTree.gen.ts",
    ],
    output: "src/i18n/locales/{{language}}.json",
    defaultNS: false,
    keySeparator: ".",
  },
  lint: {
    ignore: [
      "src/**/*.test.{ts,tsx}",
      "src/test/**",
      "src/ipc/bindings.ts",
      "src/routeTree.gen.ts",
    ],
  },
});

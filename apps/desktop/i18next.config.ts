import { defineConfig } from "i18next-cli";

// Files that are not user-facing UI text: tests, generated code, and the development-only design
// system page (plan section 6.10), which is never shipped to users.
const ignore = [
  "src/**/*.test.{ts,tsx}",
  "src/test/**",
  "src/dev/**",
  "src/routes/dev/**",
  "src/ipc/bindings.ts",
  "src/routeTree.gen.ts",
  "src/components/ui/**",
];

export default defineConfig({
  locales: ["en-US"],
  extract: {
    input: ["src/**/*.{ts,tsx}"],
    ignore,
    output: "src/i18n/locales/{{language}}.json",
    defaultNS: false,
    keySeparator: ".",
  },
  lint: { ignore },
});

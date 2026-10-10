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
    // Keys built at runtime, such as the title of each settings tab, cannot be found by reading the
    // code, so they are listed here to keep the extractor from deleting them.
    preservePatterns: [
      "agents.*",
      "settings.*",
      "errors.*",
      "commands.*",
      "items.*",
      "sessions.announce.*",
      "sessions.actions.*",
      "settings.agents.names.*",
      "sessions.figures.*",
    ],
  },
  lint: { ignore },
});

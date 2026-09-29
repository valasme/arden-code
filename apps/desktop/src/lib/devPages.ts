/**
 * Whether the development-only pages (the design system and the errors page) can be opened. They
 * are available while developing and in debug builds (`pnpm build:debug`), never in a release.
 */
export const devPagesEnabled =
  import.meta.env.DEV || import.meta.env["VITE_ARDEN_DEV_PAGES"] === "true";

# 0007. TypeScript 7 with Oxlint and oxfmt

- Status: Accepted
- Date: 2026-09-29

## Context

TypeScript 7, the native compiler, reached general availability in July 2026 and type-checks far faster.

- typescript-eslint cannot do type-aware linting on TypeScript 7 until the programmatic API returns in TypeScript 7.1 (beta expected in October 2026).
- Oxlint's type-aware linting became stable in July 2026, covering 59 of typescript-eslint's 61 type-aware rules, and it tracks TypeScript 7.
- oxfmt (beta) aims for Prettier compatibility and sorts Tailwind classes.

## Decision

- **Type-checking:** TypeScript 7.
- **Linting:** Oxlint in type-aware mode, with its typescript, react, react-hooks, jsx-a11y, import, unicorn and vitest rules, plus the React Compiler rules.
- **Formatting:** oxfmt.
- **Not used:** ESLint and Prettier.

## Consequences

- Linting, formatting and type-checking are fast.
- Some ESLint-only plugins would need Oxlint's JavaScript-plugin support, which is in alpha.
- If oxfmt misbehaves, Prettier with its Tailwind plugin is a drop-in fallback.
- Revisit when TypeScript 7.1 ships.

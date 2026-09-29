# 0006. Frontend stack

- Status: Accepted
- Date: 2026-09-29

## Context

The maintainer required TanStack Router, shadcn/ui on Radix, Tailwind CSS and Lucide. In July 2026
shadcn/ui made Base UI its default, but Radix remains fully supported, and every new component ships
for both. The theme uses a corner radius of 0, which is what shadcn's "Lyra" style is designed for.

## Decision

- **Runtime and build:** React 19.3 with React Compiler 1.0; Vite 8 with `@vitejs/plugin-react` 6. The compiler runs through the official `reactCompilerPreset` via `@rolldown/plugin-babel`.
- **TanStack:** Router (file-based, automatic code splitting, Zod-validated search params), Query (data from Rust), Form, Virtual, and Hotkeys (alpha, wrapped by our command registry).
- **State and validation:** Zustand 5 for UI state, chosen because TanStack Store is still pre-1.0; Zod 4 for validation.
- **Components:** shadcn/ui with the **Radix** base and **Lyra** style; Tailwind CSS 4.3; tw-animate-css; Lucide; Sonner.
- **Chat and markdown:** Streamdown and Shiki, and shadcn's chat components with shadcn/typeset.

## Consequences

- The stack matches the maintainer's requirements and current best practice.
- Pre-1.0 pieces sit behind our own abstractions, so they can be swapped.

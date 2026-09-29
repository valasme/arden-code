# 0014. Internationalization and input

- Status: Accepted
- Date: 2026-09-29

## Context

The app launches in English only, but it should be cheap to translate later. Options considered:

- **Lingui 6:** still needs Babel for its macros on Vite 8.
- **Paraglide 2:** reloads the page to switch locale.
- **i18next:** mature, with `i18next-cli` for extraction, typed keys and a lint for hard-coded strings.

The web engine formats dates and numbers by UI language rather than by the Windows regional format.
Users occasionally switch to a non-Latin keyboard layout.

## Decision

- **Library:** i18next with react-i18next and i18next-cli.
- **Language:** English (US) only, in `locales/en-US.json`, bundled.
- **Pseudo-language:** available in development builds only.
- **Formats:** dates and numbers follow the Windows regional format, which Rust reads and passes to `Intl`. General has an override.
- **Layout:** direction-neutral CSS only (start/end instead of left/right).
- **Shortcuts:** they match the typed character first, and fall back to the physical key position when a non-Latin layout is active.
- **Message box:** composition-safe, so Enter never sends while a character is still being composed.

## Consequences

- Adding a language means adding a JSON file and a picker.
- Hard-coded strings fail CI.

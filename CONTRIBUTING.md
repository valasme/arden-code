# Contributing

Arden Code is a personal open-source project in pre-alpha. Issues and ideas are welcome. For anything
larger than a small fix, please open an issue first so we can agree on the approach.

## Read first

- [`docs/PLAN.md`](docs/PLAN.md): what is being built and why
- [`docs/adr/`](docs/adr/README.md): decision records. To change a decision, write a new record that supersedes the old one.
- [`GLOSSARY.md`](GLOSSARY.md): the project's language. Use its terms in code, commits and UI text.

## Set up

Follow [`docs/dev-setup.md`](docs/dev-setup.md). Then:

```powershell
pnpm install
pnpm dev
```

## Before you commit

```powershell
pnpm check
```

runs everything CI runs: formatting, linting, type-checking, tests and the bindings check. Git hooks (installed by
`pnpm install`) format and lint staged files and reject commit messages that aren't
[Conventional Commits](https://www.conventionalcommits.org), for example `feat: add the command palette`.

Also worth knowing:

- **Tests first.** Write a failing test, make it pass, repeat. Test behavior through public interfaces.
- **No hard-coded UI text.** Every string goes through i18next (`apps/desktop/src/i18n/locales/en-US.json`).
- **Generated files are committed and checked.** After changing a Rust command, run `pnpm bindings`.
- **Dependencies.** New packages must be at least two days old (pnpm enforces this). Packages that run install scripts need approval in `pnpm-workspace.yaml`.

## Pull requests

Keep them focused, describe what changed and why, and link the issue. CI must be green.

## License

By contributing you agree that your contribution is licensed under the [MIT license](LICENSE).

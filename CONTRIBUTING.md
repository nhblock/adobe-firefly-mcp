# Contributing to adobe-firefly-mcp

Thanks for your interest in improving `adobe-firefly-mcp`. This guide covers how
to set up the project, the quality bar for changes, and how to submit them.

## Prerequisites

- Node.js `>=20.11`
- npm
- Playwright's Chromium browser (installed via `npm run install:browser`)

## Getting started

```bash
git clone https://github.com/peroxide-dev/adobe-firefly-mcp.git
cd adobe-firefly-mcp
npm install
npm run install:browser   # downloads the Chromium build Playwright uses
npm run build
```

Run the server in watch mode during development:

```bash
npm run dev
```

## Quality bar

Every change must pass the full check suite before it can be merged:

```bash
npm run check
```

This runs, in order:

1. `typecheck` — `tsc --noEmit` (strict mode, no type errors)
2. `lint` — ESLint (including `no-floating-promises`)
3. `format:check` — Prettier
4. `test` — Vitest
5. `build` — `tsc` to `dist/`

CI runs the same command on Node 20 and 22 across Linux, macOS, and Windows.
A pull request will not be merged while CI is red.

To auto-fix formatting: `npm run format`.

## Testing

- Unit tests live in `tests/` and use [Vitest](https://vitest.dev/).
- Browser interactions are mocked; tests do **not** require a real Adobe login
  or make network calls.
- Add or update tests for any behavioral change. New tools and bug fixes should
  ship with coverage.

## Commit conventions

This repository uses [Conventional Commits](https://www.conventionalcommits.org/)
with a scope, matching the existing history:

```
feat(video): add duration option to generation
fix(auth): stop treating the upsell button as an auth marker
docs: document Playwright browser installation
chore(release): bump dependencies
```

Common scopes: `core`, `video`, `auth`, `browser`, `dom`. Keep commits atomic
and self-contained — one logical change per commit.

## Working with the browser automation layer

Adobe can change the Firefly UI at any time. When adding automation:

- Prefer resilient Playwright locators (role/text) over brittle CSS.
- Register new selectors in `src/firefly/selectors.ts` with ordered fallbacks.
- The self-healing engine can recover broken selectors; see the README's
  "Self-Healing Automation" section.
- Use `firefly_dom_inspect` and `firefly_debug_bundle` to diagnose UI changes.

## Submitting a pull request

1. Fork the repository and create a topic branch.
2. Make your change with tests and passing `npm run check`.
3. Open a pull request against `main` using the PR template.
4. Describe what changed, why, and how you verified it.

## Reporting bugs and requesting features

Use the issue templates under **New Issue**. For security issues, follow
[SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).

# Release Checklist

Use this checklist before tagging and publishing a release.

## Pre-flight

- [ ] `main` is up to date and the working tree is clean.
- [ ] `npm run check` passes locally (typecheck, lint, format, test, build).
- [ ] CI is green on all Node versions and platforms.
- [ ] `CHANGELOG.md` has an entry for the release; move items out of
      `[Unreleased]` into the new version section.
- [ ] Version bumped in `package.json` (`npm version <major|minor|patch>`).

## Security

- [ ] No secrets, cookies, `.env`, or `profile/` contents are tracked
      (`git ls-files | grep -Ei 'profile/|\.env$|cookie|secret'` returns
      nothing).
- [ ] `git log --all` history contains no accidentally committed credentials.
- [ ] `.gitignore` still excludes `profile/`, `debug/`, `.env`, and scratch
      files.
- [ ] `npm audit --audit-level=high` reports no high/critical vulnerabilities.

## Packaging

- [ ] `npm pack --dry-run` includes only `dist/`, `README.md`, and `LICENSE`.
- [ ] No source, tests, scratch files, or debug captures appear in the tarball.
- [ ] `package.json` metadata is correct: `name`, `version`, `author`,
      `license`, `repository`, `bugs`, `homepage`, `bin`, `engines`.
- [ ] The `bin` entry (`dist/server.js`) starts with the `#!/usr/bin/env node`
      shebang.

## Documentation

- [ ] `README.md` install and Quick Start steps work from a clean checkout.
- [ ] Playwright Chromium install step is documented.
- [ ] All internal documentation links resolve.
- [ ] `SECURITY.md`, `CONTRIBUTING.md`, and issue/PR templates are present.

## Publish

- [ ] Tag the release: `git tag vX.Y.Z && git push --tags`.
- [ ] `npm publish` (or `npm publish --access public` for the first publish).
- [ ] Create the GitHub release with notes from `PUBLIC_RELEASE_NOTES.md`.
- [ ] Verify the published package installs and runs:
      `npx adobe-firefly-mcp` after `npm run install:browser`.

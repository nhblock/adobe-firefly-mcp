# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `firefly_generate` no longer reports success without generating. A Generate
  click swallowed by the prompt-suggestion popup is detected (no generate
  request and no new results) and retried once; if Firefly still does not
  start, the tool fails with a clear error instead of downloading old results.
- New results are identified by image source and natural size only, so layout
  shifts no longer make the previous run's images look new.
- Each new image is saved once: the tool hovers each result tile and clicks
  only the download control inside it, then drops byte-identical duplicates.
  Previously overlapping download selectors saved one image several times.
- `contentClass` and `style` are no longer typed into the prompt text;
  `contentClass` uses Firefly's content-type buttons. `negativePrompt` is
  ignored with a warning, because Firefly's web UI has no exclusion field and
  "Avoid: …" text in the prompt pulled those subjects into the image.
- The first-run "Start generating images" coachmark (OK button) and the
  prompt-suggestion popup are closed before clicking Generate.
- Image fingerprinting retries when Firefly's URL change destroys the page's
  execution context mid-check.

### Added

- `FIREFLY_GENERATION_START_TIMEOUT_MS` (default `20000`): how long to wait for
  Firefly to start generating after each Generate click.

## [0.1.1] — First public release

### Added

- `firefly_generate_video` — prompt-to-video generation (Veo, Kling, and the
  first-party Firefly Video model) with API-response classification that
  distinguishes accepted jobs from transient, auth, and moderation failures.
- `firefly_verify_environment` — read-only verification of the live Firefly
  page, including authentication and visible account/credit details.
- Shared live browser page reused across all diagnostic tools within a single
  server process.
- Documentation suite: `SECURITY.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`,
  `MCP_TOOLS.md`, `RELEASE_CHECKLIST.md`, `CODE_OF_CONDUCT.md`, and this
  changelog.
- GitHub issue and pull request templates.
- `install:browser` npm script for installing Playwright's Chromium build.
- Complete package metadata (author, repository, bugs, homepage) for npm
  publishing.

### Fixed

- Video download now waits for the media-timeline download button to become
  enabled (~5s) before clicking, and falls back to a shadow-piercing blob fetch
  of the `core-video` source when Firefly emits no Playwright download event.
- Credit-error detection no longer misreads the persistent "Get Credits" upsell
  button as a generation failure.
- Normalized the `bin` path to `dist/server.js` so npm preserves the
  `adobe-firefly-mcp` CLI entry when publishing.

### Changed

- `.gitignore` now excludes local debug captures (which may contain auth
  cookies) and scratch scripts.

## [0.1.0]

Initial (unpublished) release tag. Superseded by 0.1.1, which is the first
version published to npm. MCP server driving Adobe Firefly through a persistent
Playwright browser session, with image generation, variations, expand,
remove-background, DOM inspection, debug bundles, environment validation, and a
self-healing selector engine.

[Unreleased]: https://github.com/peroxide-dev/adobe-firefly-mcp/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/peroxide-dev/adobe-firefly-mcp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/peroxide-dev/adobe-firefly-mcp/releases/tag/v0.1.0

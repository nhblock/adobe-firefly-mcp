# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

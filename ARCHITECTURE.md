# Architecture

`adobe-firefly-mcp` is a [Model Context Protocol](https://modelcontextprotocol.io/)
server that drives the Adobe Firefly web UI through a persistent Playwright
Chromium session. This document explains how the pieces fit together.

## High-level flow

```
MCP client (Claude Code)
        │  stdio (JSON-RPC)
        ▼
   src/server.ts ──────── registers tools, owns lifecycle & shutdown
        │
        ▼
   src/tools/*  ────────── thin MCP tool adapters (schema + result shaping)
        │
        ▼
   src/firefly/* ───────── Firefly automation logic
        │
        ▼
   src/browser.ts ──────── BrowserManager: one persistent context + live page
        │
        ▼
   Playwright Chromium ─── real, authenticated Adobe Firefly session
```

The MCP client speaks JSON-RPC over stdio. **stdout is reserved for the
protocol**; all logging goes to stderr (`src/logger.ts`).

## Process and browser lifecycle

- `src/server.ts` builds the runtime (config, logger, `BrowserManager`),
  registers every tool, and installs idempotent `SIGINT`/`SIGTERM` handlers that
  close the browser context before exit.
- `src/browser.ts` (`BrowserManager`) lazily launches a single
  `launchPersistentContext` and reuses one live `Page` for the whole process.
  `getLivePage()` returns the current page without navigating, so diagnostic
  tools never disturb an in-progress generation.
- The persistent profile (`profile/`) keeps the Adobe session alive across
  restarts, so users sign in only once. See [SECURITY.md](SECURITY.md).

## Layers

### Tool adapters — `src/tools/`

Each MCP tool has a thin adapter that validates input with a Zod schema, calls
into the Firefly layer, and shapes the result. Adapters hold no automation
logic. Examples: `generate.ts`, `generateVideo.ts`, `variations.ts`,
`expand.ts`, `removeBackground.ts`, `status.ts`, `verifyEnvironment.ts`,
`validateEnvironmentTool.ts`, `debugBundleTool.ts`, `domInspect.ts`,
`domWatch.ts`. Shared helpers live in `shared.ts`.

### Firefly automation — `src/firefly/`

- `generate.ts`, `video.ts` — the generation workflows.
- `selectors.ts` — centralized, ordered selector definitions with fallbacks.
- `locatorResolver.ts` — resolves selectors to Playwright locators, with logging
  and self-healing integration.
- `selfHealing.ts` — recovers broken selectors when Adobe changes the UI, with a
  confidence threshold and persistence.
- `generationWait.ts`, `wait.ts` — wait for completion and classify errors
  (success / firefly_error / moderation_error / auth_error / credit_error /
  timeout).
- `authDetector.ts` — determines authentication confidence from the page.
- `download.ts`, `downloads.ts` — result download and file management.
- `domInspect.ts`, `domWatch.ts`, `diagnostics.ts` and the `dom/` subpackage —
  read-only inspection utilities used for debugging automation.

### Utilities — `src/utils/`

`filesystem.ts` (directory/file helpers), `image.ts` (image handling),
`retry.ts` (retry/backoff), `ringBuffer.ts` (bounded console/network capture).

## Resilience strategy

Adobe can change routes, labels, or DOM structure without notice. The server
defends against this in layers:

1. **Resilient locators first** — role/text-based Playwright locators.
2. **Ordered CSS fallbacks** — multiple candidate selectors per element.
3. **Environment overrides** — `FIREFLY_SELECTOR_*` and `FIREFLY_*_URL` let users
   adapt without code changes.
4. **Self-healing** — automatic selector recovery above a confidence threshold.
5. **Explicit error classification** — failures surface as typed errors instead
   of opaque timeouts.

## Configuration

All configuration is environment-driven and optional (`src/config.ts`). See the
Configuration table in the [README](README.md#configuration) for the full list
of variables and defaults.

## Testing

Unit tests (`tests/`, Vitest) mock the browser layer, so they run without a real
Adobe login or network access. See [CONTRIBUTING.md](CONTRIBUTING.md).

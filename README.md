# adobe-firefly-mcp

[![npm version](https://img.shields.io/npm/v/adobe-firefly-mcp.svg)](https://www.npmjs.com/package/adobe-firefly-mcp)
[![npm downloads](https://img.shields.io/npm/dm/adobe-firefly-mcp.svg)](https://www.npmjs.com/package/adobe-firefly-mcp)
[![CI](https://github.com/peroxide-dev/adobe-firefly-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/peroxide-dev/adobe-firefly-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.11-brightgreen.svg)](https://nodejs.org/)

Local MCP server for using Adobe Firefly from Claude Code through Playwright browser automation.

This project is designed for a personal local workflow where you already have access to Adobe Firefly in your browser. It launches a persistent Playwright Chromium profile, lets you sign in manually once, then reuses that profile for future image workflows.

It does not use a private Adobe API, automate login credentials, bypass authentication, or store credentials outside the browser profile.

## Features

- **Image generation** — prompt-to-image with aspect ratio, style, and count.
- **Video generation** — prompt-to-video via Veo, Kling, and the first-party Firefly Video model, with reliable download handling.
- **Image editing** — variations, generative expand/outpaint, and background removal from local images.
- **Persistent Adobe session** — sign in once; the profile is reused across restarts.
- **Resilient automation** — ordered selectors, environment overrides, and a self-healing engine that recovers when Adobe changes the UI.
- **Deep debugging tools** — DOM inspection, real-time mutation watching, and a 26+ file diagnostic bundle.
- **Typed error classification** — auth, moderation, credit, and transient backend errors are reported distinctly instead of as opaque timeouts.

## Quick Start

Install from npm:

```bash
# 1. Install the server
npm install -g adobe-firefly-mcp

# 2. Install the Chromium build Playwright drives (one-time)
npx playwright install chromium
```

Or build from source:

```bash
# 1. Clone and install
git clone https://github.com/peroxide-dev/adobe-firefly-mcp.git
cd adobe-firefly-mcp
npm install

# 2. Install the Chromium build Playwright drives
npm run install:browser

# 3. Build
npm run build
```

Then add the server to your MCP client (see [Claude Code Configuration](#claude-code-configuration)) and complete the one-time [First Run](#first-run) sign-in. Total time: a few minutes.

## Documentation

- [MCP Tools Reference](https://github.com/peroxide-dev/adobe-firefly-mcp/blob/main/MCP_TOOLS.md) — every tool and its parameters
- [Architecture](https://github.com/peroxide-dev/adobe-firefly-mcp/blob/main/ARCHITECTURE.md) — how the server is put together
- [Security Policy](https://github.com/peroxide-dev/adobe-firefly-mcp/blob/main/SECURITY.md) — session storage and safe handling of `profile/`
- [Contributing](https://github.com/peroxide-dev/adobe-firefly-mcp/blob/main/CONTRIBUTING.md) — dev setup and quality bar
- [Changelog](https://github.com/peroxide-dev/adobe-firefly-mcp/blob/main/CHANGELOG.md) — release history

## Tools

`adobe-firefly-mcp` exposes these MCP tools:

- `firefly_generate` - prompt-to-image generation.
- `firefly_generate_video` - prompt-to-video generation.
- `firefly_variations` - upload a local image and ask Firefly for variations.
- `firefly_expand` - upload a local image and run Firefly's expand/outpaint workflow.
- `firefly_remove_background` - upload a local image and run Firefly's remove-background workflow.
- `firefly_status` - open/check the persistent browser profile, auth state, paths, and optional screenshot.
- `firefly_verify_environment` - read-only verification of the current live Firefly page, including authentication and visible account/credit details.
- `firefly_dom_inspect` - inspect the current DOM state for debugging automation issues.
- `firefly_dom_watch` - watch for DOM mutations in real-time.
- `firefly_debug_bundle` - capture comprehensive debug bundle with 26+ diagnostic files.
- `firefly_validate_environment` - check environment readiness and auto-fix common issues.

Generated files are saved locally and returned as absolute file paths.

## Install

Published on npm as [`adobe-firefly-mcp`](https://www.npmjs.com/package/adobe-firefly-mcp).

Global install (recommended):

```bash
npm install -g adobe-firefly-mcp
npx playwright install chromium   # one-time browser download
```

Run without installing:

```bash
npx adobe-firefly-mcp
```

From source:

```bash
npm install
npm run install:browser   # downloads the Chromium build Playwright drives
npm run build
```

> **Chromium is required.** By default the server drives Playwright's bundled
> Chromium, which is not downloaded automatically. Run `npm run install:browser`
> (from source) or `npx playwright install chromium` (global install) once. If
> you prefer to reuse your installed Google Chrome and its existing profile, set
> `FIREFLY_USE_PERSISTENT_PROFILE=true` and `FIREFLY_USER_DATA_DIR` instead — see
> [Configuration](#configuration).

## Claude Code Configuration

From a source checkout:

```json
{
  "mcpServers": {
    "adobe-firefly-mcp": {
      "command": "node",
      "args": ["./dist/server.js"],
      "cwd": "/absolute/path/to/adobe-firefly-mcp"
    }
  }
}
```

From a global install:

```json
{
  "mcpServers": {
    "adobe-firefly-mcp": {
      "command": "adobe-firefly-mcp",
      "env": {
        "FIREFLY_MCP_DATA_DIR": "/absolute/path/to/.adobe-firefly-mcp"
      }
    }
  }
}
```

On Windows, use escaped backslashes or forward slashes in JSON paths:

```json
"FIREFLY_MCP_DATA_DIR": "C:/Users/you/.adobe-firefly-mcp"
```

## First Run

1. Start Claude Code with the MCP server configured.
2. Run `firefly_status` with `openBrowser: true`.
3. A Chromium window opens at Adobe Firefly.
4. Sign in manually with your Adobe account.
5. Run `firefly_status` again. The same profile in `profile/` will be reused.

`firefly_status`, `firefly_verify_environment`, `firefly_validate_environment`,
`firefly_debug_bundle`, and the generation tools share the same in-memory
`BrowserManager`, `BrowserContext`, and live `Page` for the lifetime of one MCP
server process. The diagnostic tools do not navigate an already-open page.

The default browser mode is headed (`FIREFLY_HEADLESS=false`) because the first sign-in must be done by you.

## Example Tool Call

### Image Generation

```json
{
  "prompt": "A cinematic product photo of a translucent blue mechanical keyboard on a polished steel desk",
  "aspectRatio": "16:9",
  "style": "Photo",
  "count": 4
}
```

### Video Generation

```json
{
  "prompt": "A timelapse of clouds moving over a mountain landscape at golden hour",
  "aspectRatio": "Widescreen (16:9)",
  "resolution": "720p",
  "duration": "8 seconds",
  "model": "Veo 3.1 Fast"
}
```

Example Claude prompts for video generation:

- "Generate a video of a cat playing with a ball of yarn in slow motion"
- "Create a 1080p video of ocean waves crashing on a rocky shore at sunset"
- "Make a widescreen video of a busy city street at night with neon lights reflecting in puddles"
- "Generate a short video of steam rising from a freshly brewed cup of coffee"

### DOM Inspection (Developer Tool)

The `firefly_dom_inspect` tool is a read-only debugging utility for diagnosing broken automation. It never navigates, clicks, or modifies the page.

#### Modes

**Full mode** (default) - Returns everything:

```json
{
  "mode": "full"
}
```

**Selector mode** - Inspect specific elements:

```json
{
  "mode": "selector",
  "selector": "[data-testid='generate-button']"
}
```

**Shadow DOM mode** - Inspect Adobe Spectrum components:

```json
{
  "mode": "shadow",
  "maxDepth": 8
}
```

**Accessibility mode** - Return accessibility tree:

```json
{
  "mode": "accessibility"
}
```

**Tree mode** - Visual DOM tree:

```json
{
  "mode": "tree",
  "maxDepth": 10
}
```

#### Output Includes

- Page info (URL, title, browser version, viewport, frameworks detected)
- Discovered selectors with Playwright locator suggestions
- Selector uniqueness (how many elements each selector matches)
- XPath alongside CSS and Playwright locators
- Shadow DOM traversal for Adobe Spectrum components
- Console messages (captured via listeners in MCP process)
- Network requests with duration
- Performance metrics (Navigation Timing, LCP, FCP)
- Screenshots (standard + annotated with numbered labels)
- HTML snapshots
- Element screenshots (optional)

#### Example: Diagnose Broken Automation

When Adobe changes the UI and your automation breaks:

```json
{
  "mode": "full",
  "includeScreenshot": true,
  "captureElementScreenshots": true
}
```

This returns:

- All discovered buttons/inputs with their selectors
- Which selectors are unique (matches: 1) vs shared (matches: 14)
- Playwright locator recommendations ranked by stability
- Screenshots showing exactly what's on screen

### DOM Watch (Real-time Monitoring)

The `firefly_dom_watch` tool uses MutationObserver to report exactly when elements appear, disappear, or attributes change.

```json
{
  "timeoutMs": 60000,
  "targetSelector": "[data-testid='generate-container']",
  "mutations": ["childList", "attributes"]
}
```

Returns:

```json
{
  "mutations": [
    {
      "timestamp": "2026-07-06T12:34:56.789Z",
      "type": "childList",
      "action": "added",
      "targetSelector": "[data-testid='generate-button']",
      "addedNodes": ["Generate"],
      "removedNodes": []
    }
  ],
  "summary": {
    "totalMutations": 5,
    "addedNodes": 3,
    "removedNodes": 1,
    "attributeChanges": 1
  }
}
```

Example use cases:

- "Watch for the Generate button to appear after page load"
- "Monitor when the spinner disappears and results show"
- "Track when the download button becomes enabled"

### Debug Bundle (Comprehensive Diagnostics)

The `firefly_debug_bundle` tool captures a complete diagnostic snapshot with 26+ files. This is a read-only tool that never clicks Generate, uploads files, modifies settings, changes prompts, or navigates away.

```json
{}
```

Optional: Specify a URL to navigate to first:

```json
{
  "url": "https://firefly.adobe.com/generate/video"
}
```

#### Output Files

The tool creates a timestamped directory at `debug/bundles/YYYY-MM-DDTHH-MM-SS/` with:

| File                     | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `page.json`              | URL, title, browser version, frameworks detected     |
| `browser.json`           | Browser status and config                            |
| `dom.json`               | DOM tree, shadow DOM count, iframes, forms, dialogs  |
| `accessibility.json`     | Accessibility tree snapshot                          |
| `performance.json`       | Navigation Timing, LCP, FCP, memory usage            |
| `console.json`           | Console messages (last 500)                          |
| `network.json`           | Network requests with timing (last 500)              |
| `cookies.json`           | All browser cookies                                  |
| `storage.json`           | localStorage and sessionStorage keys                 |
| `framework.json`         | Detected frameworks (React, Vue, Angular, etc.)      |
| `selectors.json`         | Discovered elements with bounding boxes              |
| `locators.json`          | Selector validation results (exists/visible/enabled) |
| `forms.json`             | Form elements and validation state                   |
| `dialogs.json`           | Modal dialogs and alerts                             |
| `shadow-dom.json`        | Shadow DOM tree traversal                            |
| `iframes.json`           | Iframe inspection                                    |
| `permissions.json`       | Browser permissions state                            |
| `fingerprint.json`       | Browser fingerprint (user agent, WebGL, etc.)        |
| `service-workers.json`   | Registered service workers                           |
| `indexeddb.json`         | IndexedDB databases                                  |
| `localstorage.json`      | localStorage contents                                |
| `sessionstorage.json`    | sessionStorage contents                              |
| `automation-health.json` | Automation detection indicators (webdriver, etc.)    |
| `authentication.json`    | Auth state, Adobe cookies, token expiry              |
| `selector-report.md`     | Human-readable selector validation report            |
| `automation-health.md`   | Human-readable automation health report              |
| `summary.md`             | Overall diagnostic summary with confidence level     |
| `screenshot.png`         | Full-page screenshot                                 |
| `page.html`              | Complete HTML snapshot                               |

#### Use Cases

- "Run a full diagnostic on the current page"
- "Check if automation is being detected"
- "Validate all selectors are still working"
- "Get a snapshot before something breaks"
- "Compare browser fingerprints between sessions"

### Validate Environment

`firefly_validate_environment` checks your environment readiness and optionally auto-fixes common issues:

```json
{
  "autoFix": true
}
```

#### Checks Performed

- **Authentication**: Verifies Adobe session cookies are present and valid
- **Selectors**: Validates all critical UI selectors still work
- **Browser**: Confirms browser is available and launchable
- **Cookies**: Checks cookie file integrity and expiration
- **Storage**: Verifies storage directory exists and is writable
- **Credits**: Attempts to detect Adobe credit/quota status
- **Automation health**: Tests prompt input and download button availability

#### Response

```json
{
  "ok": true,
  "readinessScore": 85,
  "issues": [
    {
      "severity": "warning",
      "category": "auth",
      "message": "Adobe session cookie expired",
      "autoFixed": false
    }
  ],
  "autoFixes": [],
  "recommendations": ["Re-authenticate with Adobe Firefly"]
}
```

Readiness score ranges from 0 (completely broken) to 100 (fully operational).

Successful tool calls return JSON like:

```json
{
  "ok": true,
  "operation": "firefly_generate",
  "files": [
    {
      "path": "/absolute/path/to/downloads/firefly-example.png",
      "source": "download"
    }
  ],
  "pageUrl": "https://firefly.adobe.com/...",
  "warnings": []
}
```

## Configuration

All configuration is optional.

| Environment variable                  | Default                          | Purpose                                                                |
| ------------------------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| `FIREFLY_MCP_DATA_DIR`                | current working directory        | Base directory for `downloads/` and `profile/`.                        |
| `FIREFLY_DOWNLOADS_DIR`               | `<dataDir>/downloads`            | Saved image output directory.                                          |
| `FIREFLY_PROFILE_DIR`                 | `<dataDir>/profile`              | Persistent Chromium user data directory.                               |
| `FIREFLY_HEADLESS`                    | `false`                          | Run Chromium headless after you have already signed in.                |
| `FIREFLY_IMAGE_MODEL`                 | `Firefly Image 4`                | Image model to select. Firefly Image 4 uses no credits.                |
| `FIREFLY_LOG_LEVEL`                   | `info`                           | `debug`, `info`, `warn`, `error`, or `silent`. Logs go to stderr only. |
| `FIREFLY_MAX_DOWNLOADS`               | `4`                              | Default maximum generated images to save.                              |
| `FIREFLY_OPERATION_TIMEOUT_MS`        | `180000`                         | General UI action timeout.                                             |
| `FIREFLY_GENERATION_TIMEOUT_MS`       | `300000`                         | Generation wait timeout.                                               |
| `FIREFLY_GENERATION_START_TIMEOUT_MS` | `20000`                          | Wait for Firefly to start generating after each Generate click.        |
| `FIREFLY_NAVIGATION_TIMEOUT_MS`       | `60000`                          | Page navigation timeout.                                               |
| `FIREFLY_BASE_URL`                    | `https://firefly.adobe.com`      | Base Firefly URL.                                                      |
| `FIREFLY_TEXT_TO_IMAGE_URL`           | `<base>/generate/image`          | Prompt-to-image route (multi-model page).                              |
| `FIREFLY_VARIATIONS_URL`              | `<base>`                         | Variations route.                                                      |
| `FIREFLY_EXPAND_URL`                  | `<base>/tools/generative-expand` | Expand route.                                                          |
| `FIREFLY_REMOVE_BACKGROUND_URL`       | `<base>/tools/remove-background` | Remove-background route.                                               |
| `FIREFLY_VIDEO_URL`                   | `<base>/generate/video`          | Video generation route.                                                |
| `FIREFLY_SELECTOR_PROMPT_INPUT`       | built-in candidates              | CSS selector override for the prompt input.                            |
| `FIREFLY_SELECTOR_GENERATE_BUTTON`    | built-in candidates              | CSS selector override for the generate/action button.                  |
| `FIREFLY_SELECTOR_DOWNLOAD_BUTTON`    | built-in candidates              | CSS selector override for download buttons.                            |
| `FIREFLY_SELECTOR_UPLOAD_BUTTON`      | built-in candidates              | CSS selector override for upload controls.                             |
| `FIREFLY_USE_PERSISTENT_PROFILE`      | `false`                          | Use real Chrome with user's existing profile instead of Chromium.      |
| `FIREFLY_USER_DATA_DIR`               | undefined                        | Path to Chrome user data directory (required when using persistent).   |
| `FIREFLY_SELF_HEALING_ENABLED`        | `true`                           | Enable automatic selector recovery.                                    |
| `FIREFLY_SELF_HEALING_THRESHOLD`      | `0.7`                            | Minimum confidence score (0-1) to accept recovered selector.           |

Adobe can change the Firefly UI at any time. The server uses resilient Playwright locators first, then CSS selector overrides when needed. Self-healing automatically recovers when selectors break.

## Development

```bash
npm install
npm run dev
npm run check
```

Useful scripts:

- `npm run build` - compile TypeScript to `dist/`.
- `npm run lint` - run ESLint.
- `npm run format` - apply Prettier.
- `npm run test` - run Vitest unit tests.
- `npm run check` - typecheck, lint, format-check, test, and build.

## Security Model

- Uses `chromium.launchPersistentContext()` with a dedicated local profile.
- Never asks for Adobe credentials.
- Never fills login forms.
- Never stores credentials in config, logs, env vars, or project files.
- Reuses whatever Adobe session exists in the Playwright profile.
- Writes MCP protocol messages to stdout and logs only to stderr.

Keep `profile/` private. It may contain browser cookies/session storage after you sign in.

## Architecture

The server uses a modular architecture with centralized selectors, reusable utilities, and automatic diagnostics:

### Core Modules

- **`src/firefly/selectors.ts`** - Centralized selector candidates for image, video, and shared UI elements
- **`src/firefly/locatorResolver.ts`** - Reusable `resolveLocator()` with timeout, scroll, retry, and debug logging
- **`src/firefly/selfHealing.ts`** - Self-healing engine with confidence scoring and selector recovery
- **`src/firefly/diagnostics.ts`** - Automatic screenshot/HTML capture on failures
- **`src/firefly/generationWait.ts`** - Generation completion monitoring with explicit error detection
- **`src/firefly/downloads.ts`** - Robust download handling with `downloadMode: "first"|"all"`

### Self-Healing Automation

The server includes a self-healing selector recovery system that automatically recovers when Adobe changes their UI, without requiring code changes:

#### Recovery Chain

1. **Primary selector** - Try the first selector candidate (fastest, most specific)
2. **Remaining candidates** - Try other predefined selector candidates
3. **DOM inspector discovery** - If all candidates fail, discover elements by role, name, and text
4. **Confidence scoring** - Each discovered element is scored based on match quality
5. **Fail safely** - If no match exceeds confidence threshold (default 0.7), report failure

#### Confidence Scoring

Each selector candidate is scored based on its kind and match quality:

| Selector Kind          | Base Score |
| ---------------------- | ---------- |
| `testId` (data-testid) | 100        |
| `ariaLabel`            | 90         |
| `role`                 | 85         |
| `placeholder`          | 80         |
| `label`                | 80         |
| `text`                 | 70         |
| `tag`                  | 40         |
| `css` (dynamic/hashed) | 10         |

Bonuses: visibility (+10), enabled (+5), unique match (+40).

#### Usage

Self-healing is integrated into `locatorResolver.ts`. When you call `resolveLocator()`, it automatically:

1. Tries the primary selector candidate
2. Falls back to other candidates if primary fails
3. Uses self-healing engine if all candidates fail
4. Returns `healed: true` and `confidence: number` when recovery succeeds
5. Persists recovered selectors to `debug/recovered-selectors.json`

```typescript
const result = await resolveLocator(page, candidates, "Generate button", 3000);
if (result.healed) {
  console.log(`Healed with confidence: ${result.confidence}`);
}
```

#### Configuration

```typescript
const config: AppConfig = {
  selfHealing: {
    enabled: true,
    confidenceThreshold: 0.7, // 0-1, minimum confidence to accept
    maxRecoveryAttempts: 3,
    persistencePath: "debug/recovered-selectors.json",
  },
};
```

### Error Detection

The video generation tool explicitly detects Firefly errors instead of treating them as timeouts:

| Status             | Description                                               |
| ------------------ | --------------------------------------------------------- |
| `success`          | Generation completed and download button is enabled       |
| `firefly_error`    | "Something went wrong", "Try again", "Server error", etc. |
| `moderation_error` | Content policy violations                                 |
| `auth_error`       | Session expired, sign-in required                         |
| `credit_error`     | No credits/quota remaining                                |
| `timeout`          | No success or error detected within timeout               |

### Debugging Workflow

When automation fails:

1. Run `firefly_debug_bundle` to capture a comprehensive diagnostic snapshot
2. Run `firefly_status` to check auth state and take a screenshot
3. Run `firefly_dom_inspect` with `mode: "full"` to see all selectors and page state
4. Use `firefly_dom_watch` to monitor real-time DOM changes
5. Check tool output for structured error diagnostics

The debug bundle provides the most complete picture with 26+ diagnostic files, selector validation, automation health checks, and auth diagnostics.

## Troubleshooting

**"Executable doesn't exist" / browser fails to launch.**
Playwright's Chromium isn't installed. Run `npm run install:browser` (from
source) or `npx playwright install chromium` (global install).

**A Chromium window never opens on first run.**
The default mode is headed so you can sign in. Ensure `FIREFLY_HEADLESS` is not
set to `true`, then run `firefly_status` with `openBrowser: true`.

**Tools report `auth_error` or I'm asked to sign in repeatedly.**
Your Adobe session expired or the profile wasn't reused. Run `firefly_status`
with `openBrowser: true`, sign in again, and confirm the `profile/` path in the
output matches across runs. Do not delete `profile/` between runs.

**Generation returns `credit_error`.**
Your Adobe plan is out of Firefly credits/quota. This is an account state, not a
bug.

**Automation broke after an Adobe UI change.**
Adobe changed routes, labels, or structure. Run `firefly_debug_bundle` and
`firefly_dom_inspect` to find new selectors, then set the relevant
`FIREFLY_SELECTOR_*` or `FIREFLY_*_URL` overrides. The self-healing engine will
also attempt automatic recovery.

**Browser won't start: profile is locked.**
Another instance is using the profile, or a previous run didn't exit cleanly.
Close other Chromium instances using `profile/` and retry.

**Nothing appears in the MCP client / protocol errors.**
Logs go to **stderr**, never stdout (stdout is reserved for the MCP protocol).
Check stderr and set `FIREFLY_LOG_LEVEL=debug` for more detail.

## Limitations

This is browser automation over a consumer web UI, not an official Adobe API. It can break when Adobe changes routes, labels, or page structure. Use `firefly_status` and selector/URL environment overrides to diagnose and adapt.

You are responsible for using Adobe Firefly in accordance with your Adobe plan and applicable terms.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and
the quality bar, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). For security
issues, follow [SECURITY.md](SECURITY.md) rather than opening a public issue.

## License

[MIT](LICENSE) © Anik

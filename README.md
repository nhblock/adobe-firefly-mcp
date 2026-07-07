# adobe-firefly-mcp

Local MCP server for using Adobe Firefly from Claude Code through Playwright browser automation.

This project is designed for a personal local workflow where you already have access to Adobe Firefly in your browser. It launches a persistent Playwright Chromium profile, lets you sign in manually once, then reuses that profile for future image workflows.

It does not use a private Adobe API, automate login credentials, bypass authentication, or store credentials outside the browser profile.

## Tools

`adobe-firefly-mcp` exposes these MCP tools:

- `firefly_generate` - prompt-to-image generation.
- `firefly_generate_video` - prompt-to-video generation.
- `firefly_variations` - upload a local image and ask Firefly for variations.
- `firefly_expand` - upload a local image and run Firefly's expand/outpaint workflow.
- `firefly_remove_background` - upload a local image and run Firefly's remove-background workflow.
- `firefly_status` - open/check the persistent browser profile, auth state, paths, and optional screenshot.
- `firefly_dom_inspect` - inspect the current DOM state for debugging automation issues.
- `firefly_dom_watch` - watch for DOM mutations in real-time.
- `firefly_debug_bundle` - capture comprehensive debug bundle with 26+ diagnostic files.

Generated files are saved locally and returned as absolute file paths.

## Install

From source:

```bash
npm install
npm run build
```

When published to npm:

```bash
npm install -g adobe-firefly-mcp
```

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

| Environment variable               | Default                          | Purpose                                                                |
| ---------------------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| `FIREFLY_MCP_DATA_DIR`             | current working directory        | Base directory for `downloads/` and `profile/`.                        |
| `FIREFLY_DOWNLOADS_DIR`            | `<dataDir>/downloads`            | Saved image output directory.                                          |
| `FIREFLY_PROFILE_DIR`              | `<dataDir>/profile`              | Persistent Chromium user data directory.                               |
| `FIREFLY_HEADLESS`                 | `false`                          | Run Chromium headless after you have already signed in.                |
| `FIREFLY_LOG_LEVEL`                | `info`                           | `debug`, `info`, `warn`, `error`, or `silent`. Logs go to stderr only. |
| `FIREFLY_MAX_DOWNLOADS`            | `4`                              | Default maximum generated images to save.                              |
| `FIREFLY_OPERATION_TIMEOUT_MS`     | `180000`                         | General UI action timeout.                                             |
| `FIREFLY_GENERATION_TIMEOUT_MS`    | `300000`                         | Generation wait timeout.                                               |
| `FIREFLY_NAVIGATION_TIMEOUT_MS`    | `60000`                          | Page navigation timeout.                                               |
| `FIREFLY_BASE_URL`                 | `https://firefly.adobe.com`      | Base Firefly URL.                                                      |
| `FIREFLY_TEXT_TO_IMAGE_URL`        | `<base>/generate/images`         | Prompt-to-image route.                                                 |
| `FIREFLY_VARIATIONS_URL`           | `<base>`                         | Variations route.                                                      |
| `FIREFLY_EXPAND_URL`               | `<base>/tools/generative-expand` | Expand route.                                                          |
| `FIREFLY_REMOVE_BACKGROUND_URL`    | `<base>/tools/remove-background` | Remove-background route.                                               |
| `FIREFLY_VIDEO_URL`                | `<base>/generate/video`          | Video generation route.                                                |
| `FIREFLY_SELECTOR_PROMPT_INPUT`    | built-in candidates              | CSS selector override for the prompt input.                            |
| `FIREFLY_SELECTOR_GENERATE_BUTTON` | built-in candidates              | CSS selector override for the generate/action button.                  |
| `FIREFLY_SELECTOR_DOWNLOAD_BUTTON` | built-in candidates              | CSS selector override for download buttons.                            |
| `FIREFLY_SELECTOR_UPLOAD_BUTTON`   | built-in candidates              | CSS selector override for upload controls.                             |
| `FIREFLY_USE_PERSISTENT_PROFILE`   | `false`                          | Use real Chrome with user's existing profile instead of Chromium.      |
| `FIREFLY_USER_DATA_DIR`            | undefined                        | Path to Chrome user data directory (required when using persistent).   |

Adobe can change the Firefly UI at any time. The server uses resilient Playwright locators first, then CSS selector overrides when needed.

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
- **`src/firefly/diagnostics.ts`** - Automatic screenshot/HTML capture on failures
- **`src/firefly/generationWait.ts`** - Generation completion monitoring with explicit error detection
- **`src/firefly/downloads.ts`** - Robust download handling with `downloadMode: "first"|"all"`

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

## Limitations

This is browser automation over a consumer web UI, not an official Adobe API. It can break when Adobe changes routes, labels, or page structure. Use `firefly_status` and selector/URL environment overrides to diagnose and adapt.

You are responsible for using Adobe Firefly in accordance with your Adobe plan and applicable terms.

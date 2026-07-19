# MCP Tools Reference

`adobe-firefly-mcp` exposes the following MCP tools. All generated files are
saved locally and returned as absolute file paths. Inputs are validated with Zod
schemas; only the most useful parameters are listed here.

## Generation tools

### `firefly_generate`

Prompt-to-image generation.

| Parameter     | Type   | Notes                           |
| ------------- | ------ | ------------------------------- |
| `prompt`      | string | **Required.** The image prompt. |
| `aspectRatio` | string | e.g. `1:1`, `16:9`, `4:3`.      |
| `style`       | string | e.g. `Photo`, `Art`.            |
| `count`       | number | Number of images (default `4`). |

### `firefly_generate_video`

Prompt-to-video generation. Supports third-party models (Veo, Kling) and the
first-party Firefly Video model. Classifies the generate API response so
transient backend errors are reported distinctly from auth/moderation failures.

| Parameter     | Type   | Notes                                 |
| ------------- | ------ | ------------------------------------- |
| `prompt`      | string | **Required.** The video prompt.       |
| `model`       | string | e.g. `Veo 3.1 Fast`, `Firefly Video`. |
| `duration`    | string | e.g. `4 seconds`, `8 seconds`.        |
| `resolution`  | string | e.g. `720p`, `1080p`.                 |
| `aspectRatio` | string | e.g. `Widescreen (16:9)`.             |

### `firefly_variations`

Upload a local image and ask Firefly for variations.

| Parameter   | Type   | Notes                                 |
| ----------- | ------ | ------------------------------------- |
| `imagePath` | string | **Required.** Local image to upload.  |
| `prompt`    | string | Optional guidance for the variations. |

### `firefly_expand`

Upload a local image and run Firefly's expand/outpaint workflow.

| Parameter     | Type   | Notes                                |
| ------------- | ------ | ------------------------------------ |
| `imagePath`   | string | **Required.** Local image to upload. |
| `aspectRatio` | string | Target aspect ratio to expand into.  |

### `firefly_remove_background`

Upload a local image and run Firefly's remove-background workflow.

| Parameter   | Type   | Notes                                |
| ----------- | ------ | ------------------------------------ |
| `imagePath` | string | **Required.** Local image to upload. |

## Session and environment tools

### `firefly_status`

Open/check the persistent browser profile, authentication state, paths, and an
optional screenshot. Use `openBrowser: true` for first-run sign-in.

### `firefly_verify_environment`

Read-only verification of the current live Firefly page, including
authentication and visible account/credit details. Does not navigate.

### `firefly_validate_environment`

Check environment readiness and auto-fix common issues.

## Debugging tools

These are read-only developer utilities for diagnosing broken automation. They
never click, type, or navigate.

### `firefly_dom_inspect`

Inspect the current DOM state. Modes: `full` (default), `selector`, `shadow`,
`accessibility`, `tree`. Returns discovered selectors with Playwright locator
suggestions, uniqueness counts, shadow-DOM traversal, console/network capture,
performance metrics, and optional screenshots. See the README for detailed mode
examples.

### `firefly_dom_watch`

Watch for DOM mutations in real time — useful for finding which elements appear
after an action.

### `firefly_debug_bundle`

Capture a comprehensive diagnostic snapshot (26+ files): selector validation,
automation health checks, auth diagnostics, network traces, and screenshots.

> **Security note:** debug bundles may contain cookies and auth tokens. Review
> and redact before sharing. See [SECURITY.md](SECURITY.md).

## Error classification

Generation tools classify outcomes instead of returning opaque timeouts:

| Status             | Meaning                                                   |
| ------------------ | --------------------------------------------------------- |
| `success`          | Generation completed and the result was downloaded.       |
| `firefly_error`    | "Something went wrong", "Try again", "Server error", etc. |
| `moderation_error` | Content policy violation.                                 |
| `auth_error`       | Session expired or sign-in required.                      |
| `credit_error`     | No credits/quota remaining.                               |
| `timeout`          | No success or error detected within the timeout.          |

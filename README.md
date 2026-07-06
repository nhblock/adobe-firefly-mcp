# adobe-firefly-mcp

Local MCP server for using Adobe Firefly from Claude Code through Playwright browser automation.

This project is designed for a personal local workflow where you already have access to Adobe Firefly in your browser. It launches a persistent Playwright Chromium profile, lets you sign in manually once, then reuses that profile for future image workflows.

It does not use a private Adobe API, automate login credentials, bypass authentication, or store credentials outside the browser profile.

## Tools

`adobe-firefly-mcp` exposes these MCP tools:

- `firefly_generate` - prompt-to-image generation.
- `firefly_variations` - upload a local image and ask Firefly for variations.
- `firefly_expand` - upload a local image and run Firefly's expand/outpaint workflow.
- `firefly_remove_background` - upload a local image and run Firefly's remove-background workflow.
- `firefly_status` - open/check the persistent browser profile, auth state, paths, and optional screenshot.

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

```json
{
  "prompt": "A cinematic product photo of a translucent blue mechanical keyboard on a polished steel desk",
  "aspectRatio": "16:9",
  "style": "Photo",
  "count": 4
}
```

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
| `FIREFLY_SELECTOR_PROMPT_INPUT`    | built-in candidates              | CSS selector override for the prompt input.                            |
| `FIREFLY_SELECTOR_GENERATE_BUTTON` | built-in candidates              | CSS selector override for the generate/action button.                  |
| `FIREFLY_SELECTOR_DOWNLOAD_BUTTON` | built-in candidates              | CSS selector override for download buttons.                            |
| `FIREFLY_SELECTOR_UPLOAD_BUTTON`   | built-in candidates              | CSS selector override for upload controls.                             |

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

## Limitations

This is browser automation over a consumer web UI, not an official Adobe API. It can break when Adobe changes routes, labels, or page structure. Use `firefly_status` and selector/URL environment overrides to diagnose and adapt.

You are responsible for using Adobe Firefly in accordance with your Adobe plan and applicable terms.

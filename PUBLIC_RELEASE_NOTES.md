# Public Release Notes

## adobe-firefly-mcp

A local [Model Context Protocol](https://modelcontextprotocol.io/) server that
lets Claude Code (and other MCP clients) drive **Adobe Firefly** through a
persistent Playwright browser session — using your own signed-in Adobe account,
with no private APIs and no credentials leaving your machine.

### Highlights

- **Image generation** — prompt-to-image with aspect ratio, style, and count.
- **Video generation** — prompt-to-video via Veo, Kling, and the first-party
  Firefly Video model, with reliable download handling.
- **Image editing** — variations, generative expand/outpaint, and background
  removal from local images.
- **Persistent session** — sign in to Adobe once; the profile is reused across
  restarts.
- **Resilient automation** — ordered selectors, environment overrides, and a
  self-healing engine that recovers when Adobe changes the UI.
- **Deep debugging tools** — DOM inspection, real-time mutation watching, and a
  26+ file diagnostic bundle for when automation breaks.
- **Typed error classification** — auth, moderation, credit, and transient
  backend errors are reported distinctly instead of as opaque timeouts.

### Requirements

- Node.js `>=20.11`
- An Adobe account with Firefly access
- Playwright's Chromium (one command: `npm run install:browser`)

### Getting started

See the [Quick Start in the README](README.md#quick-start). A first-time user
can install, sign in, and generate in a few minutes.

### Security

This server drives a real authenticated Adobe session stored in a local browser
profile. Please read [SECURITY.md](SECURITY.md) before use — in particular, the
`profile/` directory is a credential and must never be shared or committed.

### Known limitations

- Automates a consumer web UI, not an official Adobe API; it can break when
  Adobe changes routes, labels, or page structure (self-healing and overrides
  mitigate this).
- First sign-in must be performed manually in the launched browser window.
- Subject to your Adobe plan's credits, quotas, and terms of service.

### License

MIT. See [LICENSE](LICENSE).

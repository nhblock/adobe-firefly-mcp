# Security Policy

`adobe-firefly-mcp` drives a **real, authenticated Adobe Firefly session** in a
local browser. This has direct security and privacy implications that every user
should understand before running it.

## What this server does and does not do

- It launches a Playwright-controlled Chromium instance and reuses a persistent
  browser profile so you only sign in once.
- It does **not** use a private Adobe API, automate your login credentials,
  bypass authentication, or transmit your data to any third party.
- All generated files and all session data stay on your local machine.

## Your Adobe session lives in `profile/`

After you sign in, your authenticated Adobe session — including cookies and
local storage — is written to the persistent Chromium profile directory
(`profile/` by default, or `FIREFLY_PROFILE_DIR`).

Treat this directory as a **credential**:

- **Never commit it.** `profile/` is git-ignored by default; keep it that way.
- **Never share, upload, or archive it.** Anyone with a copy of `profile/` can
  act as you on Adobe Firefly until the session expires.
- **Do not sync it** to cloud storage or back it up to shared locations.
- If you believe the profile was exposed, sign out of Adobe (which invalidates
  the session) and delete the `profile/` directory.

## Debug captures may contain secrets

The diagnostic tools (`firefly_debug_bundle`, `firefly_dom_inspect`) can capture
cookies, request headers, and network traces to a local `debug/` directory.
These artifacts **may contain authentication tokens**. `debug/` is git-ignored.
Do not share debug bundles publicly without reviewing and redacting them first.

## Environment and logs

- Secrets are never hardcoded. Configuration is via environment variables only.
- Logs are written to **stderr** (stdout is reserved for the MCP protocol) and
  do not print cookies or tokens. Set `FIREFLY_LOG_LEVEL=silent` to disable.
- Keep `.env` out of version control (`.env` and `.env.*` are git-ignored; only
  `.env.example` is tracked).

## Terms of use

This is browser automation over a consumer web UI, not an official Adobe API.
You are responsible for using Adobe Firefly in accordance with your Adobe plan
and Adobe's applicable terms of service.

## Reporting a vulnerability

If you discover a security issue, please **do not open a public issue**.
Instead, report it privately via
[GitHub Security Advisories](https://github.com/peroxide-dev/adobe-firefly-mcp/security/advisories/new).

Please include reproduction steps and the affected version. We aim to
acknowledge reports within 7 days.

## Supported versions

This project is pre-1.0. Security fixes are applied to the latest release only.

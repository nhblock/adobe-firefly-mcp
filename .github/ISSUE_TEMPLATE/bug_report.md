---
name: Bug report
about: Report a problem with the MCP server or Firefly automation
title: "[bug] "
labels: bug
---

## Describe the bug

A clear and concise description of what went wrong.

## To reproduce

Steps to reproduce the behavior:

1. Tool called (e.g. `firefly_generate_video`) and parameters used
2. What you expected to happen
3. What actually happened

## Diagnostics

- Output of `firefly_status` (auth state, paths)
- Relevant stderr logs (set `FIREFLY_LOG_LEVEL=debug`)
- If automation broke after an Adobe UI change, attach a **redacted**
  `firefly_debug_bundle` output (remove cookies/tokens first — see SECURITY.md)

## Environment

- OS: [e.g. Windows 11, macOS 14, Ubuntu 24.04]
- Node version: [`node --version`]
- Package version: [e.g. 0.1.0]
- MCP client: [e.g. Claude Code]

## Additional context

Anything else that might help.

---
name: tab
description: Reference for the Tab token-accountability plugin and its slash commands (/tab, /tab waste, /tab report, /tab forecast). Use when the user asks how to read Tab's output, which command to run, or how to enable the live statusline.
disable-model-invocation: true
---

# Tab

Tab finds the wasted portion of your token spend — itemized, with fixes — and
tells you what each outcome actually cost you in quota.

## Commands

- `/tab` — print the version banner.
- `/tab waste` — itemized recoverable token waste, with a fix per line.
- `/tab report` — per-branch usage: tokens, % of quota window, tokens per
  surviving line, waste share.
- `/tab forecast` — the latest burn-rate forecast recorded by the statusline.

## Live statusline (burn-rate forecast)

The live forecast line (`[tab] ⛏ burn … → window empty ~X min …`) is produced by
`statusline/tab-statusline.js`. A plugin cannot auto-register a statusline, so
add it to your `settings.json` with an absolute path:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /absolute/path/to/tab/statusline/tab-statusline.js"
  }
}
```

The Phase 6 installer automates this. Silence it any time with
`TAB_STATUSLINE=0`. Rate-limit forecasting requires a Claude.ai Pro/Max account
(the window data is not exposed otherwise).

See `design/TAB_TECH_SPEC.md` for the full specification.

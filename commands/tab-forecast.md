---
description: Show the live burn-rate forecast and recommended lever
allowed-tools: Bash(node:*)
disable-model-invocation: true
---

Burn-rate forecast for this session:

!`node "${CLAUDE_PLUGIN_ROOT}/bin/tab.js" forecast`

Show the line above to the user verbatim. It reflects the latest data the Tab
statusline recorded; if the statusline is not registered, it will say so.

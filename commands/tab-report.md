---
description: Attribute this branch's spend — tokens, % of quota, tokens/surviving-line
allowed-tools: Bash(node:*)
disable-model-invocation: true
---

Per-outcome usage report for the current branch:

!`node "${CLAUDE_PLUGIN_ROOT}/bin/tab.js" report`

Show the report above to the user verbatim. It is pre-formatted — do not
summarize or editorialize it.

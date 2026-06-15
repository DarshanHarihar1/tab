# Phase 1 — Data spine: collector + local ledger

**Goal:** every tool call produces one accurate, cheap, local event. Everything else reads this.

**Git tag:** `v0.1.0`

**Depends on:** Phase 0

-----

## Implementation

- `hooks/session-start.js`: create `~/.tab/<project>/<session>.jsonl`; snapshot loaded MCP servers + memory files.
- `hooks/collect.js` (PreToolUse + PostToolUse): append normalized events per the event schema (args_hash, tokens, cache_read, model, result size). Hot-path only — no analysis.
- `lib/transcript.js`: parse `~/.claude/projects/.../*.jsonl` for per-message token counts; reconcile with hook events.
- Fail-open wrapper around all hooks (exit 0 on any error).

### Event schema

```json
{
  "ts": "2026-06-14T14:32:01Z",
  "session": "a1b2",
  "branch": "feat/payments-webhook",
  "kind": "tool_use",
  "tool": "Read",
  "args_hash": "sha256:…",
  "target": "src/auth.ts",
  "tokens_in": 4120,
  "tokens_out": 0,
  "cache_read": 3900,
  "model": "claude-sonnet-4-6",
  "result_bytes": 8210,
  "outcome_tag": null
}
```

-----

## Milestones

- One ledger event per tool call, with correct tool name and non-zero token fields.
- Collector p95 latency < 30 ms.

-----

## Testing criteria (must pass)

- Scripted session (read 5 files, run `npm test` twice, one grep): ledger event count and tool names match exactly.
- Token fields reconcile with the session JSONL within a defined tolerance.
- **Fail-open test:** force the hook to throw mid-write → agent continues, no tool call blocked.
- **Latency test:** 100 tool calls; assert added p95 < 30 ms.
- **Privacy test:** run under a network monitor; assert zero egress from hooks.

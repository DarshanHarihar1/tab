# Phase 2 — Waste Ledger (Feature 1)

**Goal:** the hero feature — itemized, recoverable waste with fixes.

**Git tag:** `v0.2.0`

**Depends on:** Phase 1 (data spine)

-----

## Implementation

- `lib/waste.js`: redundant re-reads (args_hash on unchanged files), duplicate tool calls, retry-loop detection, loaded-vs-used MCP diff, CLAUDE.md/memory carried-every-turn cost.
- `commands/tab-waste.md` → renders the waste block with %, evidence, and a fix per line.
- Per-category reclaimable-token estimate.

### Expected output

```
/tab waste
─ Wasted this session: ~38% of tokens (~310k)
  ▸ 41%  redundant file re-reads      src/auth.ts read 6× unchanged   [fix: pin to path]
  ▸ 22%  unused MCP tools             7 servers loaded, 1 used        [fix: /mcp disable]
  ▸ 18%  retried failed commands      `npm test` run 5× failing       [fix: stop-on-fail]
  ▸ 11%  CLAUDE.md carried every turn 3.8k tokens × every message     [fix: /tab compress]
```

### Waste categories

| Category | Detection method |
|----------|-----------------|
| Redundant file re-reads | args_hash on unchanged files across turns |
| Duplicate tool calls | identical (tool, args_hash) within session |
| Retry loops | same failing command run N≥3 times |
| Dead MCP overhead | loaded servers − actually-called servers |
| Memory/CLAUDE.md bloat | file size × turns carried |
| Stale context | turns since last relevant use of a context chunk |

-----

## Milestones

- `/tab waste` produces the itemized block on a real session.
- Reclaimable estimate within tolerance of hand-computed ground truth on the fixture corpus.

-----

## Testing criteria (must pass)

- Fixture sessions with **injected** waste (e.g., a file read 6× unchanged, a command retried 5×) → detector reports the correct category and count.
- **False-positive guard:** a file that genuinely changed between reads is NOT flagged as redundant (assert).
- Output fits terminal width; every line carries an actionable fix.
- **Accuracy eval:** reclaimable estimate vs ground truth within ±X% across the corpus (X defined and recorded in `evals/`).

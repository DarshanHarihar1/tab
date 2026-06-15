# evals — waste estimate accuracy

Honest accuracy harness for the Waste Ledger (Phase 2). Run with:

```
npm run eval
```

## Method

Each fixture in `fixtures/` is a recorded/synthetic ledger with **known injected
waste** and a `ground_truth_reclaimable` token figure. The harness runs
`lib/waste.analyze()` and asserts its `totalReclaimable` is within tolerance of
the ground truth.

- **Token estimate:** `~bytes / 4` per redundant occurrence (`BYTES_PER_TOKEN` in
  `lib/waste.js`).
- **Tolerance (X):** **±10%**. Recorded here per the Phase 2 testing criteria.
- The harness exits non-zero on any out-of-tolerance fixture, so it can gate
  merges in Phase 6.

## What is measured

Only the token-estimated categories contribute to `totalReclaimable`:

- redundant file re-reads
- duplicate tool calls
- retried failed commands

## Known limitations (v1, by design)

- **Conservative lower bound.** The estimate counts the direct content of each
  redundant occurrence and does **not** model the history re-send compounding
  that makes re-reads expensive in practice. Real reclaimable tokens are likely
  higher.
- **Dead MCP overhead and carried memory are advisories**, not part of the
  reclaimable total — their per-turn token cost is not derivable from the ledger
  alone (no MCP tool-definition sizes). They are reported with evidence + a fix.
- Fixtures are synthetic; replace/augment with recorded real sessions as the
  corpus grows.

# Phase 5 — Anomaly / Trust alerts (Feature 4)

**Goal:** the trust feature — explain platform-caused spikes, with near-zero false alarms.

**Git tag:** `v0.5.0`

**Depends on:** Phase 1 (data spine)

-----

## Implementation

- `lib/anomaly.js`: cache-read ratio trend → infer cache breaks; sudden context-jump detection (large multi-file pulls).
- Event-driven nudges from hooks (fire only on anomaly), worded "likely," with evidence.

### Expected output

```
⚠ [tab] cache-hit fell 88%→11% at 14:32 — likely a caching break, not your usage. New session may fix.
⚠ [tab] that step pulled 22 files (+48k tokens) into context; they reprocess every turn. Compact?
```

### Anomaly types

| Type | Detection | Alert wording |
|------|-----------|--------------|
| Cache break | cache_read/tokens_in ratio drops >50% turn-over-turn | "likely a caching break, not your usage" |
| Context explosion | single turn adds >N tokens from file reads | "pulled X files (+Yk tokens) into context" |

### Detection thresholds

- Cache break: cache-hit ratio collapses from >60% to <20% within 2 consecutive turns.
- Context jump: single PostToolUse event adds >30k tokens to context.
- Both thresholds should be configurable (defined in `evals/` with justification).

### Critical: near-zero false alarms

This is the trust feature. False alarms destroy credibility. The anomaly detector must:
- Never fire on normal session variance.
- Use conservative thresholds, tuned against the fixture corpus.
- Word alerts as "likely," never "confirmed."
- Fire once per anomaly event, not repeatedly.

-----

## Milestones

- Detects a synthetic cache break and a context explosion in fixtures, with the correct one-liner.

-----

## Testing criteria (must pass)

- Cache-ratio-collapse fixture → alert fires once, worded as "likely," not "confirmed."
- +N-file context-jump fixture → "compact?" nudge fires.
- **False-alarm guard (critical):** a normal steady-cache session produces **zero** anomaly alerts over the full run (assert). Target precision ≥ Z (defined in `evals/`); false alarms must be near-zero to protect trust positioning.

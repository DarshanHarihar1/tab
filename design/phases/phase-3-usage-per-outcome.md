# Phase 3 — Usage-per-Outcome (Feature 2)

**Goal:** attribute spend to a unit of work, in subscription-friendly units.

**Git tag:** `v0.3.0`

**Depends on:** Phase 1 (data spine)

-----

## Implementation

- `lib/attributor.js`: map events to current Git branch and task boundaries; compute tokens, % of 5h/7d window, tokens-per-surviving-line (git diff on branch).
- `hooks/finalize.js` (Stop): emit the per-outcome report; `commands/tab-report.md` for on-demand.
- Account-type detection (subscription → tokens + %; API → exact `$`).

### Account-type handling

| Surface | Subscription | API |
|---------|-------------|-----|
| Per-outcome metric | tokens + % of 5h / 7d window | tokens + exact `$` |
| Waste ledger | tokens + % of window reclaimable | tokens + `$` reclaimable |
| Forecast | "window empty in ~X min" | "≈ $Y at this rate" + minutes |
| Dollars | hidden or labeled estimate | exact |

Detection: infer from whether the session/statusline payload exposes a dollar figure (API) vs a rate-limit window (subscription). When uncertain, default to subscription view.

### Expected output

```
/tab report   (also auto-runs on Stop / branch finish)
─ Branch: feat/payments-webhook
  Tokens:           412k  (≈ 19% of your 5-hour window, 4% of 7-day quota)
  Wall-clock:       52 min across 3 sessions
  Surviving lines:  1,240   →  332 tokens / surviving line
  Waste share:      29% (see /tab waste)
```

### Attribution logic

- Map events to `git rev-parse --abbrev-ref HEAD` at time of event.
- Task boundary = `SessionStart` / `Stop` hook events.
- Surviving lines = `git diff <branch-base>..HEAD --stat` on Stop.

-----

## Milestones

- `/tab report` and the Stop hook both produce the report block with correct branch attribution.
- Subscription accounts never see an unlabeled dollar figure.

-----

## Testing criteria (must pass)

- On a test branch with known commits: correct token total attributed, correct tokens-per-surviving-line.
- Account-type fixtures (subscription vs API): correct units shown; no unlabeled `$` on subscription.
- **Edge cases** handled without crashing: detached HEAD, no branch, multiple branches in one session (assert graceful fallback).

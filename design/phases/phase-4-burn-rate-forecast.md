# Phase 4 — Burn-Rate Forecast (Feature 3)

**Goal:** the live surface — predict the quota wall and offer a concrete lever.

**Git tag:** `v0.4.0`

**Depends on:** Phase 1 (data spine)

-----

## Implementation

- `statusline/tab-statusline.js`: consume per-turn payload (model, context fill, rate-limit %); compute rolling burn rate; print forecast line.
- Work classifier (boilerplate / refactor / exploration) from recent tool-call patterns.
- One recommended lever (route Haiku / `/compact` / scope).
- `TAB_STATUSLINE=0` env var to silence output.
- `commands/tab-forecast.md` for on-demand view.

### Expected statusline output

```
[tab] ⛏ burn 4.1k/min → window empty ~16 min · boilerplate ahead → route Haiku? saves ~12 min
```

### Burn-rate computation

- Rolling window: last N turns (configurable, default 5).
- Rate = (tokens_in_last_N_turns) / (wall_clock_elapsed_last_N_turns).
- Forecast = (remaining_quota_tokens) / rate.

### Work classifier heuristics

| Pattern | Classification |
|---------|---------------|
| Mostly Write/Edit tool calls | boilerplate |
| Mix of Read + Edit + Bash | refactor |
| Mostly Read + Grep + search | exploration |

### Lever recommendations

| Situation | Recommended lever |
|-----------|------------------|
| Boilerplate work ahead | Route to Haiku |
| Context fill > 70% | `/compact now` |
| Large scope, little time | Scope the task |

-----

## Milestones

- Statusline shows "window empty ~X min" + a lever, updating each turn.
- Forecast error within tolerance on replayed sessions.

-----

## Testing criteria (must pass)

- Replay a recorded high-burn session → forecasted "minutes to empty" within ±Y% of actual at each checkpoint.
- Statusline script runs within the per-turn budget; degrades gracefully if payload fields are missing.
- Silence env var works (`TAB_STATUSLINE=0` → no output).

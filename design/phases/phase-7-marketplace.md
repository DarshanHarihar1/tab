# Phase 7 — Official marketplace + cross-agent advisory (post-v1)

**Goal:** reach and credibility, without faking parity.

**Git tag:** `v1.1.0`

**Depends on:** Phase 6 (v1.0 shipped)

-----

## Implementation

- Submit to Anthropic's official marketplace (review ~days); keep the self-hosted marketplace as primary meanwhile.
- Lighter advisory mode for Codex / Gemini / Cursor (skill + CLI), clearly labeled reduced-fidelity.

### Cross-agent strategy

The deep value (session-log parsing, hooks, statusline) is Claude-Code-specific. Other agents get a reduced-fidelity advisory mode — a skill + CLI that works from available data.

| Agent | Mode | Fidelity |
|-------|------|----------|
| Claude Code | Full (hooks + statusline + ledger) | 100% |
| Codex | Advisory (skill + CLI) | Reduced — labeled |
| Gemini | Advisory (skill + CLI) | Reduced — labeled |
| Cursor | Advisory (skill + CLI) | Reduced — labeled |

**Never fake cross-agent parity for star-count.** The trust positioning forbids it. Label reduced-fidelity modes clearly in the README and in the output itself.

### Marketplace submission checklist

- Passes naming rules (no reserved names).
- Passes structure review (plugin.json, marketplace.json valid).
- README headline number is reproducible.
- Privacy statement prominent.
- No telemetry without explicit opt-in.

-----

## Milestones

- Listed (or in active review) on the official marketplace.
- Advisory mode works on ≥ 1 other harness.

-----

## Testing criteria (must pass)

- Passes the official review checklist (naming, structure, no reserved marketplace names).
- On a second harness, the CLI produces a (reduced) waste summary from available data; limitations are documented in the README.

# Phase 6 — Hardening, benchmarks, evals, installer, docs → v1.0

**Goal:** ship-ready: reproducible numbers, honest evals, frictionless install.

**Git tag:** `v1.0.0`

**Depends on:** Phases 0–5

-----

## Implementation

- `benchmarks/`: real sessions with reclaimed-token receipts (Caveman-style).
- `evals/`: accuracy harness for waste estimate (±X%), forecast error (±Y%), anomaly precision/recall (≥Z); wired into CI as a merge gate.
- README with the reproducible headline number; finalized `SKILL.md`; loud privacy statement; `/tab report --share` anonymized one-liner.
- `install.sh` / `install.ps1` one-liner: detect agent, drop files, register hooks + statusline, idempotent, `--uninstall`.

### Eval harness thresholds (to be defined in `evals/`)

| Feature | Metric | Threshold |
|---------|--------|-----------|
| Waste ledger | estimate vs ground truth | ±X% (TBD from corpus) |
| Forecast | minutes-to-empty error | ±Y% (TBD from replay) |
| Anomaly | precision | ≥Z (TBD, target >0.95) |
| Anomaly | false alarm rate | near-zero (assert 0 on normal sessions) |

### Install methods

1. **Native plugin marketplace:** `/plugin marketplace add you/tab` → `/plugin install tab@tab-marketplace`
2. **One-line curl:** `curl -fsSL https://raw.githubusercontent.com/you/tab/main/install.sh | bash`
3. **PowerShell:** `irm https://raw.githubusercontent.com/you/tab/main/install.ps1 | iex`
4. **npx:** `npx skills add you/tab`

### Installer requirements

- Detects installed agents (Claude Code, Codex, Cursor, Gemini).
- Drops files into each agent's directory.
- Registers statusline + hooks.
- Idempotent: re-running does nothing extra.
- `--uninstall` removes all files + hooks cleanly.

-----

## Milestones

- Installable 3 ways (native marketplace, curl, `npx skills add`).
- Eval harness publishes accuracy numbers; README headline number reproduces from `benchmarks/`.

-----

## Testing criteria (must pass)

- Installer tested on macOS / Linux / WSL / Windows PowerShell; re-run is idempotent; `--uninstall` removes all files + hooks cleanly.
- `evals/` runs in CI and **blocks merge** if thresholds regress.
- README headline number reproduces from `benchmarks/` on a clean checkout.
- **Privacy:** automated check confirms zero network egress in default mode.

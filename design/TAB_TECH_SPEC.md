# Tab — Technical Specification (v1)

> **Name:** `tab` (confirmed — GitHub repo name available)
> **One-line pitch:** *Finds the ~30% of your token spend that was pure waste — itemized, with fixes — and tells you what each outcome actually cost you in quota.*
> **Status:** Draft / pre-build · **Target surface:** Claude Code plugin (cross-agent later) · **License:** MIT
> *Supersedes the earlier `thrift`-named draft.*

-----

## 1. Why this exists (problem statement)

Agentic coding tools have made token/quota consumption a primary source of developer anxiety. Since the March 2026 quota crisis, subscription users on Max plans reported 5-hour windows draining in as little as ~19 minutes, and API users saw 10–20x cost spikes from caching bugs. The reaction across Reddit, GitHub, and HN was a mix of "where are my tokens going?" and "am I being overcharged?"

The market responded with **descriptive** tooling, and that space is now saturated:

|Tool                        |What it shows                                                         |Type       |
|----------------------------|----------------------------------------------------------------------|-----------|
|`/usage` (`/cost`, `/stats`)|Session cost, plan limits, which component consumes tokens (Opus 4.8+)|Built-in   |
|`/context`                  |Live per-category breakdown of the context window                     |Built-in   |
|`/stats`                    |Dashboard: heatmap, token totals, model breakdown, streaks            |Built-in   |
|Statusline                  |Live context fill, 5-hour + 7-day quota after each turn               |Built-in   |
|`ccusage`                   |Usage by date/session/project, `blocks --live`                        |Third-party|
|`claude-hud`                |Live terminal overlay: tokens, model, cost                            |Third-party|
|Caveman badge               |Lifetime tokens saved                                                 |Third-party|

**Every one of these answers "what did I spend?" None answers the three questions a developer acts on:**

1. **What did I *waste*?** (recoverable money/quota, itemized)
1. **What is this *worth*?** (consumption per outcome delivered)
1. **What's about to *go wrong*?** (forecast + anomaly/trust)

Tab is not a meter. It is a **recovery, accountability, and early-warning layer** built on top of the data the meters only display.

-----

## 2. Goals and non-goals

### Goals

- Turn raw consumption into **recoverable waste**, itemized with one-tap fixes.
- Express the cost of each **outcome** (PR / branch / task) in the units a subscriber actually feels: **tokens and % of quota window**, not dollars.
- **Forecast** the quota wall before it's hit and offer a concrete lever (model routing, compact, scope).
- Detect **anomalies** (caching breaks, context explosions) and give the developer receipts.
- Be **honest**: clearly label estimates vs exact figures. This is a trust product; overclaiming kills it.

### Non-goals (v1)

- ❌ Re-implementing `/usage` / `/context` / a generic live number display. We complement them, not duplicate.
- ❌ A web SaaS dashboard. v1 is local-first, terminal-native.
- ❌ Any telemetry that leaves the machine by default (see §10).
- ❌ Changing how the agent writes code (that's the proof-of-work idea #1 — deliberately out of scope here).

-----

## 3. The product: four interlinked features, one data spine

The four ideas are **not four tools** — they are four *views* over a single event stream. This is the architectural core and the reason they ship together.

```
                 ┌──────────────────────────────────────────┐
                 │            DATA SPINE (collector)          │
                 │  hooks events + session JSONL + statusline │
                 │            → local event ledger            │
                 └───────────────┬──────────────────────────┘
                                 │
     ┌───────────────┬───────────┼───────────────┬──────────────────┐
     ▼               ▼           ▼                ▼                  ▼
 (1) WASTE      (2) USAGE-    (3) BURN-RATE   (4) ANOMALY        STATUSLINE
   LEDGER         PER-          FORECAST        / TRUST          (live surface)
 itemizes the   OUTCOME       predicts the    flags caching
 avoidable      attributes    wall + offers   breaks & context
 spend          spend to      a lever         explosions
                PR/branch
```

### Feature 1 — Waste Ledger *(core identity)*

Instead of "you used 1.2M tokens," show what was **avoidable**:

- **Redundant file re-reads** — same file pulled into context N times unchanged (compounds because full history re-sends every turn).
- **Duplicate tool calls** — identical grep/test/read run repeatedly.
- **Retried failures** — the "20 broken attempts" loop.
- **Dead MCP overhead** — N servers consuming context every turn; how many were actually used.
- **CLAUDE.md / memory bloat** carried every turn.
- **Stale context** — content that should have been compacted M messages ago.

**Output (screenshottable):**

```
/tab waste
─ Wasted this session: ~38% of tokens (~310k)
  ▸ 41%  redundant file re-reads      src/auth.ts read 6× unchanged   [fix: pin to path]
  ▸ 22%  unused MCP tools             7 servers loaded, 1 used        [fix: /mcp disable]
  ▸ 18%  retried failed commands      `npm test` run 5× failing       [fix: stop-on-fail]
  ▸ 11%  CLAUDE.md carried every turn 3.8k tokens × every message     [fix: /tab compress]
```

Each line is a *recoverable* number with a concrete action. This is the differentiator nothing else has.

### Feature 2 — Usage-per-Outcome *(reframed for subscription users)*

**Decision locked from review:** because most users are on subscription (no per-token dollar figure), express value as **tokens and % of quota window per outcome**, not cost-per-outcome.

Attribute consumption to a unit of work (Git branch / PR / ticket) and report:

- **Tokens per PR / per branch / per task.**
- **% of the 5-hour window** that outcome consumed, and **% of the 7-day rolling quota.**
- **Tokens per surviving line** (lines that made it through review/commit) — efficiency, not just volume.

**Output:**

```
/tab report   (also auto-runs on Stop / branch finish)
─ Branch: feat/payments-webhook
  Tokens:           412k  (≈ 19% of your 5-hour window, 4% of 7-day quota)
  Wall-clock:       52 min across 3 sessions
  Surviving lines:  1,240   →  332 tokens / surviving line
  Waste share:      29% (see /tab waste)
```

On **API** accounts, also show exact `$` (we have the real number there). On **subscription**, dollars are hidden or shown as a clearly-labeled estimate (§9).

### Feature 3 — Burn-Rate Forecast *(the live surface)*

The statusline shows "60% used" — passive. Tab forecasts and offers a lever:

```
[tab] ⛏ burn 4.1k/min → window empty ~16 min · boilerplate ahead → route Haiku? saves ~12 min
```

- Computes burn rate from recent turns.
- Classifies upcoming work (boilerplate / refactor / exploration) from tool-call patterns.
- Recommends one action: **model route to Haiku**, **/compact now**, or **scope the task**.

### Feature 4 — Anomaly / Trust alerts *(event-driven, not ambient)*

Surfaces a one-liner **only when something abnormal happens**:

```
⚠ [tab] cache-hit fell 88%→11% at 14:32 — likely a caching break, not your usage. New session may fix.
⚠ [tab] that step pulled 22 files (+48k tokens) into context; they reprocess every turn. Compact?
```

- Watches input-token / cache-read patterns across turns to infer cache breaks (the March 2026 failure mode).
- Watches sudden context jumps (PR reviews, large reads).
- This is the **trust** feature: it gives developers receipts when the platform, not their behavior, caused a spike.

### Interlink summary (why they ship together)

- The **ledger (1)** feeds the **waste share** line in the **report (2)**.
- The **forecast (3)** uses the same burn data and recommends fixes the **ledger (1)** identified.
- The **anomaly detector (4)** explains spikes the **forecast (3)** would otherwise blame on the user.
- One collector, one local store, four views. Building any one alone duplicates 70% of the others' plumbing.

-----

## 4. Architecture

### 4.1 Data sources (all local)

1. **Claude Code hooks** — real-time tool-call interception:
- `SessionStart` — initialize the session ledger, snapshot loaded MCP servers / memory files.
- `PreToolUse` — log every intended tool call (tool name, args hash); enable dup/retry detection and pre-expensive-op nudges.
- `PostToolUse` — log result size; (Claude Code ≥ May 2026 can replace tool output, useful later for trimming noise).
- `Stop` — finalize the per-task report (Feature 2).
1. **Session JSONL transcript logs** (`~/.claude/projects/.../*.jsonl`) — per-message token counts, the proven source ccusage and Caveman read. Used for exact token attribution and cache-read patterns.
1. **Statusline JSON payload** — the per-turn object Claude Code hands the statusline script: model, context-window fill, rate-limit consumption. Used for the live forecast surface.

### 4.2 Components

- **Collector** — thin hook scripts (fast; they run on every tool call) that append normalized events to a local ledger.
- **Ledger store** — append-only JSONL (or SQLite if we need queries) under `~/.tab/<project>/<session>.jsonl`. Local only.
- **Analyzers** (run on demand for slash commands, or on `Stop`):
  - *Waste detector* — dedup by args-hash, count re-reads of unchanged files, detect retry loops, diff loaded-vs-used MCP tools.
  - *Attributor* — map spend to current Git branch (`git rev-parse --abbrev-ref HEAD`) and to task boundaries.
  - *Forecaster* — rolling burn rate + work classifier.
  - *Anomaly detector* — cache-read ratio trend + context-jump detection.
- **Surfaces** — statusline script, slash commands (`/tab`, `/tab waste`, `/tab report`, `/tab forecast`), and event-driven nudges emitted from hooks.

### 4.3 Event schema (illustrative)

```json
{
  "ts": "2026-06-14T14:32:01Z",
  "session": "a1b2",
  "branch": "feat/payments-webhook",
  "kind": "tool_use",
  "tool": "Read",
  "args_hash": "sha256:…",       // for dedup / re-read detection
  "target": "src/auth.ts",
  "tokens_in": 4120,
  "tokens_out": 0,
  "cache_read": 3900,
  "model": "claude-sonnet-4-6",
  "result_bytes": 8210,
  "outcome_tag": null            // set on Stop: pr/branch/task id
}
```

-----

## 5. Performance constraints (non-negotiable)

Hooks run on **every** tool call. If the collector is slow, it taxes exactly the thing we're trying to make efficient.

- Collector hook budget: **< 30 ms** per call; do nothing but append a normalized line. All analysis is deferred to slash commands / `Stop`.
- Fail open: a malformed/crashed hook must exit 0 (allow), never block the agent. (Mirrors Claude Code's own permissive hook default.)
- No network calls in the hot path.

-----

## 6. Subscription vs API handling (the §2 reframe, concretely)

|Surface           |Subscription accounts                                          |API accounts                 |
|------------------|---------------------------------------------------------------|-----------------------------|
|Per-outcome metric|**tokens + % of 5h / 7d window**                               |tokens + exact `$`           |
|Waste ledger      |tokens + % of window reclaimable                               |tokens + `$` reclaimable     |
|Forecast          |"window empty in ~X min"                                       |"≈ $Y at this rate" + minutes|
|Dollars           |hidden, or shown as **labeled estimate** (tokens × public rate)|exact                        |

Detection: infer account type from whether the session/statusline payload exposes a dollar figure (API) vs a rate-limit window (subscription). When uncertain, default to the subscription (token/%) view — never show an unlabeled dollar figure we can't stand behind.

-----

## 7. Claude Code integration (modeled on Caveman / Superpowers)

This is where we copy what works from the repos that got traction. Both ship as **plugins distributed by git** (never an npm install of the skill itself), expose **slash commands**, wire **hooks**, run a **statusline**, and offer a **one-line installer**.

### 7.1 Repo skeleton

```
tab/
├── .claude-plugin/
│   ├── plugin.json            # name, version, description, components
│   └── marketplace.json       # lists this plugin → enables /plugin marketplace add
├── skills/
│   └── tab/SKILL.md           # explains the commands & how to read the output
├── commands/                  # slash commands (thin wrappers → analyzers)
│   ├── tab.md
│   ├── tab-waste.md
│   ├── tab-report.md
│   └── tab-forecast.md
├── hooks/
│   ├── session-start.js       # init ledger, snapshot MCP/memory
│   ├── collect.js             # Pre/PostToolUse → append event (FAST)
│   └── finalize.js            # Stop → write per-task report
├── statusline/
│   └── tab-statusline.js      # consumes per-turn JSON, prints forecast line
├── lib/                       # analyzers (waste, attributor, forecaster, anomaly)
├── bin/                       # CLI entry for manual use / other agents
├── benchmarks/                # like Caveman: real sessions, reclaimed-token receipts
├── evals/                     # honest eval harness (estimate accuracy)
├── install.sh / install.ps1   # Caveman-style one-liner
├── README.md                  # lead with the headline number
└── LICENSE                    # MIT
```

### 7.2 `plugin.json` (sketch)

```json
{
  "name": "tab",
  "version": "1.0.0",
  "description": "Itemizes wasted tokens, attributes spend per outcome, forecasts the quota wall, flags caching anomalies.",
  "author": "…",
  "hooks": "./hooks",
  "commands": "./commands",
  "skills": "./skills",
  "statusLine": "./statusline/tab-statusline.js"
}
```

### 7.3 `marketplace.json` (sketch — lets users `/plugin marketplace add you/tab`)

```json
{
  "name": "tab-marketplace",
  "owner": { "name": "…", "url": "https://github.com/you" },
  "metadata": { "description": "Tab token-accountability plugin", "version": "1.0.0" },
  "plugins": [
    { "name": "tab", "source": "./", "description": "Token waste ledger + per-outcome usage + forecast + anomaly alerts" }
  ]
}
```

### 7.4 Hook wiring

|Hook          |Script          |Job                                                             |Budget  |
|--------------|----------------|----------------------------------------------------------------|--------|
|`SessionStart`|session-start.js|init ledger, snapshot loaded MCP servers + memory files         |< 100 ms|
|`PreToolUse`  |collect.js      |append intended call; detect dup/retry; emit pre-expensive nudge|< 30 ms |
|`PostToolUse` |collect.js      |append result size + cache-read                                 |< 30 ms |
|`Stop`        |finalize.js     |compute & print per-outcome report                              |< 500 ms|

### 7.5 Statusline (the live surface)

Claude Code runs the configured script after every turn and passes a JSON payload (model, context fill, rate-limit consumption). `tab-statusline.js` reads it, pulls the recent burn rate from the ledger, and prints the forecast line. A `TAB_STATUSLINE=0` env var silences it (Caveman does the same with its badge).

### 7.6 Install methods (offer all, like Caveman)

1. **Native plugin marketplace (primary):**
   
   ```
   /plugin marketplace add you/tab
   /plugin install tab@tab-marketplace
   ```
   
   Then **restart Claude Code** (slash commands load at startup). **Must `git tag` releases** — the plugin system fetches tags, not `main`.
1. **One-line installer (Caveman-style), for a memorable README + cross-agent:**
   
   ```
   curl -fsSL https://raw.githubusercontent.com/you/tab/main/install.sh | bash
   irm https://raw.githubusercontent.com/you/tab/main/install.ps1 | iex   # Windows
   ```
   
   Script detects installed agents, drops files into each agent's dir, registers the statusline + hooks, idempotent + `--uninstall`.
1. **`npx skills add you/tab`** — the Vercel skills.sh registry convenience layer.
1. **Manual:** clone, copy `skills/tab` into `~/.claude/skills/` (global) or `.claude/skills/` (project).

### 7.7 Cross-agent strategy (phase it honestly)

Caveman and Superpowers ship parallel config dirs (`.codex`, `.cursor-plugin`, `gemini-extension.json`) and advertise 30+ agents. We **can** do the same for the *skill/command* layer, **but** the deep value (session-log parsing, hooks, statusline) is Claude-Code-specific. So:

- **v1:** full experience on Claude Code only.
- **Later:** lighter "advisory" mode on Codex/Gemini/Cursor (the skill + a CLI), clearly labeled as reduced-fidelity until those harnesses expose equivalent hooks/logs.
  Don't fake cross-agent parity for star-count; the trust positioning forbids it.

-----

## 8. What makes it spread (traction mechanics, from studying the repos)

- **Lead the README with one number**, the way Caveman leads with "65%": e.g. *"reclaims ~30% of wasted tokens, itemized."* Back it with a real `benchmarks/` folder + an honest `evals/` harness (Caveman compares against "answer concisely," not a strawman — we do the equivalent for waste estimates).
- **Memorable name + a screenshottable output line** (the waste ledger block above is the hero asset).
- **One-line install.**
- **Ride the quota crisis** in the launch post (X + r/ClaudeAI + r/ClaudeCode), framed as "stop guessing where your quota goes — here's the receipts."
- **A `/tab report --share`** that prints a tweetable, anonymized one-liner (Caveman's `/caveman-stats --share` pattern).

-----

## 9. Honesty / measurement caveats (must be in the README)

- On **subscription**, dollar amounts are **estimates** (tokens × public rates) — labeled as such or hidden. Token and % figures are exact.
- The plugin **cannot see Anthropic's server-side cache state**; anomaly detection **infers** breaks from input-token / cache-read patterns. Phrase as "likely," never "confirmed."
- Waste heuristics (dedup, re-read) can have **false positives** (e.g. a legitimately re-read file that changed). Show the evidence per line so the user can judge; never auto-act without consent.

-----

## 10. Privacy & safety (load-bearing for a trust tool)

- **100% local.** No telemetry, no network calls, by default. The ledger lives under `~/.tab/`.
- A cost/usage tool that phones home is dead on arrival — privacy is a feature, state it loudly.
- Optional, explicit, opt-in only: `--share` produces an anonymized line the *user* copies; nothing is sent automatically.
- Reads only local session logs the user already owns. No credentials touched.

-----

## 11. Tech stack

- **Hooks / statusline / CLI:** Node ≥ 18 (matches Caveman's baseline; widely present). Keep dependencies near-zero for the hot-path collector.
- **Analyzers:** Node (or Python for heavier analysis if preferred) run off the hot path.
- **Store:** append-only JSONL first; SQLite only if query needs justify it.
- **Tests:** unit tests on the waste heuristics + a fixture corpus of recorded sessions in `evals/`.

-----

## 12. Roadmap at a glance

*(Full detail, with milestones and testing criteria per phase, is in §15.)*

|Phase|Theme                                                   |
|-----|--------------------------------------------------------|
|0    |Scaffold & installable plugin skeleton                  |
|1    |Data spine: collector + local ledger                    |
|2    |Waste Ledger (Feature 1)                                |
|3    |Usage-per-Outcome (Feature 2)                           |
|4    |Burn-Rate Forecast (Feature 3)                          |
|5    |Anomaly / Trust alerts (Feature 4)                      |
|6    |Hardening, benchmarks, evals, installer, docs → **v1.0**|
|7    |Official marketplace + cross-agent advisory (post-v1)   |

-----

## 13. Open questions / risks

1. **Estimate accuracy on subscription** — how close can token×rate get to perceived burn? Validate in `evals/`.
1. **Hook overhead** — must stay under budget on large repos with many tool calls.
1. **Cache-inference reliability** — needs real anomaly fixtures to avoid false alarms (false alarms destroy the trust positioning).
1. **Attribution edge cases** — detached HEAD, multiple branches per session, work with no branch.
1. **Overlap with `/usage` perception** — messaging must make "waste & outcomes," not "another meter," obvious from the first README line.

-----

## 14. Decisions locked (from review)

- All **four features ship in v1** as views over one data spine.
- Feature 2 is **usage/quota-per-outcome (tokens + % of window)**, not cost-per-outcome, because the audience is mostly subscription.
- **Plugin + hooks**, not a skill alone — enforcement and observation need hooks.
- **Local-only, no telemetry** by default.
- Distribute **git-first** (native marketplace + curl installer + `npx skills add`); **npm only** if/when we ship a standalone CLI.
- Project name is **`tab`**.

-----

## 15. Implementation phases (detailed)

Each phase is independently shippable and builds on the previous one. **Phases 2–5 all depend on Phase 1's data spine.** No phase is "done" until its testing criteria pass. Suggested git tags shown per phase.

See [`phases/`](./phases/) for individual phase breakdowns.

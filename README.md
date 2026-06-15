# tab

**Reclaims ~30% of wasted tokens — itemized, with fixes.**

That number is reproducible: run `npm run benchmark` against the recorded
sessions in [`benchmarks/`](benchmarks/).

Tab is not another meter. It is a recovery, accountability, and early-warning
layer on top of the usage data Claude Code already exposes. It answers the three
questions a developer acts on:

1. **What did I waste?** — recoverable tokens, itemized with one-tap fixes.
2. **What is this worth?** — consumption per outcome (branch / task), in tokens
   and % of your quota window.
3. **What's about to go wrong?** — burn-rate forecast + anomaly/trust alerts.

## Privacy (loud, on purpose)

**100% local. No telemetry. No network calls. Ever, by default.** The ledger
lives under `~/.tab/`. A cost tool that phones home is dead on arrival — so Tab
reads only the local session logs you already own, touches no credentials, and
sends nothing anywhere. `/tab report --share` produces an anonymized one-liner
that *you* copy; nothing is sent automatically. The no-egress property is
enforced by an automated check in CI.

## Commands

```
/tab            version banner
/tab waste      itemized recoverable waste, with a fix per line
/tab report     per-branch usage: tokens, % of quota, tokens/surviving-line
/tab forecast   the latest burn-rate forecast from the statusline
```

```
/tab waste
─ Wasted this session: ~38% of tokens (~310k, estimate)
  ▸ 71% redundant file re-reads  auth.ts read 6× unchanged   [fix: pin to path]
  ▸ 29% retried failed commands  `npm test` run 5× failing  [fix: stop-on-fail]
```

The live statusline shows the forecast each turn:

```
[tab] ⛏ burn 4.1k/min → window empty ~16 min · boilerplate ahead → route Haiku?
```

## Install

```sh
# one-line installer (macOS / Linux / WSL)
curl -fsSL https://raw.githubusercontent.com/DarshanHarihar1/tab/main/install.sh | bash
# Windows PowerShell
irm https://raw.githubusercontent.com/DarshanHarihar1/tab/main/install.ps1 | iex
```

Or via the native plugin marketplace:

```
/plugin marketplace add DarshanHarihar1/tab
/plugin install tab@tab-marketplace
```

Restart Claude Code, then run `/tab`. Silence the statusline any time with
`TAB_STATUSLINE=0`; silence the per-stop report with `TAB_REPORT=0`. Uninstall
with `install.sh --uninstall`.

## Honesty / caveats

- On **subscription** accounts, dollar figures are hidden; you see exact tokens
  and % of window. On **API** accounts, the dollar figure is an estimate from
  public rates, clearly labeled.
- The plugin **cannot see Anthropic's server-side cache state** — anomaly alerts
  **infer** caching breaks from token patterns and say "likely," never
  "confirmed."
- Waste estimates are a **conservative lower bound** (~bytes/4 per redundant
  occurrence; no history-compounding model). See [`evals/`](evals/) for accuracy
  method and tolerances.

## Development

```sh
npm test         # unit tests
npm run eval     # waste accuracy, anomaly precision, forecast error (merge gate)
npm run benchmark# reproduce the headline number
```

## License

MIT — see [LICENSE](LICENSE).

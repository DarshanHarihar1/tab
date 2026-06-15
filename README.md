# tab

**Reclaims ~30% of wasted tokens — itemized, with fixes.**

Tab is not another meter. It is a recovery, accountability, and early-warning
layer on top of the usage data Claude Code already exposes. It answers the three
questions a developer acts on:

1. **What did I waste?** — recoverable tokens, itemized with one-tap fixes.
2. **What is this worth?** — consumption per outcome (PR / branch / task), in
   tokens and % of your quota window.
3. **What's about to go wrong?** — burn-rate forecast + anomaly/trust alerts.

> **Status:** pre-build. This repo currently contains the technical
> specification and a Phase 0 plugin scaffold. See
> [`design/TAB_TECH_SPEC.md`](design/TAB_TECH_SPEC.md) and
> [`design/phases/`](design/phases/) for the build plan.

## Privacy

100% local. No telemetry, no network calls by default. The ledger lives under
`~/.tab/`. A cost tool that phones home is dead on arrival.

## Install (scaffold)

```
/plugin marketplace add DarshanHarihar1/tab
/plugin install tab@tab-marketplace
```

Restart Claude Code, then run `/tab` to print the version banner.

## License

MIT — see [LICENSE](LICENSE).

'use strict';

// Usage-per-Outcome attributor. Attributes ledger events to a Git branch and
// reports tokens, % of quota window, tokens-per-surviving-line, wall-clock, and
// waste share — in subscription-friendly units by default (never an unlabeled
// dollar figure; see §6/§9 of the spec).

const { execFileSync } = require('child_process');
const waste = require('./waste');

// Approximate public per-MTok USD rates (input / output / cache-read), used
// ONLY for the API dollar ESTIMATE. Subscription never shows dollars. These go
// stale — labeled "estimate, public rates" in output. (As of 2026-06.)
const RATES = {
  opus: { in: 15, out: 75, cache: 1.5 },
  sonnet: { in: 3, out: 15, cache: 0.3 },
  haiku: { in: 1, out: 5, cache: 0.1 }
};

function rateFor(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus')) return RATES.opus;
  if (m.includes('haiku')) return RATES.haiku;
  if (m.includes('sonnet')) return RATES.sonnet;
  return null;
}

function tokensOf(e) {
  return (e.tokens_in || 0) + (e.tokens_out || 0) + (e.cache_read || 0);
}

function human(n) {
  n = Math.round(n || 0);
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '') + 'k';
  return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
}

function commas(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function detectAccount(opts) {
  if (opts && opts.account) return opts.account;
  const env = process.env.TAB_ACCOUNT;
  if (env === 'api' || env === 'subscription') return env;
  return 'subscription'; // default when unsure: never show an unlabeled dollar
}

function windowCaps(opts) {
  if (opts && opts.window) return opts.window;
  return {
    cap5h: Number(process.env.TAB_WINDOW_5H_TOKENS) || null,
    cap7d: Number(process.env.TAB_WINDOW_7D_TOKENS) || null
  };
}

function attribute(events, opts) {
  opts = opts || {};
  const account = detectAccount(opts);

  // Target branch: explicit, else the most-recent event's branch (current work).
  let branch = opts.branch;
  if (branch === undefined) {
    branch = null;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].branch !== undefined) {
        branch = events[i].branch;
        break;
      }
    }
  }

  const mine = events.filter((e) => e.branch === branch);
  const tool = mine.filter((e) => e.kind === 'tool_use');
  const tokens = mine.reduce((s, e) => s + tokensOf(e), 0);
  const breakdown = mine.reduce(
    (a, e) => ({ in: a.in + (e.tokens_in || 0), out: a.out + (e.tokens_out || 0), cache: a.cache + (e.cache_read || 0) }),
    { in: 0, out: 0, cache: 0 }
  );

  const ts = mine.map((e) => Date.parse(e.ts)).filter((n) => !isNaN(n));
  const wallClockMin = ts.length > 1 ? Math.round((Math.max.apply(null, ts) - Math.min.apply(null, ts)) / 60000) : 0;
  const sessions = new Set(mine.map((e) => e.session).filter(Boolean)).size || (mine.length ? 1 : 0);

  const w = waste.analyze(tool);
  const wasteSharePct = tokens > 0 ? Math.round((w.totalReclaimable / tokens) * 100) : null;

  const survivingLines = opts.survivingLines != null ? opts.survivingLines : null;
  const tokensPerLine = survivingLines && survivingLines > 0 ? Math.round(tokens / survivingLines) : null;

  const caps = windowCaps(opts);
  const windowPct5h = caps.cap5h ? +((tokens / caps.cap5h) * 100).toFixed(1) : null;
  const windowPct7d = caps.cap7d ? +((tokens / caps.cap7d) * 100).toFixed(1) : null;

  let dollars = null;
  if (account === 'api') {
    const models = {};
    for (const e of mine) if (e.model) models[e.model] = (models[e.model] || 0) + 1;
    const model = Object.keys(models).sort((a, b) => models[b] - models[a])[0];
    const r = rateFor(model);
    if (r) dollars = +((breakdown.in / 1e6) * r.in + (breakdown.out / 1e6) * r.out + (breakdown.cache / 1e6) * r.cache).toFixed(2);
  }

  return {
    branch,
    account,
    tokens,
    breakdown,
    wallClockMin,
    sessions,
    survivingLines,
    tokensPerLine,
    wasteSharePct,
    windowPct5h,
    windowPct7d,
    dollars
  };
}

// Lines added on the current branch that survive vs the default-branch base.
// Runs git off the hot path (on-demand / report). Returns null on any failure.
function survivingLines(cwd) {
  function git(args) {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 });
  }
  try {
    let base = null;
    for (const ref of ['origin/HEAD', 'main', 'master', 'origin/main']) {
      try {
        base = git(['merge-base', 'HEAD', ref]).trim();
        if (base) break;
      } catch (e) {
        /* ref not present */
      }
    }
    if (!base) return null;
    const out = git(['diff', '--numstat', base + '..HEAD']);
    let added = 0;
    for (const line of out.split('\n')) {
      const m = line.match(/^(\d+)\t(\d+)\t/);
      if (m) added += Number(m[1]);
    }
    return added;
  } catch (e) {
    return null;
  }
}

function render(r) {
  const out = [];
  out.push(`─ Branch: ${r.branch || '(no branch)'}`);

  let tline = `  Tokens:           ${human(r.tokens)}`;
  if (r.account === 'api' && r.dollars != null) {
    tline += `  (≈ $${r.dollars} — estimate, public rates)`;
  } else if (r.account !== 'api' && (r.windowPct5h != null || r.windowPct7d != null)) {
    const parts = [];
    if (r.windowPct5h != null) parts.push(`${r.windowPct5h}% of your 5-hour window`);
    if (r.windowPct7d != null) parts.push(`${r.windowPct7d}% of 7-day quota`);
    tline += `  (≈ ${parts.join(', ')})`;
  }
  out.push(tline);

  out.push(`  Wall-clock:       ${r.wallClockMin} min across ${r.sessions} session${r.sessions === 1 ? '' : 's'}`);

  if (r.survivingLines != null && r.tokensPerLine != null) {
    out.push(`  Surviving lines:  ${commas(r.survivingLines)}   →  ${commas(r.tokensPerLine)} tokens / surviving line`);
  } else {
    out.push('  Surviving lines:  n/a (no diff vs base)');
  }

  if (r.wasteSharePct != null) {
    out.push(`  Waste share:      ${r.wasteSharePct}% (see /tab waste)`);
  }

  return out.join('\n');
}

// Anonymized, tweetable one-liner: numbers only — no branch name, no paths.
function shareLine(r) {
  return `tab 🪙 reclaimed ~${r.wasteSharePct || 0}% of a ${human(r.tokens)}-token branch — measured in tokens + % of quota, 100% local. github.com/DarshanHarihar1/tab`;
}

module.exports = { attribute, render, shareLine, survivingLines, detectAccount, human };

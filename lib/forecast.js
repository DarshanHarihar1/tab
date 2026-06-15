'use strict';

// Burn-Rate Forecast logic. Pure functions shared by the statusline script and
// the /tab forecast command. Computes a rolling burn rate from the rate-limit
// window percentage (the statusline payload exposes a 0-100 percentage and a
// reset time, NOT token capacity), classifies upcoming work from recent tool
// calls, and picks one lever.

function human(n) {
  n = Math.round(n || 0);
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '') + 'k';
  return (n / 1e6).toFixed(1) + 'M';
}

// Tolerant extraction from the statusline payload; every field may be absent.
function extractSnapshot(payload, nowMs) {
  const rl = payload.rate_limits || {};
  const fh = rl.five_hour || {};
  const sd = rl.seven_day || {};
  const cw = payload.context_window || {};
  const cum =
    typeof cw.total_input_tokens === 'number' || typeof cw.total_output_tokens === 'number'
      ? (cw.total_input_tokens || 0) + (cw.total_output_tokens || 0)
      : null;
  return {
    ts: nowMs,
    pct5h: typeof fh.used_percentage === 'number' ? fh.used_percentage : null,
    pct7d: typeof sd.used_percentage === 'number' ? sd.used_percentage : null,
    resetsAt5h: fh.resets_at || null,
    contextPct: typeof cw.used_percentage === 'number' ? cw.used_percentage : null,
    cumTokens: cum
  };
}

// Rolling burn over the last up-to-5 snapshots. minutesToEmpty = remaining % of
// the 5-hour window / burn %-per-minute. tokenPerMin from cumulative-token delta
// when available (guards against resets/compaction → negative deltas ignored).
function computeBurn(history) {
  const empty = { pctPerMin: null, minutesToEmpty: null, tokenPerMin: null };
  if (!history || history.length < 2) return empty;
  const recent = history.slice(-5);
  const a = recent[0];
  const b = recent[recent.length - 1];
  const dMin = (b.ts - a.ts) / 60000;
  if (!(dMin > 0)) return empty;

  let pctPerMin = null;
  let minutesToEmpty = null;
  let tokenPerMin = null;
  if (a.pct5h != null && b.pct5h != null) {
    const dP = b.pct5h - a.pct5h;
    if (dP > 0) {
      pctPerMin = dP / dMin;
      minutesToEmpty = Math.max(0, (100 - b.pct5h) / pctPerMin);
    }
  }
  if (a.cumTokens != null && b.cumTokens != null) {
    const dT = b.cumTokens - a.cumTokens;
    if (dT > 0) tokenPerMin = dT / dMin;
  }
  return { pctPerMin, minutesToEmpty, tokenPerMin };
}

// Classify upcoming work from recent tool-call mix.
function classifyWork(events) {
  const c = { Write: 0, Edit: 0, NotebookEdit: 0, Read: 0, Bash: 0, Grep: 0, Glob: 0 };
  for (const e of events || []) if (c[e.tool] != null) c[e.tool]++;
  const edits = c.Write + c.Edit + c.NotebookEdit;
  const explore = c.Read + c.Grep + c.Glob;
  const total = edits + explore + c.Bash;
  if (total < 2) return null;
  if (edits > explore && c.Bash <= 1) return 'boilerplate';
  if (c.Bash > 0 && edits > 0 && c.Read > 0) return 'refactor';
  if (explore >= edits) return 'exploration';
  return 'refactor';
}

// One recommended lever.
function chooseLever(state) {
  if (state.contextPct != null && state.contextPct > 70) return '/compact now';
  if (state.classification === 'boilerplate') return 'route Haiku?';
  if (state.minutesToEmpty != null && state.minutesToEmpty < 20) return 'scope the task';
  return '';
}

function formatLine(burn, snap, classification, lever) {
  const head = '[tab] ⛏';
  if (burn.minutesToEmpty != null) {
    const rate =
      burn.tokenPerMin != null
        ? `${human(burn.tokenPerMin)}/min`
        : burn.pctPerMin != null
        ? `${burn.pctPerMin.toFixed(1)}%/min`
        : '—';
    let line = `${head} burn ${rate} → window empty ~${Math.round(burn.minutesToEmpty)} min`;
    if (classification) line += ` · ${classification} ahead`;
    if (lever) line += ` → ${lever}`;
    return line;
  }
  // Degraded: no forecast yet (first turns, or no rate-limit data for this account).
  let line = head;
  if (snap && snap.contextPct != null) line += ` ${Math.round(snap.contextPct)}% context`;
  if (snap && snap.pct5h != null) line += ' · gathering burn rate…';
  if (lever) line += ` → ${lever}`;
  return line === head ? '' : line;
}

module.exports = { extractSnapshot, computeBurn, classifyWork, chooseLever, formatLine, human };

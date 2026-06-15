'use strict';

// Anomaly / Trust detector. Surfaces a one-liner ONLY when something abnormal
// happens, worded "likely" (never "confirmed") — the plugin cannot see
// Anthropic's server-side cache state, it INFERS breaks from token patterns.
// Conservative thresholds: false alarms destroy the trust positioning, so the
// bias is heavily toward silence.

const waste = require('./waste');

const DEFAULTS = {
  cacheHigh: 0.6, // a "healthy" cache-hit ratio
  cacheLow: 0.2, // a "collapsed" cache-hit ratio
  contextJumpTokens: 30000, // tokens pulled in one multi-file step
  contextJumpFiles: 12 // files pulled in one step
};

function human(n) {
  n = Math.round(n || 0);
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '') + 'k';
  return (n / 1e6).toFixed(1) + 'M';
}

// Fraction of a turn's input tokens that were served from cache.
function turnRatio(usage) {
  const cr = usage.cache_read_input_tokens || 0;
  const denom = cr + (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  return denom > 0 ? cr / denom : null;
}

// Cache break: the cache-hit ratio collapses from healthy to near-zero across
// two adjacent turns. Fires once (first occurrence).
function detectCacheBreak(turns, opts) {
  const o = Object.assign({}, DEFAULTS, opts);
  const ratios = (turns || []).map((t) => (t && t.usage ? turnRatio(t.usage) : null));
  for (let i = 1; i < ratios.length; i++) {
    const prev = ratios[i - 1];
    const cur = ratios[i];
    if (prev != null && cur != null && prev > o.cacheHigh && cur < o.cacheLow) {
      const from = Math.round(prev * 100);
      const to = Math.round(cur * 100);
      return {
        type: 'cache_break',
        from,
        to,
        turn: i,
        signature: 'cache:' + i,
        message: `cache-hit fell ${from}%→${to}% — likely a caching break, not your usage. A new session may fix it.`
      };
    }
  }
  return null;
}

// Context explosion: a single step (a run of consecutive file reads) pulls a
// large amount of new content into context, which then reprocesses every turn.
function detectContextJump(events, opts) {
  const o = Object.assign({}, DEFAULTS, opts);
  let best = null;
  let run = [];

  function flush() {
    if (run.length) {
      const tokens = run.reduce((s, e) => s + waste.estTokens(e.result_bytes), 0);
      const files = run.length;
      if ((tokens > o.contextJumpTokens || files >= o.contextJumpFiles) && (!best || tokens > best.tokens)) {
        best = { files, tokens, startTs: run[0].ts };
      }
    }
    run = [];
  }

  for (const e of events || []) {
    if (e.kind === 'tool_use' && e.tool === 'Read') run.push(e);
    else if (e.kind === 'tool_use') flush(); // a non-read tool ends the run
  }
  flush();

  if (!best) return null;
  return {
    type: 'context_jump',
    files: best.files,
    tokens: best.tokens,
    signature: 'jump:' + best.startTs + ':' + best.files,
    message: `that step pulled ${best.files} files (+${human(best.tokens)} tokens) into context; they reprocess every turn. Compact?`
  };
}

function detect(events, turns, opts) {
  const out = [];
  const cb = detectCacheBreak(turns, opts);
  if (cb) out.push(cb);
  const cj = detectContextJump(events, opts);
  if (cj) out.push(cj);
  return out;
}

module.exports = { detect, detectCacheBreak, detectContextJump, DEFAULTS };

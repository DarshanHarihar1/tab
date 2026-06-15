'use strict';

// Waste Ledger analyzer. Reads the local event ledger (Phase 1) and itemizes
// recoverable token waste with evidence and a concrete fix per category.
//
// Token estimates are derived from each event's result_bytes (~bytes/4). They
// are estimates and are labeled as such in the output (see §9 of the spec).
// This is a conservative lower bound: it counts the direct content of each
// redundant occurrence and does NOT model history re-send compounding.

const path = require('path');

const BYTES_PER_TOKEN = 4;

function estTokens(bytes) {
  return Math.round((bytes || 0) / BYTES_PER_TOKEN);
}

function base(p) {
  try {
    return path.basename(String(p));
  } catch (e) {
    return String(p);
  }
}

function short(s, n) {
  s = String(s == null ? '' : s);
  n = n || 40;
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function human(n) {
  n = Math.round(n || 0);
  if (n < 1000) return String(n);
  return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
}

// --- Category 1: redundant file re-reads -----------------------------------
// A Read is redundant if the same file was read before with the same args_hash
// AND the same result_bytes, with no intervening Edit/Write. Differing bytes =
// content changed = not flagged (false-positive guard).
function detectReReads(events) {
  const state = new Map(); // target -> { hash, bytes }
  const perTarget = new Map(); // target -> { reads, redundant }
  let count = 0;
  let reclaimable = 0;

  for (const e of events) {
    if (e.kind !== 'tool_use') continue;
    const t = e.target;
    if (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'NotebookEdit') {
      if (t) state.delete(t); // file changed: next read is fresh
      continue;
    }
    if (e.tool !== 'Read' || !t) continue;

    const pt = perTarget.get(t) || { reads: 0, redundant: 0 };
    pt.reads++;
    const prev = state.get(t);
    if (prev && prev.hash === e.args_hash && prev.bytes === e.result_bytes) {
      count++;
      pt.redundant++;
      reclaimable += estTokens(e.result_bytes);
    }
    state.set(t, { hash: e.args_hash, bytes: e.result_bytes });
    perTarget.set(t, pt);
  }

  let top = null;
  for (const [t, pt] of perTarget) {
    if (pt.redundant > 0 && (!top || pt.reads > top.reads)) top = { target: t, reads: pt.reads };
  }
  return { count, reclaimable, top };
}

// --- Categories 2 & 3: duplicate calls and retry loops ---------------------
// Grouped by (tool, args_hash). Read is excluded (handled above). A Bash group
// of >=3 identical calls with >=1 failure is a retry loop; other repeats are
// duplicate tool calls. Reclaimable = the repeats after the first.
function detectGroups(events) {
  const groups = new Map();
  for (const e of events) {
    if (e.kind !== 'tool_use' || e.tool === 'Read') continue;
    const key = e.tool + '\u0000' + e.args_hash;
    let g = groups.get(key);
    if (!g) {
      g = { tool: e.tool, target: e.target, items: [], failures: 0 };
      groups.set(key, g);
    }
    g.items.push(e);
    if (e.error === true) g.failures++;
  }

  const dup = { count: 0, reclaimable: 0, top: null };
  const retry = { count: 0, reclaimable: 0, top: null };

  for (const g of groups.values()) {
    if (g.items.length < 2) continue;
    const repeats = g.items.slice(1);
    const recl = repeats.reduce((s, e) => s + estTokens(e.result_bytes), 0);
    const isRetry = g.tool === 'Bash' && g.items.length >= 3 && g.failures >= 1;
    if (isRetry) {
      retry.count += g.items.length;
      retry.reclaimable += recl;
      if (!retry.top || g.items.length > retry.top.n) retry.top = { cmd: g.target, n: g.items.length };
    } else {
      dup.count += repeats.length;
      dup.reclaimable += recl;
      if (!dup.top || g.items.length > dup.top.n) dup.top = { tool: g.tool, target: g.target, n: g.items.length };
    }
  }
  return { dup, retry };
}

// --- Advisories: dead MCP servers and carried memory -----------------------
function detectMcp(events) {
  const loaded = new Set();
  const used = new Set();
  for (const e of events) {
    if (e.kind === 'session_start' && Array.isArray(e.mcp_servers)) e.mcp_servers.forEach((s) => loaded.add(s));
    if (e.kind === 'tool_use' && typeof e.tool === 'string' && e.tool.startsWith('mcp__')) {
      const server = e.tool.split('__')[1];
      if (server) used.add(server);
    }
  }
  const dead = [...loaded].filter((s) => !used.has(s));
  return { loaded: loaded.size, used: used.size, dead };
}

function detectMemory(events) {
  let snapshot = null; // last session_start snapshot wins (avoid double-count on resume)
  for (const e of events) {
    if (e.kind === 'session_start' && Array.isArray(e.memory_files)) snapshot = e.memory_files;
  }
  if (!snapshot) return { bytes: 0, files: 0 };
  return { bytes: snapshot.reduce((s, m) => s + (m.bytes || 0), 0), files: snapshot.length };
}

function analyze(events, opts) {
  opts = opts || {};
  const rr = detectReReads(events);
  const groups = detectGroups(events);
  const dup = groups.dup;
  const retry = groups.retry;
  const mcp = detectMcp(events);
  const mem = detectMemory(events);

  const categories = [];
  if (rr.count > 0) {
    categories.push({
      key: 'rereads',
      label: 'redundant file re-reads',
      count: rr.count,
      reclaimable: rr.reclaimable,
      evidence: rr.top ? `${base(rr.top.target)} read ${rr.top.reads}× unchanged` : '',
      fix: 'pin to path'
    });
  }
  if (retry.reclaimable > 0 || retry.count > 0) {
    categories.push({
      key: 'retries',
      label: 'retried failed commands',
      count: retry.top ? retry.top.n : retry.count,
      reclaimable: retry.reclaimable,
      evidence: retry.top ? `\`${short(retry.top.cmd, 30)}\` run ${retry.top.n}× failing` : '',
      fix: 'stop-on-fail'
    });
  }
  if (dup.count > 0) {
    categories.push({
      key: 'duplicates',
      label: 'duplicate tool calls',
      count: dup.count,
      reclaimable: dup.reclaimable,
      evidence: dup.top ? `${dup.top.tool} ${short(dup.top.target, 24)} run ${dup.top.n}×` : '',
      fix: 'cache / skip repeat'
    });
  }

  const totalReclaimable = categories.reduce((s, c) => s + c.reclaimable, 0);
  categories.sort((a, b) => b.reclaimable - a.reclaimable);

  const advisories = [];
  if (mcp.dead.length > 0) {
    advisories.push({
      key: 'mcp',
      detail: `${mcp.loaded} MCP servers loaded, ${mcp.used} used (${mcp.dead.length} idle)`,
      fix: '/mcp disable'
    });
  }
  if (mem.bytes > 0) {
    const perTurn = estTokens(mem.bytes);
    if (perTurn >= 500) {
      advisories.push({ key: 'memory', detail: `~${human(perTurn)} tokens of memory carried every turn`, fix: '/tab compress' });
    }
  }

  const sessionTokens = opts.sessionTokens != null ? opts.sessionTokens : null;
  const wastedPct = sessionTokens ? Math.round((totalReclaimable / sessionTokens) * 100) : null;

  return { categories, advisories, totalReclaimable, sessionTokens, wastedPct, raw: { rr, dup, retry, mcp, mem } };
}

// --- Rendering -------------------------------------------------------------
// Every itemized line is clamped to `width` and always carries a [fix: ...].
function fitLine(prefix, mid, suffix, width) {
  prefix = prefix.padEnd(8);
  const avail = Math.max(4, width - prefix.length - suffix.length - 1);
  if (mid.length > avail) mid = mid.slice(0, avail - 1) + '…';
  return prefix + mid.padEnd(avail) + ' ' + suffix;
}

function render(result, width) {
  const W = width || 80;
  const out = ['  /tab waste'];

  if (result.categories.length === 0 && result.advisories.length === 0) {
    out.push('  No recoverable waste detected this session.');
    return out.join('\n');
  }

  if (result.sessionTokens) {
    out.push(`─ Wasted this session: ~${result.wastedPct}% of tokens (~${human(result.totalReclaimable)}, estimate)`);
  } else {
    out.push(`─ Recoverable this session: ~${human(result.totalReclaimable)} tokens (estimate)`);
  }

  const total = result.totalReclaimable || 1;
  for (const c of result.categories) {
    const share = Math.round((c.reclaimable / total) * 100);
    out.push(fitLine(`  ▸ ${share}%`, `${c.label}  ${c.evidence}`, `[fix: ${c.fix}]`, W));
  }

  if (result.advisories.length) {
    out.push('  Also carrying (review):');
    for (const a of result.advisories) {
      out.push(fitLine('  •', a.detail, `[fix: ${a.fix}]`, W));
    }
  }

  return out.join('\n');
}

module.exports = { analyze, render, estTokens, BYTES_PER_TOKEN };

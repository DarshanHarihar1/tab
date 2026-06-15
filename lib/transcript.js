'use strict';

// Parses a Claude Code session transcript (~/.claude/projects/.../<session>.jsonl)
// for per-turn token usage and reconciles it onto the ledger's tool-call events.
// Token/model data lives only in the transcript, never in hook payloads.

const fs = require('fs');

// Transcript lines may be flat or nested under `message`; tolerate both.
function fields(line) {
  const m = line.message || line;
  return {
    type: line.type || m.type,
    usage: m.usage || line.usage,
    model: m.model || line.model,
    content: m.content || line.content
  };
}

function num(x) {
  return typeof x === 'number' ? x : 0;
}

// One entry per assistant turn that reports usage, with the tool_use ids it
// contains (the join key back to ledger events).
function parseTranscript(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return [];
  const turns = [];
  for (const line of fs.readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (e) {
      continue;
    }
    const f = fields(obj);
    if (f.type !== 'assistant' || !f.usage) continue;
    const ids = Array.isArray(f.content)
      ? f.content.filter((b) => b && b.type === 'tool_use').map((b) => b.id)
      : [];
    turns.push({ usage: f.usage, model: f.model || null, toolUseIds: ids });
  }
  return turns;
}

// Returns { events, totals }. Each event gets its containing turn's usage,
// split evenly across the tool calls in that turn so per-event sums reconcile
// with the transcript. cache_creation tokens count as input (they are billed
// as input); cache_read is reported separately.
function reconcile(events, transcriptPath) {
  const turns = parseTranscript(transcriptPath);
  const byId = new Map();
  for (const t of turns) for (const id of t.toolUseIds) byId.set(id, t);

  const perTurnEvents = new Map();
  for (const e of events) {
    const t = byId.get(e.tool_use_id);
    if (t) perTurnEvents.set(t, (perTurnEvents.get(t) || 0) + 1);
  }

  const enriched = events.map((e) => {
    const t = byId.get(e.tool_use_id);
    if (!t) return Object.assign({}, e);
    const n = perTurnEvents.get(t) || 1;
    const u = t.usage;
    return Object.assign({}, e, {
      tokens_in: Math.round((num(u.input_tokens) + num(u.cache_creation_input_tokens)) / n),
      tokens_out: Math.round(num(u.output_tokens) / n),
      cache_read: Math.round(num(u.cache_read_input_tokens) / n),
      model: t.model || e.model || null
    });
  });

  let tokens_in = 0;
  let tokens_out = 0;
  let cache_read = 0;
  for (const t of turns) {
    const u = t.usage;
    tokens_in += num(u.input_tokens) + num(u.cache_creation_input_tokens);
    tokens_out += num(u.output_tokens);
    cache_read += num(u.cache_read_input_tokens);
  }

  return { events: enriched, totals: { tokens_in, tokens_out, cache_read } };
}

module.exports = { parseTranscript, reconcile };

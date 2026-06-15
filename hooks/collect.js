#!/usr/bin/env node
'use strict';

// PostToolUse collector. Writes ONE normalized event per tool call. Hot-path
// only: no transcript parsing, no analysis. Token/model fields are left null
// here and filled later by lib/transcript.reconcile() — they are not present
// in the hook payload.

const crypto = require('crypto');
const { runHook } = require('../lib/hook');
const { appendEvent, currentBranch } = require('../lib/ledger');

// Deterministic JSON for hashing: object keys sorted recursively.
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return (
    '{' +
    Object.keys(v)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + stableStringify(v[k]))
      .join(',') +
    '}'
  );
}

function argsHash(input) {
  return 'sha256:' + crypto.createHash('sha256').update(stableStringify(input || {})).digest('hex');
}

function extractTarget(tool, input) {
  if (!input) return null;
  switch (tool) {
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return input.file_path || input.notebook_path || null;
    case 'Bash':
      return typeof input.command === 'string' ? input.command.slice(0, 200) : null;
    case 'Grep':
    case 'Glob':
      return input.pattern || null;
    default:
      return null;
  }
}

function resultBytes(result) {
  if (result == null) return 0;
  if (typeof result === 'string') return Buffer.byteLength(result);
  if (typeof result.text === 'string') return Buffer.byteLength(result.text);
  try {
    return Buffer.byteLength(JSON.stringify(result));
  } catch (e) {
    return 0;
  }
}

function isError(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.is_error === true) return true;
  return Array.isArray(result.content) && result.content.some((b) => b && b.is_error);
}

function buildEvent(payload, cwd) {
  const tool = payload.tool_name;
  // PostToolUse names the result `tool_response` in some Claude Code versions and
  // `tool_result` in others; accept whichever is present.
  const result = payload.tool_response != null ? payload.tool_response : payload.tool_result;
  return {
    ts: new Date().toISOString(),
    session: payload.session_id || null,
    branch: currentBranch(cwd),
    kind: 'tool_use',
    tool: tool || null,
    tool_use_id: payload.tool_use_id || null,
    args_hash: argsHash(payload.tool_input),
    target: extractTarget(tool, payload.tool_input),
    tokens_in: null,
    tokens_out: null,
    cache_read: null,
    model: null,
    result_bytes: resultBytes(result),
    error: isError(result),
    outcome_tag: null
  };
}

function handle(payload) {
  if (payload && payload.hook_event_name && payload.hook_event_name !== 'PostToolUse') return;
  if (!payload || !payload.tool_name) return;
  const cwd = payload.cwd || process.cwd();
  appendEvent(cwd, payload.session_id, buildEvent(payload, cwd));
}

if (require.main === module) {
  runHook(handle);
}

module.exports = { handle, buildEvent, argsHash, extractTarget, resultBytes, isError, stableStringify };

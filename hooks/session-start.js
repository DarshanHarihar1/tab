#!/usr/bin/env node
'use strict';

// SessionStart hook. Initializes the session ledger and records a snapshot of
// the loaded MCP servers and memory (CLAUDE.md) files, which later phases use
// to estimate per-turn overhead. Append-only and fail-open.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { runHook } = require('../lib/hook');
const { appendEvent, currentBranch } = require('../lib/ledger');

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function mcpServers(cwd) {
  const set = new Set();
  const sources = [path.join(cwd, '.mcp.json'), path.join(os.homedir(), '.claude.json')];
  for (const p of sources) {
    const j = readJson(p);
    if (j && j.mcpServers) Object.keys(j.mcpServers).forEach((k) => set.add(k));
  }
  return [...set];
}

function memoryFiles(cwd) {
  const out = [];
  const candidates = [
    path.join(cwd, 'CLAUDE.md'),
    path.join(cwd, 'CLAUDE.local.md'),
    path.join(cwd, '.claude', 'CLAUDE.md'),
    path.join(os.homedir(), '.claude', 'CLAUDE.md')
  ];
  for (const p of candidates) {
    try {
      out.push({ path: p, bytes: fs.statSync(p).size });
    } catch (e) {
      /* not present */
    }
  }
  return out;
}

function handle(payload) {
  const cwd = payload.cwd || process.cwd();
  appendEvent(cwd, payload.session_id, {
    ts: new Date().toISOString(),
    session: payload.session_id || null,
    branch: currentBranch(cwd),
    kind: 'session_start',
    source: payload.matcher || payload.source || null,
    mcp_servers: mcpServers(cwd),
    memory_files: memoryFiles(cwd)
  });
}

if (require.main === module) {
  runHook(handle);
}

module.exports = { handle, mcpServers, memoryFiles };

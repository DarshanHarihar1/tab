#!/usr/bin/env node
'use strict';

// Tab statusline. Claude Code runs this each turn and passes a JSON payload
// (model, context fill, rate-limit window %). It maintains a small rolling
// snapshot history, prints the burn-rate forecast line, and (when derivable)
// records an estimated window capacity to window.json for the per-outcome
// report. Fail-open: any error → no output. Silence with TAB_STATUSLINE=0.
//
// NOTE: a plugin cannot auto-register a statusline and ${CLAUDE_PLUGIN_ROOT}
// does not expand in the statusLine command. Register this in settings.json
// with an absolute path (the Phase 6 installer automates it). See skills/tab.

const fs = require('fs');
const path = require('path');
const forecast = require('../lib/forecast');
const { ledgerDir, readEvents } = require('../lib/ledger');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (e) {
    return '';
  }
}

function statePath(cwd) {
  return path.join(ledgerDir(cwd), 'statusline-state.json');
}

function loadState(cwd) {
  try {
    return JSON.parse(fs.readFileSync(statePath(cwd), 'utf8'));
  } catch (e) {
    return { history: [] };
  }
}

function saveState(cwd, state) {
  try {
    fs.mkdirSync(ledgerDir(cwd), { recursive: true });
    fs.writeFileSync(statePath(cwd), JSON.stringify(state));
  } catch (e) {
    /* best-effort */
  }
}

function recentToolEvents(cwd, session) {
  try {
    return readEvents(cwd, session)
      .filter((e) => e.kind === 'tool_use')
      .slice(-8);
  } catch (e) {
    return [];
  }
}

// Estimate the 5-hour window's token capacity from token-vs-% deltas and write
// it for Phase 3 (clearly an estimate). The payload exposes only a percentage,
// so this is the only way to express per-outcome "% of window" in tokens.
function maybeWriteWindow(cwd, history) {
  if (history.length < 2) return;
  const a = history[0];
  const b = history[history.length - 1];
  if (a.cumTokens == null || b.cumTokens == null || a.pct5h == null || b.pct5h == null) return;
  const dT = b.cumTokens - a.cumTokens;
  const dP = b.pct5h - a.pct5h;
  if (dT > 0 && dP > 0) {
    try {
      fs.writeFileSync(path.join(ledgerDir(cwd), 'window.json'), JSON.stringify({ cap5h: Math.round((100 * dT) / dP), ts: b.ts, estimate: true }));
    } catch (e) {
      /* best-effort */
    }
  }
}

function main() {
  if (process.env.TAB_STATUSLINE === '0') process.exit(0);
  let payload;
  try {
    payload = JSON.parse(readStdin() || '{}');
  } catch (e) {
    process.exit(0);
  }
  try {
    const cwd = (payload.workspace && payload.workspace.current_dir) || payload.cwd || process.cwd();
    const snap = forecast.extractSnapshot(payload, Date.now());
    const state = loadState(cwd);
    state.history = (state.history || []).concat([snap]).slice(-5);
    saveState(cwd, state);
    maybeWriteWindow(cwd, state.history);

    const burn = forecast.computeBurn(state.history);
    const cls = forecast.classifyWork(recentToolEvents(cwd, payload.session_id));
    const lever = forecast.chooseLever({ classification: cls, contextPct: snap.contextPct, minutesToEmpty: burn.minutesToEmpty });
    const line = forecast.formatLine(burn, snap, cls, lever);
    if (line) process.stdout.write(line);
  } catch (e) {
    /* fail-open: no output */
  }
  process.exit(0);
}

main();

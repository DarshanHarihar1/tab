#!/usr/bin/env node
'use strict';

// Stop hook. Records a task boundary, writes the per-outcome report for this
// session, and emits a concise one-line summary to the user. Fail-open and fast
// — it does NOT shell out to git (that would risk the Stop budget); tokens-per-
// surviving-line is computed on demand by `/tab report`. Silence with TAB_REPORT=0.

const fs = require('fs');
const path = require('path');
const { runHook } = require('../lib/hook');
const { appendEvent, readEvents, currentBranch, ledgerDir } = require('../lib/ledger');
const { reconcile } = require('../lib/transcript');
const attributor = require('../lib/attributor');

function handle(payload) {
  if (process.env.TAB_REPORT === '0') return;
  const cwd = payload.cwd || process.cwd();
  const session = payload.session_id;
  const branch = currentBranch(cwd);

  appendEvent(cwd, session, { ts: new Date().toISOString(), session, branch, kind: 'stop' });

  let events = readEvents(cwd, session);
  if (payload.transcript_path) {
    try {
      events = reconcile(events, payload.transcript_path).events;
    } catch (e) {
      /* reconcile is best-effort */
    }
  }

  const report = attributor.attribute(events, { branch });
  try {
    fs.writeFileSync(path.join(ledgerDir(cwd), session + '.report.txt'), attributor.render(report));
  } catch (e) {
    /* report file is best-effort */
  }

  if (report.tokens <= 0) return;
  const one =
    `[tab] ${report.branch || '(no branch)'}: ${attributor.human(report.tokens)} tokens` +
    (report.wasteSharePct != null ? ` · ${report.wasteSharePct}% waste` : '') +
    ' · /tab report';
  return { systemMessage: one };
}

if (require.main === module) {
  runHook(handle);
}

module.exports = { handle };

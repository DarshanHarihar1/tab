#!/usr/bin/env node
'use strict';

// Tab CLI. Thin entry the slash commands wrap. Locates the current project's
// most-recent session ledger, optionally reconciles tokens from the transcript,
// and prints the requested report.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ledgerDir, readEvents } = require('../lib/ledger');
const { reconcile } = require('../lib/transcript');
const waste = require('../lib/waste');

function latestSession(cwd) {
  const dir = ledgerDir(cwd);
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  } catch (e) {
    return null;
  }
  if (!files.length) return null;
  files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
  return files[0].replace(/\.jsonl$/, '');
}

function findTranscript(cwd, session) {
  const root = path.join(os.homedir(), '.claude', 'projects');
  const encoded = path.join(root, cwd.replace(/[/.]/g, '-'), session + '.jsonl');
  if (fs.existsSync(encoded)) return encoded;
  try {
    for (const d of fs.readdirSync(root)) {
      const p = path.join(root, d, session + '.jsonl');
      if (fs.existsSync(p)) return p;
    }
  } catch (e) {
    /* no transcripts dir */
  }
  return null;
}

function main() {
  const cmd = process.argv[2] || 'waste';
  const cwd = process.cwd();
  const session = latestSession(cwd);
  if (!session) {
    console.log('  /tab: no session ledger found yet for this project.');
    return;
  }

  let events = readEvents(cwd, session);
  let sessionTokens = null;
  const tp = findTranscript(cwd, session);
  if (tp) {
    const r = reconcile(events, tp);
    events = r.events;
    sessionTokens = (r.totals.tokens_in || 0) + (r.totals.cache_read || 0) + (r.totals.tokens_out || 0);
  }

  if (cmd === 'waste') {
    console.log(waste.render(waste.analyze(events, { sessionTokens }), process.stdout.columns || 80));
  } else {
    console.log('  /tab: unknown command "' + cmd + '"');
  }
}

main();

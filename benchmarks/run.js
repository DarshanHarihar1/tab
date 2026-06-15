#!/usr/bin/env node
'use strict';

// Benchmark — reproduces the README headline number from recorded sessions.
// Each session in sessions/ is a ledger with real-shaped waste; this aggregates
// the reclaimable tokens across them. The README cites the HEADLINE printed here.

const fs = require('fs');
const path = require('path');
const waste = require('../lib/waste');

const dir = path.join(__dirname, 'sessions');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

let totalReclaim = 0;
let totalTokens = 0;
console.log('Tab benchmark — reclaimable-token receipts\n');
for (const f of files) {
  const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const a = waste.analyze(s.events, { sessionTokens: s.sessionTokens });
  totalReclaim += a.totalReclaimable;
  totalTokens += s.sessionTokens;
  console.log(`  ${s.name.padEnd(22)} ${String(a.wastedPct + '%').padStart(4)} waste  (${a.totalReclaimable} of ${s.sessionTokens} tokens)`);
}

const headline = Math.round((totalReclaim / totalTokens) * 100);
console.log(`\n  HEADLINE: reclaims ~${headline}% of wasted tokens across ${files.length} benchmark sessions`);
console.log(`  (${totalReclaim} reclaimable of ${totalTokens} total tokens)`);

#!/usr/bin/env node
'use strict';

// Accuracy eval harness for the Waste Ledger. For each fixture, compares the
// analyzer's reclaimable-token estimate against the known injected ground truth
// and asserts it is within TOLERANCE. Exits non-zero on any failure so it can
// gate merges (Phase 6). See README.md for method and the chosen tolerance.

const fs = require('fs');
const path = require('path');
const waste = require('../lib/waste');

const TOLERANCE = 0.1; // ±10% — recorded in evals/README.md

const dir = path.join(__dirname, 'fixtures');
const fixtures = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

let failed = 0;
console.log('Waste estimate accuracy (tolerance ±' + TOLERANCE * 100 + '%)\n');
for (const f of fixtures) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const got = waste.analyze(fx.events, { sessionTokens: fx.sessionTokens }).totalReclaimable;
  const truth = fx.ground_truth_reclaimable;
  const err = truth === 0 ? (got === 0 ? 0 : 1) : Math.abs(got - truth) / truth;
  const ok = err <= TOLERANCE;
  if (!ok) failed++;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${f.padEnd(22)} est=${got}  truth=${truth}  err=${(err * 100).toFixed(1)}%`
  );
}

console.log('\n' + (failed ? `${failed} fixture(s) out of tolerance` : 'all fixtures within tolerance'));
process.exit(failed ? 1 : 0);

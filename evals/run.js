#!/usr/bin/env node
'use strict';

// Accuracy eval harness for the Waste Ledger. For each fixture, compares the
// analyzer's reclaimable-token estimate against the known injected ground truth
// and asserts it is within TOLERANCE. Exits non-zero on any failure so it can
// gate merges (Phase 6). See README.md for method and the chosen tolerance.

const fs = require('fs');
const path = require('path');
const waste = require('../lib/waste');
const anomaly = require('../lib/anomaly');
const forecast = require('../lib/forecast');

const TOLERANCE = 0.1; // ±10% — recorded in evals/README.md
const FORECAST_Y = 0.25; // ±25% — recorded in evals/README.md

let failed = 0;

// --- Waste estimate accuracy ----------------------------------------------
const dir = path.join(__dirname, 'fixtures');
const fixtures = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

console.log('Waste estimate accuracy (tolerance ±' + TOLERANCE * 100 + '%)\n');
for (const f of fixtures) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const got = waste.analyze(fx.events, { sessionTokens: fx.sessionTokens }).totalReclaimable;
  const truth = fx.ground_truth_reclaimable;
  const err = truth === 0 ? (got === 0 ? 0 : 1) : Math.abs(got - truth) / truth;
  const ok = err <= TOLERANCE;
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${f.padEnd(22)} est=${got}  truth=${truth}  err=${(err * 100).toFixed(1)}%`);
}

// --- Anomaly precision (false alarms must be zero) -------------------------
const adir = path.join(dir, 'anomaly');
const types = ['cache_break', 'context_jump'];
let tp = 0;
let fp = 0;
let fn = 0;

console.log('\nAnomaly detection (false alarms must be ZERO)\n');
for (const f of fs.readdirSync(adir).filter((x) => x.endsWith('.json'))) {
  const fx = JSON.parse(fs.readFileSync(path.join(adir, f), 'utf8'));
  const fired = new Set(anomaly.detect(fx.events, fx.turns).map((a) => a.type));
  let ok = true;
  for (const t of types) {
    const exp = !!(fx.expect && fx.expect[t]);
    const got = fired.has(t);
    if (got && exp) tp++;
    else if (got && !exp) {
      fp++;
      ok = false;
    } else if (!got && exp) {
      fn++;
      ok = false;
    }
  }
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${f.padEnd(22)} fired=[${[...fired].join(',')}]`);
}
const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
console.log(`\n  precision=${precision.toFixed(2)} (target ≥0.95)  false_alarms=${fp}  misses=${fn}`);
if (fp > 0) failed++; // near-zero false alarms is non-negotiable

// --- Forecast error --------------------------------------------------------
const fdir = path.join(dir, 'forecast');
console.log('\nForecast error (tolerance ±' + FORECAST_Y * 100 + '%)\n');
for (const f of fs.readdirSync(fdir).filter((x) => x.endsWith('.json'))) {
  const fx = JSON.parse(fs.readFileSync(path.join(fdir, f), 'utf8'));
  const got = forecast.computeBurn(fx.history).minutesToEmpty;
  const truth = fx.expectedMinutesToEmpty;
  const err = Math.abs(got - truth) / truth;
  const ok = err <= FORECAST_Y;
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${f.padEnd(22)} est=${got}  truth=${truth}  err=${(err * 100).toFixed(1)}%`);
}

console.log('\n' + (failed ? `${failed} check(s) failed` : 'all checks passed'));
process.exit(failed ? 1 : 0);

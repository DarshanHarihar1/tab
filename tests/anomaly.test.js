'use strict';

const test = require('node:test');
const assert = require('node:assert');
const anomaly = require('../lib/anomaly');

function turn(input_tokens, cache_read) {
  return { usage: { input_tokens, cache_read_input_tokens: cache_read, cache_creation_input_tokens: 0 } };
}
function read(bytes, ts) {
  return { kind: 'tool_use', tool: 'Read', result_bytes: bytes, ts: ts || '2026-01-01T00:00:00Z' };
}

// Testing criterion 1: cache-ratio collapse → fires once, worded "likely".
test('cache break fires once, worded "likely" not "confirmed"', () => {
  // turn 0: 90% cache hit (9000/10000); turn 1: ~9% (1000/11000)
  const turns = [turn(1000, 9000), turn(10000, 1000), turn(10000, 1000)];
  const cb = anomaly.detectCacheBreak(turns);
  assert.ok(cb, 'cache break detected');
  assert.match(cb.message, /likely/);
  assert.ok(!/confirmed/i.test(cb.message));

  const all = anomaly.detect([], turns);
  assert.strictEqual(all.filter((a) => a.type === 'cache_break').length, 1); // exactly once
});

// Testing criterion 2: a multi-file context jump → "Compact?" nudge fires.
test('context jump fires on a large multi-file read step', () => {
  const events = Array.from({ length: 15 }, (_, i) => read(40000, `2026-01-01T00:00:0${i}Z`)); // ~10k tok each
  const cj = anomaly.detectContextJump(events);
  assert.ok(cj, 'context jump detected');
  assert.match(cj.message, /pulled 15 files/);
  assert.match(cj.message, /Compact\?/);
});

// Testing criterion 3 (CRITICAL): a normal steady-cache session → ZERO alerts.
test('false-alarm guard: a normal session produces zero alerts', () => {
  // steady ~80% cache, small interspersed reads broken up by edits
  const turns = [turn(2000, 8000), turn(2000, 8200), turn(1800, 8100), turn(2100, 8300)];
  const events = [];
  for (let i = 0; i < 6; i++) {
    events.push(read(3000, `2026-01-01T00:0${i}:00Z`));
    events.push({ kind: 'tool_use', tool: 'Edit', result_bytes: 0, ts: `2026-01-01T00:0${i}:30Z` });
  }
  assert.deepStrictEqual(anomaly.detect(events, turns), []);
});

test('no cache break on a mild dip (conservative thresholds)', () => {
  const turns = [turn(2000, 8000), turn(3000, 5000)]; // 80% → 62.5%, not a collapse
  assert.strictEqual(anomaly.detectCacheBreak(turns), null);
});

test('no context jump for normal-sized reads', () => {
  const events = Array.from({ length: 4 }, (_, i) => read(5000, `2026-01-01T00:0${i}:00Z`));
  assert.strictEqual(anomaly.detectContextJump(events), null);
});

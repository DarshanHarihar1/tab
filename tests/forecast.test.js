'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const forecast = require('../lib/forecast');

const MIN = 60000;

// Testing criterion 1: replay a high-burn session → forecast minutes-to-empty
// within ±25% of the actual at each checkpoint. (Tolerance Y = 25%.)
test('forecast minutes-to-empty within ±25% on a linear-burn replay', () => {
  // pct = 20 + 4%/min. True minutes-to-empty at pct p = (100 - p) / 4.
  const history = [0, 2, 4, 6, 8].map((m) => ({ ts: m * MIN, pct5h: 20 + 4 * m }));
  for (let end = 2; end < history.length; end++) {
    const slice = history.slice(0, end + 1);
    const got = forecast.computeBurn(slice).minutesToEmpty;
    const actual = (100 - slice[slice.length - 1].pct5h) / 4;
    assert.ok(Math.abs(got - actual) / actual <= 0.25, `checkpoint ${end}: got ${got}, actual ${actual}`);
  }
});

test('computeBurn derives a token-per-minute rate from cumulative tokens', () => {
  const history = [
    { ts: 0, pct5h: 10, cumTokens: 0 },
    { ts: 2 * MIN, pct5h: 18, cumTokens: 8000 }
  ];
  const b = forecast.computeBurn(history);
  assert.strictEqual(b.tokenPerMin, 4000); // 8000 / 2 min
  assert.ok(b.minutesToEmpty > 0);
});

// Testing criterion 2: graceful degradation when fields are missing.
test('degrades gracefully with missing data (no throw, no false forecast)', () => {
  assert.deepStrictEqual(forecast.computeBurn([]), { pctPerMin: null, minutesToEmpty: null, tokenPerMin: null });
  const snap = forecast.extractSnapshot({}, 0); // empty payload
  assert.strictEqual(snap.pct5h, null);
  assert.strictEqual(snap.contextPct, null);
  assert.strictEqual(forecast.formatLine({ minutesToEmpty: null }, snap, null, ''), '');
});

test('classifyWork recognizes work types from tool mix', () => {
  const reads = (n) => Array.from({ length: n }, () => ({ tool: 'Read' }));
  const edits = (n) => Array.from({ length: n }, () => ({ tool: 'Edit' }));
  assert.strictEqual(forecast.classifyWork(edits(4)), 'boilerplate');
  assert.strictEqual(forecast.classifyWork([...reads(3), { tool: 'Grep' }]), 'exploration');
  assert.strictEqual(forecast.classifyWork([{ tool: 'Read' }, { tool: 'Edit' }, { tool: 'Bash' }]), 'refactor');
});

test('chooseLever prioritizes compact, then Haiku, then scope', () => {
  assert.strictEqual(forecast.chooseLever({ contextPct: 80 }), '/compact now');
  assert.strictEqual(forecast.chooseLever({ classification: 'boilerplate', contextPct: 10 }), 'route Haiku?');
  assert.strictEqual(forecast.chooseLever({ minutesToEmpty: 10, contextPct: 10 }), 'scope the task');
  assert.strictEqual(forecast.chooseLever({ contextPct: 10 }), '');
});

test('formatLine renders the full forecast line', () => {
  const line = forecast.formatLine(
    { minutesToEmpty: 16, tokenPerMin: 4100, pctPerMin: 2 },
    { contextPct: 30 },
    'boilerplate',
    'route Haiku?'
  );
  assert.match(line, /window empty ~16 min/);
  assert.match(line, /boilerplate ahead/);
  assert.match(line, /route Haiku\?/);
});

// Testing criterion 3 (silence) + end-to-end statusline behavior via spawn.
const statusScript = path.join(__dirname, '..', 'statusline', 'tab-statusline.js');
function runStatusline(payload, env) {
  return spawnSync(process.execPath, [statusScript], {
    input: JSON.stringify(payload),
    env: Object.assign({}, process.env, env),
    encoding: 'utf8'
  });
}

test('TAB_STATUSLINE=0 silences output', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-sl0-'));
  const r = runStatusline({ workspace: { current_dir: '/p' }, rate_limits: { five_hour: { used_percentage: 50 } } }, {
    HOME: home,
    USERPROFILE: home,
    TAB_STATUSLINE: '0'
  });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
});

test('statusline exits 0 on empty payload (graceful)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-slx-'));
  const r = runStatusline({}, { HOME: home, USERPROFILE: home });
  assert.strictEqual(r.status, 0);
});

test('statusline emits a forecast once it has history', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-sl-'));
  const cwd = '/proj';
  // Seed an older snapshot so the new turn can compute a burn rate.
  const dir = path.join(home, '.tab', 'proj');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'statusline-state.json'),
    JSON.stringify({ history: [{ ts: Date.now() - 4 * MIN, pct5h: 20, cumTokens: 1000 }] })
  );
  const r = runStatusline(
    { workspace: { current_dir: cwd }, session_id: 's', rate_limits: { five_hour: { used_percentage: 40 } }, context_window: { used_percentage: 30, total_input_tokens: 5000, total_output_tokens: 0 } },
    { HOME: home, USERPROFILE: home }
  );
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /window empty ~\d+ min/);
});

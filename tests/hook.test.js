'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const collectScript = path.join(__dirname, '..', 'hooks', 'collect.js');

// Writable throwaway HOME for the in-process latency test.
const homeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-home-'));
process.env.HOME = homeTmp;
process.env.USERPROFILE = homeTmp;

function runScript(input, env) {
  return spawnSync(process.execPath, [collectScript], {
    input,
    env: Object.assign({}, process.env, env),
    encoding: 'utf8'
  });
}

// Testing criterion 3 (fail-open): a crashing/malformed hook must exit 0 and
// never block the tool call.
test('fail-open: malformed stdin exits 0', () => {
  assert.strictEqual(runScript('not json{').status, 0);
});

test('fail-open: empty stdin exits 0', () => {
  assert.strictEqual(runScript('').status, 0);
});

test('fail-open: ledger write failure mid-hook still exits 0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-fail-'));
  const fileHome = path.join(dir, 'home'); // a FILE, so mkdir under it throws
  fs.writeFileSync(fileHome, 'x');
  const payload = JSON.stringify({
    hook_event_name: 'PostToolUse',
    session_id: 's',
    cwd: dir,
    tool_name: 'Read',
    tool_input: { file_path: '/a' },
    tool_use_id: 't'
  });
  const r = runScript(payload, { HOME: fileHome, USERPROFILE: fileHome });
  assert.strictEqual(r.status, 0);
});

// Testing criterion 4 (latency): 100 calls, added p95 < 30 ms for the work we
// control (stdin parse + branch read + append). Note: Node *process* startup is
// separate and outside this budget.
test('collector work p95 < 30 ms over 100 calls', () => {
  const collect = require('../hooks/collect');
  const times = [];
  for (let i = 0; i < 100; i++) {
    const start = process.hrtime.bigint();
    collect.handle({
      hook_event_name: 'PostToolUse',
      session_id: 'lat',
      cwd: homeTmp,
      tool_name: 'Read',
      tool_input: { file_path: '/a/' + i },
      tool_use_id: 't' + i,
      tool_result: { type: 'text', text: 'x' }
    });
    times.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(0.95 * times.length)];
  assert.ok(p95 < 30, `p95 was ${p95.toFixed(2)} ms`);
});

// Testing criterion 5 (privacy): hook/lib sources make no network calls.
test('no network APIs in hook or lib sources', () => {
  const files = ['hooks/collect.js', 'hooks/session-start.js', 'lib/hook.js', 'lib/ledger.js', 'lib/transcript.js', 'lib/waste.js', 'bin/tab.js'];
  const banned = /require\(\s*['"](https?|net|dns|tls|dgram|http2)['"]\s*\)|\bfetch\s*\(|XMLHttpRequest/;
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.ok(!banned.test(src), `network API found in ${f}`);
  }
});

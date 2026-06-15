'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate the ledger under a throwaway HOME before requiring the modules.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-collect-'));
process.env.HOME = tmp;
process.env.USERPROFILE = tmp;

const collect = require('../hooks/collect');
const { readEvents } = require('../lib/ledger');

// Testing criterion 1: scripted session (read 5 files, npm test x2, one grep)
// → ledger event count and tool names match exactly.
test('one event per tool call, tool names match exactly', () => {
  const cwd = tmp;
  const session = 'scripted';
  const calls = [
    ...Array.from({ length: 5 }, (_, i) => ({
      tool_name: 'Read',
      tool_input: { file_path: `/src/f${i}.ts` },
      tool_use_id: `r${i}`,
      tool_result: { type: 'text', text: 'contents' }
    })),
    { tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_use_id: 'b1', tool_result: { type: 'text', text: 'FAIL' } },
    { tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_use_id: 'b2', tool_result: { type: 'text', text: 'FAIL' } },
    { tool_name: 'Grep', tool_input: { pattern: 'foo' }, tool_use_id: 'g1', tool_result: { type: 'text', text: 'match' } }
  ];

  for (const c of calls) collect.handle(Object.assign({ hook_event_name: 'PostToolUse', session_id: session, cwd }, c));

  const events = readEvents(cwd, session);
  assert.strictEqual(events.length, 8);
  assert.deepStrictEqual(
    events.map((e) => e.tool),
    ['Read', 'Read', 'Read', 'Read', 'Read', 'Bash', 'Bash', 'Grep']
  );
  assert.ok(events.every((e) => e.kind === 'tool_use'));
  assert.ok(events.every((e) => e.args_hash.startsWith('sha256:')));
  assert.ok(events.every((e) => e.result_bytes > 0));
});

test('args_hash is stable and order-independent; differs on different input', () => {
  const a = collect.argsHash({ a: 1, b: 2 });
  const b = collect.argsHash({ b: 2, a: 1 });
  const c = collect.argsHash({ a: 1, b: 3 });
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
});

test('extractTarget pulls the right field per tool', () => {
  assert.strictEqual(collect.extractTarget('Read', { file_path: '/x.ts' }), '/x.ts');
  assert.strictEqual(collect.extractTarget('Bash', { command: 'ls' }), 'ls');
  assert.strictEqual(collect.extractTarget('Grep', { pattern: 'p' }), 'p');
  assert.strictEqual(collect.extractTarget('WebFetch', { url: 'u' }), null);
});

// A non-PostToolUse event must not write to the ledger.
test('ignores non-PostToolUse events', () => {
  const session = 'ignored';
  collect.handle({ hook_event_name: 'PreToolUse', session_id: session, cwd: tmp, tool_name: 'Read', tool_input: {}, tool_use_id: 'x' });
  assert.strictEqual(readEvents(tmp, session).length, 0);
});

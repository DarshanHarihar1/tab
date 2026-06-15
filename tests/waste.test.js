'use strict';

const test = require('node:test');
const assert = require('node:assert');
const waste = require('../lib/waste');

function read(target, bytes, hash) {
  return { kind: 'tool_use', tool: 'Read', target, args_hash: hash || 'h', result_bytes: bytes };
}
function bash(cmd, bytes, error) {
  return { kind: 'tool_use', tool: 'Bash', target: cmd, args_hash: 'b:' + cmd, result_bytes: bytes, error: !!error };
}

// Testing criterion 1a: a file read 6x unchanged → redundant re-read category,
// correct count.
test('detects redundant re-reads with correct count', () => {
  const events = Array.from({ length: 6 }, () => read('/src/auth.ts', 4000));
  const r = waste.analyze(events);
  const cat = r.categories.find((c) => c.key === 'rereads');
  assert.ok(cat, 'rereads category present');
  assert.strictEqual(r.raw.rr.top.reads, 6); // read 6x
  assert.strictEqual(r.raw.rr.count, 5); // 5 redundant
  assert.ok(cat.reclaimable > 0);
  assert.match(cat.evidence, /auth\.ts read 6× unchanged/);
});

// Testing criterion 1b: a command retried 5x failing → retry category, count 5.
test('detects retry loop with correct count', () => {
  const events = Array.from({ length: 5 }, () => bash('npm test', 2000, true));
  const r = waste.analyze(events);
  const cat = r.categories.find((c) => c.key === 'retries');
  assert.ok(cat, 'retries category present');
  assert.strictEqual(r.raw.retry.top.n, 5);
  assert.ok(cat.reclaimable > 0);
  assert.match(cat.evidence, /run 5× failing/);
});

// Testing criterion 2: a file that genuinely changed between reads is NOT
// flagged (different result_bytes), nor is a read after an edit.
test('false-positive guard: changed file is not flagged', () => {
  const changed = [read('/src/a.ts', 4000), read('/src/a.ts', 5200)]; // bytes differ
  assert.strictEqual(waste.analyze(changed).raw.rr.count, 0);

  const edited = [
    read('/src/b.ts', 4000),
    { kind: 'tool_use', tool: 'Edit', target: '/src/b.ts', args_hash: 'e', result_bytes: 0 },
    read('/src/b.ts', 4000)
  ];
  assert.strictEqual(waste.analyze(edited).raw.rr.count, 0);
});

test('successful repeated Bash is a duplicate, not a retry', () => {
  const events = Array.from({ length: 3 }, () => bash('ls', 100, false));
  const r = waste.analyze(events);
  assert.ok(r.categories.find((c) => c.key === 'duplicates'));
  assert.ok(!r.categories.find((c) => c.key === 'retries'));
});

test('dead MCP servers and memory surface as advisories', () => {
  const events = [
    { kind: 'session_start', mcp_servers: ['github', 'supabase', 'linear'], memory_files: [{ path: '/CLAUDE.md', bytes: 16000 }] },
    { kind: 'tool_use', tool: 'mcp__github__list_issues', target: null, args_hash: 'm', result_bytes: 10 }
  ];
  const r = waste.analyze(events);
  const mcp = r.advisories.find((a) => a.key === 'mcp');
  const mem = r.advisories.find((a) => a.key === 'memory');
  assert.ok(mcp && /3 MCP servers loaded, 1 used/.test(mcp.detail));
  assert.match(mcp.fix, /\/mcp disable/);
  assert.ok(mem && /carried every turn/.test(mem.detail));
});

// Testing criterion 3: every itemized line fits terminal width and carries a fix.
test('render: lines fit width and every itemized line has a fix', () => {
  const events = [
    ...Array.from({ length: 6 }, () => read('/src/some/really/long/path/to/auth.ts', 4000)),
    ...Array.from({ length: 5 }, () => bash('npm run test:integration --workspace=server', 2000, true)),
    { kind: 'session_start', mcp_servers: ['a', 'b'], memory_files: [{ path: '/CLAUDE.md', bytes: 16000 }] }
  ];
  const text = waste.render(waste.analyze(events, { sessionTokens: 100000 }), 80);
  const lines = text.split('\n');
  for (const l of lines) assert.ok(l.length <= 80, `line over width (${l.length}): ${l}`);
  for (const l of lines) {
    if (l.includes('▸') || l.includes('•')) assert.match(l, /\[fix: .+\]/);
  }
  assert.match(text, /Wasted this session: ~\d+% of tokens/);
});

test('render: no waste → friendly message', () => {
  assert.match(waste.render(waste.analyze([])), /No recoverable waste detected/);
});

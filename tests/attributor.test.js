'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const attributor = require('../lib/attributor');

function ev(branch, tokens_in, extra) {
  return Object.assign(
    { kind: 'tool_use', branch, session: 's', tool: 'Read', target: '/x', args_hash: 'h', result_bytes: 10, tokens_in, tokens_out: 0, cache_read: 0, ts: '2026-01-01T00:00:00Z' },
    extra
  );
}

// Testing criterion 1: correct token total + tokens-per-surviving-line.
test('attributes tokens to a branch and computes tokens/surviving-line', () => {
  const events = Array.from({ length: 4 }, (_, i) =>
    ev('feat/x', 1000, { tokens_out: 100, cache_read: 50, target: '/x' + i, args_hash: 'h' + i, ts: `2026-01-01T00:0${i}:00Z` })
  );
  const r = attributor.attribute(events, { branch: 'feat/x', survivingLines: 46 });
  assert.strictEqual(r.tokens, 4600); // 4 * (1000+100+50)
  assert.strictEqual(r.tokensPerLine, 100); // 4600 / 46
  assert.strictEqual(r.sessions, 1);
});

// Testing criterion 2: account-type units; no unlabeled $ on subscription.
test('subscription shows window %, never a dollar figure', () => {
  const events = [ev('b', 412000, { model: 'claude-sonnet-4-6' })];
  const text = attributor.render(
    attributor.attribute(events, { branch: 'b', account: 'subscription', window: { cap5h: 2168000, cap7d: 10000000 } })
  );
  assert.match(text, /% of your 5-hour window/);
  assert.ok(!text.includes('$'), 'no dollar sign on subscription');
});

test('API shows a labeled dollar estimate', () => {
  const events = [ev('b', 412000, { model: 'claude-sonnet-4-6' })];
  const text = attributor.render(attributor.attribute(events, { branch: 'b', account: 'api' }));
  assert.match(text, /\$/);
  assert.match(text, /estimate/);
});

test('default account is subscription', () => {
  assert.strictEqual(attributor.detectAccount({}), 'subscription');
});

// Testing criterion 3: edge cases must not crash.
test('edge cases: no branch, multiple branches, empty', () => {
  const none = attributor.attribute([ev(null, 100)], { branch: null });
  assert.strictEqual(none.branch, null);
  assert.match(attributor.render(none), /\(no branch\)/);

  const multi = [ev('feat/a', 1000), ev('feat/b', 5000, { ts: '2026-01-01T00:10:00Z' })];
  assert.strictEqual(attributor.attribute(multi, { branch: 'feat/a' }).tokens, 1000); // only feat/a
  const current = attributor.attribute(multi); // most-recent branch
  assert.strictEqual(current.branch, 'feat/b');
  assert.strictEqual(current.tokens, 5000);

  assert.doesNotThrow(() => attributor.render(attributor.attribute([], {})));
});

test('detached HEAD (sha as branch) does not crash', () => {
  const r = attributor.attribute([ev('a1b2c3d4e5f6', 200)], { branch: 'a1b2c3d4e5f6' });
  assert.match(attributor.render(r), /Branch: a1b2c3d4e5f6/);
});

// survivingLines integration: real git repo with known added lines.
test('survivingLines counts added lines vs base branch', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-git-'));
  const g = (args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  g(['init', '-q']);
  g(['config', 'user.email', 't@t']);
  g(['config', 'user.name', 't']);
  g(['config', 'commit.gpgsign', 'false']); // env enforces signing globally; disable for throwaway repo
  g(['checkout', '-q', '-b', 'main']);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one\ntwo\n');
  g(['add', '.']);
  g(['commit', '-q', '-m', 'base']);
  g(['checkout', '-q', '-b', 'feat']);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one\ntwo\nthree\nfour\nfive\n'); // +3
  g(['add', '.']);
  g(['commit', '-q', '-m', 'work']);
  assert.strictEqual(attributor.survivingLines(repo), 3);
});

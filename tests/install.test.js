'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function freshSettings(initial) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-inst-'));
  const p = path.join(dir, 'settings.json');
  if (initial) fs.writeFileSync(p, JSON.stringify(initial));
  process.env.TAB_SETTINGS = p;
  return p;
}

function load(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Each test re-requires the module so settingsPath() reads the current env.
function configure() {
  delete require.cache[require.resolve('../install/configure.js')];
  return require('../install/configure.js');
}

const DEST = '/home/u/.claude/plugins/tab';

test('install registers hooks + statusline', () => {
  const p = freshSettings();
  configure().install(DEST);
  const s = load(p);
  assert.ok(s.hooks.SessionStart && s.hooks.PostToolUse && s.hooks.Stop);
  assert.match(s.statusLine.command, /tab-statusline\.js/);
  assert.ok(s.hooks.PostToolUse[0].hooks[0].command.includes(DEST));
});

test('install is idempotent (no duplicate entries)', () => {
  const p = freshSettings();
  const cfg = configure();
  cfg.install(DEST);
  cfg.install(DEST);
  cfg.install(DEST);
  const s = load(p);
  assert.strictEqual(s.hooks.SessionStart.length, 1);
  assert.strictEqual(s.hooks.PostToolUse.length, 1);
  assert.strictEqual(s.hooks.Stop.length, 1);
});

test('uninstall removes only tab entries, preserves the rest', () => {
  const p = freshSettings({
    model: 'opus',
    statusLine: { type: 'command', command: 'node /other/statusline.js' },
    hooks: { PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'node /other/hook.js' }] }] }
  });
  const cfg = configure();
  cfg.install(DEST);
  cfg.uninstall(DEST);
  const s = load(p);
  assert.strictEqual(s.model, 'opus'); // unrelated preserved
  assert.strictEqual(s.statusLine.command, 'node /other/statusline.js'); // user's statusline untouched
  assert.strictEqual(s.hooks.PostToolUse.length, 1); // only the user's hook remains
  assert.ok(s.hooks.PostToolUse[0].hooks[0].command.includes('/other/hook.js'));
  assert.ok(!s.hooks.SessionStart, 'tab SessionStart removed');
});

test("install does not clobber a user's existing statusline", () => {
  const p = freshSettings({ statusLine: { type: 'command', command: 'node /mine.js' } });
  configure().install(DEST);
  assert.strictEqual(load(p).statusLine.command, 'node /mine.js');
});

#!/usr/bin/env node
'use strict';

// Settings configurator for the installer. Merges Tab's hooks + statusline into
// ~/.claude/settings.json idempotently, and removes them cleanly on uninstall.
// Local-only file edits; no network. Entries are identified by the install dest
// path embedded in each command, so re-running never duplicates and uninstall
// leaves any unrelated user config untouched.

const fs = require('fs');
const path = require('path');
const os = require('os');

function settingsPath() {
  return process.env.TAB_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');
}

function read(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return {};
  }
}

function write(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

function isOurs(cmd, dest) {
  return typeof cmd === 'string' && cmd.indexOf(dest) !== -1;
}

function nodeCmd(dest, rel) {
  return `node "${path.join(dest, rel)}"`;
}

function hookGroups(dest) {
  return {
    SessionStart: { hooks: [{ type: 'command', command: nodeCmd(dest, 'hooks/session-start.js') }] },
    PostToolUse: { matcher: '*', hooks: [{ type: 'command', command: nodeCmd(dest, 'hooks/collect.js') }] },
    Stop: { hooks: [{ type: 'command', command: nodeCmd(dest, 'hooks/finalize.js') }] }
  };
}

function removeOurs(settings, dest) {
  if (settings.hooks) {
    for (const ev of Object.keys(settings.hooks)) {
      settings.hooks[ev] = (settings.hooks[ev] || []).filter((group) => !(group.hooks || []).some((h) => isOurs(h.command, dest)));
      if (settings.hooks[ev].length === 0) delete settings.hooks[ev];
    }
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  }
  if (settings.statusLine && isOurs(settings.statusLine.command, dest)) delete settings.statusLine;
}

function install(dest) {
  const p = settingsPath();
  const s = read(p);
  removeOurs(s, dest); // idempotent: clear any prior tab entries first
  s.hooks = s.hooks || {};
  const groups = hookGroups(dest);
  for (const ev of Object.keys(groups)) s.hooks[ev] = (s.hooks[ev] || []).concat([groups[ev]]);

  const slCmd = nodeCmd(dest, 'statusline/tab-statusline.js');
  if (!s.statusLine) s.statusLine = { type: 'command', command: slCmd };
  else if (isOurs(s.statusLine.command, dest)) s.statusLine.command = slCmd;
  // else: leave the user's existing statusline in place (don't clobber it).

  write(p, s);
  return s;
}

function uninstall(dest) {
  const p = settingsPath();
  const s = read(p);
  removeOurs(s, dest);
  write(p, s);
  return s;
}

if (require.main === module) {
  const mode = process.argv[2];
  const dest = process.argv[3];
  if (!dest || (mode !== 'install' && mode !== 'uninstall')) {
    console.error('usage: configure.js install|uninstall <dest>');
    process.exit(1);
  }
  (mode === 'install' ? install : uninstall)(dest);
}

module.exports = { install, uninstall, hookGroups, removeOurs, settingsPath };

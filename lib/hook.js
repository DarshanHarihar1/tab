'use strict';

// Fail-open hook runner. Reads the JSON payload Claude Code sends on stdin,
// hands it to `handler`, and ALWAYS exits 0 so a crash here can never block a
// tool call (mirrors Claude Code's permissive hook default). Any error is
// swallowed to a temp log; the agent continues regardless.

const fs = require('fs');
const os = require('os');
const path = require('path');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (e) {
    return '';
  }
}

function logError(err) {
  try {
    fs.appendFileSync(
      path.join(os.tmpdir(), 'tab-hook-error.log'),
      new Date().toISOString() + ' ' + (err && err.stack ? err.stack : err) + '\n'
    );
  } catch (e) {
    /* fail-open: even logging must not throw */
  }
}

function runHook(handler) {
  let payload;
  try {
    payload = JSON.parse(readStdin() || '{}');
  } catch (e) {
    process.exit(0); // malformed stdin: allow, do nothing
    return;
  }
  try {
    const out = handler(payload);
    if (out) process.stdout.write(JSON.stringify(out));
  } catch (e) {
    logError(e);
  }
  process.exit(0);
}

module.exports = { runHook, readStdin };

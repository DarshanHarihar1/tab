'use strict';

// Local, append-only event ledger under ~/.tab/<project>/<session>.jsonl.
// Local only — never networked. Shared by the hooks (writers) and, later, the
// analyzers (readers).

const fs = require('fs');
const os = require('os');
const path = require('path');

function slug(s) {
  return String(s == null ? 'unknown' : s).replace(/[^a-zA-Z0-9._-]/g, '-');
}

// project = basename(cwd). Same-named directories in different paths collide;
// acceptable for v1 (see "attribution edge cases" in the spec's open questions).
function ledgerDir(cwd) {
  return path.join(os.homedir(), '.tab', slug(path.basename(cwd || 'unknown')));
}

function ledgerPath(cwd, session) {
  return path.join(ledgerDir(cwd), slug(session || 'session') + '.jsonl');
}

function appendEvent(cwd, session, event) {
  const dir = ledgerDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(ledgerPath(cwd, session), JSON.stringify(event) + '\n');
}

function readEvents(cwd, session) {
  const p = ledgerPath(cwd, session);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);
}

function findGitDir(cwd) {
  let dir = path.resolve(cwd || '.');
  for (let i = 0; i < 50; i++) {
    const g = path.join(dir, '.git');
    if (fs.existsSync(g)) return g;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Read the current branch from .git/HEAD directly — a single small file read,
// fast enough for the hot path (no `git` child process). Reflects checkouts
// live. Returns the short SHA for detached HEAD, or null if not a repo.
function currentBranch(cwd) {
  try {
    const g = findGitDir(cwd);
    if (!g) return null;
    let headPath;
    if (fs.statSync(g).isDirectory()) {
      headPath = path.join(g, 'HEAD');
    } else {
      const m = fs.readFileSync(g, 'utf8').match(/gitdir:\s*(.+)/);
      if (!m) return null;
      headPath = path.join(m[1].trim(), 'HEAD');
    }
    const head = fs.readFileSync(headPath, 'utf8').trim();
    const ref = head.match(/ref:\s*refs\/heads\/(.+)/);
    return ref ? ref[1] : head.slice(0, 12);
  } catch (e) {
    return null;
  }
}

module.exports = { ledgerDir, ledgerPath, appendEvent, readEvents, currentBranch };

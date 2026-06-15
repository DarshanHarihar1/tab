#!/usr/bin/env bash
# Tab installer (macOS / Linux / WSL). Copies the plugin into ~/.claude/plugins/tab
# and registers its hooks + statusline in ~/.claude/settings.json. Idempotent.
# Uninstall with: install.sh --uninstall
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${TAB_DEST:-$HOME/.claude/plugins/tab}"

if [ "${1:-}" = "--uninstall" ]; then
  [ -f "$DEST/install/configure.js" ] && node "$DEST/install/configure.js" uninstall "$DEST" || true
  rm -rf "$DEST"
  echo "tab: uninstalled."
  exit 0
fi

command -v node >/dev/null 2>&1 || { echo "tab: needs Node >= 18 on PATH." >&2; exit 1; }
[ -d "$HOME/.claude" ] || echo "tab: note — ~/.claude not found; is Claude Code installed?"

mkdir -p "$DEST"
for item in .claude-plugin hooks lib statusline bin commands skills install package.json; do
  [ -e "$SRC/$item" ] && cp -R "$SRC/$item" "$DEST/"
done

node "$DEST/install/configure.js" install "$DEST"

echo "tab: installed to $DEST and registered in ~/.claude/settings.json."
echo "tab: restart Claude Code. Silence the statusline any time with TAB_STATUSLINE=0."

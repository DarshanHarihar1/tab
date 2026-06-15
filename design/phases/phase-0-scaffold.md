# Phase 0 — Scaffold & installable plugin skeleton

**Goal:** an empty but installable plugin, so the distribution path is proven before any logic exists.

**Git tag:** `v0.0.1`

-----

## Implementation

- Initialize repo `tab`, MIT `LICENSE`, README stub.
- `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` (schemas from §7 of the tech spec).
- Empty `skills/tab/SKILL.md` with valid frontmatter; create `commands/`, `hooks/`, `statusline/`, `lib/`, `bin/`.
- One no-op `/tab` command that prints a version banner.
- Tag `v0.0.1`.

-----

## Milestones

- Plugin installs from a self-hosted marketplace and from a raw GitHub URL.
- `/tab` responds after a restart.

-----

## Testing criteria (must pass)

- Fresh machine: `/plugin marketplace add you/tab` → `/plugin install tab@tab-marketplace` → restart → `/tab` prints banner.
- `plugin.json` and `marketplace.json` validate against the current plugin schema (no load errors in `claude --debug`).
- Plugin's resting context cost is just name+description (verify via `/context` that it adds no measurable overhead when idle).
- Install is reproducible from a tagged release (confirm the system pulls the tag, not `main`).

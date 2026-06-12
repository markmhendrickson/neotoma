#!/usr/bin/env bash
# Continuous skills mirror for LaunchAgent com.neotoma.skills-sync.
#
# Watches the canonical skills/ directory and re-runs `neotoma skills sync`
# whenever a skill is added, removed, renamed, or edited — so every installed
# harness (claude-code, cursor, codex, openclaw) stays in sync automatically.
# Also runs once at load (RunAtLoad) to pick up newly-installed harnesses.
#
# Watch mechanism: prefers fswatch (event-driven, low latency); falls back to a
# polling loop when fswatch is unavailable so the daemon works on any machine.
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

SKILLS_DIR="$REPO_ROOT/skills"

run_sync() {
  if [[ -f "$REPO_ROOT/dist/cli/bootstrap.js" ]]; then
    node "$REPO_ROOT/dist/cli/bootstrap.js" skills sync || true
  elif command -v neotoma >/dev/null 2>&1; then
    neotoma skills sync || true
  else
    echo "neotoma skills sync: no CLI found. Run npm run build:server, or install/link neotoma globally." >&2
  fi
}

# Always reconcile once on start (creates dirs for newly-installed harnesses).
run_sync

if [[ ! -d "$SKILLS_DIR" ]]; then
  echo "skills sync: source dir $SKILLS_DIR missing; idling." >&2
fi

if command -v fswatch >/dev/null 2>&1; then
  # Event-driven: re-sync on any change under skills/. --latency debounces bursts.
  fswatch --latency 1 --one-per-batch --recursive "$SKILLS_DIR" | while read -r _; do
    run_sync
  done
else
  # Portable fallback: poll a checksum of the skills tree (names + mtimes) every 30s.
  echo "skills sync: fswatch not found; using 30s polling fallback." >&2
  prev=""
  while true; do
    cur="$(find "$SKILLS_DIR" -type f -name 'SKILL.md' -exec stat -f '%N:%m' {} + 2>/dev/null | sort | shasum | awk '{print $1}')"
    if [[ "$cur" != "$prev" ]]; then
      run_sync
      prev="$cur"
    fi
    sleep 30
  done
fi

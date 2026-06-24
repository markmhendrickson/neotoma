#!/usr/bin/env bash
#
# redeploy_rc_from_main.sh — "rolling main = RC" auto-deploy.
#
# Brings the running prod server up to the latest origin/main by:
#   1. fast-forwarding the RC checkout (this repo) to origin/main,
#      preserving the uncommitted RC version bump (e.g. 0.16.0-rc.1),
#   2. rebuilding dist — both the server (so the global CLI + any dist
#      consumers are current) AND the Inspector SPA (so the content-negotiated
#      bundle served at / reflects the new main; a server-only rebuild leaves
#      the UI stale),
#   3. HARD-restarting the prod-server launchagent (kill + relaunch) so tsx /
#      node --watch re-imports fresh modules — a soft reload was observed to
#      miss reducer changes (see the #1595 deploy session).
#
# Idempotent: if the RC is already at origin/main, it exits early without
# touching the server. Intended to be invoked by the com.neotoma.rc-autodeploy
# LaunchAgent on a StartInterval (poll), and safe to run by hand.
#
# Exit codes: 0 = up-to-date or successfully deployed; non-zero = error (the
# server is left running on its prior build; nothing destructive on failure).

set -uo pipefail

# Default RC_DIR to this script's own repo root (scripts/..), so the script is
# portable to any RC checkout; the installer still sets RC_DIR explicitly in the
# LaunchAgent env. Resolve the real path of the script even if symlinked.
_SCRIPT_SRC="${BASH_SOURCE[0]}"
while [ -h "$_SCRIPT_SRC" ]; do
  _SCRIPT_DIR="$(cd -P "$(dirname "$_SCRIPT_SRC")" >/dev/null 2>&1 && pwd)"
  _SCRIPT_SRC="$(readlink "$_SCRIPT_SRC")"
  [ "${_SCRIPT_SRC#/}" = "$_SCRIPT_SRC" ] && _SCRIPT_SRC="$_SCRIPT_DIR/$_SCRIPT_SRC"
done
_SCRIPT_DIR="$(cd -P "$(dirname "$_SCRIPT_SRC")" >/dev/null 2>&1 && pwd)"
RC_DIR="${RC_DIR:-$(cd "$_SCRIPT_DIR/.." && pwd)}"
PROD_LABEL="${PROD_LABEL:-com.neotoma.prod-server}"
HEALTH_URL="${HEALTH_URL:-https://neotoma.markmhendrickson.com/health}"
BRANCH="${BRANCH:-main}"
LOCK_DIR="${LOCK_DIR:-/tmp/neotoma-rc-autodeploy.lock.d}"

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*"; }

# Single-flight via atomic mkdir (portable; flock is unavailable on macOS).
# A stale lock older than 30 min is reclaimed so a crashed run cannot wedge the
# loop forever.
if [ -d "$LOCK_DIR" ]; then
  if [ -n "$(find "$LOCK_DIR" -prune -mmin +30 2>/dev/null)" ]; then
    log "reclaiming stale lock (>30m old)"
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
fi
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "another redeploy is in progress; skipping."
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

cd "$RC_DIR" || { log "ERROR: RC_DIR $RC_DIR missing"; exit 1; }

git fetch origin "$BRANCH" --quiet || { log "ERROR: git fetch failed"; exit 1; }

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

if [ "$LOCAL" = "$REMOTE" ]; then
  log "RC already at origin/$BRANCH ($(git rev-parse --short HEAD)); nothing to do."
  exit 0
fi

# Refuse to deploy if HEAD has diverged from origin/main (not a fast-forward).
# Rolling-main model assumes the RC only ever fast-forwards; a divergence means
# someone committed on the RC checkout and a human must reconcile.
if ! git merge-base --is-ancestor "$LOCAL" "$REMOTE"; then
  log "ERROR: RC HEAD has diverged from origin/$BRANCH (not a fast-forward). Aborting; needs manual reconcile."
  exit 1
fi

log "Updating RC $(git rev-parse --short HEAD) -> $(git rev-parse --short "origin/$BRANCH")"

# Preserve the uncommitted RC version bump (and any other local tweaks) across
# the pull. Stash only if there is something to stash.
STASHED=0
if ! git diff --quiet || ! git diff --cached --quiet; then
  if git stash push --quiet --include-untracked -m "rc-autodeploy: preserve local RC tweaks"; then
    STASHED=1
    log "stashed local RC changes (incl. version bump)"
  else
    log "ERROR: failed to stash local changes; aborting before pull"
    exit 1
  fi
fi

if ! git merge --ff-only "origin/$BRANCH" --quiet; then
  log "ERROR: fast-forward merge failed"
  [ "$STASHED" -eq 1 ] && git stash pop --quiet || true
  exit 1
fi

if [ "$STASHED" -eq 1 ]; then
  if ! git stash pop --quiet; then
    log "WARNING: stash pop conflicted (likely main changed package.json vs the RC version bump)."
    log "         Resolve manually in $RC_DIR (git status / git checkout --theirs the version bump),"
    log "         then run 'git stash drop'. The next poll (≤120s) will retry the deploy automatically."
    log "         Only remove $LOCK_DIR by hand if a prior run crashed mid-deploy and left it behind."
    log "         Server NOT restarted to avoid shipping a conflicted tree."
    exit 1
  fi
  log "restored local RC changes after fast-forward"
fi

log "RC now at $(git rev-parse --short HEAD); rebuilding dist…"
# Let stdout/stderr flow to launchd's StandardOut/ErrorPath so a build failure is
# diagnosable from the log without re-running the build by hand.
if ! npm run build:server; then
  log "ERROR: build:server failed; server left on prior build. See the build output above."
  exit 1
fi
log "build:server complete."

# Rebuild the Inspector SPA too. The prod-server serves the static
# dist/inspector bundle (content-negotiated at /), so a server-only rebuild
# leaves the UI frozen at whatever was last built by hand — observed in the
# v0.16 RC, where the git pointer advanced but the served Inspector was 10
# days stale because this step was missing. build:inspector:prod-target emits
# the prod-targeted bundle into dist/inspector.
if ! npm run build:inspector:prod-target; then
  log "ERROR: build:inspector:prod-target failed; server left on prior build. See the build output above."
  exit 1
fi
log "build:inspector complete."

# HARD restart: kickstart -k kills the existing job instance and relaunches it,
# forcing tsx/node --watch to re-import modules from the updated source.
log "hard-restarting $PROD_LABEL…"
if ! launchctl kickstart -k "gui/$(id -u)/$PROD_LABEL" 2>/dev/null; then
  launchctl kickstart -k "user/$(id -u)/$PROD_LABEL" 2>/dev/null || {
    log "ERROR: failed to kickstart $PROD_LABEL"; exit 1; }
fi

# Wait for health to come back (best-effort; the server does its own build on
# launch, so allow generous time).
log "waiting for $HEALTH_URL to report healthy…"
for i in $(seq 1 30); do
  if curl -s -m 5 "$HEALTH_URL" 2>/dev/null | grep -q '"ok":true'; then
    log "DEPLOYED: server healthy at $(git rev-parse --short HEAD) ($(curl -s -m 5 "$HEALTH_URL" | sed 's/.*\"version\":\"//;s/\".*//'))."
    exit 0
  fi
  sleep 5
done

log "WARNING: deployed code + restarted, but health did not confirm within ~150s. Check the prod-server log."
exit 0

#!/usr/bin/env bash
# Publish the current package to npm using a token sourced from .env (or the
# ambient shell), so `npm publish` can run unattended without an interactive
# `npm login` browser flow.
#
# Setup (one-time per machine):
#   1. Add a line to your repo-local .env (which is .gitignored):
#        NPM_TOKEN=npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
#      The token should be a Granular Access Token (GAT) with publish scope on
#      the `neotoma` package. For this repo's maintainer the canonical source
#      is the 1Password item named "npm", field "access token – ateles".
#      Example fetch via the 1Password CLI:
#        echo "NPM_TOKEN=$(op item get npm --fields label='access token – ateles' --reveal)" >> .env
#   2. Make ~/.npmrc interpolate that env var instead of hard-coding a token:
#        printf '//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n' > ~/.npmrc
#      (chmod 600 ~/.npmrc recommended.)
#
# After that, every release run can simply call this script and inherit auth
# from the env-sourced token. No browser, no `Exit handler never called!`.
#
# Behavior:
#   - Sources .env if present (looking for NPM_TOKEN; never echoes the value).
#   - Refuses to run when npm whoami fails, with a clear remediation hint.
#   - Forwards all extra args to `npm publish` (e.g. --otp=123456, --dry-run).

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$REPO_ROOT"

if [ -f .env ]; then
  # Auto-export every key=value while sourcing so NPM_TOKEN reaches npm.
  set -a
  # shellcheck disable=SC1091
  . .env
  set +a
fi

if [ -z "${NPM_TOKEN:-}" ]; then
  echo "[npm-publish] WARN: NPM_TOKEN is not set after sourcing .env." >&2
  echo "[npm-publish]       Falling back to whatever ~/.npmrc already holds." >&2
fi

if ! npm whoami >/tmp/npm-whoami.$$.txt 2>&1; then
  echo "[npm-publish] ERROR: npm whoami failed:" >&2
  sed 's/^/  /' /tmp/npm-whoami.$$.txt >&2 || true
  rm -f /tmp/npm-whoami.$$.txt
  cat >&2 <<'HINT'

[npm-publish] To fix:
  1. Add a fresh publish-scoped token to .env (do NOT commit):
       NPM_TOKEN=npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
     For this repo's maintainer:
       echo "NPM_TOKEN=$(op item get npm --fields label='access token – ateles' --reveal)" >> .env
  2. Confirm ~/.npmrc interpolates that var:
       printf '//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n' > ~/.npmrc
  3. Re-run this script.
HINT
  exit 1
fi

WHOAMI=$(cat /tmp/npm-whoami.$$.txt)
rm -f /tmp/npm-whoami.$$.txt
echo "[npm-publish] authenticated as: $WHOAMI"

exec npm publish "$@"

#!/usr/bin/env bash
#
# Prepare a fresh checkout to run the FULL Vitest suite (`npm test`).
#
# Why this exists
# ---------------
# The CI baseline lane runs `npm run test:unit`, which covers only
#   tests/unit tests/services tests/agent tests/contract tests/security
#   tests/cli tests/subscriptions
# The pre-commit hook, by contrast, runs `npm test` (plain `vitest run`), which
# ALSO picks up tests/integration, tests/fixtures, src/**, and inspector/src/**.
# Those extra lanes need build artifacts CI's baseline job never produces, so a
# clean checkout that is perfectly green in CI still fails locally — which is
# what pushed contributors onto `--no-verify`.
#
# Everything below is either a step CI's baseline lane already performs, or a
# build artifact that only the wider local lane requires. It installs and builds;
# it does not run tests.
#
# Usage: ./scripts/setup_test_env.sh   (or: npm run test:setup)

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Installing root dependencies"
npm ci

# --- Steps mirrored from .github/workflows/ci_test_lanes.yml (baseline lane) ---

echo "==> Initializing the inspector submodule (Vitest imports inspector sources)"
git submodule update --init --depth 1 inspector || true

echo "==> Building @neotoma/client, @neotoma/agent and cursor-hooks (hook tests import their dist/)"
for pkg in client agent cursor-hooks; do
  npm ci --prefix "packages/$pkg"
  npm run build --prefix "packages/$pkg"
done

# opencode-plugin's tests import src/ directly, so no build is needed — but the
# node_modules symlink for "@neotoma/client": "file:../client" must exist for
# ESM resolution.
npm ci --prefix packages/opencode-plugin

echo "==> Building the server (required by the CLI tests)"
npm run build:server

# --- Steps the FULL suite needs that CI's baseline lane does not perform -------

# tests/integration/{csp_local_http,embed_cross_origin_http,inspector_content_negotiation}
# assert on the served SPA shell, so they need a real dist/inspector/index.html;
# without it the mount serves 404/JSON and the assertions fail. This also
# installs inspector/node_modules, which inspector/src/**/*.test.ts import from
# (e.g. @xyflow/react in inspector/src/lib/graph_layout.ts).
echo "==> Building the Inspector SPA (dist/inspector) and installing its dependencies"
npm run build:inspector

echo
echo "Setup complete. Run the full suite with: npm test"

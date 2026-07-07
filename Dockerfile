# --- Build stage: compile TypeScript (includes devDependencies)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:server

# --- Inspector build stage: compile Vite SPA (always built; served at / by default).
FROM node:20-alpine AS inspector-build
WORKDIR /app/inspector
ARG VITE_NEOTOMA_SANDBOX_UI=""
# Vite base path = router basename (main.tsx derives ROUTER_BASENAME from
# import.meta.env.BASE_URL). The server unconditionally serves the Inspector
# SPA at the site ROOT for every deploy of this image — root-level static
# assets (installInspectorRootStaticAssets), the early SPA-shell content
# negotiation (installInspectorSpaShellEarly), and a 308 /inspector → /
# redirect (installInspectorLegacyRedirect) are all wired in unconditionally
# in src/actions.ts (see src/services/inspector_mount.ts). So the build MUST
# default to "/" here too (matching inspector/vite.config.ts's own default
# and inspector/README.md) — building with "/inspector/" makes <Router
# basename="/inspector"> unable to match "/" and renders a blank page for any
# Fly app (e.g. fly.toml's tenant-neotoma) that doesn't override this ARG.
# Set VITE_PUBLIC_BASE_PATH=/inspector/ only when restoring the legacy
# subpath mount for a deployment that deliberately serves Inspector at
# /inspector instead of /.
ARG VITE_PUBLIC_BASE_PATH="/"
COPY inspector/package*.json ./
RUN npm ci
COPY inspector/ ./
RUN VITE_PUBLIC_BASE_PATH="$VITE_PUBLIC_BASE_PATH" \
    VITE_NEOTOMA_SANDBOX_UI="$VITE_NEOTOMA_SANDBOX_UI" \
    npm run build

# --- Runtime stage: CLI + MCP server + API server
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Fly production uses internal_port 3180 (see fly.toml). Local overrides may set HTTP_PORT.
ENV HTTP_PORT=3180
# Real git commit of the deployed build, passed at deploy time
# (`flyctl deploy --build-arg NEOTOMA_GIT_SHA="$(git rev-parse HEAD)"`).
# readGitSha() (src/services/root_landing/index.ts) prefers this over the
# Fly machine-version ULID so the root JSON / footer show a verifiable commit.
ARG NEOTOMA_GIT_SHA=""
ENV NEOTOMA_GIT_SHA=$NEOTOMA_GIT_SHA
EXPOSE 3180

COPY package*.json ./
RUN npm ci --omit=dev
# flyctl ssh console -C wraps remote commands in `bash -lc`; Alpine has no bash by default.
# Required for sandbox-weekly-reset.yml to connect and run the reset script via SSH.
RUN apk add --no-cache bash

# Compiled output and OpenAPI spec
COPY --from=build /app/dist ./dist
COPY --from=build /app/openapi.yaml ./openapi.yaml

# Sandbox weekly reset + seed (see scripts/reset_sandbox.ts, fly.sandbox.toml)
COPY tests/fixtures/json ./tests/fixtures/json
COPY tests/fixtures/sandbox ./tests/fixtures/sandbox

# Inspector SPA (served at /inspector by default via inspector_mount.ts).
COPY --from=inspector-build /app/inspector/dist /app/dist/inspector

# Register `neotoma` CLI globally (bin field in package.json → dist/cli/bootstrap.js)
RUN npm link

VOLUME /app/data

# Default: run the API server. Override for CLI or MCP stdio.
CMD ["node", "dist/actions.js"]

# --- Build stage: compile TypeScript (includes devDependencies)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:server

# --- Inspector build stage: compile Vite SPA (always built; served at /inspector).
FROM node:20-alpine AS inspector-build
WORKDIR /app/inspector
ARG VITE_NEOTOMA_SANDBOX_UI=""
# Vite base path = router basename (main.tsx derives ROUTER_BASENAME from
# import.meta.env.BASE_URL). Default "/inspector/" for installs that reach the
# Inspector at /inspector. The sandbox serves the SPA at the site ROOT, so it
# must build with "/" (otherwise <Router basename="/inspector"> can't match "/"
# and renders a blank page) — fly.sandbox.toml overrides this to "/".
ARG VITE_PUBLIC_BASE_PATH="/inspector/"
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
# Required for manual operator reset (fly ssh) via sandbox-weekly-reset.yml.
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

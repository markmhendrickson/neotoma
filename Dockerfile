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
COPY inspector/package*.json ./
RUN npm ci
COPY inspector/ ./
RUN VITE_PUBLIC_BASE_PATH="/inspector/" \
    VITE_NEOTOMA_SANDBOX_UI="$VITE_NEOTOMA_SANDBOX_UI" \
    npm run build

# --- Runtime stage: CLI + MCP server + API server
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Fly production uses internal_port 3180 (see fly.toml). Local overrides may set HTTP_PORT.
ENV HTTP_PORT=3180
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

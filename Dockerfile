# --- Build stage: compile TypeScript (includes devDependencies)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:server

# --- Inspector build stage: compile Vite SPA (optional; controlled by BUILD_INSPECTOR ARG).
# When BUILD_INSPECTOR=1 the sandbox deploy bakes the Inspector into /app/inspector so
# the API server can serve it from NEOTOMA_INSPECTOR_BASE_PATH (default /app).
FROM node:20-alpine AS inspector-build
WORKDIR /app/inspector
ARG BUILD_INSPECTOR=0
ARG VITE_NEOTOMA_API_URL=""
ARG VITE_PUBLIC_BASE_PATH="/app/"
ARG VITE_NEOTOMA_SANDBOX_UI=""
COPY inspector/package*.json ./
RUN if [ "$BUILD_INSPECTOR" = "1" ]; then npm ci; else mkdir -p dist && echo '<!doctype html><title>Inspector disabled</title>' > dist/index.html; fi
COPY inspector/ ./
RUN if [ "$BUILD_INSPECTOR" = "1" ]; then \
      VITE_NEOTOMA_API_URL="$VITE_NEOTOMA_API_URL" \
      VITE_PUBLIC_BASE_PATH="$VITE_PUBLIC_BASE_PATH" \
      VITE_NEOTOMA_SANDBOX_UI="$VITE_NEOTOMA_SANDBOX_UI" \
      npm run build; \
    fi

# --- Runtime stage: CLI + MCP server + API server
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Fly production uses internal_port 3180 (see fly.toml). Local overrides may set HTTP_PORT.
ENV HTTP_PORT=3180
EXPOSE 3180

COPY package*.json ./
RUN npm ci --omit=dev

# Compiled output and OpenAPI spec
COPY --from=build /app/dist ./dist
COPY --from=build /app/openapi.yaml ./openapi.yaml

# Sandbox weekly reset + seed (see scripts/reset_sandbox.ts, fly.sandbox.toml)
COPY tests/fixtures/json ./tests/fixtures/json
COPY tests/fixtures/sandbox ./tests/fixtures/sandbox

# Inspector SPA (served at NEOTOMA_INSPECTOR_BASE_PATH when enabled).
COPY --from=inspector-build /app/inspector/dist /app/inspector

# Register `neotoma` CLI globally (bin field in package.json → dist/cli/bootstrap.js)
RUN npm link

VOLUME /app/data

# Default: run the API server. Override for CLI or MCP stdio.
CMD ["node", "dist/actions.js"]

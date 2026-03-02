# --- Build stage: compile TypeScript (includes devDependencies)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:server

# --- Runtime stage: CLI + MCP server + API server
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HTTP_PORT=3080
EXPOSE 3080

COPY package*.json ./
RUN npm ci --omit=dev

# Compiled output and OpenAPI spec
COPY --from=build /app/dist ./dist
COPY --from=build /app/openapi.yaml ./openapi.yaml

# Register `neotoma` CLI globally (bin field in package.json → dist/cli/bootstrap.js)
RUN npm link

VOLUME /app/data

# Default: run the API server. Override for CLI or MCP stdio.
CMD ["node", "dist/actions.js"]

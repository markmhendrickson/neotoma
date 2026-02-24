# Developer Getting Started Guide

_(Local-only setup)_

## Scope

This guide covers local development setup for Neotoma using SQLite + local filesystem only.

## Prerequisites

- Node.js `v18.x` or `v20.x`
- npm `v9+`
- Git (for contributors)

## Install

### Option A: npm package

```bash
npm install -g neotoma
neotoma init
neotoma api start --env dev
neotoma mcp config
```

### Option B: repository clone

```bash
git clone https://github.com/markmhendrickson/neotoma.git
cd neotoma
npm install
npm run type-check
```

## Local storage model

Neotoma now runs in local-only mode:

- SQLite database under `./data` by default
- Local raw file storage under `./data/sources`
- Optional event/log directories under `./data/events` and `./data/logs`

No remote backend configuration is required.

## Environment setup

Create a `.env` only if you want overrides. Defaults work without one.

```bash
# Optional local path overrides
# NEOTOMA_DATA_DIR=./data
# NEOTOMA_SQLITE_PATH=./data/neotoma.db
# NEOTOMA_RAW_STORAGE_DIR=./data/sources
# NEOTOMA_EVENT_LOG_DIR=./data/events
# NEOTOMA_LOGS_DIR=./data/logs

# Optional event mirroring
NEOTOMA_EVENT_LOG_MIRROR=false

# Optional server ports
PORT=3000
HTTP_PORT=8080
WS_PORT=8280

# API auth token used by local HTTP actions
ACTIONS_BEARER_TOKEN=dev-token-or-random-string

# Optional AI features
OPENAI_API_KEY=sk-your-api-key-here
```

## Run development servers

```bash
npm run dev
npm run dev:server
npm run dev:ui
npm run dev:full
```

## Run tests

```bash
npm test
npm run test:integration
npm run test:e2e
npm run type-check
npm run lint
```

## First contribution checklist

- Run `npm run type-check`
- Run `npm run lint`
- Run affected tests
- Verify no local-only behavior regressed

## Notes

- Remote backend setup has been removed from active docs and runtime.
- If remote support is needed in the future, restore from git history.

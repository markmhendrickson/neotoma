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

### Testing a local package (pack + install in another project)

To test a built package from another project (e.g. `neotoma-tests`):

1. In the neotoma repo: `npm run pack:local` (clean build then `npm pack`).
2. In the other project: `rm -rf node_modules/neotoma && npm install /path/to/neotoma/neotoma-0.3.6.tgz`.
3. Run the **project’s** CLI so you don’t use a global `neotoma`:
   - `npx neotoma init` or `./node_modules/.bin/neotoma init`

If you type `neotoma` and have a global install, the shell may run that instead of the installed package. Use `which neotoma` to confirm; prefer `npx neotoma` when testing the local tarball.

## First-run onboarding paths

### Agent path

If you want your assistant to execute setup for you, use the onboarding workflow in [Agent onboarding](agent_onboarding.md). The sequence starts with:

```bash
npm install -g neotoma
neotoma init
```

Then the agent previews candidate personal data from current session context/tool outputs and asks for confirmation before first save.

### Human path

If you are running setup directly yourself, use the install commands above and continue with the normal setup steps in this guide.

## Local storage model

Neotoma now runs in local-only mode:

- SQLite database under `./data` by default
- Local raw file storage under `./data/sources`
- Optional logs directory under `./data/logs` (includes `events.log` for event-sourcing)

No remote backend configuration is required.

## Environment setup

Run `neotoma init` first. It auto-detects whether to manage project `.env` (inside a source checkout) or user `.env` at `~/.config/neotoma/.env` (global/non-checkout usage). Create or edit `.env` only when you want overrides.

```bash
# Optional local path overrides
# NEOTOMA_DATA_DIR=./data
# NEOTOMA_RAW_STORAGE_DIR=./data/sources
# NEOTOMA_EVENT_LOG_PATH=./data/logs/events.log
# NEOTOMA_LOGS_DIR=./data/logs

# Optional event mirroring
NEOTOMA_EVENT_LOG_MIRROR=false

# Optional server ports
PORT=3000
HTTP_PORT=3080
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
- For clean-machine macOS validation, see `docs/developer/macos_vm_testing.md` (UTM + SSH workflow).

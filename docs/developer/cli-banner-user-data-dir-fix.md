---
title: "CLI banner: show Prod/Dev counts when using user data dir (no repo root)"
summary: "Apply this fix in the **Neotoma CLI** source (the package that publishes the `neotoma` npm binary). If the CLI lives in a separate repo from this one, use this doc as guidance there."
---

# CLI banner: show Prod/Dev counts when using user data dir (no repo root)

Apply this fix in the **Neotoma CLI** source (the package that publishes the `neotoma` npm binary). If the CLI lives in a separate repo from this one, use this doc as guidance there.

## Problem

When Neotoma is run as a **global install** and the user has no project root (e.g. runs `neotoma` from `~/Projects`), the intro banner shows "-" for all Prod and Dev record counts. The CLI only attempted to load local SQLite stats when `repoRootForLocal` was set (from a Neotoma checkout). Users who run `neotoma init` and set a **user-level data directory** (e.g. `~/Documents/data`) and env at `~/.config/neotoma/.env` expect the banner to show counts from those DBs even when not inside a repo.

## Root cause

- Intro stats come from `getDualEnvIntroStats(repoRoot, userId)`, which uses `resolveDataDir(repoRoot)` to find the data directory. `resolveDataDir` already returns `process.env.NEOTOMA_DATA_DIR` when set, so passing `repoRoot === null` is valid when `NEOTOMA_DATA_DIR` is set.
- The no-session path only called `getDualEnvIntroStats` when `repoRootForLocal` was truthy, so with no repo root it never read the user's SQLite DBs and showed the fallback message instead of counts.

## Fix (apply in source)

Apply the following in the **Neotoma CLI** source (e.g. `src/cli/index.ts`), in the **no-session** block where the intro panel and command menu are built.

### 1. Load user env when there is no repo root

After resolving `repoRootForLocal`, if it is null, load the user env file so `NEOTOMA_DATA_DIR` is available for local stats:

```ts
let repoRootForLocal = (await resolveAndPersistRepoRootFromInitContext()) ??
    (await resolveRepoRootFromInstalledCli());

if (!repoRootForLocal) {
    if (await pathExists(USER_ENV_PATH)) {
        const userEnv = await readEnvFileVars(USER_ENV_PATH);
        const dataDir = userEnv.NEOTOMA_DATA_DIR?.trim();
        if (dataDir)
            process.env.NEOTOMA_DATA_DIR = dataDir;
    }
}
```

- Use the existing `pathExists` and `readEnvFileVars` from the same file.
- `USER_ENV_PATH` is from `./config.js` (e.g. `path.join(os.homedir(), ".config", "neotoma", ".env")`).

### 2. Use an “effective root” for local stats and recent events

Introduce an effective root so that when there is no repo root but `NEOTOMA_DATA_DIR` is set, the CLI still fetches intro stats and recent events (with `repoRoot = null`; `resolveDataDir(null)` will return `NEOTOMA_DATA_DIR`):

```ts
const effectiveRootForLocal =
    repoRootForLocal ?? (process.env.NEOTOMA_DATA_DIR ? null : undefined);

const introStatsOrFallback =
    effectiveRootForLocal !== undefined
        ? await getDualEnvIntroStats(effectiveRootForLocal, LOCAL_DEV_USER_ID)
        : ["Production data: unavailable", "Development data: unavailable"];

const recentEvents =
    effectiveRootForLocal !== undefined
        ? await getLastNWatchEntriesAcrossEnvs(
              effectiveRootForLocal,
              LOCAL_DEV_USER_ID,
              WATCH_INITIAL_EVENT_LIMIT
          )
        : [];
```

### 3. Keep using `repoRootForLocal` for MCP/config

Leave all other uses of `repoRootForLocal` unchanged (e.g. `scanForMcpConfigs`, `scanAgentInstructions`, `buildInstallationBoxLines`, `getInitContextStatus`). Only intro stats and recent events should use `effectiveRootForLocal`.

## Before / after (reference)

**Before:** Only used local DBs when a repo root was present.

```ts
const repoRootForLocal = (await resolveAndPersistRepoRootFromInitContext()) ??
    (await resolveRepoRootFromInstalledCli());
const introStatsOrFallback = repoRootForLocal
    ? await getDualEnvIntroStats(repoRootForLocal, LOCAL_DEV_USER_ID)
    : ["Production data: unavailable", "Development data: unavailable"];
const recentEvents = repoRootForLocal
    ? await getLastNWatchEntriesAcrossEnvs(repoRootForLocal, LOCAL_DEV_USER_ID, WATCH_INITIAL_EVENT_LIMIT)
    : [];
```

**After:** When there is no repo root, load user env and still fetch local stats when `NEOTOMA_DATA_DIR` is set.

```ts
let repoRootForLocal = (await resolveAndPersistRepoRootFromInitContext()) ??
    (await resolveRepoRootFromInstalledCli());
if (!repoRootForLocal) {
    if (await pathExists(USER_ENV_PATH)) {
        const userEnv = await readEnvFileVars(USER_ENV_PATH);
        const dataDir = userEnv.NEOTOMA_DATA_DIR?.trim();
        if (dataDir)
            process.env.NEOTOMA_DATA_DIR = dataDir;
    }
}
const effectiveRootForLocal = repoRootForLocal ?? (process.env.NEOTOMA_DATA_DIR ? null : undefined);
const introStatsOrFallback = effectiveRootForLocal !== undefined
    ? await getDualEnvIntroStats(effectiveRootForLocal, LOCAL_DEV_USER_ID)
    : ["Production data: unavailable", "Development data: unavailable"];
const recentEvents = effectiveRootForLocal !== undefined
    ? await getLastNWatchEntriesAcrossEnvs(effectiveRootForLocal, LOCAL_DEV_USER_ID, WATCH_INITIAL_EVENT_LIMIT)
    : [];
```

## Prerequisites

- `resolveDataDir(repoRoot)` must return `process.env.NEOTOMA_DATA_DIR` when it is truthy (e.g. after trim), and otherwise `path.join(repoRoot, "data")`. Treat empty string as unset so that passing `null` for `repoRoot` is only valid when `NEOTOMA_DATA_DIR` is non-empty.
- `getLocalIntroStats(repoRoot, preferredEnv, userId)` uses `resolveDataDir(repoRoot)` and opens `neotoma.db` (dev) or `neotoma.prod.db` (prod) in that directory. No change required there.

## Edge cases and other call sites

- **Never pass `null` without `NEOTOMA_DATA_DIR`:** If `resolveDataDir(repoRoot)` falls through to `path.join(repoRoot, "data")` with `repoRoot === null`, Node’s `path.join` can throw or produce an invalid path. The fix only sets `effectiveRootForLocal = null` when `process.env.NEOTOMA_DATA_DIR` is set, so `resolveDataDir(null)` always returns that env value.
- **Session / REPL path:** The banner is also built when the CLI runs with a session (REPL). Search the CLI source for all calls to `getDualEnvIntroStats(...)` (e.g. on session start or SIGWINCH redraw). If the root passed there is derived from “repo root” and can be null when the user has no repo, apply the same pattern: ensure user env is loaded when repo root is null, and pass an effective root (repo root or `null` when `NEOTOMA_DATA_DIR` is set) so the session banner shows counts from the user data dir. See **[cli-banner-session-repl-fix.md](./cli-banner-session-repl-fix.md)** for step-by-step instructions for the session/REPL path.

## Verification

1. Run `neotoma init` and set the data directory (e.g. `~/Documents/data`) and user env at `~/.config/neotoma/.env` with `NEOTOMA_DATA_DIR=...`.
2. From a directory that is **not** a Neotoma repo (e.g. `~/Projects`), run `neotoma` with no arguments.
3. The intro banner should show numeric Prod and Dev counts (or 0) instead of "-" when the user data dir contains initialized `neotoma.db` and `neotoma.prod.db`.

## Checklist when applying in source

- [ ] User env is loaded only when `repoRootForLocal` is null (avoid overwriting existing `NEOTOMA_DATA_DIR` from a project `.env`).
- [ ] `effectiveRootForLocal` is `undefined` only when there is no repo root and no `NEOTOMA_DATA_DIR`, so we never call `getDualEnvIntroStats(null, ...)` or `getLastNWatchEntriesAcrossEnvs(null, ...)` without `NEOTOMA_DATA_DIR` set.
- [ ] All other logic still uses `repoRootForLocal` (MCP config, init context, etc.), not `effectiveRootForLocal`.
- [ ] Any other call sites that build the intro stats (e.g. session/REPL redraw) use the same effective-root pattern where the root can be null with user data dir.

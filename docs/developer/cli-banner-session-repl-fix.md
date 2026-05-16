---
title: "CLI banner (session/REPL): show Prod/Dev counts with user data dir and no repo root"
summary: "This doc covers the **remaining** fix for the intro banner when using a user-level data dir with no project root. The **no-session** path is described in [cli-banner-user-data-dir-fix.md](./cli-banner-user-data-dir-fix.md). Here we fix t..."
---

# CLI banner (session/REPL): show Prod/Dev counts with user data dir and no repo root

This doc covers the **remaining** fix for the intro banner when using a user-level data dir with no project root. The **no-session** path is described in [cli-banner-user-data-dir-fix.md](./cli-banner-user-data-dir-fix.md). Here we fix the **session/REPL** path so the banner shows counts when the user is in the REPL (`neotoma>` prompt) and was started without a repo root.

## Context

- **Already fixed (no-session):** Running `neotoma` with no arguments shows the command menu and one banner; that path now loads user env and uses an effective root so counts appear.
- **Remaining (session/REPL):** When the user enters the REPL, the banner is built again (and on redraws, e.g. SIGWINCH). That code still uses the repo root (e.g. `sessionRepoRoot`) for `getDualEnvIntroStats`. With no repo root it stays null, so the session banner can still show "-".

## Goal

Apply the same pattern as in the no-session fix wherever the **session** builds or redraws the intro banner:

1. When repo root is null, ensure user env is loaded so `NEOTOMA_DATA_DIR` is set.
2. Use an effective root (repo root, or `null` when `NEOTOMA_DATA_DIR` is set) for intro stats and recent events only; keep using the real repo root for MCP/config and other session behavior.

## Steps (apply in Neotoma CLI source)

### 1. Find session call sites

In the CLI source (e.g. `src/cli/index.ts`), search for:

- `getDualEnvIntroStats(`
- Any variable that holds the “repo root” used for the session (e.g. `sessionRepoRoot`, `sessionWatchState.repoRoot`, or similar).

Identify every place that:

- Builds or redraws the intro/status block (banner with Prod/Dev table), and
- Calls `getDualEnvIntroStats(repoRoot, ...)` or `getLastNWatchEntriesAcrossEnvs(repoRoot, ...)` (or equivalent) using that repo root.

Typical spots:

- Session startup: where the REPL is started and the initial status block is built.
- Redraw handlers: e.g. on SIGWINCH or when switching back to the status view, where the same status block is rebuilt.

### 2. Ensure user env is loaded when repo root is null

Before building intro stats in the session path, if the repo root for the session is null:

- If not already done earlier in the process, load the user env file (`USER_ENV_PATH`: `~/.config/neotoma/.env`).
- Set `process.env.NEOTOMA_DATA_DIR` from that file only when the value is non-empty (e.g. `const val = userEnv.NEOTOMA_DATA_DIR?.trim(); if (val) process.env.NEOTOMA_DATA_DIR = val;`). Do not set an empty string.

Reuse the same logic as in the no-session fix so you don’t overwrite `NEOTOMA_DATA_DIR` when it was already set (e.g. from a project `.env`). Typically that means: only load user env when the session repo root is null.

### 3. Introduce effective root for local stats in the session

Where the session currently does something like:

```ts
const introStats = await getDualEnvIntroStats(sessionRepoRoot, effectiveUserId);
```

(or uses `sessionRepoRoot` for recent events / watch entries):

- Compute an effective root for **local data only**:

  ```ts
  const effectiveRootForLocal =
      sessionRepoRoot ?? (process.env.NEOTOMA_DATA_DIR ? null : undefined);
  ```

- Use `effectiveRootForLocal` only for:
  - `getDualEnvIntroStats(effectiveRootForLocal, effectiveUserId)`
  - `getLastNWatchEntriesAcrossEnvs(effectiveRootForLocal, ...)` (or equivalent)
- Use `sessionRepoRoot` (unchanged) for everything else (MCP config, init context, session cwd, ports, etc.).

If the session stores “the repo root” in a single variable (e.g. `sessionRepoRoot`), keep that variable as the real repo root; introduce a separate `effectiveRootForLocal` (or equivalent name) used only for the stats and recent-events calls that feed the banner.

### 4. Guard against null without NEOTOMA_DATA_DIR

Do **not** call `getDualEnvIntroStats(null, ...)` or pass `null` into any function that will call `resolveDataDir(null)` unless `process.env.NEOTOMA_DATA_DIR` is set. Otherwise `resolveDataDir(null)` can fall back to `path.join(null, "data")`, which is invalid. So:

- Only set the effective root to `null` when `process.env.NEOTOMA_DATA_DIR` is set.
- When effective root is `undefined` (no repo root and no user data dir), keep using the fallback message (e.g. "Production data: unavailable", "Development data: unavailable") instead of calling the stats functions.

### 5. One-time vs. redraw

- If user env is loaded once at session start (e.g. when establishing `sessionRepoRoot`), later redraws can rely on `process.env.NEOTOMA_DATA_DIR` already being set.
- If the session can start with a null repo root, ensure that at **first** use of intro stats in the session you either:
  - Have already run the “load user env when repo root is null” logic (e.g. in the same startup that sets `sessionRepoRoot`), or
  - Run that logic right before the first `getDualEnvIntroStats` in the session path.

## Checklist

- [ ] All call sites that build/redraw the session banner and use `getDualEnvIntroStats` or recent-events use an effective root (repo root or `null` only when `NEOTOMA_DATA_DIR` is set).
- [ ] User env is loaded when session repo root is null so `NEOTOMA_DATA_DIR` is set before any `getDualEnvIntroStats(null, ...)`.
- [ ] Session repo root variable is unchanged for non-banner behavior (MCP, init context, cwd, ports).
- [ ] No `getDualEnvIntroStats(null, ...)` or equivalent without `NEOTOMA_DATA_DIR` set.

## Verification

1. Run `neotoma` from a directory that is **not** a Neotoma repo (e.g. `~/Projects`), with `NEOTOMA_DATA_DIR` set (e.g. in `~/.config/neotoma/.env`) to a dir that has `neotoma.db` and `neotoma.prod.db`.
2. Enter the REPL (e.g. accept session or run a command that starts the REPL).
3. Confirm the banner in the REPL shows numeric Prod/Dev counts (or 0), not "-".
4. If the banner redraws (e.g. resize terminal), confirm it still shows counts.

## Potential problems to avoid

- **Empty `NEOTOMA_DATA_DIR`:** Only set `process.env.NEOTOMA_DATA_DIR` when the value from the user env file is non-empty after trim. If you set it to `""`, then `process.env.NEOTOMA_DATA_DIR ? null : undefined` yields `undefined`, so you won't call the stats functions (correct), but you may have overwritten a valid value that was set earlier.
- **Session started without no-session path:** The REPL can be entered without the no-session command menu (e.g. via a flag or subcommand). In that case `process.env.NEOTOMA_DATA_DIR` may never have been set. The session path must therefore always run the "load user env when repo root is null" logic before the first intro-stats fetch, not assume the no-session path ran first.
- **`resolveDataDir(null)` when env unset:** Ensure `resolveDataDir(repoRoot)` returns `process.env.NEOTOMA_DATA_DIR` only when it is **truthy** (e.g. after trim). If it treats empty string as set, then passing `null` could still lead to using `path.join(null, "data")` when the env was explicitly cleared. The no-session doc already requires: only set effective root to `null` when `NEOTOMA_DATA_DIR` is set; the implementation of `resolveDataDir` should treat empty string as unset.

## See also

- [cli-banner-user-data-dir-fix.md](./cli-banner-user-data-dir-fix.md) — no-session path and shared concepts (effective root, `resolveDataDir`, edge cases).

# Remaining fix: CLI banner in session/REPL (user data dir, no repo root)

Apply this in the **Neotoma CLI** source. The no-session path is already fixed; this is the **remaining** change so the banner shows Prod/Dev counts in the REPL when the user has no project root but has `NEOTOMA_DATA_DIR` set (e.g. in `~/.config/neotoma/.env`).

---

## What to do

### 1. Find where the session builds the banner

Search for:

- `getDualEnvIntroStats(`
- The session repo root variable (e.g. `sessionRepoRoot`, `sessionWatchState.repoRoot`).

Apply the steps below at every place that builds or redraws the intro banner (session startup and redraw handlers, e.g. SIGWINCH).

### 2. When session repo root is null, load user env

Before the first use of intro stats in the session path, if the session repo root is null:

```ts
if (!sessionRepoRoot && (await pathExists(USER_ENV_PATH))) {
    const userEnv = await readEnvFileVars(USER_ENV_PATH);
    const val = userEnv.NEOTOMA_DATA_DIR?.trim();
    if (val) process.env.NEOTOMA_DATA_DIR = val;
}
```

Use existing `pathExists` and `readEnvFileVars`. Only set when the value is non-empty so you don’t overwrite a valid existing `NEOTOMA_DATA_DIR`.

### 3. Use an effective root for banner stats only

Replace direct use of the session repo root for intro stats and recent events with an effective root:

```ts
const effectiveRootForLocal =
    sessionRepoRoot ?? (process.env.NEOTOMA_DATA_DIR ? null : undefined);

const introStats =
    effectiveRootForLocal !== undefined
        ? await getDualEnvIntroStats(effectiveRootForLocal, effectiveUserId)
        : null; // or fallback object / message

// For recent events / watch entries that feed the banner, use effectiveRootForLocal too:
const recentEvents =
    effectiveRootForLocal !== undefined
        ? await getLastNWatchEntriesAcrossEnvs(effectiveRootForLocal, effectiveUserId, limit)
        : [];
```

Keep using `sessionRepoRoot` (unchanged) for everything else (MCP config, init context, cwd, ports, etc.).

### 4. Guards

- Never call `getDualEnvIntroStats(null, ...)` or pass `null` into code that uses `resolveDataDir(null)` unless `process.env.NEOTOMA_DATA_DIR` is set (truthy). Otherwise `resolveDataDir(null)` can use `path.join(null, "data")`, which is invalid.
- When `effectiveRootForLocal === undefined`, show the fallback message instead of calling the stats functions.

---

## Checklist

- [ ] User env is loaded when session repo root is null; `NEOTOMA_DATA_DIR` is set only when non-empty after trim.
- [ ] All session banner call sites use `effectiveRootForLocal` for `getDualEnvIntroStats` and recent-events; all other session logic still uses `sessionRepoRoot`.
- [ ] No `getDualEnvIntroStats(null, ...)` without `NEOTOMA_DATA_DIR` set.

---

## Verify

1. Run `neotoma` from a non-repo directory with `NEOTOMA_DATA_DIR` in `~/.config/neotoma/.env` pointing to a dir with `neotoma.db` and `neotoma.prod.db`.
2. Enter the REPL. Banner should show numeric Prod/Dev counts (or 0), not "-".
3. Redraw the banner (e.g. resize terminal). Counts should still appear.

---

## See also

- [cli-banner-user-data-dir-fix.md](./cli-banner-user-data-dir-fix.md) — no-session fix and shared concepts.
- [cli-banner-session-repl-fix.md](./cli-banner-session-repl-fix.md) — same remaining fix with more detail and edge cases.

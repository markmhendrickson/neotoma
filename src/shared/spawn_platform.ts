/**
 * Cross-platform spawn helpers.
 *
 * On Windows, since the Node.js fix for CVE-2024-27980 (Node >= 18.20.2 /
 * 20.12.2 / 21.7.2, and all v22+), `child_process.spawn('foo.cmd', args)` and
 * other batch-file shims (`npm.cmd`, `npx.cmd`, `claude.cmd`, `tsx.cmd`,
 * `neotoma.cmd`, ...) throw `EINVAL` unless shell mode is enabled. Node refuses
 * to launch `.cmd` / `.bat` files directly without `shell: true`.
 *
 * The boolean `shell: true` form is safe here: Node still passes `args` as a
 * real argv array (quoting each argument), so there is no command-string
 * concatenation and therefore no shell-injection vector — unlike building a
 * single command string and spawning that. Callers must keep passing `args` as
 * an array; never concatenate user input into the command itself.
 *
 * Use {@link spawnShellOnWin} to opt a single spawn into win32 shell mode, or
 * {@link WIN_SHELL} to spread into an existing options object.
 */

/** True when running on Windows. */
export const IS_WINDOWS = process.platform === "win32";

/**
 * Spawn options fragment that enables shell mode only on Windows. Spread into a
 * `spawn` / `spawnSync` options object whose command may resolve to a `.cmd` /
 * `.bat` shim (npm, npx, claude, tsx, neotoma, ...):
 *
 * ```ts
 * spawn(npmCmd, ["run", script], { cwd, stdio: "inherit", ...WIN_SHELL });
 * ```
 */
export const WIN_SHELL: { shell: boolean } = { shell: IS_WINDOWS };

/**
 * Returns a `shell` value for a spawn options object: `true` on Windows so
 * `.cmd` shims can launch, `false` elsewhere. Prefer {@link WIN_SHELL} when you
 * only need to add the flag; use this when you must merge with an existing
 * `shell` decision:
 *
 * ```ts
 * shell: needShellForOverride || shellOnWin(),
 * ```
 */
export function shellOnWin(): boolean {
  return IS_WINDOWS;
}

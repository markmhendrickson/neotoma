/**
 * Loads the user-level Neotoma env file (`~/.config/neotoma/.env`) into
 * `process.env` for CLI processes.
 *
 * Background (ateles#578, ateles#566): the file has historically been read by
 * exactly one thing — the MCP stdio wrapper, which greps `NEOTOMA_BEARER_TOKEN`
 * out of it and exports it. Everything descended from that wrapper inherited
 * credentials; everything else (an interactive shell, a daemon, a cron job, a
 * dispatched agent) got nothing and hit `401 Missing Bearer token`. Loading the
 * file here makes it a real config source for every CLI invocation instead of
 * an artifact only one shell script knows how to read.
 *
 * PRECEDENCE — the real process environment always wins:
 *
 *   1. `process.env` as inherited by the process (an explicitly-exported
 *      variable, or one set inline as `NEOTOMA_BEARER_TOKEN=... neotoma ...`)
 *   2. the user env file (`$NEOTOMA_ENV_FILE`, else `~/.config/neotoma/.env`)
 *
 * A caller can therefore always override the file, which is what makes it safe
 * to load implicitly. Values are only ever *filled in*, never overwritten.
 *
 * SECRET HANDLING: this module never logs, echoes, prints, or returns a value
 * read from the file. Callers get the names of the keys applied and nothing
 * else, so a debug line or an error message cannot leak a credential.
 */
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Keys hydrated from the user env file. Deliberately an allowlist rather than
 * "everything in the file": that file is a general scratch space on real
 * machines, and blanket-importing it would let it silently redirect unrelated
 * runtime behaviour (data dirs, ports, DB selection) for every CLI process.
 *
 * `NEOTOMA_ENV` is intentionally NOT hydrated. It selects the SQLite DB file
 * for local transport, and on real machines the file frequently carries a stale
 * `NEOTOMA_ENV=development` alongside a production `NEOTOMA_BASE_URL`; letting
 * the file drive env selection would silently point reads and writes at a
 * development database. See ateles#578 "secondary finding".
 */
export const USER_ENV_HYDRATED_KEYS = ["NEOTOMA_BEARER_TOKEN", "NEOTOMA_BASE_URL"] as const;

/** Resolve the user env file path, honoring the `NEOTOMA_ENV_FILE` override. */
export function resolveUserEnvFilePath(): string | null {
  const override = process.env.NEOTOMA_ENV_FILE?.trim();
  if (override) return override;
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  if (!homeDir) return null;
  return path.join(homeDir, ".config", "neotoma", ".env");
}

/**
 * Minimal dotenv parse: `KEY=value` lines, `#` comments, optional surrounding
 * quotes. Matches the shape the MCP wrapper's grep already assumes.
 */
function parseEnvFile(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const withoutExport = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;
    const key = withoutExport.slice(0, eq).trim();
    if (!key) continue;
    const value = withoutExport
      .slice(eq + 1)
      .trim()
      .replace(/^"(.*)"$/s, "$1")
      .replace(/^'(.*)'$/s, "$1");
    out[key] = value;
  }
  return out;
}

/**
 * Hydrate allowlisted variables from the user env file into `process.env`,
 * without overwriting anything already set in the real environment.
 *
 * Returns the NAMES of the keys that were applied — never their values — so
 * callers can report "loaded credentials from <file>" without leaking a secret.
 * Any failure (missing file, unreadable, malformed) is swallowed: an absent
 * user env file is the normal case for a fresh install.
 */
export function loadUserEnvFile(): { path: string | null; applied: string[] } {
  const envPath = resolveUserEnvFilePath();
  if (!envPath || !existsSync(envPath)) return { path: null, applied: [] };
  let parsed: Record<string, string>;
  try {
    parsed = parseEnvFile(readFileSync(envPath, "utf-8"));
  } catch {
    return { path: null, applied: [] };
  }
  const applied: string[] = [];
  for (const key of USER_ENV_HYDRATED_KEYS) {
    // Real process env wins: only fill in what is unset or empty.
    if (process.env[key]?.trim()) continue;
    const value = parsed[key]?.trim();
    if (!value) continue;
    process.env[key] = value;
    applied.push(key);
  }
  return { path: envPath, applied };
}

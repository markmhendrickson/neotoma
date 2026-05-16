/**
 * GitHub authentication via the `gh` CLI.
 *
 * Resolution order:
 *   1. NEOTOMA_ISSUES_GITHUB_TOKEN env var (explicit override for CI/scripts)
 *   2. `gh auth token` (preferred interactive path)
 *   3. Bot fallback (if user declines gh setup)
 *
 * The gh CLI manages OAuth + credential storage transparently. Neotoma
 * never stores GitHub tokens directly -- it resolves them at runtime.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

let cachedToken: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

/**
 * Check if the `gh` CLI is installed and accessible.
 */
export async function isGhInstalled(): Promise<boolean> {
  try {
    await execFileAsync("gh", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the user is authenticated with `gh`.
 */
export async function isGhAuthenticated(): Promise<boolean> {
  try {
    const { exitCode } = await execFileAsync("gh", ["auth", "status"]).then(
      () => ({ exitCode: 0 }),
      (err) => ({ exitCode: err.code ?? 1 })
    );
    return exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get the current auth token from `gh auth token`.
 * Cached in-process for 60 seconds to avoid repeated subprocess calls.
 */
export async function getGhToken(): Promise<string | null> {
  if (cachedToken && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedToken;
  }

  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token"]);
    const token = stdout.trim();
    if (token) {
      cachedToken = token;
      cachedAt = Date.now();
      return token;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Verify the token works by calling the GitHub API.
 */
export async function verifyGhAuth(): Promise<{ login: string } | null> {
  try {
    const { stdout } = await execFileAsync("gh", ["api", "user"]);
    const user = JSON.parse(stdout) as { login: string };
    return user;
  } catch {
    return null;
  }
}

/**
 * Resolve a GitHub token using the priority order.
 *
 * Returns null if no authentication method is available.
 */
export async function resolveGitHubToken(): Promise<string | null> {
  const envToken = process.env.NEOTOMA_ISSUES_GITHUB_TOKEN;
  if (envToken) return envToken;

  const ghToken = await getGhToken();
  if (ghToken) return ghToken;

  return null;
}

/**
 * Clear the in-process token cache (useful after re-auth).
 */
export function clearTokenCache(): void {
  cachedToken = null;
  cachedAt = 0;
}

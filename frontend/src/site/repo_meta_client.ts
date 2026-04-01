/** Client-side metadata for the public npm package and GitHub repo (footer, etc.). */

export const NPM_PACKAGE_NAME = "neotoma";
export const GITHUB_REPO_OWNER = "markmhendrickson";
export const GITHUB_REPO_NAME = "neotoma";

/**
 * Browser star counts use shields.io (img.shields.io), which proxies GitHub with a valid
 * User-Agent. Direct calls to api.github.com return 403 in some embedded browsers (no UA).
 *
 * Published release counts are not fetched in the browser; use bundled `repo_info.json`
 * (updated by `scripts/repo_info.ts` at build) to avoid the same 403 noise.
 */

/** Shields badge `message` / `value` for numeric badges (e.g. "9", "1.2k", "3M"). */
export function parseShieldsCountMessage(message: string): number {
  const t = message.trim().toLowerCase().replace(/,/g, "");
  const m = t.match(/^([\d.]+)\s*([kmb])?$/i);
  if (!m) {
    throw new Error(`shields.io: unrecognized count message: ${JSON.stringify(message)}`);
  }
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) {
    throw new Error(`shields.io: invalid count: ${JSON.stringify(message)}`);
  }
  const suffix = (m[2] ?? "").toLowerCase();
  const mult =
    suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : suffix === "b" ? 1e9 : 1;
  return Math.round(n * mult);
}

export async function fetchNpmLatestVersion(packageName: string): Promise<string> {
  const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`);
  if (!res.ok) {
    throw new Error(`npm registry ${res.status}`);
  }
  const data = (await res.json()) as { version?: string };
  const v = data.version;
  if (typeof v !== "string" || !v.length) {
    throw new Error("npm registry: missing version");
  }
  return v;
}

/** Star count via shields.io (avoids GitHub REST 403 when the browser sends no User-Agent). */
export async function fetchGitHubStarsCount(
  owner: string,
  repo: string
): Promise<number> {
  const url = `https://img.shields.io/github/stars/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`shields.io ${res.status}`);
  }
  const data = (await res.json()) as { message?: unknown; value?: unknown };
  const raw =
    typeof data.message === "string"
      ? data.message
      : typeof data.value === "string"
        ? data.value
        : null;
  if (raw == null) {
    throw new Error("shields.io: missing stars message");
  }
  return parseShieldsCountMessage(raw);
}

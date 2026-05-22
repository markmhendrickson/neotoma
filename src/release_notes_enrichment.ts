/**
 * Optional npm registry + GitHub release enrichment for npm_check_update.
 * Best-effort only; never throws to callers.
 */

const NPM_REGISTRY_VERSION = "https://registry.npmjs.org";
const GITHUB_API = "https://api.github.com";
const EXCERPT_MAX = 8000;

export interface ReleaseEnrichmentResult {
  release_url: string | null;
  release_notes_excerpt: string | null;
  breaking_changes_excerpt: string | null;
  enrichment_error: string | null;
}

export function npmPackageVersionUrl(packageName: string, version: string): string {
  return `https://www.npmjs.com/package/${encodeURIComponent(packageName)}/v/${encodeURIComponent(version)}`;
}

/** Parse owner/repo from npm repository field (string URL or {url}). */
export function parseGithubRepoFromNpmMetadata(
  repository: unknown
): { owner: string; repo: string } | null {
  let urlStr: string | null = null;
  if (typeof repository === "string") {
    urlStr = repository;
  } else if (
    repository &&
    typeof repository === "object" &&
    "url" in repository &&
    typeof (repository as { url?: unknown }).url === "string"
  ) {
    urlStr = (repository as { url: string }).url;
  }
  if (!urlStr) return null;
  const normalized = urlStr.replace(/^git\+/, "").replace(/\.git$/, "");
  const m = normalized.match(/github\.com[/:]([^/]+)\/([^/]+)/i);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!.replace(/\.git$/, "") };
}

export function extractBreakingExcerpt(body: string): string | null {
  const lines = body.split("\n");
  let idx = 0;
  for (; idx < lines.length; idx++) {
    const line = lines[idx]!.trim();
    if (/^#{1,3}\s*(breaking\s+changes?|breaking)\s*$/i.test(line)) {
      idx++;
      break;
    }
  }
  if (idx >= lines.length) return null;
  const rest = lines.slice(idx).join("\n").trim();
  if (!rest) return null;
  const nextHeading = rest.search(/\n#{1,3}\s+/);
  const section = nextHeading >= 0 ? rest.slice(0, nextHeading).trim() : rest;
  if (!section) return null;
  return section.length > EXCERPT_MAX ? section.slice(0, EXCERPT_MAX) + "\n…" : section;
}

function truncateExcerpt(s: string): string {
  const t = s.trim();
  return t.length > EXCERPT_MAX ? t.slice(0, EXCERPT_MAX) + "\n…" : t;
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * Fetch registry document for a single version (npm `GET /{pkg}/{version}`).
 */
export async function fetchNpmVersionDocument(
  packageName: string,
  version: string
): Promise<Record<string, unknown> | null> {
  const url = `${NPM_REGISTRY_VERSION}/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`;
  const data = await fetchJson(url, { accept: "application/json" });
  return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
}

export async function fetchGithubReleaseBody(params: {
  owner: string;
  repo: string;
  version: string;
}): Promise<{ body: string | null; html_url: string | null; error: string | null }> {
  const token = process.env.GITHUB_TOKEN?.trim();
  const tagCandidates = [
    params.version.startsWith("v") ? params.version : `v${params.version}`,
    params.version,
  ];
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "User-Agent": "neotoma-npm-check-update",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  for (const tag of tagCandidates) {
    const url = `${GITHUB_API}/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/releases/tags/${encodeURIComponent(tag)}`;
    const data = await fetchJson(url, headers);
    if (!data || typeof data !== "object") continue;
    const rec = data as { body?: unknown; html_url?: unknown };
    const body = typeof rec.body === "string" ? rec.body : null;
    const html_url = typeof rec.html_url === "string" ? rec.html_url : null;
    return { body, html_url, error: null };
  }
  return { body: null, html_url: null, error: "github_release_not_found" };
}

export async function enrichNpmReleaseMetadata(params: {
  packageName: string;
  latestVersion: string;
  includeReleaseNotes: boolean;
}): Promise<ReleaseEnrichmentResult> {
  const { packageName, latestVersion, includeReleaseNotes } = params;
  const release_url = npmPackageVersionUrl(packageName, latestVersion);

  if (!includeReleaseNotes) {
    return {
      release_url,
      release_notes_excerpt: null,
      breaking_changes_excerpt: null,
      enrichment_error: null,
    };
  }

  const doc = await fetchNpmVersionDocument(packageName, latestVersion);
  if (!doc) {
    return {
      release_url,
      release_notes_excerpt: null,
      breaking_changes_excerpt: null,
      enrichment_error: "npm_version_doc_unavailable",
    };
  }

  const readme = typeof doc.readme === "string" ? doc.readme : null;
  const gh = parseGithubRepoFromNpmMetadata(doc.repository);

  let release_notes_excerpt: string | null = readme ? truncateExcerpt(readme) : null;
  let breaking_changes_excerpt: string | null = readme ? extractBreakingExcerpt(readme) : null;

  if (gh) {
    const ghRelease = await fetchGithubReleaseBody({
      owner: gh.owner,
      repo: gh.repo,
      version: latestVersion,
    });
    if (ghRelease.body) {
      release_notes_excerpt = truncateExcerpt(ghRelease.body);
      breaking_changes_excerpt = extractBreakingExcerpt(ghRelease.body) ?? breaking_changes_excerpt;
    } else if (!readme && ghRelease.error) {
      return {
        release_url: ghRelease.html_url ?? release_url,
        release_notes_excerpt: null,
        breaking_changes_excerpt: null,
        enrichment_error: ghRelease.error,
      };
    }
  }

  return {
    release_url,
    release_notes_excerpt,
    breaking_changes_excerpt,
    enrichment_error: null,
  };
}

/** Client-side metadata for the public npm package and GitHub repo (footer, etc.). */

export const NPM_PACKAGE_NAME = "neotoma";
export const GITHUB_REPO_OWNER = "markmhendrickson";
export const GITHUB_REPO_NAME = "neotoma";

const ghHeaders = {
  Accept: "application/vnd.github.v3+json",
};

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

/** GitHub stargazers count (single API call, no pagination needed). */
export async function fetchGitHubStarsCount(
  owner: string,
  repo: string
): Promise<number> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const res = await fetch(url, { headers: ghHeaders });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}`);
  }
  const data = (await res.json()) as { stargazers_count?: number };
  if (typeof data.stargazers_count !== "number") {
    throw new Error("GitHub API: missing stargazers_count");
  }
  return data.stargazers_count;
}

/** Published (non-draft) GitHub releases count; paginates like scripts/repo_info.ts. */
export async function fetchGitHubPublishedReleasesCount(
  owner: string,
  repo: string
): Promise<number> {
  let total = 0;
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=${perPage}&page=${page}`;
    const res = await fetch(url, { headers: ghHeaders });
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}`);
    }
    const data = (await res.json()) as { draft?: boolean }[];
    if (!Array.isArray(data)) {
      throw new Error("GitHub API: unexpected releases payload");
    }
    const count = data.filter((r) => !r.draft).length;
    total += count;
    if (count < perPage) break;
    page++;
  }
  return total;
}

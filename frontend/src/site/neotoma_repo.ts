/** Canonical public GitHub root for Neotoma (matches install/docs links site-wide). */
export const NEOTOMA_GITHUB_REPO = "https://github.com/markmhendrickson/neotoma";

export function neotomaGithubBlobUrl(repoPath: string): string {
  const trimmed = repoPath.replace(/^\//, "");
  return `${NEOTOMA_GITHUB_REPO}/blob/main/${trimmed}`;
}

/** Raw markdown URL for agents (`fetch`, curl, etc.). */
export function neotomaGithubRawUrl(repoPath: string): string {
  const trimmed = repoPath.replace(/^\//, "");
  return `https://raw.githubusercontent.com/markmhendrickson/neotoma/main/${trimmed}`;
}

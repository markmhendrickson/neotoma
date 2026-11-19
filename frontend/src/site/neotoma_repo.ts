import { viewerHrefForRepoPath } from "./docs_viewer_manifest";

/** Canonical public GitHub root for Neotoma (matches install/docs links site-wide). */
export const NEOTOMA_GITHUB_REPO = "https://github.com/markmhendrickson/neotoma";

export function neotomaGithubBlobUrl(repoPath: string): string {
  const trimmed = repoPath.replace(/^\//, "");
  return `${NEOTOMA_GITHUB_REPO}/blob/main/${trimmed}`;
}

/** Use the curated local page when published; keep GitHub as the source fallback. */
export function neotomaDocUrl(repoPath: string): string {
  const trimmed = repoPath.replace(/^\//, "");
  const viewerHref = viewerHrefForRepoPath(trimmed);
  if (viewerHref) return viewerHref;
  if (trimmed.endsWith("/")) return `${NEOTOMA_GITHUB_REPO}/tree/main/${trimmed.slice(0, -1)}`;
  return neotomaGithubBlobUrl(trimmed);
}

/** Raw markdown URL for agents (`fetch`, curl, etc.). */
export function neotomaGithubRawUrl(repoPath: string): string {
  const trimmed = repoPath.replace(/^\//, "");
  return `https://raw.githubusercontent.com/markmhendrickson/neotoma/main/${trimmed}`;
}

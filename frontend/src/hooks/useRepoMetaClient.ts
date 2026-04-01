import { useEffect, useState } from "react";
import {
  GITHUB_REPO_NAME,
  GITHUB_REPO_OWNER,
  NPM_PACKAGE_NAME,
  fetchGitHubPublishedReleasesCount,
  fetchGitHubStarsCount,
  fetchNpmLatestVersion,
} from "@/site/repo_meta_client";

/**
 * Loads latest npm version, GitHub release count, and stars in the browser.
 * Starts from bundled fallbacks (repo_info.json) then refreshes when network calls succeed.
 */
export function useRepoMetaClient(
  fallbackVersion: string,
  fallbackReleasesCount: number,
  fallbackStarsCount: number
): {
  version: string;
  releasesCount: number;
  starsCount: number;
} {
  const [version, setVersion] = useState(fallbackVersion);
  const [releasesCount, setReleasesCount] = useState(fallbackReleasesCount);
  const [starsCount, setStarsCount] = useState(fallbackStarsCount);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const settled = await Promise.allSettled([
        fetchNpmLatestVersion(NPM_PACKAGE_NAME),
        fetchGitHubPublishedReleasesCount(GITHUB_REPO_OWNER, GITHUB_REPO_NAME),
        fetchGitHubStarsCount(GITHUB_REPO_OWNER, GITHUB_REPO_NAME),
      ]);
      if (cancelled) return;
      if (settled[0].status === "fulfilled") {
        setVersion(settled[0].value);
      }
      if (settled[1].status === "fulfilled") {
        setReleasesCount(settled[1].value);
      }
      if (settled[2].status === "fulfilled") {
        setStarsCount(settled[2].value);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { version, releasesCount, starsCount };
}

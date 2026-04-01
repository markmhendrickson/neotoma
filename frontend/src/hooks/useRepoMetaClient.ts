import { useEffect, useState } from "react";
import {
  GITHUB_REPO_NAME,
  GITHUB_REPO_OWNER,
  NPM_PACKAGE_NAME,
  fetchGitHubStarsCount,
  fetchNpmLatestVersion,
} from "@/site/repo_meta_client";

/**
 * Loads latest npm version and star count in the browser.
 * Release count stays on bundled repo_info.json (build script); avoids GitHub REST 403 in embedded browsers.
 */
export function useRepoMetaClient(
  fallbackVersion: string,
  fallbackReleasesCount: number,
  fallbackStarsCount: number
): {
  version: string;
  releasesCount: number;
  starsCount: number;
  /** True only after a successful live star-count fetch (avoids showing bundled `0` when data never loaded). */
  starsResolved: boolean;
} {
  const [version, setVersion] = useState(fallbackVersion);
  const [releasesCount, setReleasesCount] = useState(fallbackReleasesCount);
  const [starsCount, setStarsCount] = useState(fallbackStarsCount);
  const [starsResolved, setStarsResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const settled = await Promise.allSettled([
        fetchNpmLatestVersion(NPM_PACKAGE_NAME),
        fetchGitHubStarsCount(GITHUB_REPO_OWNER, GITHUB_REPO_NAME),
      ]);
      if (cancelled) return;
      if (settled[0].status === "fulfilled") {
        setVersion(settled[0].value);
      }
      if (settled[1].status === "fulfilled") {
        setStarsCount(settled[1].value);
        setStarsResolved(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { version, releasesCount, starsCount, starsResolved };
}

import { useRepoMetaClient } from "@/hooks/useRepoMetaClient";
import { REPO_RELEASES_COUNT, REPO_STARS_COUNT, REPO_VERSION } from "@/site/site_data";

/** Live developer release line for MDX-backed changelog pages. */
export function ChangelogLiveBlock() {
  const { version: liveVersion, releasesCount: liveReleasesCount } = useRepoMetaClient(
    REPO_VERSION,
    REPO_RELEASES_COUNT,
    REPO_STARS_COUNT,
  );

  return (
    <p className="text-[15px] leading-7 mb-4">
      Current developer release: <strong>v{liveVersion}</strong>. Published releases:{" "}
      <strong>{liveReleasesCount}</strong>.
    </p>
  );
}

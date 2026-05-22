import { MdxSitePage } from "@/components/subpages/MdxSitePage";

/** @deprecated Prefer {@link MdxSitePage} with `canonicalPath="/changelog"`; kept for imports during migration. */
export function ChangelogPage() {
  return <MdxSitePage canonicalPath="/changelog" />;
}

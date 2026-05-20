import { MdxSitePage } from "@/components/subpages/MdxSitePage";

/** @deprecated Prefer {@link MdxSitePage} with `canonicalPath="/api"`. */
export function ApiReferencePage() {
  return <MdxSitePage canonicalPath="/api" />;
}

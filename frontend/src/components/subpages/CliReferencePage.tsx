import { MdxSitePage } from "@/components/subpages/MdxSitePage";

/** @deprecated Prefer {@link MdxSitePage} with `canonicalPath="/cli"`. */
export function CliReferencePage() {
  return <MdxSitePage canonicalPath="/cli" />;
}

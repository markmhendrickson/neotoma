import { MdxSitePage } from "@/components/subpages/MdxSitePage";

/** @deprecated Prefer {@link MdxSitePage} with `canonicalPath="/mcp"`. */
export function McpReferencePage() {
  return <MdxSitePage canonicalPath="/mcp" />;
}

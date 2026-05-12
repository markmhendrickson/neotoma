import { MdxSitePage } from "./MdxSitePage";

/**
 * Route shell for `/agent-auth`. MDX body lives in {@link AgentAuthLandingPageBody} in
 * `agent_auth_landing_body.tsx` so eager-loaded site MDX does not import this module (which pulls
 * `MdxSitePage` → `mdx_site_registry`) while the registry is still evaluating MDX, and that cycle
 * surfaced as a missing named export at runtime.
 */
export function AgentAuthLandingPage() {
  return <MdxSitePage canonicalPath="/agent-auth" shell="bare" />;
}

export { AgentAuthLandingPageBody } from "./agent_auth_landing_body";

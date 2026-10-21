/**
 * Route set of neotoma.io as a one-pager.
 *
 * neotoma.io is a single page (`/`) plus a real `/install` page. Every other former route is
 * either HELD (still served as before, because something fetches or links to it programmatically,
 * or it is a legal or consent surface) or RETIRED to a static redirect stub pointing at its closest
 * GitHub equivalent. GitHub Pages cannot send HTTP redirects, so a stub is a small HTML file with a
 * meta refresh, a canonical link, `noindex` and a visible link.
 *
 * Pure data and pure functions, imported by the static build, the app shell and the tests.
 * Adding a route to the app without listing it here fails `tests/unit/site_route_retirement.test.ts`.
 */

import {
  DOCS_VIEWER_INDEX,
  type DocsViewerIndex,
  viewerHrefForRepoPath,
} from "./docs_viewer_manifest";

export const GITHUB_REPO = "https://github.com/markmhendrickson/neotoma";
const BLOB = `${GITHUB_REPO}/blob/main/`;
const TREE = `${GITHUB_REPO}/tree/main/`;

/** Routes that are real pages on the one-pager site. */
export const LIVE_ROUTES: readonly string[] = ["/", "/install"];

const MARKDOWN_MIRROR_REASON =
  "Markdown mirrors of site pages that are themselves served, linked from each page for agents and crawlers; llms.txt points at them.";

/**
 * Routes kept exactly as they are, with the old app shell, until their owner decides. Each has
 * a reason. Most are not linked from the one-pager; /meet, /privacy and /terms are, deliberately
 * (sheet 07 and the colophon). See the pull request for the inbound-use evidence.
 */
export const HELD_ROUTES: readonly { match: string | RegExp; reason: string }[] = [
  {
    match: /^\/evaluate(\/|$)/,
    reason:
      "Fetched by agents: the evaluation prompt on the install page and in install.md says 'Read https://neotoma.io/evaluate'.",
  },
  {
    // Only the mirror root. A mirror of a page is held exactly while its source page is served as a
    // real page (see heldReason); the mirror of a retired page is a redirect stub like its source.
    match: "/markdown",
    reason: MARKDOWN_MIRROR_REASON,
  },
  {
    match: /^\/skills(\/|$)/,
    reason: "Agent skill pages, referenced from install.md and the Inspector activation card.",
  },
  {
    match: /^\/(privacy|terms|sandbox)(\/|$)/,
    reason:
      "Legal and consent surfaces: docs/legal and the live sandbox name these URLs as the published privacy notice, terms and sandbox terms of use. Redirecting a legal URL is a counsel decision.",
  },
  {
    match: "/meet",
    reason:
      "Booking gateway with no GitHub equivalent; used from outreach and the old home call to action.",
  },
  {
    match: /^\/(raw|site-markdown|404)$/,
    reason: "Internal rendering routes used by the markdown mirrors and the 404 page.",
  },
];

/** `null` means "no GitHub equivalent: send to the one-pager". Paths ending in `/` are folders. */
export const RETIRED_DESTINATIONS: Readonly<Record<string, string | null>> = {
  // Client-side-only redirects in the old app that also had committed pages
  "/docker": "docs/developer/docker.md",
  "/knowledge-workers": null,
  "/quick-start": "/install",
  "/install/manual": "install.md",
  "/install/docker": "docs/developer/docker.md",
  "/what-to-store": "docs/foundation/what_to_store.md",
  "/backup": "docs/operations/runbook.md",
  "/tunnel": "docs/infrastructure/deployment.md",
  "/hosted": "docs/infrastructure/deployment.md",
  "/integrations": "docs/integrations/matrix.md",
  "/connect": "docs/integrations/matrix.md",
  "/docs": "docs/",
  "/terminology": "docs/vocabulary/canonical_terms.md",
  "/agent-instructions": "docs/developer/agent_instructions.md",
  "/agent-instructions/store-recipes": "docs/developer/agent_instructions.md",
  "/agent-instructions/retrieval-provenance": "docs/developer/agent_instructions.md",
  "/agent-instructions/display-conventions": "docs/developer/agent_instructions.md",
  "/api": "docs/api/rest_api.md",
  "/mcp": "docs/developer/mcp_overview.md",
  "/cli": "docs/developer/cli_reference.md",
  "/sdk/agent": "packages/client/",
  "/sdk/python": "packages/client-python/",
  "/aauth": "docs/subsystems/aauth.md",
  "/aauth/spec": "docs/subsystems/aauth.md",
  "/aauth/attestation": "docs/subsystems/aauth_attestation.md",
  "/aauth/cli-keys": "docs/subsystems/aauth_cli_attestation.md",
  "/aauth/integration": "docs/developer/aauth_overview.md",
  "/aauth/capabilities": "docs/subsystems/agent_capabilities.md",
  "/peer-sync": "docs/subsystems/peer_sync.md",
  "/subscriptions": "docs/subsystems/subscriptions.md",
  "/subscriptions-guide": "docs/subsystems/subscriptions.md",
  "/issue-reporting": "docs/developer/issues_guide.md",
  "/issues-guide": "docs/developer/issues_guide.md",
  "/security-hardening": "docs/security/practices.md",
  "/plans-guide": "docs/developer/plans_guide.md",
  "/mirror-guide": "docs/developer/mirror_guide.md",
  "/inspector": "docs/developer/inspector/README.md",
  "/inspector/dashboard": "docs/developer/inspector/dashboard.md",
  "/inspector/entities": "docs/developer/inspector/entities.md",
  "/inspector/observations-and-sources": "docs/developer/inspector/observations_and_sources.md",
  "/inspector/relationships-and-graph": "docs/developer/inspector/relationships_and_graph.md",
  "/inspector/schemas": "docs/developer/inspector/schemas.md",
  "/inspector/timeline": "docs/developer/inspector/timeline.md",
  "/inspector/conversations": "docs/developer/inspector/conversations.md",
  "/inspector/agents": "docs/developer/inspector/agents.md",
  "/inspector/peers": "docs/developer/inspector/peers.md",
  "/inspector/search": "docs/developer/inspector/search.md",
  "/inspector/settings": "docs/developer/inspector/settings.md",
  "/inspector/settings/connection": "docs/developer/inspector/settings.md",
  "/inspector/settings/attribution-policy": "docs/developer/inspector/settings.md",
  "/inspector/settings/retention": "docs/developer/inspector/settings.md",
  "/inspector/search-and-settings": "docs/developer/inspector/settings.md",
  "/developer-walkthrough": "docs/developer/canonical_walkthrough.md",
  "/data-model": "docs/foundation/data_models.md",
  "/inspector-skinning": "docs/developer/inspector/README.md",
  "/identify-entity-by-signals": "docs/foundation/entity_resolution.md",
  "/capability-delta": null,
  "/high-velocity-intake": null,
  "/embed-graph": null,
  "/architecture": "docs/architecture/architecture.md",
  "/operating": "docs/operations/runbook.md",
  "/building-pipelines": null,
  "/debugging-infrastructure": null,
  "/neotoma-with-cursor": "docs/developer/mcp_cursor_setup.md",
  "/neotoma-with-claude": "docs/integrations/matrix.md",
  "/neotoma-with-claude-connect-desktop": "docs/integrations/matrix.md",
  "/neotoma-with-claude-connect-remote-mcp": "docs/integrations/matrix.md",
  "/neotoma-with-claude-code": "docs/developer/mcp_claude_code_setup.md",
  "/neotoma-with-claude-agent-sdk": "docs/integrations/hooks/claude_agent_sdk.md",
  "/neotoma-with-chatgpt": "docs/developer/chatgpt_apps_setup.md",
  "/neotoma-with-chatgpt-connect-remote-mcp": "docs/developer/chatgpt_apps_setup.md",
  "/neotoma-with-chatgpt-connect-custom-gpt": "docs/developer/chatgpt_actions_setup.md",
  "/neotoma-with-codex": "docs/integrations/hooks/codex_cli.md",
  "/neotoma-with-codex-connect-local-stdio": "docs/integrations/hooks/codex_cli.md",
  "/neotoma-with-codex-connect-remote-http-oauth": "docs/integrations/hooks/codex_cli.md",
  "/neotoma-with-opencode": "docs/integrations/hooks/opencode.md",
  "/neotoma-with-openclaw": "docs/integrations/openclaw.md",
  "/neotoma-with-ironclaw": "docs/developer/mcp_ironclaw_setup.md",
  "/neotoma-with-openclaw-connect-local-stdio": "docs/developer/mcp_openclaw_setup.md",
  "/neotoma-with-openclaw-connect-remote-http": "docs/developer/mcp_openclaw_setup.md",
  "/neotoma-with-continue": "docs/developer/mcp_continue_setup.md",
  "/neotoma-with-windsurf": "docs/developer/mcp_windsurf_setup.md",
  "/neotoma-with-vscode": "docs/developer/mcp_vscode_setup.md",
  "/neotoma-with-letta": "docs/developer/mcp_letta_setup.md",
  "/deterministic-state-evolution": "docs/subsystems/reducer.md",
  "/versioned-history": "docs/subsystems/observation_architecture.md",
  "/replayable-timeline": "docs/subsystems/timeline_events.md",
  "/auditable-change-log": "docs/subsystems/observation_architecture.md",
  "/strong-consistency": "docs/architecture/consistency.md",
  "/transactional-writes": "docs/architecture/consistency.md",
  "/schema-constraints": "docs/subsystems/schema_registry.md",
  "/silent-mutation-risk": "docs/developer/agent_memory_failure_modes.md",
  "/conflicting-facts-risk": "docs/subsystems/conflict_resolution.md",
  "/false-closure-risk": "docs/developer/agent_memory_failure_modes.md",
  "/reproducible-state-reconstruction": "docs/developer/exit_rebuild_test.md",
  "/human-inspectability": "docs/developer/inspector/README.md",
  "/zero-setup-onboarding": "install.md",
  "/semantic-similarity-search": "docs/subsystems/vector_ops.md",
  "/direct-human-editability": "docs/subsystems/markdown_mirror.md",
  "/platform-memory": null,
  "/retrieval-memory": null,
  "/file-based-memory": null,
  "/database-memory": null,
  "/deterministic-memory": null,
  "/memory-vendors": null,
  "/memory-models": null,
  "/memory-guarantees": null,
  "/build-vs-buy": null,
  "/multi-agent-state": null,
  "/troubleshooting": "docs/operations/runbook.md",
  "/faq": null,
  "/neotoma-vs-platform-memory": null,
  "/neotoma-vs-mem0": null,
  "/neotoma-vs-zep": null,
  "/neotoma-vs-rag": null,
  "/neotoma-vs-files": null,
  "/neotoma-vs-database": null,
  "/types/contacts": "docs/subsystems/record_types.md",
  "/types/tasks": "docs/subsystems/record_types.md",
  "/types/transactions": "docs/subsystems/record_types.md",
  "/types/contracts": "docs/subsystems/record_types.md",
  "/types/decisions": "docs/subsystems/record_types.md",
  "/types/events": "docs/subsystems/record_types.md",
  "/primitives": "docs/architecture/architecture.md",
  "/primitives/sources": "docs/subsystems/sources.md",
  "/primitives/interpretations": "docs/subsystems/interpretations.md",
  "/primitives/observations": "docs/subsystems/observation_architecture.md",
  "/primitives/relationships": "docs/subsystems/relationships.md",
  "/primitives/timeline-events": "docs/subsystems/timeline_events.md",
  "/primitives/entities": "docs/subsystems/entities.md",
  "/primitives/entity-snapshots": "docs/subsystems/entity_snapshots.md",
  "/schemas": "docs/subsystems/schema.md",
  "/schemas/registry": "docs/subsystems/schema_registry.md",
  "/schemas/merge-policies": "docs/subsystems/conflict_resolution.md",
  "/schemas/storage-layers": "docs/subsystems/schema.md",
  "/schemas/versioning": "docs/subsystems/schema_registry.md",
  "/schemas/locked-vs-evolving": "docs/subsystems/schema_registry.md",
  "/walkthrough": "docs/developer/canonical_walkthrough.md",
  "/schema-management": "docs/subsystems/schema_registry.md",
  "/non-destructive-testing": "docs/developer/getting_started.md",
  "/changelog": "releases",
  "/foundations": "docs/foundation/core_identity.md",
  "/foundation/problem-statement": "docs/foundation/problem_statement.md",
  "/privacy-first": null,
  "/cross-platform": null,
  // Use-case landing pages
  "/use-cases": "docs/use_cases/README.md",
  "/verticals": "docs/use_cases/README.md",
  "/crm": "docs/use_cases/crm.md",
  "/compliance": "docs/use_cases/compliance.md",
  "/contracts": "docs/use_cases/contracts.md",
  "/diligence": "docs/use_cases/diligence.md",
  "/portfolio": "docs/use_cases/portfolio.md",
  "/cases": "docs/use_cases/cases.md",
  "/financial-ops": "docs/use_cases/financial_ops.md",
  "/procurement": "docs/use_cases/procurement.md",
  "/agent-auth": "docs/use_cases/agent_auth.md",
  "/healthcare": "docs/use_cases/healthcare.md",
  "/government": "docs/use_cases/government.md",
  "/customer-ops": "docs/use_cases/customer_ops.md",
  "/logistics": "docs/use_cases/logistics.md",
  "/personal-data": "docs/use_cases/personal_data.md",
  "/trading": "docs/use_cases/trading.md",
  "/crypto-engineering": "docs/use_cases/crypto_engineering.md",
  "/ai-infrastructure-engineers": "docs/icp/",
  "/ai-native-operators": "docs/icp/",
  "/agentic-systems-builders": "docs/icp/",
};

/** Special destinations that are not repo paths. */
const SPECIAL: Readonly<Record<string, string>> = {
  releases: `${GITHUB_REPO}/releases`,
};

export type Destination = {
  /** Absolute URL, or "/" for the one-pager. */
  url: string;
  /** Repo-relative path when the destination is a file or folder in this repository. */
  repoPath: string | null;
  kind: "github" | "onepager" | "site";
};

const LOCALE_PREFIX = /^\/(es|ca|zh|hi|ar|fr|pt|ru|bn|ur|id|de)(\/|$)/;
/** Legal and consent routes that stay live in every locale (single source for the app shell and the build). */
export const LOCALIZED_LEGAL_PATHS = ["/privacy", "/terms", "/sandbox/terms-of-use"] as const;
const LOCALE_LEGAL = new RegExp(
  `^/(es|ca|zh|hi|ar|fr|pt|ru|bn|ur|id|de)/(markdown/)?(${LOCALIZED_LEGAL_PATHS.map((p) => p.slice(1).replace(/\//g, "\\/")).join("|")})$`
);
const LEGAL_REASON =
  "Localized legal and consent surface (the page and its markdown mirror): held like its English counterpart. Redirecting a legal URL is a counsel decision.";

export function isLocaleRoute(route: string): boolean {
  return LOCALE_PREFIX.test(route);
}

export function stripTrailingSlash(route: string): string {
  return route.length > 1 ? route.replace(/\/+$/, "") : route;
}

export function isLiveRoute(route: string): boolean {
  return LIVE_ROUTES.includes(stripTrailingSlash(route));
}

export function heldReason(route: string): string | null {
  const r = stripTrailingSlash(route);
  if (LOCALE_LEGAL.test(r)) return LEGAL_REASON;
  if (r.startsWith("/markdown/")) {
    // A mirror carries its source page's content and metadata, so it is served only while the source is.
    const source = r.slice("/markdown".length);
    if (isLiveRoute(source) || (!source.startsWith("/markdown") && heldReason(source) !== null)) {
      return MARKDOWN_MIRROR_REASON;
    }
    return null;
  }
  for (const h of HELD_ROUTES) {
    if (typeof h.match === "string" ? h.match === r : h.match.test(r)) return h.reason;
  }
  return null;
}

/**
 * Every locale route goes to the one-pager, except the localized legal routes, which stay live.
 * A route served by a published docs viewer page (`/docs/<slug>/`) is a real page, not retired.
 */
export function isRetiredRoute(route: string, viewer: DocsViewerIndex = DOCS_VIEWER_INDEX): boolean {
  const r = stripTrailingSlash(route);
  if (isLocaleRoute(r)) return !LOCALE_LEGAL.test(r);
  if (isLiveRoute(r)) return false;
  if (viewer.byRoute.has(r)) return false;
  return heldReason(r) === null;
}

/** True when the route is served as a real page (live or held), false when it is a redirect stub. */
export function servesRealPage(route: string): boolean {
  return !isRetiredRoute(route);
}

export function resolveDestination(
  route: string,
  viewer: DocsViewerIndex = DOCS_VIEWER_INDEX
): Destination {
  const r = stripTrailingSlash(route);
  if (isLocaleRoute(r)) return { url: "/", repoPath: null, kind: "onepager" };
  const self = viewer.byRoute.get(r);
  if (self) return { url: `https://neotoma.io${r}/`, repoPath: null, kind: "site" };
  // The mirror of a retired page goes where its source page goes.
  if (r.startsWith("/markdown/") && RETIRED_DESTINATIONS[r] === undefined) {
    return resolveDestination(r.slice("/markdown".length), viewer);
  }
  const mapped = RETIRED_DESTINATIONS[r];
  if (mapped === undefined) {
    // Dynamic children (for example /skills/:slug are held; unknown retired routes go home).
    return { url: "/", repoPath: null, kind: "onepager" };
  }
  if (mapped === null) return { url: "/", repoPath: null, kind: "onepager" };
  if (mapped.startsWith("/"))
    return { url: `https://neotoma.io${mapped}`, repoPath: null, kind: "site" };
  if (SPECIAL[mapped]) return { url: SPECIAL[mapped], repoPath: null, kind: "github" };
  // A destination that neotoma.io now renders as a docs viewer page goes to that page.
  const viewerHref = viewerHrefForRepoPath(mapped, viewer);
  if (viewerHref) return { url: `https://neotoma.io${viewerHref}`, repoPath: null, kind: "site" };
  const url = mapped.endsWith("/") ? `${TREE}${mapped}` : `${BLOB}${mapped}`;
  return { url, repoPath: mapped, kind: "github" };
}

/** Stub page for a retired route. Meta refresh, canonical, noindex and a visible link. */
export function buildRedirectStub(
  route: string,
  origin = "https://neotoma.io",
  viewer: DocsViewerIndex = DOCS_VIEWER_INDEX
): string {
  const dest = resolveDestination(route, viewer);
  const target = dest.url === "/" ? `${origin}/` : dest.url;
  const label = dest.kind === "github" ? "the Neotoma repository on GitHub" : "the Neotoma site";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Moved | Neotoma</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,follow">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<link rel="canonical" href="${esc(target)}">
<style>body{margin:0;padding:48px 20px;background:#f2ecdf;color:#28372f;font:16px/1.6 system-ui,sans-serif}main{max-width:36rem;margin:0 auto;border:2px solid #28372f;background:#fffbf2;padding:28px}a{color:#a84d33}</style>
</head>
<body>
<main>
<p><strong>This page has moved.</strong></p>
<p>Neotoma is now a single page at <a href="https://neotoma.io/">neotoma.io</a>. The closest match for this address is on ${label}.</p>
<p><a href="${esc(target)}">Continue to ${esc(target)}</a></p>
</main>
</body>
</html>
`;
}

/**
 * Server-side mirror of `DOC_NAV_CATEGORIES` from
 * `frontend/src/site/site_data.ts`. Used to render the "Learn" index on the
 * MCP root landing page without pulling the frontend module graph into the
 * Node build.
 *
 * @remarks Duplication is intentional: the SPA and server bundles don't share a
 * module path. A drift-tracking unit test lives in
 * `tests/unit/root_landing_site_nav_drift.test.ts` — it imports the frontend
 * source and fails if any label/href diverges, so the author is forced to keep
 * the mirror in sync.
 *
 * When updating `DOC_NAV_CATEGORIES` in the frontend, update this file too.
 */

export interface RootLandingNavItem {
  label: string;
  href: string;
  /** Lucide icon name (cosmetic; server renders a plain bullet). */
  icon?: string;
}

export interface RootLandingNavCategory {
  title: string;
  items: RootLandingNavItem[];
}

export const ROOT_LANDING_SITE_NAV: RootLandingNavCategory[] = [
  {
    title: "Getting started",
    items: [
      { label: "Documentation", href: "/docs", icon: "Home" },
      { label: "Evaluate", href: "/evaluate", icon: "ClipboardCheck" },
      { label: "Meet the creator", href: "/meet", icon: "CalendarClock" },
      { label: "What to store first", href: "/what-to-store", icon: "BookOpen" },
      { label: "Install", href: "/install", icon: "Download" },
      { label: "Test safely", href: "/non-destructive-testing", icon: "FlaskConical" },
      { label: "Backup and restore", href: "/backup", icon: "Database" },
      { label: "Connect remotely", href: "/connect", icon: "Plug" },
      { label: "Expose tunnel", href: "/tunnel", icon: "SatelliteDish" },
      { label: "Walkthrough", href: "/walkthrough", icon: "Waypoints" },
    ],
  },
  {
    title: "Architecture",
    items: [
      { label: "Foundations", href: "/foundations", icon: "Shield" },
      { label: "Memory guarantees", href: "/memory-guarantees", icon: "ShieldCheck" },
      { label: "Architecture", href: "/architecture", icon: "Layers" },
      { label: "Memory models", href: "/memory-models", icon: "Boxes" },
    ],
  },
  {
    title: "Hosted",
    items: [
      { label: "Hosted Neotoma", href: "/hosted", icon: "Server" },
      { label: "Public sandbox", href: "/sandbox", icon: "Globe" },
    ],
  },
  {
    title: "Integrations",
    items: [
      { label: "ChatGPT", href: "/neotoma-with-chatgpt", icon: "MessageCircle" },
      { label: "Claude", href: "/neotoma-with-claude", icon: "MessageSquare" },
      { label: "Claude Code", href: "/neotoma-with-claude-code", icon: "Code" },
      { label: "Codex", href: "/neotoma-with-codex", icon: "Monitor" },
      { label: "Cursor", href: "/neotoma-with-cursor", icon: "PanelRight" },
      { label: "IronClaw", href: "/neotoma-with-ironclaw", icon: "IronClaw" },
      { label: "OpenClaw", href: "/neotoma-with-openclaw", icon: "Sparkles" },
      { label: "OpenCode", href: "/neotoma-with-opencode", icon: "OpenCode" },
    ],
  },
  {
    title: "Skills",
    items: [
      { label: "All skills", href: "/skills", icon: "Bot" },
      { label: "Ensure Neotoma", href: "/skills/ensure-neotoma", icon: "Download" },
      { label: "Remember Email", href: "/skills/remember-email", icon: "Mail" },
      {
        label: "Remember Conversations",
        href: "/skills/remember-conversations",
        icon: "MessageSquare",
      },
      { label: "Remember Meetings", href: "/skills/remember-meetings", icon: "Users" },
      { label: "Remember Finances", href: "/skills/remember-finances", icon: "Receipt" },
      { label: "Remember Contacts", href: "/skills/remember-contacts", icon: "BookUser" },
      { label: "Remember Calendar", href: "/skills/remember-calendar", icon: "CalendarClock" },
      { label: "Remember Codebase", href: "/skills/remember-codebase", icon: "Code" },
      { label: "Store Data", href: "/skills/store-data", icon: "Database" },
      { label: "Query Memory", href: "/skills/query-memory", icon: "Search" },
    ],
  },
  {
    title: "Record types",
    items: [
      { label: "Contacts", href: "/types/contacts", icon: "Users" },
      { label: "Tasks", href: "/types/tasks", icon: "ListChecks" },
      { label: "Transactions", href: "/types/transactions", icon: "Receipt" },
      { label: "Contracts", href: "/types/contracts", icon: "Scale" },
      { label: "Decisions", href: "/types/decisions", icon: "Waypoints" },
      { label: "Events", href: "/types/events", icon: "CalendarClock" },
    ],
  },
  {
    title: "Primitive record types",
    items: [
      { label: "Overview", href: "/primitives", icon: "Layers" },
      { label: "Entities", href: "/primitives/entities", icon: "Users" },
      { label: "Entity snapshots", href: "/primitives/entity-snapshots", icon: "Boxes" },
      { label: "Sources", href: "/primitives/sources", icon: "Database" },
      { label: "Interpretations", href: "/primitives/interpretations", icon: "Sparkles" },
      { label: "Observations", href: "/primitives/observations", icon: "Fingerprint" },
      { label: "Relationships", href: "/primitives/relationships", icon: "GitCompare" },
      { label: "Timeline events", href: "/primitives/timeline-events", icon: "CalendarClock" },
    ],
  },
  {
    title: "Schemas",
    items: [
      { label: "Overview", href: "/schemas", icon: "Layers" },
      { label: "Schema registry", href: "/schemas/registry", icon: "Database" },
      { label: "Merge policies", href: "/schemas/merge-policies", icon: "GitMerge" },
      { label: "Storage layers", href: "/schemas/storage-layers", icon: "Boxes" },
      { label: "Versioning & evolution", href: "/schemas/versioning", icon: "GitBranch" },
    ],
  },
  {
    title: "Reference",
    items: [
      { label: "REST API", href: "/api", icon: "Globe" },
      { label: "MCP server", href: "/mcp", icon: "Server" },
      { label: "CLI", href: "/cli", icon: "Terminal" },
      { label: "Inspector", href: "/inspector", icon: "ScanSearch" },
      { label: "AAuth", href: "/aauth", icon: "Key" },
      { label: "Peer sync", href: "/peer-sync", icon: "Network" },
      { label: "Subscriptions", href: "/subscriptions", icon: "Radio" },
      { label: "Issue reporting", href: "/issue-reporting", icon: "Bug" },
      { label: "Security hardening", href: "/security-hardening", icon: "Lock" },
      { label: "Memory guarantees", href: "/memory-guarantees", icon: "ShieldCheck" },
      { label: "Memory models", href: "/memory-models", icon: "Container" },
      { label: "Foundations", href: "/foundations", icon: "Layers" },
      { label: "Problem statement", href: "/foundation/problem-statement", icon: "FileText" },
      { label: "Agent instructions", href: "/agent-instructions", icon: "Bot" },
      { label: "Architecture", href: "/architecture", icon: "Building2" },
      { label: "Terminology", href: "/terminology", icon: "Bookmark" },
      { label: "Troubleshooting", href: "/troubleshooting", icon: "Bug" },
      { label: "FAQ", href: "/faq", icon: "HelpCircle" },
      { label: "Changelog", href: "/changelog", icon: "History" },
      { label: "All pages (Markdown)", href: "/site-markdown", icon: "FileText" },
    ],
  },
  {
    title: "Inspector",
    items: [
      { label: "Overview", href: "/inspector", icon: "ScanSearch" },
      { label: "Dashboard & health", href: "/inspector/dashboard", icon: "LayoutGrid" },
      { label: "Entities", href: "/inspector/entities", icon: "Boxes" },
      {
        label: "Observations & sources",
        href: "/inspector/observations-and-sources",
        icon: "History",
      },
      {
        label: "Relationships & graph",
        href: "/inspector/relationships-and-graph",
        icon: "Waypoints",
      },
      { label: "Schemas", href: "/inspector/schemas", icon: "Database" },
      { label: "Timeline & interpretations", href: "/inspector/timeline", icon: "History" },
      { label: "Conversations & turns", href: "/inspector/conversations", icon: "MessageSquare" },
      { label: "Agents & grants", href: "/inspector/agents", icon: "Bot" },
      { label: "Search", href: "/inspector/search", icon: "Search" },
      { label: "Settings", href: "/inspector/settings", icon: "Settings" },
    ],
  },
  {
    title: "Where the tax shows up",
    items: [
      { label: "Context janitor", href: "/operating", icon: "SatelliteDish" },
      { label: "Inference variance", href: "/building-pipelines", icon: "Zap" },
      { label: "Log archaeology", href: "/debugging-infrastructure", icon: "Cpu" },
    ],
  },
  {
    title: "Compare",
    items: [
      { label: "Build vs buy", href: "/build-vs-buy", icon: "Scale" },
      { label: "Multi-agent shared state", href: "/multi-agent-state", icon: "Layers" },
      { label: "Neotoma vs platform memory", href: "/neotoma-vs-platform-memory", icon: "Globe" },
      { label: "Neotoma vs Mem0", href: "/neotoma-vs-mem0", icon: "Boxes" },
      { label: "Neotoma vs Zep", href: "/neotoma-vs-zep", icon: "History" },
      { label: "Neotoma vs RAG", href: "/neotoma-vs-rag", icon: "Search" },
      { label: "Neotoma vs file-based memory", href: "/neotoma-vs-files", icon: "FileText" },
      { label: "Neotoma vs database memory", href: "/neotoma-vs-database", icon: "Database" },
    ],
  },
  {
    title: "External",
    items: [
      { label: "GitHub", href: "https://github.com/markmhendrickson/neotoma", icon: "Github" },
      { label: "npm", href: "https://www.npmjs.com/package/neotoma", icon: "Package" },
    ],
  },
];

/**
 * Resolves an `href` against the `publicDocsUrl`. External URLs (anything
 * starting with `http://` or `https://`) pass through; absolute site paths
 * (`/docs`, `/install`, …) are prefixed with `publicDocsUrl`.
 */
export function resolveNavHref(href: string, publicDocsUrl: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const base = publicDocsUrl.replace(/\/+$/, "");
  const path = href.startsWith("/") ? href : `/${href}`;
  return `${base}${path}`;
}

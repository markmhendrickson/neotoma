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
      { label: "Install", href: "/install", icon: "Download" },
      { label: "Connect a remote Neotoma", href: "/connect", icon: "Plug" },
      { label: "Walkthrough", href: "/walkthrough", icon: "Waypoints" },
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
      { label: "Claude Code", href: "/neotoma-with-claude-code", icon: "Code" },
      { label: "Claude", href: "/neotoma-with-claude", icon: "MessageSquare" },
      { label: "ChatGPT", href: "/neotoma-with-chatgpt", icon: "MessageCircle" },
      { label: "Codex", href: "/neotoma-with-codex", icon: "Monitor" },
      { label: "Cursor", href: "/neotoma-with-cursor", icon: "PanelRight" },
      { label: "OpenClaw", href: "/neotoma-with-openclaw", icon: "Sparkles" },
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
    title: "Reference",
    items: [
      { label: "REST API", href: "/api", icon: "Globe" },
      { label: "MCP server", href: "/mcp", icon: "Server" },
      { label: "CLI", href: "/cli", icon: "Terminal" },
      { label: "Memory guarantees", href: "/memory-guarantees", icon: "ShieldCheck" },
      { label: "Memory models", href: "/memory-models", icon: "Container" },
      { label: "Foundations", href: "/foundations", icon: "Layers" },
      { label: "Agent instructions", href: "/agent-instructions", icon: "Bot" },
      { label: "Architecture", href: "/architecture", icon: "Building2" },
      { label: "Terminology", href: "/terminology", icon: "Bookmark" },
      { label: "Schema management", href: "/schema-management", icon: "Database" },
      { label: "Troubleshooting", href: "/troubleshooting", icon: "Bug" },
      { label: "FAQ", href: "/faq", icon: "HelpCircle" },
      { label: "Changelog", href: "/changelog", icon: "History" },
      { label: "All pages (Markdown)", href: "/site-markdown", icon: "FileText" },
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

import { Link } from "react-router-dom";
import {
  BookOpen,
  Bookmark,
  Bot,
  Boxes,
  Bug,
  Building2,
  Code,
  Cpu,
  Database,
  Download,
  FileText,
  GitCompare,
  Github,
  Globe,
  History,
  Layers,
  MessageCircle,
  MessageSquare,
  Monitor,
  Package,
  PanelRight,
  SatelliteDish,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Waypoints,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SiClaude, SiOpenai } from "react-icons/si";
import { DetailPage } from "../DetailPage";
import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";
import { Card, CardContent } from "@/components/ui/card";
import { CodexIcon } from "@/components/icons/CodexIcon";
import { CursorIcon } from "@/components/icons/CursorIcon";
import { OpenClawIcon } from "@/components/icons/OpenClawIcon";
import { DOC_NAV_CATEGORIES } from "@/site/site_data";
import { sendCtaClick, type CtaName } from "@/utils/analytics";

function docsHubCta(itemHref: string, categoryTitle: string): CtaName | null {
  if (itemHref === "/evaluate") return "docs_evaluate_getting_started";
  if (itemHref === "/install") {
    if (categoryTitle === "Getting started") return "docs_install_getting_started";
    if (categoryTitle === "Reference") return "docs_install_reference";
  }
  return null;
}

/** Same branded icons as DocsSidebar for integration hrefs. */
const INTEGRATION_BRAND_ICONS: Record<
  string,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean; size?: number }>
> = {
  "/neotoma-with-claude-code": SiClaude,
  "/neotoma-with-claude": SiClaude,
  "/neotoma-with-chatgpt": SiOpenai,
  "/neotoma-with-codex": CodexIcon,
  "/neotoma-with-cursor": CursorIcon,
  "/neotoma-with-openclaw": OpenClawIcon,
};

const DOC_NAV_ICONS: Record<string, LucideIcon> = {
  BookOpen,
  Bookmark,
  Bot,
  Boxes,
  Bug,
  Building2,
  Code,
  Cpu,
  Database,
  Download,
  FileText,
  GitCompare,
  Github,
  Globe,
  History,
  Layers,
  MessageCircle,
  MessageSquare,
  Monitor,
  Package,
  PanelRight,
  SatelliteDish,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Waypoints,
  Zap,
};

/** href -> icon name from DOC_NAV_CATEGORIES (External uses full URL). */
const ICON_BY_HREF = (() => {
  const map: Record<string, string> = {};
  for (const cat of DOC_NAV_CATEGORIES) {
    for (const item of cat.items) {
      if ("icon" in item && typeof item.icon === "string") {
        map[item.href] = item.icon;
      }
    }
  }
  return map;
})();

const DOC_CATEGORIES = [
  {
    title: "Getting started",
    items: [
      {
        label: "Evaluate",
        href: "/evaluate",
        desc: "Have your agent read this page to decide whether Neotoma fits your workflow",
      },
      { label: "Install", href: "/install", desc: "Install and initialize Neotoma locally" },
      {
        label: "Walkthrough",
        href: "/developer-walkthrough",
        desc: "End-to-end example across operating, building, and debugging",
      },
    ],
  },
  {
    title: "Integrations",
    items: [
      {
        label: "Claude Code",
        href: "/neotoma-with-claude-code",
        desc: "Persistent memory for Claude Code's local CLI agent",
      },
      {
        label: "Claude",
        href: "/neotoma-with-claude",
        desc: "Structured state alongside Claude platform memory",
      },
      {
        label: "ChatGPT",
        href: "/neotoma-with-chatgpt",
        desc: "Deterministic memory for ChatGPT conversations",
      },
      {
        label: "Codex",
        href: "/neotoma-with-codex",
        desc: "Cross-task memory and CLI fallback",
      },
      {
        label: "Cursor",
        href: "/neotoma-with-cursor",
        desc: "Persistent memory alongside Cursor context",
      },
      {
        label: "OpenClaw",
        href: "/neotoma-with-openclaw",
        desc: "User-owned memory for OpenClaw agents",
      },
    ],
  },
  {
    title: "Reference",
    items: [
      { label: "Install", href: "/install", desc: "Install and initialize Neotoma locally" },
      { label: "REST API", href: "/api", desc: "OpenAPI endpoints and parameters" },
      { label: "MCP server", href: "/mcp", desc: "Model Context Protocol actions" },
      { label: "CLI", href: "/cli", desc: "Commands, flags, and REPL" },
      {
        label: "Memory guarantees",
        href: "/memory-guarantees",
        desc: "All memory properties on one page",
      },
      {
        label: "Memory models",
        href: "/memory-models",
        desc: "Platform, retrieval, file-based, and deterministic memory compared",
      },
      {
        label: "Foundations",
        href: "/foundations",
        desc: "Privacy-first architecture and cross-platform design",
      },
      {
        label: "Agent instructions",
        href: "/agent-instructions",
        desc: "Mandatory behavioral rules for agents using Neotoma",
      },
      {
        label: "Architecture",
        href: "/architecture",
        desc: "State flow, guarantees, and principles",
      },
      { label: "Terminology", href: "/terminology", desc: "Glossary of key concepts" },
      {
        label: "Schema management",
        href: "/schema-management",
        desc: "Define, inspect, and evolve schema constraints safely",
      },
      {
        label: "Troubleshooting",
        href: "/troubleshooting",
        desc: "Common failure modes and practical fixes",
      },
      {
        label: "Changelog",
        href: "/changelog",
        desc: "Release history and documentation updates",
      },
      {
        label: "All pages (Markdown)",
        href: "/site-markdown",
        desc: "Every indexable route as Markdown (SEO summaries)",
      },
    ],
  },
  {
    title: "Operational modes",
    items: [
      {
        label: "Operating across tools",
        href: "/operating",
        desc: "Memory that survives session resets and follows you between tools",
      },
      {
        label: "Building pipelines",
        href: "/building-pipelines",
        desc: "Persistent memory and provenance for agent pipelines",
      },
      {
        label: "Debugging infrastructure",
        href: "/debugging-infrastructure",
        desc: "Replayable state for debugging agent runs",
      },
    ],
  },
  {
    title: "Compare",
    items: [
      {
        label: "Build vs buy",
        href: "/build-vs-buy",
        desc: "When to adopt a state-integrity layer instead of building around observability alone",
      },
      {
        label: "Neotoma vs platform memory",
        href: "/neotoma-vs-platform-memory",
        desc: "Convenience inside one AI product versus portable, auditable state across tools",
      },
      {
        label: "Neotoma vs Mem0",
        href: "/neotoma-vs-mem0",
        desc: "Retrieval memory for prompt augmentation versus deterministic entity state",
      },
      {
        label: "Neotoma vs Zep",
        href: "/neotoma-vs-zep",
        desc: "Knowledge-graph retrieval versus versioned, schema-bound state",
      },
      {
        label: "Neotoma vs RAG",
        href: "/neotoma-vs-rag",
        desc: "Relevant chunk retrieval versus exact state reconstruction",
      },
      {
        label: "Neotoma vs file-based memory",
        href: "/neotoma-vs-files",
        desc: "Markdown and JSON portability versus structured guarantees and provenance",
      },
      {
        label: "Neotoma vs database memory",
        href: "/neotoma-vs-database",
        desc: "CRUD rows versus append-only observations and deterministic reducers",
      },
    ],
  },
  {
    title: "External",
    items: [
      {
        label: "GitHub repository",
        href: "https://github.com/markmhendrickson/neotoma",
        desc: "Source code, README, and issues",
      },
      {
        label: "npm package",
        href: "https://www.npmjs.com/package/neotoma",
        desc: "Install via npm",
      },
    ],
  },
];

export function DocsIndexPage() {
  const { locale, dict } = useLocale();
  const translateCategoryTitle = (title: string) => {
    if (title === "Getting started") return dict.categoryGettingStarted;
    if (title === "Reference") return dict.categoryReference;
    if (title === "Memory guarantees") return "Memory guarantees";
    if (title === "Memory models") return "Memory models";
    if (title === "Foundations") return "Foundations";
    if (title === "Agent behavior") return dict.categoryAgentBehavior;
    if (title === "Use cases") return dict.categoryUseCases;
    if (title === "Integration guides" || title === "Integrations")
      return dict.categoryIntegrationGuides;
    if (title === "External") return dict.categoryExternal;
    if (title === "Compare") return dict.categoryCompare;
    if (title === "Verticals") return dict.categoryVerticals;
    return title;
  };

  return (
    <DetailPage title={dict.allDocumentation}>
      <div className="[&_a]:!no-underline [&_a]:hover:!no-underline [&_a]:focus:!no-underline">
        <p className="text-[15px] leading-7 text-muted-foreground mb-10">{dict.docsIntro}</p>

        {DOC_CATEGORIES.map((cat) => {
          return (
            <section key={cat.title} className="mb-12">
              <h2 className="text-[18px] font-medium tracking-[-0.01em] mb-4">
                {translateCategoryTitle(cat.title)}
              </h2>
              <ul className="list-none pl-0 grid grid-cols-1 sm:grid-cols-2 auto-rows-fr gap-3">
                {cat.items.map((item) => {
                  const isExternal = item.href.startsWith("http");
                  const linkProps = isExternal
                    ? { target: "_blank" as const, rel: "noopener noreferrer" }
                    : {};
                  const BrandIcon = item.href.startsWith("/")
                    ? INTEGRATION_BRAND_ICONS[item.href]
                    : null;
                  const iconName = ICON_BY_HREF[item.href];
                  const LucideIconComponent = iconName
                    ? DOC_NAV_ICONS[iconName]
                    : DOC_NAV_ICONS.BookOpen;
                  const Icon = BrandIcon ?? LucideIconComponent;
                  const desc = "desc" in item ? item.desc : null;
                  const trackDocsHub = () => {
                    const cta = docsHubCta(item.href, cat.title);
                    if (cta) sendCtaClick(cta);
                  };

                  const linkContent = (
                    <Card className="h-full transition-colors hover:bg-muted/50 border border-border [&_a]:no-underline [&_a]:hover:no-underline">
                      <CardContent className="p-4 h-full">
                        <div className="flex items-start gap-3">
                          <span
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                            aria-hidden
                          >
                            {Icon ? <Icon className="h-5 w-5 shrink-0" aria-hidden /> : null}
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-[15px] text-foreground block">
                              {item.label}
                            </span>
                            {desc && (
                              <span className="text-[13px] leading-snug text-muted-foreground block mt-0.5">
                                {desc}
                              </span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );

                  return (
                    <li key={item.href} className="h-full">
                      {isExternal ? (
                        <a
                          href={
                            item.href.startsWith("/") ? localizePath(item.href, locale) : item.href
                          }
                          className="block h-full no-underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                          {...linkProps}
                        >
                          {linkContent}
                        </a>
                      ) : item.href.startsWith("/#") ? (
                        <a
                          href={localizePath(item.href, locale)}
                          className="block h-full no-underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                          onClick={trackDocsHub}
                        >
                          {linkContent}
                        </a>
                      ) : (
                        <Link
                          to={localizePath(item.href, locale)}
                          className="block h-full no-underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                          onClick={trackDocsHub}
                        >
                          {linkContent}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </DetailPage>
  );
}

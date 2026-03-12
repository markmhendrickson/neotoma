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
  Github,
  Globe,
  History,
  Layers,
  MessageCircle,
  MessageSquare,
  Monitor,
  Package,
  PanelRight,
  Rocket,
  SatelliteDish,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SiClaude, SiOpenai } from "react-icons/si";
import { DetailPage } from "../DetailPage";
import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";
import { Card, CardContent } from "@/components/ui/card";
import { CursorIcon } from "@/components/icons/CursorIcon";
import { OpenClawIcon } from "@/components/icons/OpenClawIcon";
import { DOC_NAV_CATEGORIES } from "@/site/site_data";

/** Same branded icons as DocsSidebar for integration hrefs. */
const INTEGRATION_BRAND_ICONS: Record<
  string,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean; size?: number }>
> = {
  "/neotoma-with-claude-code": SiClaude,
  "/neotoma-with-claude": SiClaude,
  "/neotoma-with-chatgpt": SiOpenai,
  "/neotoma-with-codex": SiOpenai,
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
  Github,
  Globe,
  History,
  Layers,
  MessageCircle,
  MessageSquare,
  Monitor,
  Package,
  PanelRight,
  Rocket,
  SatelliteDish,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
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
      { label: "Install", href: "/install", desc: "Install and initialize Neotoma locally" },
      {
        label: "Developer walkthrough",
        href: "/developer-walkthrough",
        desc: "Hands-on setup and implementation guide for engineers",
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
        label: "Data model walkthrough",
        href: "/data-model",
        desc: "How sources, observations, entities, snapshots, and relationships connect",
      },
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
    ],
  },
  {
    title: "Use cases",
    items: [
      {
        label: "AI-native operators",
        href: "/ai-native-operators",
        desc: "Memory across every tool and session",
      },
      {
        label: "AI infrastructure engineers",
        href: "/ai-infrastructure-engineers",
        desc: "Deterministic state for runtimes and orchestration",
      },
      {
        label: "Agentic systems builders",
        href: "/agentic-systems-builders",
        desc: "Deterministic memory and provenance layer for agents and toolchains",
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
    return title;
  };

  return (
    <DetailPage title={dict.allDocumentation}>
      <div className="[&_a]:!no-underline [&_a]:hover:!no-underline [&_a]:focus:!no-underline">
        <p className="text-[15px] leading-7 text-muted-foreground mb-10">{dict.docsIntro}</p>

        {DOC_CATEGORIES.map((cat) => (
        <section key={cat.title} className="mb-12">
          <h2 className="text-[18px] font-medium tracking-[-0.01em] mb-4">
            {translateCategoryTitle(cat.title)}
          </h2>
          <ul className="list-none pl-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cat.items.map((item) => {
              const isExternal = item.href.startsWith("http");
              const linkProps = isExternal
                ? { target: "_blank" as const, rel: "noopener noreferrer" }
                : {};
              const BrandIcon =
                item.href.startsWith("/") ? INTEGRATION_BRAND_ICONS[item.href] : null;
              const iconName = ICON_BY_HREF[item.href];
              const LucideIconComponent = iconName
                ? DOC_NAV_ICONS[iconName]
                : DOC_NAV_ICONS.BookOpen;
              const Icon = BrandIcon ?? LucideIconComponent;
              const desc = "desc" in item ? item.desc : null;

              const linkContent = (
                <Card className="h-full transition-colors hover:bg-muted/50 border border-border [&_a]:no-underline [&_a]:hover:no-underline">
                  <CardContent className="p-4">
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
                <li key={item.href}>
                  {isExternal ? (
                    <a
                      href={item.href.startsWith("/") ? localizePath(item.href, locale) : item.href}
                      className="block no-underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                      {...linkProps}
                    >
                      {linkContent}
                    </a>
                  ) : item.href.startsWith("/#") ? (
                    <a
                      href={localizePath(item.href, locale)}
                      className="block no-underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                    >
                      {linkContent}
                    </a>
                  ) : (
                    <Link
                      to={localizePath(item.href, locale)}
                      className="block no-underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                    >
                      {linkContent}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        ))}
      </div>
    </DetailPage>
  );
}

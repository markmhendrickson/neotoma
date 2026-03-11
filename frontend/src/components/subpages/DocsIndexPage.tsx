import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";
import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";

const DOC_CATEGORIES = [
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
      <p className="text-[15px] leading-7 text-muted-foreground mb-8">{dict.docsIntro}</p>

      {DOC_CATEGORIES.map((cat) => (
        <section key={cat.title} className="mb-10">
          <h2 className="text-[18px] font-medium tracking-[-0.01em] mb-3">
            {translateCategoryTitle(cat.title)}
          </h2>
          <ul className="list-none pl-0 space-y-2">
            {cat.items.map((item) => {
              const isExternal = item.href.startsWith("http");
              const linkProps = isExternal
                ? { target: "_blank" as const, rel: "noopener noreferrer" }
                : {};
              return (
                <li key={item.href} className="text-[15px] leading-7">
                  {isExternal ? (
                    <a
                      href={item.href.startsWith("/") ? localizePath(item.href, locale) : item.href}
                      className="text-foreground underline underline-offset-2 hover:no-underline"
                      {...linkProps}
                    >
                      {item.label}
                    </a>
                  ) : item.href.startsWith("/#") ? (
                    <a
                      href={localizePath(item.href, locale)}
                      className="text-foreground underline underline-offset-2 hover:no-underline"
                    >
                      {item.label}
                    </a>
                  ) : (
                    <Link
                      to={localizePath(item.href, locale)}
                      className="text-foreground underline underline-offset-2 hover:no-underline"
                    >
                      {item.label}
                    </Link>
                  )}
                  {"desc" in item && item.desc && (
                    <span className="text-muted-foreground"> — {item.desc}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </DetailPage>
  );
}

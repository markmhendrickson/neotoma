import { GLOSSARY_ROWS, REPO_VERSION, SITE_METADATA } from "./site_data";
import { FAQ_ITEMS } from "@/site/faq_items";
import {
  DEFAULT_LOCALE,
  LOCALE_TO_OG,
  NON_DEFAULT_LOCALES,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/i18n/config";
import { getStaticLocalePack } from "@/i18n/locales/static_packs";
import { getLocaleFromPath, localizePath, stripLocaleFromPath } from "@/i18n/routing";

export interface SeoRouteMetadata {
  title: string;
  description: string;
  robots: string;
  ogType?: "website" | "article";
  jsonLdType?: "WebPage" | "WebSite" | "SoftwareApplication";
  breadcrumb?: { name: string; path: string }[];
  /** Override default OG/Twitter image URL (defaults to site-wide asset). */
  ogImageUrl?: string;
  /** Social preview image description; defaults from title + description. */
  ogImageAlt?: string;
  /** Extra keywords merged with product defaults for meta keywords. */
  keywords?: string[];
  /** Twitter card layout (default summary_large_image). */
  twitterCard?: "summary" | "summary_large_image";
  /** FAQ items rendered as FAQPage JSON-LD schema. */
  faqItems?: { question: string; answer: string }[];
  /** HowTo schema: the name/title of the procedure. */
  howToName?: string;
  /** HowTo schema: ordered steps. */
  howToSteps?: { name: string; text: string }[];
  /** DefinedTermSet schema: glossary terms. */
  definedTerms?: { term: string; definition: string }[];
  /** SoftwareApplication schema fields for the homepage. */
  softwareApp?: {
    version: string;
    operatingSystem: string;
    applicationCategory: string;
    offers: { price: string; priceCurrency: string };
    license: string;
    codeRepository: string;
    featureList?: string[];
    installUrl?: string;
  };
  /** Organization schema with founder and sameAs links. */
  organization?: {
    founderName: string;
    founderUrl?: string;
    sameAs: string[];
  };
  /** Speakable schema: CSS selectors identifying content suitable for TTS / agent reading. */
  speakable?: string[];
}

export const SEO_DEFAULTS = {
  siteName: "Neotoma",
  baseUrl: "https://neotoma.io",
  locale: LOCALE_TO_OG[DEFAULT_LOCALE],
  ogImageUrl: SITE_METADATA.ogImageUrl,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  twitterCard: "summary_large_image" as const,
  twitterSite: "@markmhendrickson",
  author: "Neotoma",
};

const ROUTE_METADATA: Record<string, SeoRouteMetadata> = {
  "/": {
    title: "Your agents forget. Neotoma makes them remember.",
    description:
      "Persistent, versioned memory for AI agents across Claude, Cursor, ChatGPT, and MCP-connected tools. Every fact is versioned, every change is traceable, and every agent works from the same truth. Open-source, local-first, installs in 5 minutes.",
    /** Matches on-image copy and footer positioning; dev preview img uses this for alt/figcaption. */
    ogImageAlt:
      "Neotoma: the state layer for AI agents. Open-source and local-first. Large headline and supporting lines on warm brown with a Neotoma packrat holding a record.",
    robots: "index,follow",
    ogType: "website",
    jsonLdType: "WebSite",
    softwareApp: {
      version: REPO_VERSION,
      operatingSystem: "macOS, Linux, Windows (WSL)",
      applicationCategory: "DeveloperApplication",
      offers: { price: "0", priceCurrency: "USD" },
      license: "https://opensource.org/licenses/MIT",
      codeRepository: "https://github.com/markmhendrickson/neotoma",
      installUrl: "https://neotoma.io/install",
      featureList: [
        "Deterministic state evolution",
        "Versioned entity history",
        "Append-only observation log",
        "Schema-bound entity validation",
        "Field-level provenance tracking",
        "Cross-tool access via MCP",
        "Entity resolution with canonical IDs",
        "Temporal state queries",
        "Privacy-first local storage",
        "CLI, REST API, and MCP interfaces",
      ],
    },
    organization: {
      founderName: "Mark Hendrickson",
      founderUrl: "https://markmhendrickson.com",
      sameAs: [
        "https://github.com/markmhendrickson/neotoma",
        "https://www.npmjs.com/package/neotoma",
        "https://x.com/markmhendrickson",
      ],
    },
    faqItems: [
      {
        question: "Does Neotoma replace Claude's memory or ChatGPT's?",
        answer:
          "No \u2014 it works alongside them. Platform memory stores what one vendor decides to remember within that vendor's tool. Neotoma stores facts you control across all your tools. Keep using platform memory for quick context; use Neotoma when you need versioning, auditability, and cross-tool consistency.",
      },
      {
        question: "Can't I just build this with SQLite or a JSON file?",
        answer:
          "You can start there \u2014 many teams do. But you'll eventually need versioning, conflict detection, schema evolution, and cross-tool sync. That's months of infrastructure work. Neotoma ships those guarantees on day one.",
      },
      {
        question: "Platform memory (Claude, ChatGPT) is good enough \u2014 why add another tool?",
        answer:
          "Platform memory stores what one vendor decides to remember, in a format you can't inspect or export. It doesn't version, doesn't detect conflicts, and vanishes if you switch tools. Neotoma gives you structured, cross-tool memory you control.",
      },
      {
        question: "Is this production-ready?",
        answer:
          "Neotoma is in developer preview \u2014 used daily by real agent workflows. The core guarantees (deterministic memory, versioned history, append-only change log) are stable. Install in 5 minutes and let your agent evaluate the fit.",
      },
      {
        question: "Does Neotoma send my data to the cloud?",
        answer:
          "No. Neotoma runs locally by default. Your data stays on your machine in a local SQLite database. There is no cloud sync, no telemetry, and no training on your data unless you choose to expose the API.",
      },
    ],
    speakable: [
      "h1",
      "#intro p",
      "#who h2",
      "#who p",
      "#common-questions summary",
      "#common-questions p",
    ],
  },
  "/home/x7k9m2vp": {
    title: "Neotoma \u2014 structured state for AI agents",
    description: "Alternative homepage variant (not indexed).",
    robots: "noindex,nofollow",
    ogType: "website",
  },
  "/home-2": {
    title: "Neotoma \u2014 structured state for AI agents",
    description: "Homepage preview variant (not indexed).",
    robots: "noindex,nofollow",
    ogType: "website",
  },
  "/install": {
    title: "Install | Neotoma",
    description:
      "Install Neotoma in 5 minutes. Agent-assisted and manual install, Docker setup, API server startup, and MCP configuration.",
    robots: "index,follow",
    ogImageUrl: "https://neotoma.io/og/neotoma-og-install-1200x630.png",
    ogImageAlt:
      "Install Neotoma in 5 minutes. npm install -g neotoma. Agent-assisted setup for Cursor, Claude, ChatGPT, and MCP-connected tools.",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Install", path: "/install" },
    ],
    howToName: "How to install Neotoma",
    howToSteps: [
      {
        name: "Install the package",
        text: "Run 'npm install -g neotoma' to install the Neotoma CLI globally.",
      },
      {
        name: "Initialize configuration",
        text: "Run 'neotoma init', choose your AI client (Cursor, Claude Code, Codex, etc.), and restart your tool.",
      },
      {
        name: "Start the API server",
        text: "Run 'neotoma api start' to launch the local API server.",
      },
      {
        name: "Connect via MCP",
        text: "Configure your AI tool's MCP settings to connect to the Neotoma server. The init step handles this automatically for supported clients.",
      },
    ],
  },
  "/install/manual": {
    title: "Manual Install | Neotoma",
    description:
      "Install Neotoma manually with npm, verify the installation, start the API server, and connect MCP.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Install", path: "/install" },
      { name: "Manual Install", path: "/install/manual" },
    ],
  },
  "/install/docker": {
    title: "Docker Install | Neotoma",
    description:
      "Run Neotoma in Docker using docker-compose or standalone containers with persistent storage.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Install", path: "/install" },
      { name: "Docker Install", path: "/install/docker" },
    ],
  },
  "/sandbox": {
    title: "Public sandbox | Neotoma",
    description:
      "The Neotoma public sandbox lets any agent read and write without installing. Data is public, resets weekly, and exists for quick evaluation and shareable examples.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Hosted", path: "/hosted" },
      { name: "Sandbox", path: "/sandbox" },
    ],
  },
  "/sandbox/terms-of-use": {
    title: "Public sandbox terms of use | Neotoma",
    description:
      "Terms of use for sandbox.neotoma.io: public data, weekly reset, abuse reporting, and no production warranty. Same text as GET /sandbox/terms on the sandbox host, in readable HTML.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Sandbox", path: "/sandbox" },
      { name: "Sandbox terms", path: "/sandbox/terms-of-use" },
    ],
  },
  "/hosted": {
    title: "Hosted Neotoma | Neotoma",
    description:
      "Overview of Neotoma hosted flavors: the public sandbox, personal tunnels over self-hosted installs, and future managed production. Pick the right fit for your workflow.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Hosted", path: "/hosted" },
    ],
  },
  "/connect": {
    title: "Connect a remote Neotoma | Neotoma",
    description:
      "Connect any AI harness - Claude Code, Claude Desktop, ChatGPT, Codex, Cursor, OpenClaw - to a hosted Neotoma MCP endpoint without installing locally.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Connect", path: "/connect" },
    ],
  },
  "/docs": {
    title: "Neotoma Documentation | Setup, API, MCP, CLI References",
    description:
      "Documentation for Neotoma: setup, architecture, API references, and operational guides.",
    robots: "index,follow",
    ogType: "website",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
    ],
  },
  "/terminology": {
    title: "Core Terminology | Neotoma",
    description:
      "Glossary of key concepts in Neotoma: observations, entities, snapshots, timelines, and deterministic state.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Terminology", path: "/terminology" },
    ],
    definedTerms: GLOSSARY_ROWS.map((row) => ({ term: row.term, definition: row.definition })),
  },
  "/agent-instructions": {
    title: "Agent Instructions | Neotoma",
    description:
      "Mandatory behavioral rules for AI agents using Neotoma: persistence, entity extraction, and conventions.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Agent Instructions", path: "/agent-instructions" },
    ],
  },
  "/agent-instructions/store-recipes": {
    title: "Store Recipes and Entity Types | Neotoma Agent Instructions",
    description:
      "How agents store entities: user-phase recipes, attachments, screenshots, chat fallbacks, schema-agnostic storage, and type reuse rules.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Agent Instructions", path: "/agent-instructions" },
      { name: "Store Recipes", path: "/agent-instructions/store-recipes" },
    ],
  },
  "/agent-instructions/retrieval-provenance": {
    title: "Retrieval, Provenance, and Tasks | Neotoma Agent Instructions",
    description:
      "How agents retrieve entities, maintain source provenance, and create tasks and commitments from conversations.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Agent Instructions", path: "/agent-instructions" },
      { name: "Retrieval and Provenance", path: "/agent-instructions/retrieval-provenance" },
    ],
  },
  "/agent-instructions/display-conventions": {
    title: "Display, Attribution, and Conventions | Neotoma Agent Instructions",
    description:
      "Display rules, agent attribution, transport conventions, feedback reporting, error recovery, and onboarding instructions.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Agent Instructions", path: "/agent-instructions" },
      { name: "Display and Conventions", path: "/agent-instructions/display-conventions" },
    ],
  },
  "/api": {
    title: "REST API Reference | Neotoma",
    description:
      "OpenAPI endpoints and parameters for Neotoma: store, retrieve, search, and manage entities via HTTP.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "API", path: "/api" },
    ],
  },
  "/mcp": {
    title: "MCP Server Reference | Neotoma",
    description:
      "Model Context Protocol actions for Neotoma: store, retrieve, and query structured memory from any MCP client.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "MCP", path: "/mcp" },
    ],
  },
  "/cli": {
    title: "CLI Reference | Neotoma",
    description:
      "Neotoma command-line interface: commands, flags, REPL, and offline-first data operations.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "CLI", path: "/cli" },
    ],
  },
  "/aauth": {
    title: "AAuth (Agent Authentication) | Neotoma",
    description:
      "Cryptographically verifiable agent identity for Neotoma writes: RFC 9421 HTTP Message Signatures, the aa-agent+jwt token, trust tiers, hardware attestation, and operator policy.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "AAuth", path: "/aauth" },
    ],
  },
  "/inspector": {
    title: "Inspector | Neotoma",
    description:
      "The Neotoma Inspector: a web UI for entities, observations, sources, relationships, the timeline, schemas, conversations, agents, and grants.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Inspector", path: "/inspector" },
    ],
  },
  "/inspector/dashboard": {
    title: "Inspector, Dashboard & health | Neotoma",
    description:
      "The Inspector dashboard surfaces top-level stats, entity-type breakdown, attribution coverage, and live system health for a Neotoma instance.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Inspector", path: "/inspector" },
      { name: "Dashboard", path: "/inspector/dashboard" },
    ],
  },
  "/inspector/entities": {
    title: "Inspector, Entities | Neotoma",
    description:
      "Entity list, snapshots, per-field provenance, observations, relationships, graph context, multi-field corrections, and duplicate detection in the Neotoma Inspector.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Inspector", path: "/inspector" },
      { name: "Entities", path: "/inspector/entities" },
    ],
  },
  "/inspector/observations-and-sources": {
    title: "Inspector, Observations & sources | Neotoma",
    description:
      "Inspect immutable observations, the reducer that produces snapshots, the source registry, and the file-backed provenance chain behind every entity.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Inspector", path: "/inspector" },
      {
        name: "Observations & sources",
        path: "/inspector/observations-and-sources",
      },
    ],
  },
  "/inspector/relationships-and-graph": {
    title: "Inspector, Relationships & graph | Neotoma",
    description:
      "Typed relationships, the Graph Explorer, edge inspection, and the workflows for reasoning about Neotoma entities as a graph.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Inspector", path: "/inspector" },
      {
        name: "Relationships & graph",
        path: "/inspector/relationships-and-graph",
      },
    ],
  },
  "/inspector/schemas": {
    title: "Inspector, Schemas | Neotoma",
    description:
      "Browse registered entity types, fields, identity rules, version history, and live cardinality through the Neotoma Inspector.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Inspector", path: "/inspector" },
      { name: "Schemas", path: "/inspector/schemas" },
    ],
  },
  "/inspector/timeline": {
    title: "Inspector, Timeline & interpretations | Neotoma",
    description:
      "The Inspector timeline turns Neotoma's per-row history into a chronological event stream and exposes derived interpretation entities.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Inspector", path: "/inspector" },
      {
        name: "Timeline & interpretations",
        path: "/inspector/timeline",
      },
    ],
  },
  "/inspector/conversations": {
    title: "Inspector, Conversations & turns | Neotoma",
    description:
      "Reconstruct chat history from conversation_message rows: per-turn transcripts, embedded files, references, and per-row compliance auditing.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Inspector", path: "/inspector" },
      {
        name: "Conversations & turns",
        path: "/inspector/conversations",
      },
    ],
  },
  "/inspector/agents": {
    title: "Inspector, Agents, attribution & grants | Neotoma",
    description:
      "Per-agent attribution surface in the Neotoma Inspector: trust tiers, AAuth thumbprints, capability grants, and per-identity activity feeds.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Inspector", path: "/inspector" },
      {
        name: "Agents, attribution & grants",
        path: "/inspector/agents",
      },
    ],
  },
  "/inspector/search": {
    title: "Inspector, Search | Neotoma",
    description:
      "Global ⌘K search across entities, observations, sources, conversations, and timeline events in the Neotoma Inspector, with ranking and result-kind details.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Inspector", path: "/inspector" },
      { name: "Search", path: "/inspector/search" },
    ],
  },
  "/inspector/search-and-settings": {
    title: "Inspector, Settings | Neotoma",
    description:
      "Inspector settings overview: connection, attribution policy, retention, and feedback, the operator-side configuration surfaced in the Inspector app.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
  },
  "/inspector/settings": {
    title: "Inspector, Settings | Neotoma",
    description:
      "Inspector settings overview: connection, attribution policy, retention, and feedback, the operator-side configuration surfaced in the Inspector app.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Inspector", path: "/inspector" },
      { name: "Settings", path: "/inspector/settings" },
    ],
  },
  "/inspector/settings/connection": {
    title: "Inspector, Settings · Connection | Neotoma",
    description:
      "Configure the Neotoma API base URL, environment, SQLite path, and health probes from the Inspector settings panel.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Inspector", path: "/inspector" },
      { name: "Settings", path: "/inspector/settings" },
      { name: "Connection", path: "/inspector/settings/connection" },
    ],
  },
  "/inspector/settings/attribution-policy": {
    title: "Inspector, Settings · Attribution policy | Neotoma",
    description:
      "Configure the AAuth attribution policy from the Inspector: global allow/warn/reject mode, minimum trust tier, per-path overrides, and a live decision summary.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Inspector", path: "/inspector" },
      { name: "Settings", path: "/inspector/settings" },
      {
        name: "Attribution policy",
        path: "/inspector/settings/attribution-policy",
      },
    ],
  },
  "/inspector/settings/retention": {
    title: "Inspector, Settings · Retention | Neotoma",
    description:
      "Configure per-store retention windows for observations, source files, timeline events, and conversation messages from the Inspector retention panel.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Inspector", path: "/inspector" },
      { name: "Settings", path: "/inspector/settings" },
      { name: "Retention", path: "/inspector/settings/retention" },
    ],
  },
  "/inspector/feedback": {
    title: "Inspector, Feedback | Neotoma",
    description:
      "Neotoma Inspector feedback route (/feedback): submission mode, PII redaction, status feed, and fix-verification round-trips, top-level in the app, not under Settings.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Inspector", path: "/inspector" },
      { name: "Feedback", path: "/inspector/feedback" },
    ],
  },
  "/inspector/settings/feedback": {
    title: "Inspector, Feedback | Neotoma",
    description:
      "Neotoma Inspector feedback route (/feedback): submission mode, PII redaction, status feed, and fix-verification round-trips, top-level in the app, not under Settings.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
  },
  "/aauth/spec": {
    title: "AAuth wire format and verification | Neotoma",
    description:
      "Canonical reference for the AAuth wire format, RFC 9421 signature components, JWT confirmation key contract, and Neotoma's trust-tier derivation cascade.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "AAuth", path: "/aauth" },
      { name: "Spec", path: "/aauth/spec" },
    ],
  },
  "/aauth/attestation": {
    title: "AAuth attestation | Neotoma",
    description:
      "Hardware attestation envelopes for AAuth: Apple Secure Enclave, WebAuthn-packed, and TPM 2.0 verifiers, the cnf.attestation claim, and revocation policy.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "AAuth", path: "/aauth" },
      { name: "Attestation", path: "/aauth/attestation" },
    ],
  },
  "/aauth/cli-keys": {
    title: "AAuth CLI keys and hardware backends | Neotoma",
    description:
      "How the Neotoma CLI generates AAuth keypairs and mints aa-agent+jwt tokens across software, Apple Secure Enclave, TPM 2.0, Windows TBS, and YubiKey 5 backends.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "AAuth", path: "/aauth" },
      { name: "CLI keys", path: "/aauth/cli-keys" },
    ],
  },
  "/aauth/integration": {
    title: "AAuth integration guide | Neotoma",
    description:
      "End-to-end wiring guide for new agents: wire format, fallback precedence, generic-name normalisation, /session preflight, policy knobs, diagnostics, and transport parity.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "AAuth", path: "/aauth" },
      { name: "Integration", path: "/aauth/integration" },
    ],
  },
  "/aauth/capabilities": {
    title: "Agent capability scoping | Neotoma",
    description:
      "Per-agent (op, entity_type) allow-lists modelled as agent_grant entities, the protected-entity-types guard, status lifecycle, and operator runbook for grant management.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "AAuth", path: "/aauth" },
      { name: "Capabilities", path: "/aauth/capabilities" },
    ],
  },
  "/architecture": {
    title: "Architecture | Neotoma",
    description:
      "Neotoma system architecture: state flow, three foundations, entity resolution pipeline, and deterministic guarantees.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Architecture", path: "/architecture" },
    ],
  },
  "/operating": {
    title: "Context janitor | Neotoma",
    description:
      "Every session starts from zero. You re-explain context, re-prompt corrections, re-establish what your agent already knew. Neotoma removes the re-prompting tax with persistent, cross-tool state.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Context janitor", path: "/operating" },
    ],
  },
  "/building-pipelines": {
    title: "Inference variance | Neotoma",
    description:
      "Your agent guesses entities every session. Corrections don\u2019t persist. Memory regressions ship because the architecture can\u2019t prevent them. Neotoma gives pipelines deterministic state.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Inference variance", path: "/building-pipelines" },
    ],
  },
  "/debugging-infrastructure": {
    title: "Log archaeology | Neotoma",
    description:
      "Two runs. Same inputs. Different state. No replay, no diff, no explanation. Neotoma replaces log archaeology with replayable timelines, state diffs, and full provenance.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Log archaeology", path: "/debugging-infrastructure" },
    ],
  },
  "/ai-native-operators": {
    title: "AI-native operators | Neotoma",
    description:
      "Legacy path; redirects to context janitor. Persistent cross-session state for operators running agents in production.",
    robots: "noindex,nofollow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Context janitor", path: "/operating" },
    ],
  },
  "/agentic-systems-builders": {
    title: "Agentic systems builders | Neotoma",
    description:
      "Legacy path; redirects to inference variance. Deterministic state and entity resolution for teams shipping agent features.",
    robots: "noindex,nofollow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Inference variance", path: "/building-pipelines" },
    ],
  },
  "/ai-infrastructure-engineers": {
    title: "AI infrastructure engineers | Neotoma",
    description:
      "Legacy path; redirects to log archaeology. Replayable timelines and provenance for infra teams debugging agent state.",
    robots: "noindex,nofollow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Log archaeology", path: "/debugging-infrastructure" },
    ],
  },
  "/neotoma-with-cursor": {
    title: "Neotoma with Cursor | Integration Guide",
    description:
      "Use Neotoma as persistent structured memory alongside Cursor context for cross-session AI development.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    ogImageUrl: "https://neotoma.io/og/neotoma-og-cursor-1200x630.png",
    ogImageAlt:
      "Neotoma + Cursor: persistent structured memory for cross-session AI development. Install in 5 minutes via MCP.",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Cursor", path: "/neotoma-with-cursor" },
    ],
  },
  "/neotoma-with-claude": {
    title: "Neotoma with Claude | Integration Guide",
    description:
      "Pair Neotoma's deterministic structured state with Claude's platform apps for reliable cross-session context via MCP.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Claude", path: "/neotoma-with-claude" },
    ],
  },
  "/neotoma-with-claude-connect-desktop": {
    title: "Claude Desktop local setup | Neotoma",
    description:
      "Step-by-step local setup for connecting Neotoma to Claude Desktop over stdio transport.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Claude", path: "/neotoma-with-claude" },
      { name: "Claude Desktop local setup", path: "/neotoma-with-claude-connect-desktop" },
    ],
    howToName: "How to connect Neotoma to Claude Desktop",
    howToSteps: [
      {
        name: "Install Neotoma",
        text: "Run 'npm install -g neotoma' to install the CLI globally.",
      },
      {
        name: "Start the API server",
        text: "Run 'neotoma api start' to launch the local Neotoma server.",
      },
      {
        name: "Configure Claude Desktop",
        text: "Add the Neotoma MCP server entry to your Claude Desktop configuration file (claude_desktop_config.json) with stdio transport.",
      },
      {
        name: "Restart Claude Desktop",
        text: "Restart Claude Desktop to load the new MCP server configuration.",
      },
    ],
  },
  "/neotoma-with-claude-connect-remote-mcp": {
    title: "claude.ai remote MCP setup | Neotoma",
    description:
      "Step-by-step remote setup: tunnel Neotoma API and connect claude.ai to your MCP endpoint.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Claude", path: "/neotoma-with-claude" },
      { name: "claude.ai remote MCP setup", path: "/neotoma-with-claude-connect-remote-mcp" },
    ],
    howToName: "How to connect claude.ai to Neotoma via remote MCP",
    howToSteps: [
      {
        name: "Start the Neotoma API",
        text: "Run 'neotoma api start' to launch the local server.",
      },
      {
        name: "Create a tunnel",
        text: "Use a tunneling tool to expose your local Neotoma API over HTTPS.",
      },
      {
        name: "Add MCP server in claude.ai",
        text: "Go to claude.ai settings, add a new MCP server, and paste your tunnel URL.",
      },
      {
        name: "Verify connection",
        text: "Start a new chat and confirm Neotoma tools appear in the available tools list.",
      },
    ],
  },
  "/neotoma-with-claude-code": {
    title: "Neotoma with Claude Code | Integration Guide",
    description:
      "Persistent structured memory for Claude Code's local CLI agent. Cross-session state via MCP or CLI fallback.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Claude Code", path: "/neotoma-with-claude-code" },
    ],
  },
  "/neotoma-with-claude-agent-sdk": {
    title: "Memory infrastructure for Claude agents | Agent SDK and Managed Agents",
    description:
      "Schema-bound, append-only memory for agents built on the Claude Agent SDK and Managed Agents. Complements the Memory Tool via MCP.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Claude Agent SDK", path: "/neotoma-with-claude-agent-sdk" },
    ],
  },
  "/neotoma-with-chatgpt": {
    title: "Neotoma with ChatGPT | Integration Guide",
    description:
      "Structured deterministic memory for ChatGPT conversations. Cross-tool continuity via MCP and CLI.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "ChatGPT", path: "/neotoma-with-chatgpt" },
    ],
  },
  "/neotoma-with-chatgpt-connect-remote-mcp": {
    title: "Connect ChatGPT via remote MCP | Neotoma",
    description:
      "Step-by-step: tunnel, developer mode, add Neotoma MCP server URL for ChatGPT Business or Enterprise.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "ChatGPT", path: "/neotoma-with-chatgpt" },
      { name: "Connect via remote MCP", path: "/neotoma-with-chatgpt-connect-remote-mcp" },
    ],
  },
  "/neotoma-with-chatgpt-connect-custom-gpt": {
    title: "Connect via custom GPT with OpenAPI | Neotoma",
    description:
      "Full setup: tunnel, Actions auth, instructions, OpenAPI paste for Neotoma in a custom GPT.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "ChatGPT", path: "/neotoma-with-chatgpt" },
      { name: "Connect via custom GPT", path: "/neotoma-with-chatgpt-connect-custom-gpt" },
    ],
  },
  "/neotoma-with-codex": {
    title: "Neotoma with Codex | Integration Guide",
    description:
      "Cross-task memory and CLI fallback for OpenAI Codex agents using Neotoma as their state layer.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Codex", path: "/neotoma-with-codex" },
    ],
  },
  "/neotoma-with-codex-connect-local-stdio": {
    title: "Codex local setup (stdio) | Neotoma",
    description: "Configure Neotoma locally in Codex using stdio transport and .codex/config.toml.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Codex", path: "/neotoma-with-codex" },
      { name: "Local setup", path: "/neotoma-with-codex-connect-local-stdio" },
    ],
    howToName: "How to connect Codex to Neotoma locally via stdio",
    howToSteps: [
      {
        name: "Install Neotoma",
        text: "Run 'npm install -g neotoma' to install the CLI globally.",
      },
      {
        name: "Configure Codex",
        text: "Add the Neotoma MCP server to your .codex/config.toml file with stdio transport settings.",
      },
      {
        name: "Verify",
        text: "Start a new Codex session and confirm Neotoma tools are available.",
      },
    ],
  },
  "/neotoma-with-codex-connect-remote-http-oauth": {
    title: "Codex remote setup (HTTP with OAuth) | Neotoma",
    description:
      "Configure Codex to connect to a remote Neotoma MCP endpoint over HTTP with OAuth.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Codex", path: "/neotoma-with-codex" },
      { name: "Remote setup", path: "/neotoma-with-codex-connect-remote-http-oauth" },
    ],
  },
  "/neotoma-with-openclaw": {
    title: "Neotoma with OpenClaw | Integration Guide",
    description:
      "User-owned structured memory for OpenClaw agents. Neotoma provides the persistent state layer beneath OpenClaw execution.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "OpenClaw", path: "/neotoma-with-openclaw" },
    ],
  },
  "/neotoma-with-openclaw-connect-local-stdio": {
    title: "OpenClaw local setup (stdio) | Neotoma",
    description:
      "Install Neotoma locally and connect OpenClaw using stdio transport on the same machine.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "OpenClaw", path: "/neotoma-with-openclaw" },
      { name: "Local setup", path: "/neotoma-with-openclaw-connect-local-stdio" },
    ],
  },
  "/neotoma-with-openclaw-connect-remote-http": {
    title: "OpenClaw remote setup (HTTP) | Neotoma",
    description:
      "Set up OpenClaw with remote Neotoma access using a tunneled HTTPS endpoint and MCP OAuth.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "OpenClaw", path: "/neotoma-with-openclaw" },
      { name: "Remote setup", path: "/neotoma-with-openclaw-connect-remote-http" },
    ],
  },
  "/deterministic-state-evolution": {
    title: "Deterministic State Evolution | Neotoma",
    description:
      "How Neotoma guarantees the same observations always produce the same entity state, eliminating ordering bugs.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Deterministic State", path: "/deterministic-state-evolution" },
    ],
  },
  "/versioned-history": {
    title: "Versioned History | Neotoma",
    description:
      "Every entity change creates a new version. Earlier states are preserved and accessible at any point in time.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Versioned History", path: "/versioned-history" },
    ],
  },
  "/replayable-timeline": {
    title: "Replayable Timeline | Neotoma",
    description:
      "Replay the full sequence of observations and state changes to reconstruct any historical entity state.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Replayable Timeline", path: "/replayable-timeline" },
    ],
  },
  "/auditable-change-log": {
    title: "Auditable Change Log | Neotoma",
    description:
      "Every modification records who made it, when, and from what source for a complete audit trail.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Auditable Change Log", path: "/auditable-change-log" },
    ],
  },
  "/schema-constraints": {
    title: "Schema Constraints | Neotoma",
    description:
      "Entities conform to defined types and validation rules, preventing garbage-in-garbage-out failures across agents.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Schema Constraints", path: "/schema-constraints" },
    ],
  },
  "/silent-mutation-risk": {
    title: "Silent Mutation Risk | Neotoma",
    description:
      "How Neotoma prevents data changes without explicit user awareness: no overwrites, merges, or drops without a trace.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Silent Mutation Risk", path: "/silent-mutation-risk" },
    ],
  },
  "/conflicting-facts-risk": {
    title: "Conflicting Facts Risk | Neotoma",
    description:
      "How Neotoma detects and resolves contradictory statements in memory using deterministic merge rules.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Conflicting Facts Risk", path: "/conflicting-facts-risk" },
    ],
  },
  "/false-closure-risk": {
    title: "False Closure Risk | Neotoma",
    description:
      "How Neotoma prevents agents from confidently answering with stale or superseded context by preserving versioned history and provenance for every state change.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "False Closure Risk", path: "/false-closure-risk" },
    ],
  },
  "/reproducible-state-reconstruction": {
    title: "Reproducible State Reconstruction | Neotoma",
    description:
      "Rebuild complete current state from raw inputs alone, like a ledger that balances to zero from its entries.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Reproducible State", path: "/reproducible-state-reconstruction" },
    ],
  },
  "/human-inspectability": {
    title: "Human Inspectability | Neotoma",
    description:
      "Examine exactly what changed between any two entity versions and trace where each fact originated.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Human Inspectability", path: "/human-inspectability" },
    ],
  },
  "/zero-setup-onboarding": {
    title: "Zero-Setup Onboarding | Neotoma",
    description:
      "How zero-setup memory works in platform products and what you trade for the convenience of no installation.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Zero-Setup Onboarding", path: "/zero-setup-onboarding" },
    ],
  },
  "/semantic-similarity-search": {
    title: "Semantic Similarity Search | Neotoma",
    description:
      "Find relevant prior context by meaning, not exact match, applied to structured entity snapshots with type and relationship scoping.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Semantic Similarity Search", path: "/semantic-similarity-search" },
    ],
  },
  "/direct-human-editability": {
    title: "Direct Human Editability | Neotoma",
    description:
      "How file-based memory enables direct editing in any text editor and the trade-offs versus structured, schema-validated systems.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Guarantees", path: "/#memory-guarantees" },
      { name: "Direct Human Editability", path: "/direct-human-editability" },
    ],
  },
  "/platform-memory": {
    title: "Platform Memory | Neotoma",
    description:
      "How platform memory (Claude, ChatGPT, Gemini) works and what guarantees it does and does not provide.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Models", path: "/#memory-guarantees" },
      { name: "Platform Memory", path: "/platform-memory" },
    ],
  },
  "/retrieval-memory": {
    title: "Retrieval Memory | Neotoma",
    description:
      "How retrieval memory (Mem0, Zep, LangChain) works and where it falls short on deterministic guarantees.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Models", path: "/#memory-guarantees" },
      { name: "Retrieval Memory", path: "/retrieval-memory" },
    ],
  },
  "/file-based-memory": {
    title: "File-Based Memory | Neotoma",
    description:
      "How file-based memory (Markdown, JSON, CRDT docs) works and what guarantees it provides and lacks.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Models", path: "/#memory-guarantees" },
      { name: "File-Based Memory", path: "/file-based-memory" },
    ],
  },
  "/database-memory": {
    title: "Database Memory | Neotoma",
    description:
      "How database memory (SQLite, Postgres, MySQL) works for AI agents: strong consistency and column types, but standard CRUD lacks versioning, audit trails, and conflict detection.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Models", path: "/#memory-guarantees" },
      { name: "Database Memory", path: "/database-memory" },
    ],
  },
  "/deterministic-memory": {
    title: "Deterministic Memory | Neotoma",
    description:
      "How Neotoma's deterministic memory model enforces versioned, schema-bound, replayable, and auditable state.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Models", path: "/#memory-guarantees" },
      { name: "Deterministic Memory", path: "/deterministic-memory" },
    ],
  },
  "/crm": {
    title: "Neotoma for CRM | State Layer for Next-Generation CRM Platforms",
    description:
      "Build next-generation AI-native CRM on a deterministic state layer. Neotoma provides versioned, schema-bound, auditable state for contacts, deals, and relationships, so every AI feature is grounded in truth.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "CRM", path: "/crm" },
    ],
  },
  "/compliance": {
    title: "Neotoma for Compliance | State Integrity for AI-Driven Vendor Risk",
    description:
      "Version control for vendor risk profiles. Neotoma ensures every AI-driven risk assessment is versioned, every conflict between agents is surfaced, and every decision is explainable to regulators, with team deployment, enterprise auth, and API compatibility guarantees.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Compliance", path: "/compliance" },
    ],
  },
  "/contracts": {
    title: "Neotoma for Contracts | State Integrity for Contract Lifecycle Management",
    description:
      "Version control for every clause, amendment, and obligation. Neotoma ensures contract state is versioned, conflicts between review agents are surfaced, and every approval traces to specific evidence.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Contracts", path: "/contracts" },
    ],
  },
  "/diligence": {
    title: "Neotoma for Due Diligence | State Integrity for M&A and Investment Diligence",
    description:
      "Know exactly what was known when the decision was made. Neotoma provides versioned findings, conflict detection between diligence agents, and temporal state queries for investment committees and regulators.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Due Diligence", path: "/diligence" },
    ],
  },
  "/portfolio": {
    title: "Neotoma for Portfolio Monitoring | State Integrity for VC/PE Portfolio Intelligence",
    description:
      "Versioned state for every portfolio company, valuation, and LP commitment. Neotoma provides temporal snapshots for fund audits, LP reporting, and follow-on investment decisions.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Portfolio", path: "/portfolio" },
    ],
  },
  "/cases": {
    title: "Neotoma for Case Management | State Integrity for Legal and Investigation Cases",
    description:
      "Reconstruct what was known at any point in a case timeline. Neotoma provides versioned evidence, temporal state queries for litigation, and auditable provenance for every filing and assessment.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Case Management", path: "/cases" },
    ],
  },
  "/financial-ops": {
    title: "Neotoma for Financial Ops | State Integrity for Reconciliation and Audit",
    description:
      "Deterministic state for every ledger entry, reconciliation, and month-end close. Neotoma provides point-in-time snapshots for SOX compliance, audit verification, and transaction provenance.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Financial Ops", path: "/financial-ops" },
    ],
  },
  "/procurement": {
    title: "Neotoma for Procurement | State Integrity for Sourcing and Supplier Management",
    description:
      "Full audit trail for bids, approvals, and supplier decisions. Neotoma provides versioned supplier profiles, bid comparison history, and approval chain provenance for enterprise procurement.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Procurement", path: "/procurement" },
    ],
  },
  "/healthcare": {
    title: "Neotoma for Healthcare | Versioned Clinical State and Decision Provenance",
    description:
      "Reconstruct what was known about a patient at any point in their care timeline. Neotoma provides versioned clinical decisions, authorization lifecycles, and care plan lineage for healthcare operations.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Healthcare", path: "/healthcare" },
    ],
  },
  "/government": {
    title: "Neotoma for Public Sector | Versioned Policy State and Determination Provenance",
    description:
      "Reconstruct which policy version and evidence governed a government decision on any date. Neotoma provides versioned eligibility determinations, inter-agency data provenance, and rule-bound decision state.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Government", path: "/government" },
    ],
  },
  "/customer-ops": {
    title: "Neotoma for Customer Ops | Versioned Support State and Routing Provenance",
    description:
      "Reconstruct why a ticket was routed, escalated, or resolved the way it was. Neotoma provides versioned routing decisions, escalation chains, and interaction-level provenance for customer operations.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Customer Ops", path: "/customer-ops" },
    ],
  },
  "/logistics": {
    title: "Neotoma for Logistics | Versioned Routing State and Constraint Provenance",
    description:
      "Reconstruct what the system knew when a routing or fulfillment decision was made. Neotoma provides versioned routing decisions, inventory position timelines, and carrier constraint snapshots for supply chain operations.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Logistics", path: "/logistics" },
    ],
  },
  "/personal-data": {
    title: "Neotoma for Personal Data | Versioned Memory for Health, Finance, and Life Data",
    description:
      "Give your personal AI agents versioned, queryable memory across health, finance, habits, and goals. Neotoma provides entity resolution, temporal queries, and cross-domain correlations for your personal data, with the same state integrity guarantees used in enterprise systems.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Personal Data", path: "/personal-data" },
    ],
  },
  "/agent-auth": {
    title: "Neotoma for Agent Authorization | Versioned Policy State and Delegation Provenance",
    description:
      "Reconstruct who authorized what, when, and under which policy state. Neotoma provides versioned authorization decisions, consent timelines, and delegation chain provenance for production agent systems.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Agent Authorization", path: "/agent-auth" },
    ],
  },
  "/trading": {
    title: "Neotoma for Autonomous Trading | Reconstructable Decision State for Trading Agents",
    description:
      "Version control for every analyst assessment, debate resolution, and trade decision. Neotoma provides strategy version history, risk state time travel, and analyst attribution for multi-agent trading systems.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Autonomous Trading", path: "/trading" },
    ],
  },
  "/use-cases": {
    title: "Use Cases | State Integrity for AI-Driven Workflows | Neotoma",
    description:
      "Neotoma fits any workflow where 'what did the agent know then?' matters. Explore use cases: compliance, CRM, contracts, due diligence, portfolio monitoring, case management, financial ops, procurement, agent authorization, healthcare, government, customer ops, logistics, trading, and AI-assisted crypto engineering.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Use Cases", path: "/use-cases" },
    ],
  },
  "/verticals": {
    title: "Use Cases (redirect) | Neotoma",
    description:
      "Legacy path /verticals redirects to /use-cases. Bookmarks and inbound links continue to resolve while the canonical use-case hub lives at /use-cases.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Use Cases", path: "/use-cases" },
    ],
  },
  "/crypto-engineering": {
    title:
      "Neotoma for Crypto & Security-Sensitive Engineering | Agent-Session Replay and Review-Cost Reduction",
    description:
      "Capture every coding-agent session, surface what the agent verified and what it skipped, attribute commits to models and context, and triage AI-generated bounty reports by provenance. Neotoma is the integrity layer for AI-assisted crypto and security-sensitive engineering pipelines with a real human-review ceiling.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Crypto Engineering", path: "/crypto-engineering" },
    ],
  },
  "/build-vs-buy": {
    title: "Build vs Buy | When to Add a State Integrity Layer | Neotoma",
    description:
      "For builders running agents across sessions and tools: logging is solved. This page separates observability from state integrity-deterministic reconstruction, multi-writer merges, and version-bound provenance-with examples by entity type (contacts, tasks, transactions, and more).",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Build vs Buy", path: "/build-vs-buy" },
    ],
    faqItems: [
      {
        question: "When do I need a state integrity layer instead of observability?",
        answer:
          "When multiple writers update the same entities, you need the composed state at a point in time, rules change while entities have active state, actions flow through delegation hops, or explanation requires full input context.",
      },
      {
        question: "What is the difference between observability and state integrity?",
        answer:
          "Observability shows what happened: events, logs, traces. State integrity proves what was true: the deterministic composed entity state at any moment, with multi-writer conflict resolution and version-bound provenance.",
      },
      {
        question: "Is observability enough for my agent system?",
        answer:
          "If 0-1 of these conditions apply: multiple entity writers, temporal state queries, changing rules, delegation chains, full-context explanations. At 4-5 conditions, you need a state integrity layer.",
      },
    ],
  },
  "/multi-agent-state": {
    title: "Multi-Agent Shared State | Write Integrity for Multi-Agent Systems | Neotoma",
    description:
      "When multiple agents write to shared state, one bad observation propagates at machine speed. Learn how write integrity prevents cascade failures across multi-agent topologies: contradiction amplification, silent overwrites, and trust boundary collapse.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Compare", path: "/build-vs-buy" },
      { name: "Multi-Agent State", path: "/multi-agent-state" },
    ],
    faqItems: [
      {
        question: "Why is multi-agent shared state different from single-agent memory?",
        answer:
          "Single-agent write corruption degrades quality gradually. Multi-agent shared state creates cascade failures: one bad write propagates at machine speed, triggering downstream actions before any human can intervene.",
      },
      {
        question: "What are the main failure modes of multi-agent shared state?",
        answer:
          "Contradiction amplification (conflicting facts with no adjudication), silent overwrite cascades (stale reads reverting other agents' changes), and trust boundary collapse (different agents with different capabilities having equal write authority).",
      },
      {
        question: "Does Neotoma replace my existing database for multi-agent systems?",
        answer:
          "No. Your existing database remains the system of record for business data. Neotoma sits between your agents and your database as a write-integrity layer for agent-generated observational state: observations, inferences, entity resolutions, and decisions.",
      },
    ],
  },
  "/troubleshooting": {
    title: "Troubleshooting and FAQ | Neotoma",
    description:
      "Common issues and fixes for Neotoma: agent storage failures, empty query results, conflicting state, CLI-API differences, and safe state resets.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Troubleshooting", path: "/troubleshooting" },
    ],
    faqItems: [
      {
        question: "Agent is not storing memory entries",
        answer:
          "Confirm the MCP server is configured and running, then verify tool calls include store actions. Recheck client config (.cursor/mcp.json.mcp.json, or .codex/config.toml) and restart the client.",
      },
      {
        question: "Entity query returns empty results",
        answer:
          "Verify the entity type and filters used by your query. Run 'neotoma entities list --type <entity_type>' without search first, then narrow filters.",
      },
      {
        question: "Unexpected or conflicting state values",
        answer:
          "Inspect observations and provenance for that entity and field. Use correction flows (correct, reinterpret) and confirm deterministic merge rules in schema/reducer logic.",
      },
      {
        question: "CLI command behavior differs from API",
        answer:
          "Check transport mode (--offline, --api-only, base URL) and environment selection. Pin the mode explicitly for reproducible debugging, then compare with API endpoint responses.",
      },
      {
        question: "Need to reset local state safely",
        answer:
          "Export data first for auditability. Back up the data directory, then reinitialize. Avoid deleting data until exports are verified.",
      },
    ],
  },
  "/evaluate": {
    title: "Ask Your Agent to Evaluate Neotoma for You | Neotoma",
    description:
      "Ask your AI agent to read this page and assess whether Neotoma fits your workflow. Structured for both human and agent evaluation of deterministic agent memory.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    ogImageUrl: "https://neotoma.io/og/neotoma-og-evaluate-1200x630.png",
    ogImageAlt:
      "Let your agent decide if Neotoma fits. Copy the evaluation prompt into Claude, Cursor, or ChatGPT and let your agent assess the fit.",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Evaluate", path: "/evaluate" },
    ],
  },
  "/evaluate/agent-instructions": {
    title: "Agent Evaluation Instructions | Neotoma",
    description:
      "Step-by-step evaluation workflow for AI agents: context sweep, install trial, fit assessment, resource map, and qualification scorecard.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Evaluate", path: "/evaluate" },
      { name: "Agent Instructions", path: "/evaluate/agent-instructions" },
    ],
  },
  "/meet": {
    title: "Meet with the Creator | Neotoma",
    description:
      "Book time with Mark Hendrickson via Notion Calendar to discuss Neotoma, implementation, or product feedback.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Meet", path: "/meet" },
    ],
  },
  "/privacy": {
    title: "Privacy Notice | Neotoma",
    description:
      "What data neotoma.io collects on the marketing site, the public sandbox, and the agent feedback pipeline. Pre-incorporation notice published by Mark Hendrickson as an individual publisher.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Privacy", path: "/privacy" },
    ],
  },
  "/terms": {
    title: "Terms of Use | Neotoma",
    description:
      "Terms of use for neotoma.io, agent.neotoma.io, and the public sandbox. The Neotoma software remains MIT-licensed; these terms govern the hosted services.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Terms", path: "/terms" },
    ],
  },
  "/faq": {
    title: "Frequently Asked Questions | Neotoma",
    description:
      "Answers to common questions about Neotoma: what it is, how it compares to SQLite/Mem0/Zep/RAG, how it works alongside Claude Code memory, what your agent should remember, and how to install it.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "FAQ", path: "/faq" },
    ],
    faqItems: FAQ_ITEMS.map((item) => ({ question: item.question, answer: item.answer })),
  },
  "/neotoma-vs-platform-memory": {
    title: "Neotoma vs Platform Memory | Claude, ChatGPT, Gemini vs Deterministic State",
    description:
      "How does Neotoma compare to platform memory? Built-in AI product memory is convenient but opaque and vendor-bound. Neotoma provides deterministic state, versioned history, and auditable provenance across tools.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    ogImageUrl: "https://neotoma.io/og/neotoma-og-vs-platform-1200x630.png",
    ogImageAlt:
      "Neotoma vs platform memory: side-by-side comparison of Claude Memory, ChatGPT Memory, and Neotoma across versioning, auditability, and portability.",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Models", path: "/memory-models" },
      { name: "Neotoma vs Platform Memory", path: "/neotoma-vs-platform-memory" },
    ],
    faqItems: [
      {
        question: "How does Neotoma compare to platform memory?",
        answer:
          "Platform memory is built into products like Claude and ChatGPT and prioritizes convenience inside one vendor surface. Neotoma stores append-only structured observations with deterministic reducers, versioned history, and provenance across tools.",
      },
      {
        question: "Can I use platform memory and Neotoma together?",
        answer:
          "Yes. Platform memory can hold lightweight in-product context, while Neotoma stores durable structured state that must persist across tools, sessions, and audits.",
      },
    ],
    speakable: ["h1", "h2", "main p", "main summary", "main table"],
  },
  "/neotoma-vs-mem0": {
    title: "Neotoma vs Mem0 | Memory System Comparison",
    description:
      "How does Neotoma compare to Mem0? Mem0 uses retrieval memory with vector search. Neotoma provides deterministic state with versioned history, schema constraints, and auditable provenance.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Models", path: "/memory-models" },
      { name: "Neotoma vs Mem0", path: "/neotoma-vs-mem0" },
    ],
    faqItems: [
      {
        question: "How does Neotoma compare to Mem0?",
        answer:
          "Mem0 stores text chunks and retrieves them by semantic similarity for prompt augmentation. Neotoma stores structured observations and composes entity state via deterministic reducers for state integrity.",
      },
      {
        question: "Can I use Mem0 and Neotoma together?",
        answer:
          "Yes. Mem0 handles semantic retrieval for prompt augmentation while Neotoma handles structured state integrity. They address different layers of the memory problem.",
      },
    ],
  },
  "/neotoma-vs-zep": {
    title: "Neotoma vs Zep | Memory System Comparison",
    description:
      "How does Neotoma compare to Zep? Zep combines vector search with knowledge graphs. Neotoma provides deterministic state with formal integrity guarantees, versioned history, and auditable provenance.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Models", path: "/memory-models" },
      { name: "Neotoma vs Zep", path: "/neotoma-vs-zep" },
    ],
    faqItems: [
      {
        question: "How does Neotoma compare to Zep?",
        answer:
          "Zep combines vector similarity search with auto-extracted knowledge graphs. Neotoma stores append-only observations and composes them into versioned entity snapshots via deterministic reducers.",
      },
      {
        question: "Does Zep provide deterministic state reconstruction?",
        answer:
          "No. Zep's knowledge graph is built via extraction and summarization, which are non-deterministic. The same inputs may produce different graph states across runs.",
      },
    ],
  },
  "/neotoma-vs-rag": {
    title: "Neotoma vs RAG Memory | Deterministic vs Retrieval Memory",
    description:
      "What's the difference between RAG memory and deterministic memory? RAG retrieves relevant text chunks by similarity. Neotoma provides deterministic entity state with versioned history and auditable provenance.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Models", path: "/memory-models" },
      { name: "Neotoma vs RAG", path: "/neotoma-vs-rag" },
    ],
    faqItems: [
      {
        question: "What's the difference between RAG memory and deterministic memory?",
        answer:
          "RAG stores text as vector embeddings and retrieves relevant chunks by similarity. Deterministic memory stores structured observations and composes entity state via reducers, guaranteeing the same inputs always produce the same state.",
      },
      {
        question: "Is Neotoma a RAG system?",
        answer:
          "No. Neotoma provides semantic search over structured entity snapshots, but it does not chunk documents or inject retrieved text into prompts. It provides deterministic state composition with formal guarantees.",
      },
    ],
  },
  "/neotoma-vs-files": {
    title: "Neotoma vs File-Based Memory | Markdown, JSON vs Deterministic State",
    description:
      "Manus, Claude Code, and OpenClaw all use markdown files for agent memory. Here is where that pattern breaks, and what Neotoma provides beyond it: schema enforcement, conflict detection, versioned history, and auditable provenance with deterministic state guarantees.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Models", path: "/memory-models" },
      { name: "Neotoma vs Files", path: "/neotoma-vs-files" },
    ],
    faqItems: [
      {
        question: "Why can't I just use markdown files for agent memory?",
        answer:
          "Markdown files conflate observations with snapshots. When two agents write conflicting values, both edits land silently. There is no schema validation, no conflict detection, and no way to reconstruct entity state at a past moment without building significant application logic on top.",
      },
      {
        question: "Can git replace versioned history?",
        answer:
          "Git versions file snapshots, not entity observations. It can tell you what a file looked like at a commit, but not which observation changed which field or how conflicting writes were resolved.",
      },
    ],
  },
  "/neotoma-vs-database": {
    title: "Neotoma vs Database Memory | SQLite, Postgres vs Deterministic State",
    description:
      "Why not just use SQLite or Postgres for agent memory? Standard CRUD overwrites state on every UPDATE. Neotoma adds observation logs, deterministic reducers, and provenance tracking on top of a database backend.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Models", path: "/memory-models" },
      { name: "Neotoma vs Database", path: "/neotoma-vs-database" },
    ],
    faqItems: [
      {
        question: "Why not just use SQLite or Postgres for agent memory?",
        answer:
          "A relational database provides strong consistency, but standard CRUD usage overwrites previous state on every UPDATE. Without an observation log, reducers, and provenance tracking, you get last-write-wins with no audit trail or conflict detection.",
      },
      {
        question: "Doesn't Neotoma use a database internally?",
        answer:
          "Yes. Neotoma uses SQLite locally and Postgres when configured. The guarantees come from the architectural pattern on top - immutable observation log, deterministic reducers, schema validation, and field-level provenance - not from the storage engine itself.",
      },
    ],
  },
  "/types/contacts": {
    title: "Contacts Guide | Store & Retrieve People, Companies, Roles | Neotoma",
    description:
      "How to store and retrieve contacts in Neotoma. CLI, MCP, and API examples for people, companies, accounts, and relationships - with versioned history and provenance.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Contacts guide", path: "/types/contacts" },
    ],
    keywords: ["contacts", "CRM", "people", "companies", "entity type", "store contacts"],
  },
  "/types/tasks": {
    title: "Tasks Guide | Store & Retrieve Obligations, Deadlines, Goals | Neotoma",
    description:
      "How to store and retrieve tasks in Neotoma. CLI, MCP, and API examples for tasks, habits, goals - versioned status changes, assignments, and deadlines.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Tasks guide", path: "/types/tasks" },
    ],
    keywords: ["tasks", "to-do", "goals", "habits", "entity type", "store tasks"],
  },
  "/types/transactions": {
    title: "Transactions Guide | Store & Retrieve Payments, Receipts, Invoices | Neotoma",
    description:
      "How to store and retrieve transactions in Neotoma. CLI, MCP, and API examples for payments, receipts, invoices - versioned corrections and reconciliation history.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Transactions guide", path: "/types/transactions" },
    ],
    keywords: ["transactions", "payments", "receipts", "invoices", "financial", "entity type"],
  },
  "/types/contracts": {
    title: "Contracts Guide | Store & Retrieve Agreements, Clauses, Amendments | Neotoma",
    description:
      "How to store and retrieve contracts in Neotoma. CLI, MCP, and API examples for agreements, clauses, amendments - reconstructable terms on any date.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Contracts guide", path: "/types/contracts" },
    ],
    keywords: ["contracts", "agreements", "clauses", "amendments", "entity type"],
  },
  "/types/decisions": {
    title: "Decisions Guide | Store & Retrieve Choices, Rationale, Audit Trails | Neotoma",
    description:
      "How to store and retrieve decisions in Neotoma. CLI, MCP, and API examples for decisions, assessments, reviews - with linked rationale and provenance.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Decisions guide", path: "/types/decisions" },
    ],
    keywords: ["decisions", "rationale", "audit trail", "assessments", "entity type"],
  },
  "/types/events": {
    title: "Events Guide | Store & Retrieve Meetings, Milestones, Outcomes | Neotoma",
    description:
      "How to store and retrieve events in Neotoma. CLI, MCP, and API examples for meetings, milestones, and outcomes - with participants, follow-ups, and versioned notes.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Events guide", path: "/types/events" },
    ],
    keywords: ["events", "meetings", "milestones", "calendar", "entity type"],
  },
  "/primitives": {
    title: "Primitive Record Types | Sources, Interpretations, Observations, Relationships, Timeline Events | Neotoma",
    description:
      "Neotoma's five primitive record types: sources, interpretations, observations, relationships, and timeline events. The system-level building blocks behind every entity, snapshot, and audit trail.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Primitive record types", path: "/primitives" },
    ],
    keywords: [
      "primitive record types",
      "sources",
      "interpretations",
      "observations",
      "relationships",
      "timeline events",
      "three-layer truth model",
      "deterministic state",
    ],
  },
  "/primitives/sources": {
    title: "Sources | Primitive Record Type | Neotoma",
    description:
      "Sources are content-addressed raw storage for every byte that ever entered Neotoma. SHA-256 deduplicated per user, immutable, and the foundation of every observation, interpretation, and timeline event.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Primitive record types", path: "/primitives" },
      { name: "Sources", path: "/primitives/sources" },
    ],
    keywords: [
      "sources",
      "content addressing",
      "deduplication",
      "raw storage",
      "primitive record type",
      "provenance",
    ],
  },
  "/primitives/interpretations": {
    title: "Interpretations | Primitive Record Type | Neotoma",
    description:
      "Interpretations are versioned, audited extraction attempts that turn a source into structured observations. interpretation_config records the model, prompt, and schema version active at run start.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Primitive record types", path: "/primitives" },
      { name: "Interpretations", path: "/primitives/interpretations" },
    ],
    keywords: [
      "interpretations",
      "extraction",
      "reinterpret",
      "interpretation_config",
      "primitive record type",
      "audit log",
    ],
  },
  "/primitives/observations": {
    title: "Observations | Primitive Record Type | Neotoma",
    description:
      "Observations are granular, immutable facts that the reducer composes into entity snapshots. Every snapshot field traces back to the observation, source, and interpretation that produced it.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Primitive record types", path: "/primitives" },
      { name: "Observations", path: "/primitives/observations" },
    ],
    keywords: [
      "observations",
      "three-layer truth model",
      "immutable",
      "source priority",
      "primitive record type",
      "reducer",
    ],
  },
  "/primitives/relationships": {
    title: "Relationships | Primitive Record Type | Neotoma",
    description:
      "Relationships are first-class typed graph edges that follow the same observation-snapshot pattern as entities. Open ontology, deterministic merging, and full per-field provenance.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Primitive record types", path: "/primitives" },
      { name: "Relationships", path: "/primitives/relationships" },
    ],
    keywords: [
      "relationships",
      "graph edges",
      "PART_OF",
      "REFERS_TO",
      "EMBEDS",
      "primitive record type",
      "open ontology",
    ],
  },
  "/primitives/timeline-events": {
    title: "Timeline Events | Primitive Record Type | Neotoma",
    description:
      "Timeline events are immutable, source-anchored temporal records derived deterministically from extracted source date fields. Distinct from system observability events and from the application-level event entity type.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Primitive record types", path: "/primitives" },
      { name: "Timeline events", path: "/primitives/timeline-events" },
    ],
    keywords: [
      "timeline events",
      "deterministic timeline",
      "source-anchored",
      "primitive record type",
      "temporal records",
    ],
  },
  "/primitives/entities": {
    title: "Entities | Primitive Record Type | Neotoma",
    description:
      "Entities are the canonical, durable rows that observations, relationships, and timeline events point at. Deterministic hash-based IDs, per-user identity isolation, and merge tracking via merged_to_entity_id.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Primitive record types", path: "/primitives" },
      { name: "Entities", path: "/primitives/entities" },
    ],
    keywords: [
      "entities",
      "canonical record",
      "deterministic id",
      "entity merge",
      "primitive record type",
    ],
  },
  "/primitives/entity-snapshots": {
    title: "Entity Snapshots | Primitive Record Type | Neotoma",
    description:
      "Entity snapshots are the deterministic reducer output for each entity, with per-field provenance back to observations and an optional embedding column for semantic search.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Primitive record types", path: "/primitives" },
      { name: "Entity snapshots", path: "/primitives/entity-snapshots" },
    ],
    keywords: [
      "entity snapshot",
      "reducer output",
      "provenance map",
      "embedding",
      "deterministic",
      "primitive record type",
    ],
  },
  "/schemas": {
    title: "Schemas | Neotoma",
    description:
      "Versioned, config-driven entity schemas in Neotoma, the schema registry, declarative merge policies, three-layer storage, and additive versioning that gives the immutable primitives their domain shape.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Schemas", path: "/schemas" },
    ],
    keywords: [
      "schema",
      "schema registry",
      "merge policies",
      "storage layers",
      "schema versioning",
      "reducer config",
    ],
  },
  "/schemas/registry": {
    title: "Schema Registry | Schemas | Neotoma",
    description:
      "The schema registry table holds every versioned entity schema in Neotoma, schema_definition, reducer_config, semantic versions, global vs user-specific scopes, and auto-enhancement from raw_fragments.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Schemas", path: "/schemas" },
      { name: "Schema registry", path: "/schemas/registry" },
    ],
    keywords: [
      "schema registry",
      "schema definition",
      "reducer config",
      "schema version",
      "user-specific schema",
      "auto-enhancement",
    ],
  },
  "/schemas/merge-policies": {
    title: "Merge Policies | Schemas | Neotoma",
    description:
      "Merge policies are per-field declarative rules that turn many observations into one deterministic snapshot, last_write, highest_priority, most_specific, and merge_array, with explicit tie-breakers.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Schemas", path: "/schemas" },
      { name: "Merge policies", path: "/schemas/merge-policies" },
    ],
    keywords: [
      "merge policies",
      "reducer",
      "last_write",
      "highest_priority",
      "most_specific",
      "merge_array",
      "deterministic merge",
    ],
  },
  "/schemas/storage-layers": {
    title: "Storage Layers | Schemas | Neotoma",
    description:
      "Three-layer storage in Neotoma: raw_text on the source, schema-compliant properties on the observation, and raw_fragments for unknown fields and converter inputs, never silently dropped.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Schemas", path: "/schemas" },
      { name: "Storage layers", path: "/schemas/storage-layers" },
    ],
    keywords: [
      "storage layers",
      "raw_text",
      "properties",
      "raw_fragments",
      "schema handling",
      "field preservation",
    ],
  },
  "/schemas/versioning": {
    title: "Schema Versioning & Evolution | Schemas | Neotoma",
    description:
      "Semantic versioning for schemas: additive minor bumps, breaking major bumps, immutable observation.schema_version, schema-projection filtering, and the public schema snapshots dump.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Schemas", path: "/schemas" },
      { name: "Versioning & evolution", path: "/schemas/versioning" },
    ],
    keywords: [
      "schema versioning",
      "semver",
      "breaking changes",
      "schema snapshots",
      "schema evolution",
      "updateSchemaIncremental",
    ],
  },
  "/data-model": {
    title: "Walkthrough | Neotoma",
    description:
      "See how contacts, tasks, and decisions persist across Cursor, Claude, and ChatGPT with versioned history and full provenance.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
  },
  "/developer-walkthrough": {
    title: "Walkthrough | Neotoma",
    description:
      "See how contacts, tasks, and decisions persist across Cursor, Claude, and ChatGPT with versioned history and full provenance.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
  },
  "/walkthrough": {
    title: "Walkthrough | Neotoma",
    description:
      "See how contacts, tasks, and decisions persist across Cursor, Claude, and ChatGPT with versioned history and full provenance.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Walkthrough", path: "/walkthrough" },
    ],
  },
  "/schema-management": {
    title: "Schema Management | Neotoma",
    description:
      "Practical schema workflows for Neotoma: list and inspect types, store with validation, evolve schemas incrementally, and handle migration.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Schema Management", path: "/schema-management" },
    ],
  },
  "/changelog": {
    title: "Changelog and Release Notes | Neotoma",
    description:
      "Release history, migration notes, and compatibility changes for Neotoma. Links to GitHub releases, npm versions, and in-repo release documentation.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Changelog", path: "/changelog" },
    ],
  },
  "/memory-models": {
    title: "Memory Models | Neotoma",
    description:
      "Compare AI agent memory models: platform memory, retrieval memory, file-based memory, and deterministic memory. Evaluate guarantees and failure modes across categories.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Models", path: "/memory-models" },
    ],
  },
  "/memory-guarantees": {
    title: "Memory Guarantees | Neotoma",
    description:
      "Memory properties that determine reliability under production load: deterministic state evolution, versioned history, replayable timeline, auditable change log, schema constraints, and more.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    ogImageUrl: "https://neotoma.io/og/neotoma-og-guarantees-1200x630.png",
    ogImageAlt:
      "Neotoma memory guarantees compared: versioned history, append-only audit log, schema-bound validation, cross-tool sync, and privacy-first local storage.",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Guarantees", path: "/memory-guarantees" },
    ],
  },
  "/foundations": {
    title: "Foundations | Neotoma",
    description:
      "Neotoma's architectural foundations: privacy-first local data with no cloud sync, and cross-platform memory across all AI tools via MCP.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Foundations", path: "/foundations" },
    ],
  },
  "/privacy-first": {
    title: "Privacy-First Memory | Neotoma",
    description:
      "Your data stays local. User-controlled storage, encryption at rest, full export and deletion. Never used for training.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Architecture", path: "/architecture" },
      { name: "Privacy-First", path: "/privacy-first" },
    ],
  },
  "/cross-platform": {
    title: "Cross-Platform Memory | Neotoma",
    description:
      "One memory system across Claude, ChatGPT, Cursor, Codex, and CLI. MCP-based access with no platform lock-in.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Architecture", path: "/architecture" },
      { name: "Cross-Platform", path: "/cross-platform" },
    ],
  },
  "/memory-vendors": {
    title: "Memory Vendor Comparison | Neotoma",
    description:
      "Compare memory model vendors across guarantee properties: platform, retrieval, file-based, and deterministic.",
    robots: "index,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Memory Vendors", path: "/memory-vendors" },
    ],
  },
  "/site-markdown": {
    title: "Site pages (Markdown) | Neotoma",
    description:
      "Browse every indexable site route as Markdown summaries (title, description, canonical URL, breadcrumbs). Full page copy remains on the HTML routes.",
    robots: "noindex,follow",
    jsonLdType: "WebPage",
    breadcrumb: [
      { name: "Home", path: "/" },
      { name: "Docs", path: "/docs" },
      { name: "Site pages (Markdown)", path: "/site-markdown" },
    ],
  },
  "/raw": {
    title: "Raw Markdown | Neotoma",
    description: "Plain Markdown export for a single indexable site route (SEO metadata fields).",
    robots: "noindex,nofollow",
    jsonLdType: "WebPage",
  },
  "/404": {
    title: "Page Not Found | Neotoma",
    description: "The requested page could not be found.",
    robots: "noindex,follow",
    ogType: "website",
    jsonLdType: "WebPage",
  },
};

/** All indexable paths derived from the route registry (excludes noindex routes). */
const INDEXABLE_DEFAULT_LOCALE_PATHS: readonly string[] = Object.entries(ROUTE_METADATA)
  .filter(([, meta]) => meta.robots === "index,follow")
  .map(([path]) => path);

/** Default-locale paths included in the sitemap; use for Markdown export and audits. */
export const INDEXABLE_SITE_PAGE_PATHS: readonly string[] = INDEXABLE_DEFAULT_LOCALE_PATHS;

/** Includes default locale paths and prefixed paths for non-default locales. */
export const SITEMAP_PATHS: readonly string[] = [
  ...INDEXABLE_DEFAULT_LOCALE_PATHS,
  ...NON_DEFAULT_LOCALES.flatMap((locale) =>
    INDEXABLE_DEFAULT_LOCALE_PATHS.map((path) => localizePath(path, locale))
  ),
];

function stripQueryAndHash(pathname: string): string {
  const [withoutQuery] = pathname.split("?");
  const [withoutHash] = withoutQuery.split("#");
  return withoutHash || "/";
}

function normalizePath(pathname: string): string {
  const value = stripQueryAndHash(pathname).trim();
  if (!value) return "/";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  if (withLeadingSlash !== "/" && withLeadingSlash.endsWith("/")) {
    return withLeadingSlash.slice(0, -1);
  }
  return withLeadingSlash;
}

export function buildCanonicalUrl(pathname: string): string {
  const locale = getLocaleFromPath(pathname) ?? DEFAULT_LOCALE;
  const normalizedPath = normalizePath(localizePath(stripLocaleFromPath(pathname), locale));
  const base = SEO_DEFAULTS.baseUrl.replace(/\/$/, "");
  if (normalizedPath === "/") {
    return `${base}/`;
  }
  return `${base}${normalizedPath}`;
}

function resolveBaseRouteMetadata(normalizedPath: string): SeoRouteMetadata {
  if (ROUTE_METADATA[normalizedPath]) {
    return ROUTE_METADATA[normalizedPath];
  }
  if (normalizedPath.startsWith("/docs/")) {
    return ROUTE_METADATA["/docs"];
  }
  return ROUTE_METADATA["/404"];
}

export function getSeoMetadataForPath(pathname: string): SeoRouteMetadata {
  const normalizedPath = normalizePath(stripLocaleFromPath(pathname));

  if (normalizedPath === "/markdown" || normalizedPath.startsWith("/markdown/")) {
    const rawRemainder =
      normalizedPath === "/markdown" ? "" : normalizedPath.slice("/markdown".length);
    const sourcePath =
      rawRemainder === "" || rawRemainder === "/"
        ? "/"
        : normalizePath(rawRemainder.startsWith("/") ? rawRemainder : `/${rawRemainder}`);
    const baseMeta = resolveBaseRouteMetadata(sourcePath);
    const shortTitle = baseMeta.title.replace(/\s*\|\s*Neotoma\s*$/, "").trim();
    return {
      ...baseMeta,
      title: `${shortTitle} (Markdown) | Neotoma`,
      robots: "noindex,nofollow",
      description: `Markdown export of the rendered ${sourcePath} page. ${baseMeta.description}`,
    };
  }

  return resolveBaseRouteMetadata(normalizedPath);
}

const DEFAULT_SEO_KEYWORDS = [
  "Neotoma",
  "MCP",
  "Model Context Protocol",
  "AI agents",
  "agent memory",
  "deterministic state",
] as const;

/** Alt text for Open Graph / Twitter images (keep concise for screen readers and previews). */
export function buildDefaultOgImageAlt(title: string, description: string): string {
  const snippet =
    description.length > 140 ? `${description.slice(0, 137).trimEnd()}...` : description;
  const titleTrim = title.trimEnd();
  const head = titleTrim.replace(/[.!?…]+$/u, "").trimEnd() || titleTrim;
  const combined = `${head}. ${snippet}`.trim();
  return combined.length > 200 ? `${combined.slice(0, 197)}...` : combined;
}

/** Comma-separated keywords: route-specific terms plus product defaults, deduped. */
export function buildKeywords(metadata: SeoRouteMetadata): string {
  const fromTitle = titleToKeywordHints(metadata.title);
  const extra = metadata.keywords ?? [];
  const merged = [...extra, ...fromTitle, ...DEFAULT_SEO_KEYWORDS]
    .map((k) => k.trim())
    .filter(Boolean);
  return [...new Set(merged)].join(", ");
}

function titleToKeywordHints(title: string): string[] {
  const parts = title
    .split(/[|\u2013\u2014-]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.filter((p) => p.length > 2 && p.toLowerCase() !== "neotoma");
}

function buildJsonLd(
  pathname: string,
  metadata: SeoRouteMetadata,
  image: { url: string; alt: string }
): Record<string, unknown>[] {
  const canonicalUrl = buildCanonicalUrl(pathname);
  const type = metadata.jsonLdType ?? "WebPage";
  const publisher = { "@type": "Organization", name: SEO_DEFAULTS.siteName };

  const primary: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": type,
    name: metadata.title,
    description: metadata.description,
    url: canonicalUrl,
    publisher,
    image: {
      "@type": "ImageObject",
      url: image.url,
      width: SEO_DEFAULTS.ogImageWidth,
      height: SEO_DEFAULTS.ogImageHeight,
      caption: image.alt,
    },
  };

  if (type === "WebSite") {
    primary.potentialAction = {
      "@type": "SearchAction",
      target: `${SEO_DEFAULTS.baseUrl}/docs?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    };
  }

  const items: Record<string, unknown>[] = [primary];

  if (metadata.breadcrumb && metadata.breadcrumb.length > 0) {
    items.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: metadata.breadcrumb.map((crumb, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        name: crumb.name,
        item: buildCanonicalUrl(crumb.path),
      })),
    });
  }

  if (metadata.faqItems && metadata.faqItems.length > 0) {
    items.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: metadata.faqItems.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    });
  }

  if (metadata.howToName && metadata.howToSteps && metadata.howToSteps.length > 0) {
    items.push({
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: metadata.howToName,
      step: metadata.howToSteps.map((step, idx) => ({
        "@type": "HowToStep",
        position: idx + 1,
        name: step.name,
        text: step.text,
      })),
    });
  }

  if (metadata.definedTerms && metadata.definedTerms.length > 0) {
    items.push({
      "@context": "https://schema.org",
      "@type": "DefinedTermSet",
      name: metadata.title,
      hasDefinedTerm: metadata.definedTerms.map((dt) => ({
        "@type": "DefinedTerm",
        name: dt.term,
        description: dt.definition,
      })),
    });
  }

  if (metadata.softwareApp) {
    const app = metadata.softwareApp;
    const softwareAppEntry: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SEO_DEFAULTS.siteName,
      description: metadata.description,
      url: canonicalUrl,
      applicationCategory: app.applicationCategory,
      operatingSystem: app.operatingSystem,
      softwareVersion: app.version,
      license: app.license,
      codeRepository: app.codeRepository,
      offers: {
        "@type": "Offer",
        price: app.offers.price,
        priceCurrency: app.offers.priceCurrency,
      },
    };
    if (app.installUrl) {
      softwareAppEntry.installUrl = app.installUrl;
    }
    if (app.featureList && app.featureList.length > 0) {
      softwareAppEntry.featureList = app.featureList;
    }
    items.push(softwareAppEntry);
  }

  if (metadata.organization) {
    const org = metadata.organization;
    items.push({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SEO_DEFAULTS.siteName,
      url: SEO_DEFAULTS.baseUrl,
      founder: {
        "@type": "Person",
        name: org.founderName,
        ...(org.founderUrl ? { url: org.founderUrl } : {}),
      },
      sameAs: org.sameAs,
    });
  }

  if (metadata.speakable && metadata.speakable.length > 0) {
    items.push({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: metadata.title,
      url: canonicalUrl,
      speakable: {
        "@type": "SpeakableSpecification",
        cssSelector: metadata.speakable,
      },
    });
  }

  return items;
}

export interface ResolvedSeoMetadata {
  title: string;
  description: string;
  robots: string;
  canonicalUrl: string;
  ogType: "website" | "article";
  ogLocale: string;
  locale: SupportedLocale;
  alternates: { hrefLang: string; href: string }[];
  ogImageUrl: string;
  ogImageAlt: string;
  keywords: string;
  twitterCard: "summary" | "summary_large_image";
  jsonLd: Record<string, unknown>[];
}

function buildAlternates(pathname: string): { hrefLang: string; href: string }[] {
  const basePath = stripLocaleFromPath(pathname);
  const alternates = SUPPORTED_LOCALES.map((locale) => ({
    hrefLang: locale,
    href: buildCanonicalUrl(localizePath(basePath, locale)),
  }));
  return [{ hrefLang: "x-default", href: buildCanonicalUrl(basePath) }, ...alternates];
}

export function resolveSeoMetadata(pathname: string): ResolvedSeoMetadata {
  const locale = getLocaleFromPath(pathname) ?? DEFAULT_LOCALE;
  const normalizedPath = normalizePath(stripLocaleFromPath(pathname));
  const routeMetadata = getSeoMetadataForPath(pathname);
  const pack = getStaticLocalePack(locale);
  const localizedOverride: Partial<SeoRouteMetadata> =
    normalizedPath === "/"
      ? pack.seo.home
      : normalizedPath === "/docs"
        ? pack.seo.docs
        : normalizedPath === "/install"
          ? pack.seo.install
          : normalizedPath === "/foundations"
            ? pack.seo.foundations
            : normalizedPath === "/memory-guarantees"
              ? pack.seo.memoryGuarantees
              : {};
  const resolvedRouteMetadata = { ...routeMetadata, ...localizedOverride };
  const robots =
    typeof process !== "undefined" && process.env?.SITE_PREVIEW === "1"
      ? "noindex,follow"
      : resolvedRouteMetadata.robots;
  const ogImageUrl = resolvedRouteMetadata.ogImageUrl ?? SEO_DEFAULTS.ogImageUrl;
  const ogImageAlt =
    resolvedRouteMetadata.ogImageAlt ??
    buildDefaultOgImageAlt(resolvedRouteMetadata.title, resolvedRouteMetadata.description);
  const keywords = buildKeywords(resolvedRouteMetadata);
  const twitterCard = resolvedRouteMetadata.twitterCard ?? SEO_DEFAULTS.twitterCard;
  return {
    title: resolvedRouteMetadata.title,
    description: resolvedRouteMetadata.description,
    robots,
    canonicalUrl: buildCanonicalUrl(pathname),
    ogType: resolvedRouteMetadata.ogType ?? "website",
    locale,
    ogLocale: LOCALE_TO_OG[locale],
    alternates: buildAlternates(pathname),
    ogImageUrl,
    ogImageAlt,
    keywords,
    twitterCard,
    jsonLd: buildJsonLd(pathname, resolvedRouteMetadata, {
      url: ogImageUrl,
      alt: ogImageAlt,
    }),
  };
}

export function buildSitemapXml(paths: readonly string[] = SITEMAP_PATHS): string {
  const urlEntries = paths
    .map((path) => `  <url><loc>${buildCanonicalUrl(path)}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>\n`;
}

export function buildRobotsTxt(): string {
  const base = SEO_DEFAULTS.baseUrl.replace(/\/$/, "");
  const sitemapUrl = `${base}/sitemap.xml`;
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
}

// ---------------------------------------------------------------------------
// Static HTML pre-rendering for bot-friendly meta tags
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Replace homepage meta tags in an HTML template with route-specific values.
 * Designed to run at build time so static HTML files serve correct metadata
 * to crawlers that don't execute JavaScript.
 */
export function injectRouteMetaIntoHtml(html: string, routePath: string): string {
  const meta = resolveSeoMetadata(routePath);
  let out = html;

  out = out.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`);

  out = out.replace(
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${escapeHtml(meta.description)}"`
  );
  out = out.replace(
    /<meta name="robots" content="[^"]*"/,
    `<meta name="robots" content="${escapeHtml(meta.robots)}"`
  );
  out = out.replace(
    /<link rel="canonical" href="[^"]*"/,
    `<link rel="canonical" href="${escapeHtml(meta.canonicalUrl)}"`
  );

  const ogLocaleTag = `<meta property="og:locale" content="${escapeHtml(meta.ogLocale)}" />`;
  if (/<meta property="og:locale" content="[^"]*"/.test(out)) {
    out = out.replace(
      /<meta property="og:locale" content="[^"]*"/,
      `<meta property="og:locale" content="${escapeHtml(meta.ogLocale)}"`
    );
  } else {
    out = out.replace("</head>", `    ${ogLocaleTag}\n  </head>`);
  }
  out = out.replace(
    /<meta property="og:title" content="[^"]*"/,
    `<meta property="og:title" content="${escapeHtml(meta.title)}"`
  );
  out = out.replace(
    /<meta property="og:description" content="[^"]*"/,
    `<meta property="og:description" content="${escapeHtml(meta.description)}"`
  );
  out = out.replace(
    /<meta property="og:url" content="[^"]*"/,
    `<meta property="og:url" content="${escapeHtml(meta.canonicalUrl)}"`
  );

  out = out.replace(
    /<meta property="og:type" content="[^"]*"/,
    `<meta property="og:type" content="${escapeHtml(meta.ogType)}"`
  );

  if (/<meta property="og:image" content="[^"]*"/.test(out)) {
    out = out.replace(
      /<meta property="og:image" content="[^"]*"/,
      `<meta property="og:image" content="${escapeHtml(meta.ogImageUrl)}"`
    );
  } else {
    out = out.replace(
      "</head>",
      `    <meta property="og:image" content="${escapeHtml(meta.ogImageUrl)}" />\n  </head>`
    );
  }
  if (/<meta property="og:image:width" content="[^"]*"/.test(out)) {
    out = out.replace(
      /<meta property="og:image:width" content="[^"]*"/,
      `<meta property="og:image:width" content="${String(SEO_DEFAULTS.ogImageWidth)}"`
    );
  }
  if (/<meta property="og:image:height" content="[^"]*"/.test(out)) {
    out = out.replace(
      /<meta property="og:image:height" content="[^"]*"/,
      `<meta property="og:image:height" content="${String(SEO_DEFAULTS.ogImageHeight)}"`
    );
  }
  if (/<meta property="og:image:alt" content="[^"]*"/.test(out)) {
    out = out.replace(
      /<meta property="og:image:alt" content="[^"]*"/,
      `<meta property="og:image:alt" content="${escapeHtml(meta.ogImageAlt)}"`
    );
  } else {
    out = out.replace(
      "</head>",
      `    <meta property="og:image:alt" content="${escapeHtml(meta.ogImageAlt)}" />\n  </head>`
    );
  }

  if (/<meta name="keywords" content="[^"]*"/.test(out)) {
    out = out.replace(
      /<meta name="keywords" content="[^"]*"/,
      `<meta name="keywords" content="${escapeHtml(meta.keywords)}"`
    );
  } else {
    out = out.replace(
      "</head>",
      `    <meta name="keywords" content="${escapeHtml(meta.keywords)}" />\n  </head>`
    );
  }

  if (/<meta name="twitter:card" content="[^"]*"/.test(out)) {
    out = out.replace(
      /<meta name="twitter:card" content="[^"]*"/,
      `<meta name="twitter:card" content="${escapeHtml(meta.twitterCard)}"`
    );
  }
  if (/<meta name="twitter:image" content="[^"]*"/.test(out)) {
    out = out.replace(
      /<meta name="twitter:image" content="[^"]*"/,
      `<meta name="twitter:image" content="${escapeHtml(meta.ogImageUrl)}"`
    );
  } else {
    out = out.replace(
      "</head>",
      `    <meta name="twitter:image" content="${escapeHtml(meta.ogImageUrl)}" />\n  </head>`
    );
  }
  if (/<meta name="twitter:image:width" content="[^"]*"/.test(out)) {
    out = out.replace(
      /<meta name="twitter:image:width" content="[^"]*"/,
      `<meta name="twitter:image:width" content="${String(SEO_DEFAULTS.ogImageWidth)}"`
    );
  }
  if (/<meta name="twitter:image:height" content="[^"]*"/.test(out)) {
    out = out.replace(
      /<meta name="twitter:image:height" content="[^"]*"/,
      `<meta name="twitter:image:height" content="${String(SEO_DEFAULTS.ogImageHeight)}"`
    );
  }
  if (/<meta name="twitter:image:alt" content="[^"]*"/.test(out)) {
    out = out.replace(
      /<meta name="twitter:image:alt" content="[^"]*"/,
      `<meta name="twitter:image:alt" content="${escapeHtml(meta.ogImageAlt)}"`
    );
  } else {
    out = out.replace(
      "</head>",
      `    <meta name="twitter:image:alt" content="${escapeHtml(meta.ogImageAlt)}" />\n  </head>`
    );
  }

  out = out.replace(
    /<meta name="twitter:title" content="[^"]*"/,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}"`
  );
  out = out.replace(
    /<meta name="twitter:description" content="[^"]*"/,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}"`
  );

  out = out.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    meta.jsonLd
      .map((entry) => `<script type="application/ld+json">${JSON.stringify(entry)}</script>`)
      .join("\n    ")
  );

  out = out.replace(/<link rel="alternate" hrefLang="[^"]*" href="[^"]*" \/>\s*/g, "");
  const alternatesHtml = meta.alternates
    .map(
      (alternate) =>
        `<link rel="alternate" hrefLang="${escapeHtml(alternate.hrefLang)}" href="${escapeHtml(alternate.href)}" />`
    )
    .join("\n    ");
  if (alternatesHtml) {
    out = out.replace("</head>", `    ${alternatesHtml}\n  </head>`);
  }

  out = out.replace(/<html lang="[^"]*"/, `<html lang="${meta.locale}"`);

  return out;
}

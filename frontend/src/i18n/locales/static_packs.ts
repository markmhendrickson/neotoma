import { getDictionary } from "@/i18n/dictionaries";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n/config";

export interface SeoRouteCopy {
  title: string;
  description: string;
}

export interface StaticLocalePack {
  homeHero: {
    titlePrefix: string;
    titleAccent: string;
    titleMid: string;
    titleFocus: string;
    withoutStateLayer: string;
    bullets: [string, string, string];
    summary: string;
    summaryRecordTypes: string[];
    ctaEvaluateWithAgent: string;
    ctaViewGuarantees: string;
    ctaInstall: string;
    ctaOfficeHours: string;
    ctaOfficeHoursSubtext: string;
    subcopy: string;
    curiosityGap: string;
    /** Hero micro-label below primary CTAs (displayed uppercase in UI) */
    audienceTagline: string;
  };
  siteSections: {
    intro: string;
    personalOs: string;
    beforeAfter: string;
    who?: string;
    demo?: string;
    recordTypes?: string;
    guarantees: string;
    evaluate?: string;
    /** Home slide before footer; accordion + FAQ link */
    commonQuestions?: string;
    /** Home FAQ block heading */
    frequentlyAskedQuestions?: string;
    inspect: string;
    architecture: string;
    useCases: string;
    interfaces: string;
    learnMore: string;
    resources: string;
  };
  memory: {
    vendors: string;
    representativeProviders: string;
    platform: string;
    retrievalRag: string;
    files: string;
    database: string;
    deterministic: string;
    platformShort: string;
    ragShort: string;
    filesShort: string;
    databaseShort: string;
    deterministicShort: string;
    onThisPage: string;
    showFewer: string;
    showAllGuarantees: (count: number) => string;
  };
  foundations: {
    title: string;
    onThisPage: string;
    privacyFirst: string;
    deterministic: string;
    crossPlatform: string;
  };
  seo: {
    home: SeoRouteCopy;
    docs: SeoRouteCopy;
    install: SeoRouteCopy;
    foundations: SeoRouteCopy;
    memoryGuarantees: SeoRouteCopy;
  };
}

const EN_PACK: StaticLocalePack = {
  homeHero: {
    titlePrefix: "Your agents forget.",
    titleAccent: "Neotoma",
    titleMid: "makes them",
    titleFocus: "remember.",
    withoutStateLayer: "Without shared memory across your AI tools:",
    bullets: [
      "Context drifts between Claude, Cursor, ChatGPT, and everything else.",
      "Decisions vanish when the session ends.",
      "You become the human sync layer — re-prompting what the agent should already know.",
    ],
    summary:
      "Neotoma stores your {record} as versioned, auditable state — so every agent works from truth.",
    summaryRecordTypes: [
      "contacts",
      "tasks",
      "decisions",
      "conversations",
      "notes",
      "preferences",
      "transactions",
      "meeting notes",
      "companies",
      "health data",
    ],
    ctaEvaluateWithAgent: "Ask your agent to evaluate",
    ctaViewGuarantees: "View guarantees",
    ctaInstall: "Install in 5 minutes",
    ctaOfficeHours: "Talk to the founder",
    ctaOfficeHoursSubtext:
      "Building a multi-agent stack? Office hours for developers who want to talk architecture.",
    subcopy:
      "Neotoma is git for what your agents know. Versioned, diffable, replayable state across Claude, Cursor, ChatGPT, and everything else. Stop being the human sync layer.",
    curiosityGap:
      "Most memory tools help agents retrieve information. None of them can prove it hasn\u2019t been silently corrupted.",
    audienceTagline: "Built for developers running agents across sessions and tools",
  },
  siteSections: {
    intro: "Intro",
    personalOs: "Proof",
    beforeAfter: "Before / After",
    who: "Who",
    demo: "Demo",
    recordTypes: "Record types",
    guarantees: "Guarantees",
    evaluate: "Evaluate",
    commonQuestions: "Common questions",
    frequentlyAskedQuestions: "Frequently asked questions",
    inspect: "Inspect",
    architecture: "Architecture",
    useCases: "Use cases",
    interfaces: "Interfaces",
    learnMore: "Learn more",
    resources: "Resources",
  },
  memory: {
    vendors: "Vendors",
    representativeProviders: "Representative providers for each memory approach",
    platform: "Platform",
    retrievalRag: "Retrieval / RAG",
    files: "Files",
    database: "Database",
    deterministic: "Deterministic",
    platformShort: "Plat.",
    ragShort: "RAG",
    filesShort: "Files",
    databaseShort: "DB",
    deterministicShort: "Det.",
    onThisPage: "On this page",
    showFewer: "Show fewer",
    showAllGuarantees: (count) => `Show all ${count} guarantees`,
  },
  foundations: {
    title: "Foundations",
    onThisPage: "On this page",
    privacyFirst: "Privacy-first",
    deterministic: "Deterministic",
    crossPlatform: "Cross-platform",
  },
  seo: {
    home: {
      title: "Your agents forget. Neotoma makes them remember.",
      description:
        "Versioned records \u2014 contacts, tasks, decisions, finances \u2014 that persist across Claude, Cursor, ChatGPT, and every agent you run. Store once, query everywhere, stop re-prompting. Open-source and deterministic.",
    },
    docs: {
      title: "Neotoma Documentation | Setup, API, MCP, CLI References",
      description:
        "Documentation for Neotoma: setup, architecture, API references, and operational guides.",
    },
    install: {
      title: "Install | Neotoma",
      description:
        "Install Neotoma in 5 minutes. Agent-assisted and manual install, Docker setup, API server startup, and MCP configuration.",
    },
    foundations: {
      title: "Foundations | Neotoma",
      description:
        "Neotoma's architectural foundations: privacy-first local data with no cloud sync, and cross-platform memory across all AI tools via MCP.",
    },
    memoryGuarantees: {
      title: "Memory Guarantees | Neotoma",
      description:
        "Memory properties that determine reliability under production load: deterministic state evolution, versioned history, replayable timeline, auditable change log, schema constraints, and more.",
    },
  },
};

function buildLocalizedSeo(
  locale: SupportedLocale,
  dict: ReturnType<typeof getDictionary>
): StaticLocalePack["seo"] {
  if (locale === "en") return EN_PACK.seo;
  return {
    home: {
      title: `Neotoma | ${dict.languageName}`,
      description: `${dict.install} Neotoma. Versioned, auditable memory for AI agents: contacts, finances, tasks, decisions — agent-driven, deterministic, cross-tool.`,
    },
    docs: {
      title: `${dict.docs} | Neotoma`,
      description: `${dict.allDocumentation} for Neotoma: ${dict.install}, API, MCP, CLI, and architecture.`,
    },
    install: {
      title: `${dict.install} | Neotoma`,
      description: `${dict.install} Neotoma in 5 minutes with agent-assisted or manual setup.`,
    },
    foundations: {
      title: `Foundations | Neotoma`,
      description: `Privacy-first local data and cross-platform memory via MCP.`,
    },
    memoryGuarantees: {
      title: `Memory Guarantees | Neotoma`,
      description: `Deterministic state evolution, versioned history, replayable timeline, auditable change log, and schema constraints.`,
    },
  };
}

function buildPack(locale: SupportedLocale): StaticLocalePack {
  if (locale === "en") return EN_PACK;
  const dict = getDictionary(locale);
  return {
    homeHero: {
      ...EN_PACK.homeHero,
      ctaEvaluateWithAgent:
        locale === "es" ? "Pide a tu agente que evalúe" : EN_PACK.homeHero.ctaEvaluateWithAgent,
      ctaViewGuarantees: locale === "es" ? "Ver garantías" : EN_PACK.homeHero.ctaViewGuarantees,
      ctaInstall: locale === "es" ? "Instalar en 5 minutos" : EN_PACK.homeHero.ctaInstall,
      audienceTagline:
        locale === "es"
          ? "Para desarrolladores que ejecutan agentes entre sesiones y herramientas"
          : EN_PACK.homeHero.audienceTagline,
    },
    siteSections: {
      ...EN_PACK.siteSections,
      architecture: dict.architecture,
      guarantees: "Guarantees",
      learnMore: "Learn more",
      resources: "Resources",
    },
    memory: {
      ...EN_PACK.memory,
      showFewer: dict.showLess,
      showAllGuarantees: (count) => `${dict.showMore} (${count})`,
      onThisPage: EN_PACK.memory.onThisPage,
    },
    foundations: {
      ...EN_PACK.foundations,
      title: EN_PACK.foundations.title,
      onThisPage: EN_PACK.foundations.onThisPage,
    },
    seo: buildLocalizedSeo(locale, dict),
  };
}

const STATIC_LOCALE_PACKS: Record<SupportedLocale, StaticLocalePack> = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [locale, buildPack(locale)])
) as Record<SupportedLocale, StaticLocalePack>;

export function getStaticLocalePack(locale: SupportedLocale): StaticLocalePack {
  return STATIC_LOCALE_PACKS[locale] ?? EN_PACK;
}

import { getDictionary } from "@/i18n/dictionaries";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n/config";

export interface SeoRouteCopy {
  title: string;
  description: string;
}

export interface StaticLocalePack {
  homeHero: {
    titlePrefix: string;
    titleFocus: string;
    withoutStateLayer: string;
    bullets: [string, string, string];
    summary: string;
    ctaViewGuarantees: string;
    ctaInstall: string;
    subcopy: string;
  };
  siteSections: {
    intro: string;
    beforeAfter: string;
    guarantees: string;
    evaluate: string;
    install: string;
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
    deterministic: string;
    platformShort: string;
    ragShort: string;
    filesShort: string;
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
    titlePrefix: "Your production agent has",
    titleFocus: "amnesia",
    withoutStateLayer: "Without a state layer:",
    bullets: [
      "Context drifts across sessions.",
      "Facts conflict across tools and tasks.",
      "Decisions execute without a reproducible trail.",
    ],
    summary:
      "Neotoma is the deterministic state layer for long-running agents. Every observation is versioned. Every entity snapshot is reproducible. Every decision can be replayed.",
    ctaViewGuarantees: "View guarantees",
    ctaInstall: "Install deterministic memory in 5 minutes",
    subcopy:
      "RAG retrieves documents. Platform memory personalizes chat. Neither maintains durable state. Neotoma does, with deterministic guarantees and no silent mutation.",
  },
  siteSections: {
    intro: "Intro",
    beforeAfter: "Before / After",
    guarantees: "Guarantees",
    evaluate: "Evaluate",
    install: "Install",
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
    deterministic: "Deterministic",
    platformShort: "Plat.",
    ragShort: "RAG",
    filesShort: "Files",
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
      title: "Neotoma | Deterministic state layer for long-running agents",
      description:
        "Deterministic agent state layer for long-running agents: deterministic state evolution, versioned, schema-bound, replayable, auditable. No silent mutation. Agents install Neotoma themselves.",
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

function buildLocalizedSeo(locale: SupportedLocale, dict: ReturnType<typeof getDictionary>): StaticLocalePack["seo"] {
  if (locale === "en") return EN_PACK.seo;
  return {
    home: {
      title: `Neotoma | ${dict.languageName}`,
      description: `${dict.install} Neotoma. Deterministic, versioned, schema-bound, replayable, auditable state layer for long-running agents.`,
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
      ctaViewGuarantees: locale === "es" ? "Ver garantías" : EN_PACK.homeHero.ctaViewGuarantees,
      ctaInstall:
        locale === "es"
          ? "Instalar memoria determinista en 5 minutos"
          : EN_PACK.homeHero.ctaInstall,
    },
    siteSections: {
      ...EN_PACK.siteSections,
      install: dict.install,
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


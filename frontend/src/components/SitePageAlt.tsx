import {
  ArrowLeftRight,
  Bug,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  CircleOff,
  ExternalLink,
  Eye,
  Download,
  Quote,
  Server,
  MessageSquare,
  Wrench,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SiClaude, SiOpenai } from "react-icons/si";
import { OpenCodeIcon } from "@/components/icons/OpenCodeIcon";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  REPO_RELEASES_COUNT,
  REPO_STARS_COUNT,
  REPO_VERSION,
  MEMORY_GUARANTEE_ROWS,
} from "../site/site_data";
import {
  FAQ_DEEP_LINK_SECTION_IDS,
} from "../site/faq_items";

import { useRepoMetaClient } from "../hooks/useRepoMetaClient";
import {
  HOME_EVALUATE_CTA_CLASS,
  HOME_SCROLL_BANNER_PRIMARY_CELL_CLASS,
  HOME_SCROLL_BANNER_SECONDARY_CELL_CLASS,
  HOME_SCROLL_BANNER_SPLIT_CELL_CLASS,
} from "./code_block_copy_button_classes";
import { HomeEvaluatePromptBlock } from "./HomeEvaluatePromptBlock";
import { SeoHead } from "./SeoHead";
import { SectionDotNav } from "./SectionDotNav";
import { SiteTailpiece } from "./SiteTailpiece";
import { CursorIcon } from "./icons/CursorIcon";
import { IronClawIcon } from "./icons/IronClawIcon";
import { OpenClawIcon } from "./icons/OpenClawIcon";
import { EntityGraphHero } from "./illustrations/EntityGraphHero";
import { ScrollRevealOnce } from "./ScrollRevealOnce";
import { WhoProfileCardVisual } from "./WhoProfileCardVisual";
import { CliDemoInteractive } from "./CliDemoInteractive";
import guaranteeDeterministicStateIllus from "@/assets/images/guarantees/guarantee_sym_deterministic_square.png";
import guaranteeVersionedHistoryIllus from "@/assets/images/guarantees/guarantee_sym_versioned_square.png";
import guaranteeAuditableChangeLogIllus from "@/assets/images/guarantees/guarantee_sym_audit_square.png";
import guaranteeSilentMutationPreventionIllus from "@/assets/images/guarantees/guarantee_sym_silent_square.png";
import guaranteeSchemaConstraintsIllus from "@/assets/images/guarantees/guarantee_sym_schema_square.png";
import guaranteeReproducibleReconstructionIllus from "@/assets/images/guarantees/guarantee_sym_rebuild_square.png";
import heroEvaluateIllus from "@/assets/images/hero/hero_illus_evaluate_agent_page.png";
import founderPhoto from "@/assets/images/people/mark_hendrickson.jpg";

import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { useSiteHomeEvaluateScrollBannerVisibleSetter } from "@/context/SiteAppNavContext";
import { sendCtaClick } from "@/utils/analytics";

const WHO_CALLOUT_FAQ_LINK_CLASS =
  "font-medium text-foreground underline decoration-emerald-600/35 underline-offset-2 hover:decoration-emerald-600/70";

const ALT_SECTION_ORDER: readonly string[] = [
  "intro",
  "build-your-own",
  "who",
  "demo",
  "outcomes",
  "state-guarantees",
  "proof",
  "evaluate",
  "common-questions",
];

const ALT_HASH_SECTION_IDS = new Set<string>(ALT_SECTION_ORDER);
const ALT_DOT_NAV_SECTION_IDS = new Set<string>(
  ALT_SECTION_ORDER.filter((id) => id !== "common-questions")
);

function getAltInitialNavSectionId(): string | null {
  if (typeof window === "undefined") return "intro";
  const rawHash = window.location.hash.replace(/^#/, "");
  return ALT_HASH_SECTION_IDS.has(rawHash) ? rawHash : "intro";
}

function getLocalizedDotNavSections(pack: ReturnType<typeof useLocale>["pack"]) {
  return [
    { id: "intro", label: pack.siteSections.intro },
    { id: "build-your-own", label: "DIY" },
    { id: "who", label: pack.siteSections.who ?? "Who" },
    { id: "demo", label: pack.siteSections.demo ?? "Demo" },
    { id: "outcomes", label: pack.siteSections.beforeAfter },
    { id: "state-guarantees", label: pack.siteSections.guarantees },
    { id: "proof", label: pack.siteSections.personalOs },
    { id: "evaluate", label: pack.siteSections.evaluate ?? "Evaluate" },
  ];
}

const SLIDE_CLASS =
  "min-h-[auto] md:min-h-[100svh] md:snap-start flex items-center justify-center relative print:min-h-0 print:[scroll-snap-align:unset]";
const SLIDE_INNER = "w-full max-w-6xl mx-auto px-4 md:px-12 lg:px-16 py-8 md:pt-16 md:pb-16";

const HOME_SECTION_H2_CLASS =
  "text-[26px] sm:text-[28px] md:text-[32px] font-medium tracking-[-0.02em] leading-[1.15]";

const IN_VIEW_THRESHOLD = 0.01;
const EVALUATE_BANNER_SCROLL_PADDING_BOTTOM =
  "max(5.75rem, calc(4.5rem + env(safe-area-inset-bottom, 0px)))";
const ILLUS_REVEAL_STAGGER_MS = 120;

const ICP_ICON_MAP: Record<string, LucideIcon> = {
  Server,
  Workflow,
  ArrowLeftRight,
  Bug,
};

const heroProofStripItemClass =
  "rounded-full border border-border/80 bg-background/80 px-3.5 py-2 text-[13px] font-medium text-muted-foreground lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-0";

const GUARANTEE_PREVIEW_CARDS: {
  slug: string;
  property: string;
  failure: string;
  status: "guaranteed" | "prevented";
  illus: string;
}[] = [
  {
    slug: "deterministic-state-evolution",
    property: "Deterministic state",
    failure: "You run the same pipeline twice and get different results \u2014 no way to trace why.",
    status: "guaranteed",
    illus: guaranteeDeterministicStateIllus,
  },
  {
    slug: "versioned-history",
    property: "Versioned history",
    failure: "A retry silently overwrites a preference. The original is gone.",
    status: "guaranteed",
    illus: guaranteeVersionedHistoryIllus,
  },
  {
    slug: "auditable-change-log",
    property: "Auditable change log",
    failure: "Your agent makes a bad call. You can\u2019t trace what data it relied on.",
    status: "guaranteed",
    illus: guaranteeAuditableChangeLogIllus,
  },
  {
    slug: "silent-mutation-risk",
    property: "Silent mutation prevention",
    failure: "Data changes without your knowledge. You find out when something breaks.",
    status: "prevented",
    illus: guaranteeSilentMutationPreventionIllus,
  },
  {
    slug: "schema-constraints",
    property: "Schema constraints",
    failure:
      "An agent writes a malformed record. Nothing rejects it \u2014 errors compound silently.",
    status: "guaranteed",
    illus: guaranteeSchemaConstraintsIllus,
  },
  {
    slug: "reproducible-state-reconstruction",
    property: "Reproducible reconstruction",
    failure: "Your database corrupts. There\u2019s no path back to a known-good state.",
    status: "guaranteed",
    illus: guaranteeReproducibleReconstructionIllus,
  },
];

const GUARANTEE_QA: { q: string; a: string }[] = [
  {
    q: "Platform memory (Claude, ChatGPT) is good enough - why add another tool?",
    a: "Platform memory stores what one vendor decides to remember, in a format you can't inspect or export. It doesn't version, doesn't detect conflicts, and vanishes if you switch tools. Neotoma gives you structured, cross-tool memory you control.",
  },
  {
    q: "Can't I just build this with SQLite or a JSON file?",
    a: "You can start there - many teams do. But you'll eventually need versioning, conflict detection, schema evolution, and cross-tool sync. That's months of infrastructure work. Neotoma ships those guarantees on day one.",
  },
  {
    q: "Is this production-ready?",
    a: 'Neotoma is in developer preview \u2014 used daily by real agent workflows. The core guarantees (deterministic memory, versioned history, append-only change log) are stable. Install in 5 minutes and let your agent evaluate the fit.',
  },
];

const HOME_FAQ_PREVIEW_ITEMS: { q: string; a: string }[] = [
  ...GUARANTEE_QA,
  {
    q: "Does Neotoma replace Claude's memory or ChatGPT's?",
    a: "No \u2014 it works alongside them. Platform memory stores what one vendor decides to remember within that vendor's tool. Neotoma stores facts you control across all your tools. Keep using platform memory for quick context; use Neotoma when you need versioning, auditability, and cross-tool consistency.",
  },
  {
    q: "Does Neotoma send my data to the cloud?",
    a: "No. Neotoma runs locally by default. Your data stays on your machine in a local SQLite database. There is no cloud sync, no telemetry, and no training on your data unless you choose to expose the API (for example for remote MCP clients).",
  },
];

const HERO_QUOTES: { text: string; attribution: string; attributionHref?: string }[] = [
  {
    text: "State integrity, not retrieval quality.",
    attribution: "Agentic app builder",
  },
  {
    text: "Very relevant problem, most people rolling their own.",
    attribution: "Laurie Voss, npm co-founder",
  },
  {
    text: "Genuinely useful for production agents, overkill for hobbyist chatbots.",
    attribution: "Production agent evaluator",
  },
  {
    text: "CI/CD for agent state.",
    attribution: "Tycho Onnasch, co-founder, Zest Protocol",
  },
];

function isModifiedClick(event: React.MouseEvent<HTMLElement>) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function FadeSection({
  scrollContainerRef,
  children,
  staticMode,
}: {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
  staticMode?: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [disableFadeOnMobile, setDisableFadeOnMobile] = useState(false);

  useLayoutEffect(() => {
    if (staticMode || typeof window === "undefined") return;
    setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setDisableFadeOnMobile(window.matchMedia("(max-width: 767px)").matches);
  }, [staticMode]);

  useLayoutEffect(() => {
    if (staticMode || typeof window === "undefined") return;
    const scrollEl = scrollContainerRef?.current;
    const wrapperEl = wrapperRef.current;
    if (!scrollEl || !wrapperEl) {
      setInView(true);
      return;
    }

    const checkInView = (): boolean => {
      const rootRect = scrollEl.getBoundingClientRect();
      const elRect = wrapperEl.getBoundingClientRect();
      const height = elRect.height;
      if (height <= 0) return true;
      const overlapTop = Math.max(
        0,
        Math.min(elRect.bottom, rootRect.bottom) - Math.max(elRect.top, rootRect.top)
      );
      return overlapTop / height > 0;
    };

    const syncInView = () => setInView(checkInView());
    syncInView();

    const raf = requestAnimationFrame(syncInView);
    const timeout = window.setTimeout(syncInView, 120);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setInView(entry.isIntersecting && entry.intersectionRatio > 0);
        }
      },
      { root: scrollEl, threshold: [0, 0.1, IN_VIEW_THRESHOLD, 0.5, 1], rootMargin: "0px" }
    );
    observer.observe(wrapperEl);
    scrollEl.addEventListener("scroll", syncInView, { passive: true });
    window.addEventListener("resize", syncInView);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      scrollEl.removeEventListener("scroll", syncInView);
      window.removeEventListener("resize", syncInView);
      observer.disconnect();
    };
  }, [scrollContainerRef, staticMode]);

  if (staticMode || reduceMotion || disableFadeOnMobile) return <>{children}</>;

  return (
    <div
      ref={wrapperRef}
      className={`transition-opacity duration-500 ease-out motion-reduce:transition-none print:!opacity-100 ${inView ? "opacity-100" : "opacity-0"}`}
    >
      {children}
    </div>
  );
}

function HomeAgentToolChips({
  align = "center",
  compact = false,
}: {
  align?: "center" | "start";
  compact?: boolean;
}) {
  const { pack } = useLocale();
  const { ariaLabel, worksWith } = pack.homeBody.agentToolChips;
  const chipClass = compact
    ? "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-medium text-foreground/90 no-underline transition-colors hover:bg-muted"
    : "inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[14px] font-medium text-foreground/90 no-underline transition-colors hover:bg-muted";
  const alignmentClass = align === "start" ? "justify-center lg:justify-start" : "justify-center";
  const rowClass = compact ? "gap-2.5" : "gap-3";
  const stackGap = compact ? "gap-2 md:gap-2.5" : "gap-2 md:gap-3";
  const labelClass = compact
    ? "text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70"
    : "text-[12px] font-medium uppercase tracking-wide text-muted-foreground/70";
  const iconClass = compact ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0";
  return (
    <div
      className={`flex flex-col items-center pt-1 ${stackGap} md:flex-row md:flex-wrap md:items-center ${alignmentClass}`}
      aria-label={ariaLabel}
    >
      <span
        className={`${labelClass} w-full shrink-0 text-center md:w-auto ${align === "start" ? "lg:text-left" : ""}`}
      >
        {worksWith}
      </span>
      <div
        className={`flex w-full max-w-full flex-wrap items-center justify-center ${rowClass} md:contents`}
      >
        <Link to="/neotoma-with-claude" className={chipClass}>
          <SiClaude className={iconClass} aria-hidden />
          Claude
        </Link>
        <Link to="/neotoma-with-chatgpt" className={chipClass}>
          <SiOpenai className={iconClass} aria-hidden />
          ChatGPT
        </Link>
        <Link to="/neotoma-with-cursor" className={chipClass}>
          <CursorIcon className={iconClass} aria-hidden />
          Cursor
        </Link>
        <Link to="/neotoma-with-opencode" className={chipClass}>
          <OpenCodeIcon className={iconClass} aria-hidden />
          OpenCode
        </Link>
        <Link to="/neotoma-with-openclaw" className={chipClass}>
          <OpenClawIcon className={iconClass} aria-hidden />
          OpenClaw
        </Link>
        <Link to="/neotoma-with-ironclaw" className={chipClass}>
          <IronClawIcon className={iconClass} aria-hidden />
          IronClaw
        </Link>
      </div>
    </div>
  );
}

function HeroProofStrip() {
  const { starsCount: liveStars, starsResolved } = useRepoMetaClient(
    REPO_VERSION,
    REPO_RELEASES_COUNT,
    REPO_STARS_COUNT
  );
  const showStarCount = starsResolved || liveStars > 0;
  const githubLinkLabel = showStarCount ? `${liveStars.toLocaleString()} on GitHub` : "GitHub";
  const dot = (
    <span aria-hidden="true" className="hidden text-border lg:inline">
      &middot;
    </span>
  );
  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5 text-[13px] font-medium text-muted-foreground lg:inline-flex lg:gap-x-3 lg:gap-y-1 lg:rounded-full lg:border lg:border-border/80 lg:bg-background/80 lg:px-4 lg:py-2 lg:justify-center">
      <span className={`${heroProofStripItemClass} inline-flex`}>
        Trustworthy state for AI agents
      </span>
      {dot}
      <a
        href="https://github.com/markmhendrickson/neotoma"
        target="_blank"
        rel="noopener noreferrer"
        className={`${heroProofStripItemClass} inline-flex items-center gap-1 no-underline hover:text-foreground transition-colors`}
        aria-label={showStarCount ? undefined : "Neotoma on GitHub"}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
          <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
        </svg>
        {githubLinkLabel}
      </a>
      {dot}
      <span className={heroProofStripItemClass}>{REPO_RELEASES_COUNT} releases shipped</span>
    </div>
  );
}

function HeroQuotesCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const handleScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.offsetWidth);
    setActiveIdx(Math.min(idx, HERO_QUOTES.length - 1));
  }, []);

  const scrollTo = useCallback((idx: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.offsetWidth, behavior: "smooth" });
  }, []);

  const quoteCard = (q: (typeof HERO_QUOTES)[number], i: number) => (
    <div
      key={i}
      className="flex flex-col rounded-xl border border-border/60 bg-card/30 p-3 sm:p-5 text-left"
    >
      <Quote className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-emerald-500/40 mb-2 sm:mb-3" aria-hidden />
      <p className="text-[14px] sm:text-[16px] md:text-[18px] leading-6 sm:leading-7 text-foreground/90 italic flex-1">
        &ldquo;{q.text}&rdquo;
      </p>
      <p className="mt-2 sm:mt-3 text-[11px] sm:text-[12px] text-muted-foreground">
        {q.attributionHref ? (
          <a
            href={q.attributionHref}
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:underline text-muted-foreground"
          >
            {q.attribution}
          </a>
        ) : (
          q.attribution
        )}
      </p>
    </div>
  );

  return (
    <>
      <div className="sm:hidden max-w-3xl mx-auto">
        <div
          ref={trackRef}
          onScroll={handleScroll}
          className="flex snap-x snap-mandatory overflow-x-auto scrollbar-hide -mx-4 px-4 gap-3"
        >
          {HERO_QUOTES.map((q, i) => (
            <div key={i} className="snap-center shrink-0 w-[85vw] max-w-[340px]">
              {quoteCard(q, i)}
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-1.5 mt-3">
          {HERO_QUOTES.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to quote ${i + 1}`}
              onClick={() => scrollTo(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === activeIdx
                  ? "w-4 bg-emerald-500"
                  : "w-1.5 bg-border hover:bg-muted-foreground/40"
              }`}
            />
          ))}
        </div>
      </div>
      <div className="hidden sm:grid gap-4 sm:grid-cols-2 max-w-3xl mx-auto">
        {HERO_QUOTES.map((q, i) => quoteCard(q, i))}
      </div>
    </>
  );
}

function SectionEdgeIndicators({
  sectionId,
  hidePrevious,
  hideNext,
}: {
  sectionId: string;
  hidePrevious?: boolean;
  hideNext?: boolean;
}) {
  const sectionIndex = ALT_SECTION_ORDER.indexOf(sectionId);
  if (sectionIndex === -1) return null;

  const previousId = sectionIndex > 0 ? ALT_SECTION_ORDER[sectionIndex - 1] : null;
  const nextId =
    sectionIndex < ALT_SECTION_ORDER.length - 1 ? ALT_SECTION_ORDER[sectionIndex + 1] : null;
  const isIntro = sectionId === "intro";

  const goToSection = (targetId: string) => {
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      {previousId && !hidePrevious ? (
        <a
          href={previousId === "intro" ? "/" : `#${previousId}`}
          className="absolute top-6 left-1/2 -translate-x-1/2 hidden md:inline-flex print:hidden items-center justify-center rounded-full border border-border bg-background/80 p-1.5 text-muted-foreground backdrop-blur-sm no-underline hover:text-foreground hover:bg-background transition"
          aria-label="Go to previous section"
          onClick={(e) => {
            if (isModifiedClick(e)) return;
            e.preventDefault();
            goToSection(previousId);
          }}
        >
          <ChevronUp className="h-4 w-4" />
        </a>
      ) : null}

      {nextId && !hideNext ? (
        <a
          href={`#${nextId}`}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden md:inline-flex print:hidden items-center justify-center rounded-full border border-border bg-background/80 p-1.5 text-muted-foreground backdrop-blur-sm no-underline hover:text-foreground hover:bg-background transition"
          aria-label="Go to next section"
          onClick={(e) => {
            if (isModifiedClick(e)) return;
            e.preventDefault();
            goToSection(nextId);
          }}
        >
          <ChevronDown className={`h-4 w-4 ${isIntro ? "animate-bounce" : ""}`} />
        </a>
      ) : null}
    </>
  );
}

function EvaluateSectionCta() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-stretch gap-4 text-left lg:mx-0">
      <HomeEvaluatePromptBlock copyFeedbackId="evaluate-section-prompt-alt" hideIntro />
    </div>
  );
}

/**
 * Merged ICP cards: "context janitor" + "babysitting inference" merged into one "re-explaining" card.
 * "Log archaeologist" stays as the distinct debugging card.
 */
const ALT_ICP_CARDS: {
  name: string;
  tagline: string;
  modeLabel: string;
  iconName: string;
  slug: string;
  homepageTransition?: string;
}[] = [
  {
    slug: "operating",
    name: "You keep re-explaining your world",
    modeLabel: "Cross-tool sync + pipeline state",
    iconName: "ArrowLeftRight",
    tagline:
      "Every session starts from zero. Context scatters across tools. Corrections don\u2019t persist between runs. You\u2019re the human sync layer and the inference babysitter.",
    homepageTransition:
      "Stop compensating for missing state. Store a fact once and it\u2019s available everywhere \u2014 versioned, corrected, and consistent across sessions and agents.",
  },
  {
    slug: "debugging-infrastructure",
    name: "You\u2019re the log archaeologist",
    modeLabel: "Replay & debug",
    iconName: "Bug",
    tagline: "Two runs. Same inputs. Different state. No replay, no diff, no explanation.",
    homepageTransition:
      "Stop reverse-engineering truth from logs. Debug from replayable state you can inspect, diff, and trust.",
  },
];

export function SitePageAlt() {
  const { pack, locale } = useLocale();
  const navigate = useNavigate();
  const dotNavSections = useMemo(() => getLocalizedDotNavSections(pack), [pack]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const suppressDotNavHashSyncRef = useRef(false);
  const [navActiveSectionId, setNavActiveSectionId] = useState<string | null>(
    getAltInitialNavSectionId
  );
  const [footerInScrollView, setFooterInScrollView] = useState(false);

  const showEvaluateScrollBanner =
    !footerInScrollView && navActiveSectionId !== "intro" && navActiveSectionId !== "evaluate";

  const setHomeEvaluateScrollBannerVisible = useSiteHomeEvaluateScrollBannerVisibleSetter();
  useEffect(() => {
    setHomeEvaluateScrollBannerVisible(showEvaluateScrollBanner);
    return () => setHomeEvaluateScrollBannerVisible(false);
  }, [showEvaluateScrollBanner, setHomeEvaluateScrollBannerVisible]);

  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    const footerEl = document.getElementById("site-footer-alt");
    if (!scrollEl || !footerEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setFooterInScrollView(entry.isIntersecting);
      },
      { root: scrollEl, threshold: 0, rootMargin: "0px" }
    );
    observer.observe(footerEl);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const hashId = window.location.hash.replace(/^#/, "");
    if (!hashId || !ALT_HASH_SECTION_IDS.has(hashId)) return;

    suppressDotNavHashSyncRef.current = true;

    const applyHashScroll = () => {
      document.getElementById(hashId)?.scrollIntoView({ behavior: "auto", block: "start" });
    };

    window.requestAnimationFrame(() => {
      applyHashScroll();
      window.requestAnimationFrame(() => {
        applyHashScroll();
        window.setTimeout(() => {
          applyHashScroll();
          suppressDotNavHashSyncRef.current = false;
        }, 160);
      });
    });

    if (hashId === "intro") {
      window.requestAnimationFrame(() => {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`
        );
      });
    }
  }, []);

  const handleActiveSectionChange = useCallback((sectionId: string | null) => {
    setNavActiveSectionId(sectionId);
    if (typeof window === "undefined") return;
    if (suppressDotNavHashSyncRef.current) return;

    if (sectionId === null) {
      const baseUrl = `${window.location.pathname}${window.location.search}`;
      const h = window.location.hash.replace(/^#/, "");
      if (h === "common-questions") return;
      if (ALT_DOT_NAV_SECTION_IDS.has(h) && h !== "intro") {
        window.history.replaceState(null, "", baseUrl);
      }
      return;
    }

    if (!ALT_DOT_NAV_SECTION_IDS.has(sectionId)) return;
    const baseUrl = `${window.location.pathname}${window.location.search}`;
    if (sectionId === "intro") {
      if (!window.location.hash) return;
      window.history.replaceState(null, "", baseUrl);
      return;
    }
    if (window.location.hash === `#${sectionId}`) return;
    window.history.replaceState(null, "", `${baseUrl}#${sectionId}`);
  }, []);

  return (
    <>
      <SeoHead />

      <div
        ref={scrollContainerRef}
        data-site-header-scroll-root
        data-site-home-scroll-root
        className="h-screen overflow-y-auto scroll-smooth md:snap-y md:snap-proximity print:h-auto print:min-h-0 print:overflow-visible print:snap-none"
        style={
          showEvaluateScrollBanner
            ? { scrollPaddingBottom: EVALUATE_BANNER_SCROLL_PADDING_BOTTOM }
            : undefined
        }
      >
        <SectionDotNav
          sections={dotNavSections}
          scrollContainerRef={scrollContainerRef}
          neutralZoneSectionId="common-questions"
          onActiveSectionChange={handleActiveSectionChange}
        />

        <main id="home-main">
          {/* Slide 1: Restructured hero — single promise + entity graph */}
          <section id="intro" className={SLIDE_CLASS}>
            <div className="relative z-10 flex w-full min-w-0 flex-col justify-center self-stretch">
              <FadeSection scrollContainerRef={scrollContainerRef}>
                <div className={SLIDE_INNER}>
                  <div className="mx-auto max-w-6xl pt-16 md:pt-20 lg:pt-12">
                    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.92fr)] lg:items-center">
                      <div className="space-y-6 text-center lg:text-left">
                        <h1 className="text-[36px] md:text-[48px] font-semibold tracking-[-0.035em] leading-[1.1]">
                          Structured state your agents can share, version, and replay.
                        </h1>

                        <p className="text-[15px] md:text-[17px] leading-7 text-foreground/80 max-w-xl mx-auto lg:mx-0">
                          Typed entities. Versioned history. Deterministic retrieval.
                          One source of truth across Claude, Cursor, ChatGPT, and every MCP tool.
                        </p>

                        <p className="text-[12px] font-mono uppercase tracking-wider text-muted-foreground/60 max-w-xl mx-auto lg:mx-0">
                          API and CLI from day one
                        </p>

                        <div className="mt-10 flex flex-col sm:flex-row sm:flex-wrap justify-center gap-3 lg:justify-start">
                          <a
                            href="/evaluate"
                            className={`${HOME_EVALUATE_CTA_CLASS} w-full sm:w-auto`}
                            onClick={(e) => {
                              sendCtaClick("hero_evaluate");
                              if (isModifiedClick(e)) return;
                              e.preventDefault();
                              navigate("/evaluate");
                            }}
                          >
                            <MessageSquare className="h-4 w-4 shrink-0" aria-hidden />
                            {pack.homeHero.ctaEvaluateWithAgent}
                          </a>
                          <a
                            href="/install"
                            className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5 rounded-md border border-border bg-card px-5 py-3 text-[15px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                            onClick={(e) => {
                              sendCtaClick("hero_install");
                              if (isModifiedClick(e)) return;
                              e.preventDefault();
                              navigate("/install");
                            }}
                          >
                            <Download className="h-4 w-4 shrink-0" aria-hidden />
                            {pack.homeHero.ctaInstall}
                          </a>
                        </div>
                      </div>

                      <EntityGraphHero />
                    </div>
                  </div>
                  <div className="mx-auto mt-12 flex w-full max-w-6xl justify-center lg:mt-14">
                    <div className="rounded-2xl bg-background/80 px-4 py-3 backdrop-blur-sm">
                      <HomeAgentToolChips compact />
                    </div>
                  </div>
                </div>
                <SectionEdgeIndicators sectionId="intro" />
              </FadeSection>
            </div>
          </section>

          {/* Slide 2: "Already building your own?" — elevated from original position */}
          <section id="build-your-own" className={SLIDE_CLASS}>
            <FadeSection scrollContainerRef={scrollContainerRef}>
              <div className={SLIDE_INNER}>
                <div className="mx-auto max-w-3xl space-y-6 text-center">
                  <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    Already rolling your own?
                  </p>
                  <h2 className={HOME_SECTION_H2_CLASS}>
                    Most developers start with SQLite, JSON, or a custom MCP server
                  </h2>
                  <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl mx-auto">
                    You know the problem is real because you&rsquo;re already solving it. Neotoma
                    ships the guarantees you&rsquo;d otherwise build and maintain yourself: versioning,
                    conflict detection, schema evolution, and cross-tool sync.
                  </p>
                  <div className="mx-auto max-w-xl rounded-lg border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-3 text-left">
                    <div className="flex items-start gap-2">
                      <Wrench
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/75"
                        aria-hidden
                      />
                      <p className="text-[13px] leading-5 text-muted-foreground">
                        <span className="font-medium text-foreground">
                          Replace your homegrown layer, not your workflow.
                        </span>{" "}
                        Neotoma plugs in as an MCP server. Your agents keep working the same way
                        &mdash; they just get{" "}
                        <Link
                          to={`/faq#${FAQ_DEEP_LINK_SECTION_IDS.buildingYourOwnMemorySystem}`}
                          className={WHO_CALLOUT_FAQ_LINK_CLASS}
                        >
                          state that stays correct
                        </Link>
                        .
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 pt-2 text-[12px] font-mono text-muted-foreground/60">
                    {["Versioning", "Conflict detection", "Schema evolution", "Cross-tool sync", "Audit trail", "Deterministic state"].map(
                      (g) => (
                        <span
                          key={g}
                          className="rounded border border-border/50 px-2 py-1"
                        >
                          {g}
                        </span>
                      )
                    )}
                  </div>
                </div>
              </div>
              <SectionEdgeIndicators sectionId="build-your-own" />
            </FadeSection>
          </section>

          {/* Slide 3: ICP cards — reduced from 3 to 2 */}
          <section id="who" className={SLIDE_CLASS}>
            <FadeSection scrollContainerRef={scrollContainerRef}>
              <div className={SLIDE_INNER}>
                <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto">
                  <div className="space-y-2 text-center">
                    <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                      Who this is for
                    </p>
                    <h2 className={HOME_SECTION_H2_CLASS}>
                      You run AI agents seriously...
                      <span className="mt-1.5 block text-muted-foreground sm:mt-2">
                        ...and pay the tax for unstructured state
                      </span>
                    </h2>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 max-w-3xl mx-auto">
                    {ALT_ICP_CARDS.map((card, index) => {
                      const Icon = ICP_ICON_MAP[card.iconName] ?? Server;
                      return (
                        <Link
                          key={card.slug}
                          to={`/${card.slug}`}
                          className="group flex flex-col rounded-xl border border-border bg-card/50 p-4 no-underline transition-colors hover:bg-muted/60 hover:border-border/80 sm:p-5"
                        >
                          <ScrollRevealOnce
                            scrollContainerRef={scrollContainerRef}
                            staggerMs={index * ILLUS_REVEAL_STAGGER_MS}
                          >
                            <WhoProfileCardVisual
                              profileSlug={card.slug}
                              modeLabel={card.modeLabel}
                              Icon={Icon}
                            />
                          </ScrollRevealOnce>
                          <div className="flex min-h-0 flex-1 flex-col px-1 pt-4">
                            <p className="text-[15px] font-medium text-foreground">{card.name}</p>
                            <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                              {card.tagline}
                            </p>
                            {card.homepageTransition ? (
                              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                                {card.homepageTransition}
                              </p>
                            ) : null}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                  <div className="mx-auto max-w-xl rounded-lg border border-border/30 bg-card/30 px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
                      <CircleOff
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground/75"
                        aria-hidden
                      />
                      <p>
                        Not for{" "}
                        <Link
                          to={`/faq#${FAQ_DEEP_LINK_SECTION_IDS.notForThoughtPartner}`}
                          className={WHO_CALLOUT_FAQ_LINK_CLASS}
                        >
                          one-off thought-partner workflows or note-taking apps
                        </Link>
                        .
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <SectionEdgeIndicators sectionId="who" />
            </FadeSection>
          </section>

          {/* Slide 4: CLI demo + Inspector preview — elevated */}
          <section id="demo" className={SLIDE_CLASS}>
            <FadeSection scrollContainerRef={scrollContainerRef}>
              <div className={SLIDE_INNER}>
                <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto">
                  <div className="space-y-2 text-center">
                    <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                      See what your agent knows
                    </p>
                    <h2 className={HOME_SECTION_H2_CLASS}>
                      Inspect, version, diff, and replay the state your agents share
                    </h2>
                    <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl mx-auto">
                      Every entity, every observation, every relationship &mdash; visible. The
                      same operations work from the CLI, the REST API, the Inspector app, or
                      through any MCP-connected agent. Toggle between views to try each interface.
                    </p>
                  </div>
                  <CliDemoInteractive />
                </div>
              </div>
              <SectionEdgeIndicators sectionId="demo" />
            </FadeSection>
          </section>

          {/* Slide 5: State guarantees */}
          <section id="state-guarantees" className={SLIDE_CLASS}>
            <FadeSection scrollContainerRef={scrollContainerRef}>
              <div className={SLIDE_INNER}>
                <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto">
                  <div className="space-y-2 text-center">
                    <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                      Guarantees
                    </p>
                    <h2 className={HOME_SECTION_H2_CLASS}>
                      Structured state that stays correct from session one to month twelve
                    </h2>
                    <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl mx-auto">
                      Chat memory fades. RAG drifts. Markdown and JSON files accumulate silent
                      conflicts. Neotoma enforces versioning, provenance, and tamper detection that
                      hold over months and years: not just between recent sessions.
                    </p>
                  </div>

                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                    {GUARANTEE_PREVIEW_CARDS.map((card, index) => (
                      <Link
                        key={card.slug}
                        to={`/memory-guarantees#${card.slug}`}
                        className="group flex flex-row items-center gap-4 overflow-hidden rounded-xl border border-border bg-card/50 p-4 no-underline transition-colors hover:bg-muted/60 hover:border-border/80"
                      >
                        <ScrollRevealOnce
                          scrollContainerRef={scrollContainerRef}
                          staggerMs={index * ILLUS_REVEAL_STAGGER_MS}
                          className="relative shrink-0 w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] bg-gradient-to-br from-muted/30 to-transparent rounded-lg"
                        >
                          <img
                            src={card.illus}
                            alt=""
                            width={1024}
                            height={1024}
                            className="absolute inset-0 h-full w-full rounded-lg object-contain object-center p-1 opacity-[0.95] dark:opacity-100 transition-transform duration-300 group-hover:scale-[1.05]"
                            loading="lazy"
                            decoding="async"
                          />
                        </ScrollRevealOnce>
                        <div className="flex min-h-0 min-w-0 flex-1 items-start gap-2.5">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                            <Check className="h-3 w-3 stroke-[2.5]" aria-hidden />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[14px] font-medium text-foreground leading-5">
                              {card.property}
                            </p>
                            <p className="text-[12px] italic leading-5 text-muted-foreground/70 mt-0.5">
                              {card.failure}
                            </p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>

                  <div className="flex justify-center pt-2">
                    <Link
                      to="/memory-guarantees"
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                    >
                      <Eye className="h-4 w-4 shrink-0" aria-hidden />
                      See all {MEMORY_GUARANTEE_ROWS.length} guarantees compared
                    </Link>
                  </div>
                </div>
              </div>
              <SectionEdgeIndicators sectionId="state-guarantees" />
            </FadeSection>
          </section>

          {/* Slide 6: Proof — quotes, stats, fleet/enterprise line */}
          <section id="proof" className={SLIDE_CLASS}>
            <FadeSection scrollContainerRef={scrollContainerRef}>
              <div className={SLIDE_INNER}>
                <div className="mx-auto max-w-4xl space-y-8 py-8 md:py-12">
                  <div className="space-y-2 text-center">
                    <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                      How it&rsquo;s used
                    </p>
                    <div className="flex justify-center">
                      <HeroProofStrip />
                    </div>
                  </div>

                  <blockquote className="flex gap-3 border-l-2 border-emerald-500/40 pl-4 md:pl-5 max-w-3xl mx-auto">
                    <Quote
                      className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500/40 md:h-6 md:w-6"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[17px] md:text-[19px] leading-8 text-foreground/90 italic">
                        Running daily for 5+ months across Claude Code, Cursor, ChatGPT, and CLI.
                        Same state graph from day one: every version preserved, every correction
                        traceable. Contacts evolve, contracts get amended, tasks close and reopen. I
                        ask my agents what changed on a deal since October or what I originally told
                        an investor three months ago. The memory compounds; nothing silently drifts.
                      </p>
                      <footer className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
                        <img
                          src={founderPhoto}
                          alt="Mark Hendrickson"
                          width={36}
                          height={36}
                          className="h-9 w-9 rounded-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-medium text-foreground/80">Mark Hendrickson</span>
                          <span aria-hidden="true" className="text-border">
                            &middot;
                          </span>
                          <span>Neotoma creator</span>
                          <span aria-hidden="true" className="text-border">
                            &middot;
                          </span>
                          <a
                            href="https://markmhendrickson.com/posts/what-my-agentic-stack-actually-does/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-600 no-underline hover:text-emerald-500 transition-colors dark:text-emerald-400 dark:hover:text-emerald-300"
                          >
                            Read the full post
                            <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        </div>
                      </footer>
                    </div>
                  </blockquote>

                  <div className="flex flex-wrap justify-center gap-x-6 gap-y-4 pt-2 text-center text-[13px] text-muted-foreground">
                    <div>
                      <span className="block text-[22px] font-semibold tracking-tight text-foreground">
                        1,100+
                      </span>
                      contacts
                    </div>
                    <div>
                      <span className="block text-[22px] font-semibold tracking-tight text-foreground">
                        16,000+
                      </span>
                      tasks
                    </div>
                    <div>
                      <span className="block text-[22px] font-semibold tracking-tight text-foreground">
                        900+
                      </span>
                      conversations
                    </div>
                    <div>
                      <span className="block text-[22px] font-semibold tracking-tight text-foreground">
                        2,000+
                      </span>
                      agent messages
                    </div>
                    <div>
                      <span className="block text-[22px] font-semibold tracking-tight text-foreground">
                        380+
                      </span>
                      entity types
                    </div>
                  </div>

                  {/* Fleet/enterprise signal line per Simon's feedback */}
                  <p className="text-center text-[13px] font-medium text-muted-foreground/80 pt-2">
                    From personal use to agent fleet infrastructure.
                  </p>

                  <HeroQuotesCarousel />
                </div>
              </div>
              <SectionEdgeIndicators sectionId="proof" />
            </FadeSection>
          </section>

          {/* Slide 7: Evaluate CTA */}
          <section id="evaluate" className={SLIDE_CLASS}>
            <FadeSection scrollContainerRef={scrollContainerRef}>
              <div className={SLIDE_INNER}>
                <div className="max-w-5xl mx-auto">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:gap-12 xl:gap-16 space-y-6 lg:space-y-0">
                    <div className="space-y-3 text-center lg:text-left flex flex-col items-center lg:items-start lg:flex-1 lg:min-w-0">
                      <img
                        src={heroEvaluateIllus}
                        alt="Neotoma evaluate page preview"
                        width={1536}
                        height={1024}
                        className="w-full max-w-[200px] sm:max-w-[240px] rounded-lg h-auto object-contain"
                        loading="lazy"
                        decoding="async"
                      />
                      <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                        Evaluate it
                      </p>
                      <h2 className={HOME_SECTION_H2_CLASS}>
                        Let your agent decide if Neotoma fits
                      </h2>
                      <p className="text-[15px] leading-7 text-muted-foreground max-w-lg">
                        Your agent can read the docs, inspect the evaluation criteria, and tell you
                        whether Neotoma fits your actual workflow before you install anything.
                      </p>
                      <p className="text-[13px] leading-6 text-muted-foreground/80 max-w-lg">
                        Copy this prompt into any AI agent. It reads the evaluation page, inspects
                        your context, and judges whether Neotoma fits.
                      </p>
                    </div>

                    <div className="lg:flex-1 lg:min-w-0">
                      <EvaluateSectionCta />
                    </div>
                  </div>
                  <div className="mt-12 lg:mt-14 flex w-full justify-center">
                    <HomeAgentToolChips compact />
                  </div>
                </div>
              </div>
              <SectionEdgeIndicators sectionId="evaluate" hideNext />
            </FadeSection>
          </section>

          {/* FAQ preview */}
          <section id="common-questions" className="relative w-full shrink-0 scroll-mt-12">
            <div className={SLIDE_INNER}>
              <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto">
                <h2 className="text-center text-[20px] sm:text-[21px] md:text-[22px] font-medium tracking-[-0.02em] leading-snug text-foreground">
                  {pack.siteSections.frequentlyAskedQuestions ?? "Frequently asked questions"}
                </h2>
                <div className="max-w-2xl mx-auto">
                  <div className="divide-y divide-border/40 rounded-xl border border-border/60 bg-card/30 px-4 py-1 sm:px-5">
                    {HOME_FAQ_PREVIEW_ITEMS.map((qa) => (
                      <details key={qa.q} className="group py-3 text-left first:pt-2">
                        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-normal leading-snug text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                          {qa.q}
                          <ChevronDown
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform group-open:rotate-180"
                            aria-hidden
                          />
                        </summary>
                        <p className="mt-2.5 pl-0 text-[12px] leading-6 text-muted-foreground">
                          {qa.a}
                        </p>
                      </details>
                    ))}
                  </div>
                  <p className="mt-6 text-center text-[12px] text-muted-foreground">
                    <Link
                      to="/faq"
                      className="text-muted-foreground underline decoration-border/50 underline-offset-[3px] transition-colors hover:text-foreground hover:decoration-foreground/30"
                    >
                      More questions? See the FAQ
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </section>
        </main>

        <div
          id="site-footer-alt"
          className="w-full shrink-0 scroll-mt-12 md:snap-start md:snap-always print:[scroll-snap-align:unset]"
        >
          <SiteTailpiece />
        </div>
      </div>

      <div
        className={`print:hidden fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.12)] backdrop-blur-md transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none supports-[backdrop-filter]:bg-background/85 dark:shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.35)] ${
          showEvaluateScrollBanner
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-full opacity-0"
        }`}
        role="region"
        aria-label={`${pack.homeHero.ctaEvaluateWithAgent}. ${pack.homeHero.ctaMeetCreator}`}
        aria-hidden={!showEvaluateScrollBanner}
      >
        {showEvaluateScrollBanner ? (
          <div className="mx-auto flex w-full max-w-6xl justify-center px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] md:px-12 lg:px-16">
            <div className="flex w-full flex-col items-center md:w-auto">
              <div className="flex w-full flex-col gap-2 rounded-xl border border-border/80 bg-background p-2 shadow-sm md:w-max md:max-w-full md:flex-row md:flex-wrap md:justify-center">
                <a
                  href={localizePath("/evaluate", locale)}
                  className={`${HOME_SCROLL_BANNER_SPLIT_CELL_CLASS} ${HOME_SCROLL_BANNER_PRIMARY_CELL_CLASS}`}
                  onClick={(e) => {
                    sendCtaClick("hero_evaluate_scroll_banner");
                    if (isModifiedClick(e)) return;
                    e.preventDefault();
                    navigate(localizePath("/evaluate", locale));
                  }}
                >
                  <MessageSquare className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{pack.homeHero.ctaEvaluateWithAgent}</span>
                </a>
                <Link
                  to={localizePath("/meet", locale)}
                  className={cn(
                    HOME_SCROLL_BANNER_SPLIT_CELL_CLASS,
                    HOME_SCROLL_BANNER_SECONDARY_CELL_CLASS,
                    "hidden md:flex"
                  )}
                  onClick={() => sendCtaClick("meet_with_creator_banner")}
                >
                  <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{pack.homeHero.ctaMeetCreator}</span>
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

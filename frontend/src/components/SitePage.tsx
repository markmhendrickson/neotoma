import {
  CalendarClock,
  Scale,
  Bot,
  Brain,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  Eye,
  FileCode,
  Fingerprint,
  GitBranch,
  Globe2,
  HardHat,
  Info,
  ListChecks,
  Network,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Mail,
  MessageSquare,
  Users,
  Waypoints,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SiClaude, SiOpenai } from "react-icons/si";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  LEARN_MORE_GUARANTEES_CARD,
  LEARN_MORE_POSTS,
  LEARN_MORE_REPO_CARD,
  SITE_CODE_SNIPPETS,
  REPO_RELEASES_COUNT,
  REPO_VERSION,
  MCP_ACTIONS_TABLE,
  CLI_COMMANDS_TABLE,
  FUNCTIONALITY_MATRIX,
  MEMORY_GUARANTEE_ROWS,
  MEMORY_MODEL_VENDORS,
  THREE_FOUNDATIONS,
  type LearnMoreCardItem,
} from "../site/site_data";
import { useCopyFeedback } from "../lib/copy_feedback";
import { copyTextToClipboard } from "../lib/copy_to_clipboard";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { GuaranteeCell, MemoryGuaranteesTable } from "./MemoryGuaranteesTable";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { SeoHead } from "./SeoHead";
import { SectionDotNav } from "./SectionDotNav";
import { CursorIcon } from "./icons/CursorIcon";
import { OpenClawIcon } from "./icons/OpenClawIcon";
import { StateFlowDiagram } from "./illustrations/StateFlowDiagram";
import { VERTICALS } from "./subpages/VerticalsIndexPage";
import interfacesOptionBRest from "@/assets/images/interfaces/interfaces-option-b-rest.png";
import interfacesOptionBMcp from "@/assets/images/interfaces/interfaces-option-b-mcp.png";
import interfacesOptionBCli from "@/assets/images/interfaces/interfaces-option-b-cli.png";
import learnMoreDocumentationImage from "@/assets/images/interfaces/learn_more_documentation.svg";
import learnMoreDeepDiveImage from "@/assets/images/interfaces/learn_more_deep_dive.svg";
import { useLocale } from "@/i18n/LocaleContext";
import { sendCtaClick, sendOutboundClick } from "@/utils/analytics";
interface SitePageProps {
  staticMode?: boolean;
}

const DOT_NAV_SECTIONS = [
  { id: "intro", label: "Intro" },
  { id: "outcomes", label: "Before / After" },
  { id: "memory-guarantees", label: "Guarantees" },
  { id: "evaluate", label: "Evaluate" },
  { id: "install", label: "Install" },
  { id: "inspect", label: "Inspect" },
  { id: "architecture", label: "Architecture" },
  { id: "use-cases", label: "Use cases" },
  { id: "interfaces", label: "Interfaces" },
  { id: "learn-more", label: "Learn More" },
];
const DOT_NAV_SECTION_IDS = new Set(DOT_NAV_SECTIONS.map((section) => section.id));
const SECTION_ORDER = DOT_NAV_SECTIONS.map((section) => section.id);

function getLocalizedDotNavSections(pack: ReturnType<typeof useLocale>["pack"]) {
  return [
    { id: "intro", label: pack.siteSections.intro },
    { id: "outcomes", label: pack.siteSections.beforeAfter },
    { id: "memory-guarantees", label: pack.siteSections.guarantees },
    { id: "evaluate", label: pack.siteSections.evaluate },
    { id: "install", label: pack.siteSections.install },
    { id: "inspect", label: pack.siteSections.inspect },
    { id: "architecture", label: pack.siteSections.architecture },
    { id: "use-cases", label: pack.siteSections.useCases },
    { id: "interfaces", label: pack.siteSections.interfaces },
    { id: "learn-more", label: pack.siteSections.learnMore },
  ];
}

const FOUNDATION_ICONS: Record<string, LucideIcon> = { ShieldCheck, Fingerprint, Globe2 };

const LEARN_MORE_DOCUMENTATION_CARD: LearnMoreCardItem = {
  label: "Documentation",
  title: "All documentation",
  description:
    "Reference, integration guides, use cases, and architecture, organized by category.",
  href: "/docs",
  imageUrl: learnMoreDocumentationImage,
  ctaLabel: "Browse docs →",
};

const LEARN_MORE_GUARANTEES_CARD_WITH_IMAGE: LearnMoreCardItem = {
  ...LEARN_MORE_GUARANTEES_CARD,
  imageUrl: learnMoreDeepDiveImage,
};

const MOBILE_OUTCOME_PREVIEW_COUNT = 2;
const MOBILE_GUARANTEE_PREVIEW_COUNT = 4;

function sanitizeCodeForCopy(rawCode: string): string {
  return rawCode
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("//")) {
        return "";
      }
      const commentIndex = line.indexOf("#");
      if (commentIndex >= 0 && !line.trimStart().startsWith('"')) {
        return line.slice(0, commentIndex).trimEnd();
      }
      return line;
    })
    .filter((line) => line !== "")
    .join("\n");
}

function CodeBlock({
  code,
  staticMode = false,
  previewLineCount,
}: {
  code: string;
  staticMode?: boolean;
  previewLineCount?: number;
}) {
  const { dict } = useLocale();
  const [copied, markCopied] = useCopyFeedback(`site-page:${code}`, 0);
  const [showFullCode, setShowFullCode] = useState(false);
  const lines = code.split("\n");
  const canExpand =
    !staticMode &&
    typeof previewLineCount === "number" &&
    previewLineCount > 0 &&
    lines.length > previewLineCount;
  const displayCode =
    canExpand && !showFullCode ? `${lines.slice(0, previewLineCount).join("\n")}\n...` : code;

  const onCopy = async () => {
    const normalizedCode = sanitizeCodeForCopy(code);
    markCopied();
    await copyTextToClipboard(normalizedCode);
  };

  return (
    <div className="mb-4 min-w-0">
      <pre
        className={`rounded-lg border code-block-palette p-4 overflow-x-auto overflow-y-auto font-mono text-[14px] whitespace-pre-wrap break-words max-w-full min-w-0 ${showFullCode ? "" : "max-h-60 md:max-h-none"}`}
      >
        {!staticMode ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="float-right relative z-10 ml-2 mb-2 min-w-[88px] h-8 justify-center gap-1.5 shrink-0 border-emerald-600 bg-emerald-600 px-2.5 text-white shadow-sm shadow-emerald-600/30 hover:border-emerald-500 hover:bg-emerald-500 hover:text-white focus-visible:ring-emerald-500 dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950 dark:shadow-emerald-500/30 dark:hover:border-emerald-400 dark:hover:bg-emerald-400 dark:hover:text-emerald-950 after:text-[11px] after:font-semibold after:tracking-wide after:content-[attr(aria-label)]"
            aria-label={copied ? dict.copied : dict.copy}
            onClick={onCopy}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        ) : null}
        <code>{displayCode}</code>
      </pre>
      {canExpand ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 px-2 h-8 text-[12px] text-muted-foreground hover:text-foreground"
          onClick={() => setShowFullCode((prev) => !prev)}
          aria-label={showFullCode ? dict.showLess : dict.showMore}
        >
          {showFullCode ? (
            <>
              <ChevronUp className="h-3.5 w-3.5 mr-1" />
              {dict.showLess}
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5 mr-1" />
              {dict.showMore}
            </>
          )}
        </Button>
      ) : null}
    </div>
  );
}

function LearnMoreCard({ item }: { item: LearnMoreCardItem }) {
  const isExternal = item.href.startsWith("http");
  const content = (
    <Alert className="flex flex-col md:flex-row items-stretch gap-4 cursor-pointer h-full no-underline bg-white dark:bg-card border-border">
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt=""
          className="hidden md:block w-full md:w-[120px] md:h-[120px] md:shrink-0 rounded object-cover"
        />
      )}
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <AlertTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {item.label}
        </AlertTitle>
        <AlertDescription className="py-px">
          <span className="font-medium text-foreground">{item.title}</span>
          {item.description && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{item.description}</p>
          )}
          <span className="mt-1 inline-block text-sm font-medium text-foreground/80">
            {item.ctaLabel ?? "Read more →"}
          </span>
        </AlertDescription>
      </div>
    </Alert>
  );
  const linkClassName =
    "block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-lg [&:hover]:opacity-95 transition-opacity no-underline";
  return isExternal ? (
    <a
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClassName}
      onClick={() => sendOutboundClick(item.href, item.title)}
    >
      {content}
    </a>
  ) : (
    <Link to={item.href} className={linkClassName}>
      {content}
    </Link>
  );
}

const GET_STARTED_SIMULATION_STEPS = [
  {
    role: "system" as const,
    text: "Install and initialize Neotoma per the instructions.",
    detail: undefined,
  },
  {
    role: "agent" as const,
    text: "Installed and initialized. Scanning context and platform memory for records to migrate.",
    detail: "install complete · init complete",
  },
  {
    role: "agent" as const,
    text: "Found 102 candidate records from multiple sources:",
    detail: "alerts · runbooks · incident timeline · deployment logs · session context",
  },
  {
    role: "agent" as const,
    text: "service · payments-api + 18 more · from deployment logs, repo metadata\nincident · sev-2 latency regression + 13 more · from incident timeline, notes\nrunbook · rollback + failover + 15 more · from docs, on-call handoff\nchange · deploy #4421 + 12 more · from CI/CD events, release history\nalert · p95 latency breach + 27 more · from observability stream, paging\noncall_contact · Priya Nair + 11 more · from rotations, escalation policy",
    detail: "preview · approve all / select / skip",
  },
  {
    role: "system" as const,
    text: "Approve all.",
    detail: undefined,
  },
  {
    role: "agent" as const,
    text: "\u2713 Stored 19 services\n\u2713 Stored 14 incidents\n\u2713 Stored 16 runbooks\n\u2713 Stored 13 changes\n\u2713 Stored 28 alerts\n\u2713 Stored 12 on-call contacts\n102 entities linked. Onboarding complete.",
    detail: "102 entities \u00B7 102 observations \u00B7 ready",
  },
] as const;

const GET_STARTED_STEP_MS = 2800;
const GET_STARTED_HOLD_MS = 5000;
const GET_STARTED_TYPING_DELAY_MS = 20;
const GET_STARTED_TOTAL_MS =
  GET_STARTED_SIMULATION_STEPS.length * GET_STARTED_STEP_MS + GET_STARTED_HOLD_MS;

function GetStartedSimulationVisual({ className = "" }: { className?: string }) {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const wasInViewRef = useRef(false);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const nowInView = entry.isIntersecting;
        setIsInView(nowInView);
        if (nowInView && !wasInViewRef.current) {
          setElapsed(0);
          setPlaying(true);
        }
        wasInViewRef.current = nowInView;
      },
      { threshold: 0.35 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || dragging || !isInView) return;
    let prev = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.max(0, now - prev);
      prev = now;
      setElapsed((prevElapsed) => {
        const next = prevElapsed + dt;
        return next >= GET_STARTED_TOTAL_MS ? 0 : next;
      });
    }, 80);
    return () => window.clearInterval(id);
  }, [playing, dragging, isInView]);

  const seekTo = useCallback((clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next =
      Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * GET_STARTED_TOTAL_MS;
    setElapsed(next);
  }, []);

  const onBarPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      barRef.current?.setPointerCapture(e.pointerId);
      setDragging(true);
      setPlaying(false);
      seekTo(e.clientX);
    },
    [seekTo]
  );

  const onBarPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      seekTo(e.clientX);
    },
    [dragging, seekTo]
  );

  const onBarPointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  const progress = elapsed / GET_STARTED_TOTAL_MS;

  const activeWindowMs = GET_STARTED_SIMULATION_STEPS.length * GET_STARTED_STEP_MS;
  const withinActiveWindow = elapsed < activeWindowMs;
  const activeStepIndex = withinActiveWindow
    ? Math.min(GET_STARTED_SIMULATION_STEPS.length - 1, Math.floor(elapsed / GET_STARTED_STEP_MS))
    : GET_STARTED_SIMULATION_STEPS.length - 1;
  const stepElapsed = withinActiveWindow ? elapsed - activeStepIndex * GET_STARTED_STEP_MS : 0;
  const visibleStepCount = activeStepIndex + 1;
  const typingStepIndex = withinActiveWindow ? activeStepIndex : -1;
  const typingStep = typingStepIndex >= 0 ? GET_STARTED_SIMULATION_STEPS[typingStepIndex] : null;
  const composerShowsUserTyping = !!typingStep && typingStep.role === "system" && stepElapsed > 40;
  const animateComposerTyping = composerShowsUserTyping && playing && !dragging;
  const composerText = composerShowsUserTyping ? typingStep.text : "";
  const composerDelayMs = GET_STARTED_TYPING_DELAY_MS;

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "auto" });
  }, [visibleStepCount, elapsed]);

  return (
    <div
      ref={viewportRef}
      className={`relative flex h-[360px] min-h-[320px] flex-col overflow-hidden rounded-xl border border-emerald-500/25 bg-gradient-to-b from-white via-slate-50 to-emerald-50/30 p-3 shadow-[0_14px_50px_rgba(0,0,0,0.08)] sm:h-[400px] sm:min-h-[360px] lg:h-[460px] lg:min-h-[460px] dark:border-emerald-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_14px_50px_rgba(0,0,0,0.45)] ${className}`}
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.12),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.08),transparent_35%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.18),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.12),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(to_bottom,rgba(100,116,139,0.2)_1px,transparent_1px)] [background-size:100%_10px] dark:opacity-20 dark:[background-image:linear-gradient(to_bottom,rgba(148,163,184,0.28)_1px,transparent_1px)]" />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-emerald-500/30 bg-white/95 dark:border-emerald-400/25 dark:bg-slate-950/90">
        <div className="flex shrink-0 items-center justify-between border-b border-emerald-500/25 px-3 py-2 text-[10px] uppercase tracking-wide text-emerald-800/90 dark:border-emerald-400/20 dark:text-emerald-200/70">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-400/75 dark:bg-rose-500/80" />
            <span className="h-2 w-2 rounded-full bg-amber-300/75 dark:bg-amber-500/80" />
            <span className="h-2 w-2 rounded-full bg-emerald-400/75 dark:bg-emerald-500/80" />
          </div>
          <span>agent session</span>
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <div className="space-y-1.5">
            {GET_STARTED_SIMULATION_STEPS.slice(0, visibleStepCount).map((step, index) => {
              const isTypingStep = index === typingStepIndex;
              const hideUserBubbleWhileTyping = isTypingStep && step.role === "system";
              const age = visibleStepCount - 1 - index;
              const opacity = Math.max(0.28, 1 - age * 0.14);
              const typeDelayMs = GET_STARTED_TYPING_DELAY_MS;
              const showTypingDetail =
                !!step.detail && isTypingStep && stepElapsed > GET_STARTED_STEP_MS * 0.66;

              if (hideUserBubbleWhileTyping) {
                return null;
              }

              return (
                <div
                  key={index}
                  className={`flex transition-all duration-300 ${
                    step.role === "system" ? "justify-end" : "justify-start"
                  }`}
                  style={{ opacity }}
                >
                  <div
                    className={`font-mono text-[11px] leading-4 ${
                      step.role === "system"
                        ? "w-fit max-w-[88%] rounded-md border border-slate-300 bg-slate-200 px-2.5 py-1.5 text-right text-slate-800 shadow-sm dark:border-slate-600/80 dark:bg-slate-900 dark:text-slate-200"
                        : "w-full border-l-2 border-emerald-500/45 px-2 py-1 text-emerald-900 dark:border-emerald-400/55 dark:text-emerald-100"
                    }`}
                  >
                    {isTypingStep ? (
                      <p className="whitespace-pre-line">
                        <TypewriterBadge text={step.text} delayMs={typeDelayMs} />
                        <span className="ml-0.5 inline-block h-3 w-[1px] animate-pulse bg-current align-middle opacity-70" />
                      </p>
                    ) : step.text.includes("\n") ? (
                      <ul className="list-none pl-0 space-y-0.5">
                        {step.text.split("\n").map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>{step.text}</p>
                    )}
                    {step.detail && !isTypingStep && (
                      <p className="mt-0.5 text-[9px] text-current/50">{step.detail}</p>
                    )}
                    {showTypingDetail && (
                      <p className="mt-0.5 text-[9px] text-current/45">
                        <TypewriterBadge
                          key={`install-detail-${typingStepIndex}`}
                          text={step.detail ?? ""}
                          delayMs={GET_STARTED_TYPING_DELAY_MS}
                        />
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-auto shrink-0 px-2 pb-1 pt-1">
          <div className="rounded-md border border-emerald-400/40 bg-slate-100/95 p-1.5 shadow-sm shadow-emerald-500/10 dark:border-emerald-400/25 dark:bg-slate-900/95 dark:shadow-emerald-500/10">
            <div className="flex h-8 items-center rounded border border-emerald-400/40 bg-white px-2 font-mono text-[11px] leading-4 text-black dark:border-emerald-400/25 dark:bg-slate-950 dark:text-white">
              <span className="mr-1 text-black/70 dark:text-white/70">$</span>
              <span className={composerText ? "" : "text-black/50 dark:text-white/50"}>
                {animateComposerTyping ? (
                  <TypewriterBadge
                    key={`install-user-${typingStepIndex}`}
                    text={composerText}
                    delayMs={composerDelayMs}
                  />
                ) : composerShowsUserTyping ? (
                  composerText
                ) : (
                  "\u00A0"
                )}
              </span>
              {animateComposerTyping && (
                <span className="ml-0.5 inline-block w-[1px] animate-pulse text-black dark:text-white">
                  |
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0 px-3 pb-2 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <rect x="1" y="1" width="3" height="8" rx="0.5" />
                  <rect x="6" y="1" width="3" height="8" rx="0.5" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <polygon points="2,1 9,5 2,9" />
                </svg>
              )}
            </button>
            <div
              ref={barRef}
              className="relative h-5 flex-1 cursor-pointer touch-none select-none"
              onPointerDown={onBarPointerDown}
              onPointerMove={onBarPointerMove}
              onPointerUp={onBarPointerUp}
            >
              <div className="pointer-events-none absolute inset-y-0 left-0 right-0 my-auto h-1.5 overflow-hidden rounded-full bg-slate-200/60 dark:bg-slate-700/50">
                <div
                  className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <div
                className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow transition-colors duration-300 dark:border-slate-900 bg-emerald-500 dark:bg-emerald-400"
                style={{ left: `${progress * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Agent memory scenarios: failure (without Neotoma) and success (with Neotoma) variants.
 *  First 4 map to Tier 1 data types from what_to_store.md:
 *  [0] Financial facts, [1] People & relationships, [2] Commitments & tasks, [3] Events & decisions */
const SCENARIOS = [
  {
    left: "What were the terms on the Kline contract?",
    fail: "No contract found for Kline.",
    succeed: "Net-30, signed Oct 12, auto-renews Q1.",
    version: "contract\u00B7v2",
  },
  {
    left: "Use John Smith from legal on this thread.",
    fail: "Sending to Lee from sales.",
    succeed: "Sending to John Smith from legal.",
    version: "person\u00B7v4",
  },
  {
    left: "Remind me to submit payroll Friday.",
    fail: "Reminder set for last Friday's payroll task.",
    succeed: "Reminder set for this Friday.",
    version: "task\u00B7v5",
  },
  {
    left: "What changed after yesterday's incident?",
    fail: "No known change after incident close.",
    succeed: "2 changes logged after incident close.",
    version: "event\u00B7v4",
  },
  {
    left: "Continue where we left off yesterday.",
    fail: "Resuming based on thread from two weeks ago.",
    succeed: "Resuming yesterday's thread.",
    version: "conversation\u00B7v7",
  },
  {
    left: "Ship to the updated Austin office.",
    fail: "Shipment queued for 210 2nd St.",
    succeed: "Shipment queued for 900 Congress Ave.",
    version: "address\u00B7v3",
  },
  {
    left: "Which company owns this contract?",
    fail: "Owned by Beta LLC.",
    succeed: "Owned by Apex LLC.",
    version: "contract\u00B7v2",
  },
  {
    left: "Was invoice 884 paid?",
    fail: "Unpaid as of Feb 2.",
    succeed: "Paid Feb 14.",
    version: "txn\u00B7v3",
  },
  {
    left: "Show all open work for Project Atlas.",
    fail: "Showing 18 open items.",
    succeed: "Showing 7 open items.",
    version: "project\u00B7v5",
  },
  {
    left: "Use Priya's new work email.",
    fail: "Sent to priya@oldco.com.",
    succeed: "Sent to priya@newco.io.",
    version: "contact\u00B7v3",
  },
  {
    left: "Where is the handoff meeting?",
    fail: "At the old office on 3rd Ave.",
    succeed: "At 118 W 6th St.",
    version: "location\u00B7v2",
  },
];

const FAILURE_CARDS: {
  category: string;
  Icon: LucideIcon;
  title: string;
  description: string;
  scenarioIndex: number;
}[] = [
  {
    category: "Financial facts",
    Icon: Receipt,
    title: "Conflicting records, silent data loss",
    description:
      "Two agents read different versions of the same contract. One quoted current terms; the other used a stale snapshot. Neither knew the other existed.",
    scenarioIndex: 0,
  },
  {
    category: "People & relationships",
    Icon: Users,
    title: "Stale contact, wrong recipient",
    description:
      "The agent used an outdated org chart. The message went to someone who left the project weeks ago, and no versioned record flagged the change.",
    scenarioIndex: 1,
  },
  {
    category: "Commitments & tasks",
    Icon: ListChecks,
    title: "Forgotten deadline, missed obligation",
    description:
      "A commitment from a prior session was never durably recorded. The agent set a reminder against an old task: wrong date, wrong deliverable.",
    scenarioIndex: 2,
  },
  {
    category: "Events & decisions",
    Icon: CalendarClock,
    title: "Irreproducible decision, no audit trail",
    description:
      "A decision was made based on specific inputs. When the same question came up later, the agent produced a different answer, and no one could explain why.",
    scenarioIndex: 3,
  },
];

const ANIM_SCENARIOS = SCENARIOS.slice(0, 4);
const SCENE_MS = 5000;
const TYPE_MS = 1700;
const THINK_MS = 900;
const REPLY_MS = 2000;
const TRANS_FADE_MS = 1000;
const TRANS_DELAY_MS = 1200;
const TRANS_MS = TRANS_FADE_MS + TRANS_DELAY_MS + TRANS_FADE_MS;
const PHASE_MS = ANIM_SCENARIOS.length * SCENE_MS;
const END_DELAY_MS = TRANS_DELAY_MS;
const TOTAL_MS = PHASE_MS + TRANS_MS + PHASE_MS + END_DELAY_MS;
const MODE_SWITCH_MS = PHASE_MS + TRANS_FADE_MS + TRANS_DELAY_MS;
const BEFORE_RATIO = MODE_SWITCH_MS / TOTAL_MS;

type IllustMsg = {
  key: string;
  role: "human" | "agent" | "label";
  text: string;
  thinking: boolean;
  fail: boolean;
  version?: string;
};

function TypewriterBadge({ text, delayMs = 35 }: { text: string; delayMs?: number }) {
  const [visible, setVisible] = useState("");
  useEffect(() => {
    if (!text) return;
    setVisible("");
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setVisible(text.slice(0, i));
      if (i >= text.length) clearInterval(t);
    }, delayMs);
    return () => clearInterval(t);
  }, [text, delayMs]);
  return <>{visible}</>;
}

function buildPhaseMessages(phaseElapsed: number, fail: boolean, prefix: string): IllustMsg[] {
  const msgs: IllustMsg[] = [];
  for (let i = 0; i < ANIM_SCENARIOS.length; i++) {
    const se = phaseElapsed - i * SCENE_MS;
    if (se < 0) break;
    const s = ANIM_SCENARIOS[i];
    if (se >= TYPE_MS) {
      msgs.push({ key: `${prefix}-h-${i}`, role: "human", text: s.left, thinking: false, fail });
      const replyStart = TYPE_MS + THINK_MS;
      const resp = fail ? s.fail : s.succeed;
      const showReply = se >= replyStart;
      msgs.push({
        key: `${prefix}-a-${i}`,
        role: "agent",
        text: showReply ? resp : "",
        thinking: se >= TYPE_MS && se < replyStart,
        fail,
        version: !fail && showReply ? s.version : undefined,
      });
    }
  }
  return msgs;
}

function ForgetfulAgentIllustration({ className = "" }: { className?: string }) {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const wasInViewRef = useRef(false);
  const prevElapsedWithinRunRef = useRef(0);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const nowInView = entry.isIntersecting;
        setIsInView(nowInView);
        if (nowInView && !wasInViewRef.current) {
          prevElapsedWithinRunRef.current = 0;
          setElapsed(0);
          setPlaying(true);
        }
        wasInViewRef.current = nowInView;
      },
      { threshold: 0.35 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || dragging || !isInView) return;
    let prev = performance.now();
    const intervalId = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.max(0, now - prev);
      prev = now;
      setElapsed((p) => {
        const n = p + dt;
        if (n >= TOTAL_MS) {
          prevElapsedWithinRunRef.current = 0;
          return 0;
        }
        const monotonic = Math.max(n, prevElapsedWithinRunRef.current);
        prevElapsedWithinRunRef.current = monotonic;
        return monotonic;
      });
    }, 80);
    return () => window.clearInterval(intervalId);
  }, [playing, dragging, isInView]);

  const isBefore = elapsed < PHASE_MS;
  const isAfter = elapsed >= PHASE_MS + TRANS_MS;
  const fadeInStart = PHASE_MS + TRANS_FADE_MS + TRANS_DELAY_MS;
  const failMode = isBefore || (!isAfter && elapsed < fadeInStart);

  const contentOpacity =
    !isBefore && !isAfter
      ? elapsed < fadeInStart
        ? 1
        : Math.min(1, (elapsed - fadeInStart) / TRANS_FADE_MS)
      : 1;

  let msgs: IllustMsg[] = [];
  if (isBefore) {
    msgs = [...buildPhaseMessages(elapsed, true, "b")];
  } else if (!isAfter) {
    if (elapsed < fadeInStart) {
      msgs = [...buildPhaseMessages(PHASE_MS, true, "b")];
    } else {
      msgs = [
        {
          key: "lbl-a",
          role: "label",
          text: "with state layer",
          thinking: false,
          fail: false,
        },
      ];
    }
  } else {
    const afterElapsed = Math.min(elapsed - PHASE_MS - TRANS_MS, PHASE_MS);
    msgs = [
      { key: "lbl-a", role: "label", text: "with state layer", thinking: false, fail: false },
      ...buildPhaseMessages(afterElapsed, false, "a"),
    ];
  }

  let composerText = "";
  let composerTyping = false;
  let composerTypeKey = "idle";
  let composerDelayMs = 40;
  if (isBefore) {
    const idx = Math.min(Math.floor(elapsed / SCENE_MS), ANIM_SCENARIOS.length - 1);
    const se = elapsed - idx * SCENE_MS;
    if (se < TYPE_MS) {
      composerText = ANIM_SCENARIOS[idx].left;
      composerTyping = true;
      composerTypeKey = `b-${idx}`;
      composerDelayMs = Math.max(14, Math.floor(TYPE_MS / Math.max(1, composerText.length)));
    }
  } else if (isAfter) {
    const ae = Math.min(elapsed - PHASE_MS - TRANS_MS, PHASE_MS);
    const idx = Math.min(Math.floor(ae / SCENE_MS), ANIM_SCENARIOS.length - 1);
    const se = ae - idx * SCENE_MS;
    if (se < TYPE_MS) {
      composerText = ANIM_SCENARIOS[idx].left;
      composerTyping = true;
      composerTypeKey = `a-${idx}`;
      composerDelayMs = Math.max(14, Math.floor(TYPE_MS / Math.max(1, composerText.length)));
    }
  }

  useEffect(() => {
    // Avoid queued smooth-scroll animations that can cause visible chat jitter.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
  }, [msgs.length]);

  const seekTo = useCallback((clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * TOTAL_MS;
    prevElapsedWithinRunRef.current = next;
    setElapsed(next);
  }, []);

  const onBarPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      barRef.current?.setPointerCapture(e.pointerId);
      setDragging(true);
      setPlaying(false);
      seekTo(e.clientX);
    },
    [seekTo]
  );

  const onBarPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      seekTo(e.clientX);
    },
    [dragging, seekTo]
  );

  const onBarPointerUp = useCallback(() => {
    setDragging(false);
    // Keep paused after scrub; user can press Play to resume
  }, []);

  const progress = elapsed / TOTAL_MS;

  return (
    <div
      ref={viewportRef}
      className={`relative h-[400px] overflow-hidden rounded-xl p-3 transition-colors duration-500 md:h-[500px] ${
        failMode
          ? "border border-rose-500/25 bg-gradient-to-b from-white via-slate-50 to-rose-50/30 shadow-[0_14px_50px_rgba(0,0,0,0.08)] dark:border-rose-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_14px_50px_rgba(0,0,0,0.45)]"
          : "border border-emerald-500/25 bg-gradient-to-b from-white via-slate-50 to-emerald-50/30 shadow-[0_14px_50px_rgba(0,0,0,0.08)] dark:border-emerald-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_14px_50px_rgba(0,0,0,0.45)]"
      } ${className}`}
    >
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
          failMode
            ? "bg-[radial-gradient(circle_at_20%_20%,rgba(244,63,94,0.12),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(239,68,68,0.08),transparent_35%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(244,63,94,0.18),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(239,68,68,0.12),transparent_35%)]"
            : "bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.12),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.08),transparent_35%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.18),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.12),transparent_35%)]"
        }`}
      />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(to_bottom,rgba(100,116,139,0.2)_1px,transparent_1px)] [background-size:100%_10px] dark:opacity-20 dark:[background-image:linear-gradient(to_bottom,rgba(148,163,184,0.28)_1px,transparent_1px)]" />
      <div
        className={`relative flex h-full flex-col overflow-hidden rounded-lg transition-colors duration-500 ${
          failMode
            ? "border border-rose-500/30 bg-white/95 dark:border-rose-400/25 dark:bg-slate-950/90"
            : "border border-emerald-500/30 bg-white/95 dark:border-emerald-400/25 dark:bg-slate-950/90"
        }`}
      >
        <div
          className={`grid shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b px-3 py-2 text-[10px] uppercase tracking-wide transition-colors duration-500 ${
            failMode
              ? "border-rose-500/25 text-rose-800/90 dark:border-rose-400/20 dark:text-rose-200/70"
              : "border-emerald-500/25 text-emerald-800/90 dark:border-emerald-400/20 dark:text-emerald-200/70"
          }`}
        >
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-400/75 dark:bg-rose-500/80" />
            <span className="h-2 w-2 rounded-full bg-amber-300/75 dark:bg-amber-500/80" />
            <span className="h-2 w-2 rounded-full bg-emerald-400/75 dark:bg-emerald-500/80" />
          </div>
          <span className="col-span-3 sm:col-span-1 text-center">
            agent session · {failMode ? "without state layer" : "with state layer"}
          </span>
          <div className="hidden sm:block" />
        </div>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto transition-opacity duration-300"
          style={{ opacity: contentOpacity }}
        >
          <div className="flex min-h-full flex-col justify-end gap-2 px-2 py-2 pb-2">
            {msgs.map((m, idx) => {
              const age = msgs.length - 1 - idx;
              const opacity = Math.max(0.22, 1 - age * 0.13);

              if (m.role === "label") {
                return (
                  <div key={m.key} className="flex justify-center py-0.5" style={{ opacity }}>
                    <span
                      className={`font-mono text-[8px] uppercase tracking-wider ${
                        m.fail
                          ? "text-rose-500/60 dark:text-rose-400/60"
                          : "text-emerald-500/60 dark:text-emerald-400/60"
                      }`}
                    >
                      · {m.text} ·
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={m.key}
                  className={`flex ${m.role === "human" ? "justify-end" : "justify-start"}`}
                  style={{ opacity }}
                >
                  <div
                    className={`font-mono text-[11px] ${
                      m.role === "human"
                        ? "w-fit max-w-[88%] rounded-md border border-slate-300 bg-slate-200 px-2.5 py-1.5 text-right text-slate-800 shadow-sm dark:border-slate-600/80 dark:bg-slate-900 dark:text-slate-200"
                        : m.fail
                          ? "w-full border-l-2 border-rose-500/45 px-2 py-1 text-rose-900 dark:border-rose-400/55 dark:text-rose-100"
                          : "w-full border-l-2 border-emerald-500/45 px-2 py-1 text-emerald-900 dark:border-emerald-400/55 dark:text-emerald-100"
                    }`}
                  >
                    {m.thinking ? (
                      <p
                        className={`flex items-center gap-1 leading-4 ${
                          m.fail
                            ? "text-rose-600/90 dark:text-rose-200/70"
                            : "text-emerald-600/90 dark:text-emerald-200/70"
                        }`}
                      >
                        {[0, 150, 300].map((d) => (
                          <span
                            key={d}
                            className={`h-1 w-1 rounded-full animate-bounce [animation-delay:${d}ms] ${
                              m.fail
                                ? "bg-rose-600 dark:bg-rose-300/80"
                                : "bg-emerald-600 dark:bg-emerald-300/80"
                            }`}
                          />
                        ))}
                      </p>
                    ) : (
                      <p className="leading-4">
                        <span>
                          {m.role === "human" ? m.text || "\u00A0" : m.text ? null : "\u00A0"}
                        </span>
                        {m.role === "agent" && m.text ? (
                          <TypewriterBadge text={m.text} delayMs={18} />
                        ) : null}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-9 h-10 bg-gradient-to-b from-white to-transparent dark:from-slate-950 dark:to-transparent" />
        <div className="shrink-0 px-2 pb-1 pt-1">
          <div
            className={`rounded-md border p-1.5 shadow-sm transition-colors duration-500 ${
              failMode
                ? "border-rose-400/40 bg-slate-100/95 shadow-rose-500/15 dark:border-rose-400/25 dark:bg-slate-900/95 dark:shadow-rose-500/10"
                : "border-emerald-400/40 bg-slate-100/95 shadow-emerald-500/15 dark:border-emerald-400/25 dark:bg-slate-900/95 dark:shadow-emerald-500/10"
            }`}
          >
            <div
              className={`flex h-8 items-center rounded border bg-white px-2 font-mono text-[11px] leading-4 text-black dark:text-white transition-colors duration-500 dark:bg-slate-950 ${
                failMode
                  ? "border-rose-400/40 dark:border-rose-400/25"
                  : "border-emerald-400/40 dark:border-emerald-400/25"
              }`}
            >
              <span className="mr-1 text-black/70 dark:text-white/70">$</span>
              <span className={composerText ? "" : "text-black/50 dark:text-white/50"}>
                {composerTyping ? (
                  <TypewriterBadge
                    key={composerTypeKey}
                    text={composerText}
                    delayMs={composerDelayMs}
                  />
                ) : (
                  composerText || "\u00A0"
                )}
              </span>
              {composerTyping && (
                <span className="ml-0.5 inline-block w-[1px] animate-pulse text-black dark:text-white">
                  |
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0 px-3 pb-2 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <rect x="1" y="1" width="3" height="8" rx="0.5" />
                  <rect x="6" y="1" width="3" height="8" rx="0.5" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <polygon points="2,1 9,5 2,9" />
                </svg>
              )}
            </button>
            <div
              ref={barRef}
              className="relative h-5 flex-1 cursor-pointer touch-none select-none"
              onPointerDown={onBarPointerDown}
              onPointerMove={onBarPointerMove}
              onPointerUp={onBarPointerUp}
            >
              <div className="pointer-events-none absolute inset-y-0 left-0 right-0 my-auto h-1.5 overflow-hidden rounded-full">
                <div
                  className="absolute inset-y-0 left-0 bg-rose-300/40 dark:bg-rose-500/25"
                  style={{ width: `${BEFORE_RATIO * 100}%` }}
                />
                <div
                  className="absolute inset-y-0 bg-emerald-300/40 dark:bg-emerald-500/25"
                  style={{ left: `${BEFORE_RATIO * 100}%`, right: 0 }}
                />
              </div>
              <div className="pointer-events-none absolute inset-y-0 left-0 right-0 my-auto h-1.5 overflow-hidden rounded-full">
                <div
                  className={`h-full rounded-full transition-colors duration-300 ${
                    failMode ? "bg-rose-500 dark:bg-rose-400" : "bg-emerald-500 dark:bg-emerald-400"
                  }`}
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <div
                className="pointer-events-none absolute inset-y-0 w-px bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.15)] dark:bg-slate-400 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"
                style={{ left: `${BEFORE_RATIO * 100}%` }}
                aria-hidden
              />
              <div
                className={`pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow transition-colors duration-300 dark:border-slate-900 ${
                  failMode ? "bg-rose-500 dark:bg-rose-400" : "bg-emerald-500 dark:bg-emerald-400"
                }`}
                style={{ left: `${progress * 100}%` }}
              />
            </div>
            <div className="flex shrink-0 gap-1 text-[7px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <button
                type="button"
                onClick={() => {
                  prevElapsedWithinRunRef.current = 0;
                  setElapsed(0);
                  setPlaying(true);
                }}
                className={`cursor-pointer rounded px-0.5 py-0.5 -mx-0.5 hover:bg-slate-200/60 dark:hover:bg-slate-700/50 ${failMode ? "font-semibold text-rose-500 dark:text-rose-400" : ""}`}
                aria-label="Jump to start of before (without Neotoma)"
              >
                before
              </button>
              <span>/</span>
              <button
                type="button"
                onClick={() => {
                  prevElapsedWithinRunRef.current = PHASE_MS + TRANS_MS;
                  setElapsed(PHASE_MS + TRANS_MS);
                  setPlaying(true);
                }}
                className={`cursor-pointer rounded px-0.5 py-0.5 -mx-0.5 hover:bg-slate-200/60 dark:hover:bg-slate-700/50 ${!failMode ? "font-semibold text-emerald-500 dark:text-emerald-400" : ""}`}
                aria-label="Jump to start of after (with Neotoma)"
              >
                after
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FailureIllustration({ human, fail }: { human: string; fail: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-rose-500/25 bg-gradient-to-b from-white via-slate-50 to-rose-50/30 p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:border-rose-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(244,63,94,0.10),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(239,68,68,0.06),transparent_35%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(244,63,94,0.14),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(239,68,68,0.10),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(to_bottom,rgba(100,116,139,0.2)_1px,transparent_1px)] [background-size:100%_10px] dark:opacity-15 dark:[background-image:linear-gradient(to_bottom,rgba(148,163,184,0.28)_1px,transparent_1px)]" />
      <div className="relative overflow-hidden rounded-lg border border-rose-500/30 bg-white/95 dark:border-rose-400/25 dark:bg-slate-950/90">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-rose-500/25 px-3 py-1.5 text-[9px] uppercase tracking-wide text-rose-800/90 dark:border-rose-400/20 dark:text-rose-200/70">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400/75 dark:bg-rose-500/80" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300/75 dark:bg-amber-500/80" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/75 dark:bg-emerald-500/80" />
          </div>
          <span className="text-center whitespace-nowrap">without state layer</span>
          <div />
        </div>
        <div className="flex flex-col gap-1.5 p-2.5">
          <div className="flex justify-end">
            <div className="max-w-[90%] rounded-md border border-slate-300 bg-slate-200 px-2 py-1 text-right font-mono text-[10px] leading-4 text-slate-800 shadow-sm dark:border-slate-600/80 dark:bg-slate-900 dark:text-slate-200">
              {human}
            </div>
          </div>
          <div className="flex justify-start">
            <div className="w-full border-l-2 border-rose-500/45 px-2 py-1 font-mono text-[10px] leading-4 text-rose-900 dark:border-rose-400/55 dark:text-rose-100">
              {fail}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuccessIllustration({ human, succeed }: { human: string; succeed: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-emerald-500/25 bg-gradient-to-b from-white via-slate-50 to-emerald-50/30 p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:border-emerald-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.10),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.06),transparent_35%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.14),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.10),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(to_bottom,rgba(100,116,139,0.2)_1px,transparent_1px)] [background-size:100%_10px] dark:opacity-15 dark:[background-image:linear-gradient(to_bottom,rgba(148,163,184,0.28)_1px,transparent_1px)]" />
      <div className="relative overflow-hidden rounded-lg border border-emerald-500/30 bg-white/95 dark:border-emerald-400/25 dark:bg-slate-950/90">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-emerald-500/25 px-3 py-1.5 text-[9px] uppercase tracking-wide text-emerald-800/90 dark:border-emerald-400/20 dark:text-emerald-200/70">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400/75 dark:bg-rose-500/80" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300/75 dark:bg-amber-500/80" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/75 dark:bg-emerald-500/80" />
          </div>
          <span className="text-center whitespace-nowrap">with state layer</span>
          <div />
        </div>
        <div className="flex flex-col gap-1.5 p-2.5">
          <div className="flex justify-end">
            <div className="max-w-[90%] rounded-md border border-slate-300 bg-slate-200 px-2 py-1 text-right font-mono text-[10px] leading-4 text-slate-800 shadow-sm dark:border-slate-600/80 dark:bg-slate-900 dark:text-slate-200">
              {human}
            </div>
          </div>
          <div className="flex justify-start">
            <div className="w-full border-l-2 border-emerald-500/45 px-2 py-1 font-mono text-[10px] leading-4 text-emerald-900 dark:border-emerald-400/55 dark:text-emerald-100">
              {succeed}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const SLIDE_CLASS = "min-h-[100svh] md:snap-start flex items-center justify-center relative";
const SLIDE_INNER = "w-full max-w-6xl mx-auto px-6 md:px-12 lg:px-16 py-20 md:py-12";
const SECTION_WITH_VISUAL_GRID =
  "grid gap-12 lg:gap-16 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center";
const VISUAL_PANEL_CLASS = "w-full min-h-[320px] sm:min-h-[360px] lg:min-h-[460px]";

// Keep fade-in permissive so very tall sections never stay fully hidden.
const IN_VIEW_THRESHOLD = 0.01;

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
      // Never leave content permanently hidden if refs are not ready yet.
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
      const visibleRatio = overlapTop / height;
      return visibleRatio > 0;
    };

    const syncInView = () => {
      setInView(checkInView());
    };

    syncInView();

    const raf = requestAnimationFrame(() => {
      syncInView();
    });
    const timeout = window.setTimeout(syncInView, 120);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setInView(entry.isIntersecting && entry.intersectionRatio > 0);
        }
      },
      {
        root: scrollEl,
        threshold: [0, 0.1, IN_VIEW_THRESHOLD, 0.5, 1],
        rootMargin: "0px",
      }
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

  if (staticMode || reduceMotion || disableFadeOnMobile) {
    return <>{children}</>;
  }

  return (
    <div
      ref={wrapperRef}
      className={`transition-opacity duration-500 ease-out motion-reduce:transition-none ${inView ? "opacity-100" : "opacity-0"}`}
    >
      {children}
    </div>
  );
}

const apiEndpointCount = FUNCTIONALITY_MATRIX.flatMap((r) =>
  r.openapi.split(",").filter((s) => s.trim() && s.trim() !== "—")
).length;
const mcpActionCount = MCP_ACTIONS_TABLE.length;
const cliCommandCount = CLI_COMMANDS_TABLE.length;

function SectionEdgeIndicators({ sectionId }: { sectionId: string }) {
  const sectionIndex = SECTION_ORDER.indexOf(sectionId);
  if (sectionIndex === -1) return null;

  const previousId = sectionIndex > 0 ? SECTION_ORDER[sectionIndex - 1] : null;
  const nextId = sectionIndex < SECTION_ORDER.length - 1 ? SECTION_ORDER[sectionIndex + 1] : null;
  const isIntro = sectionId === "intro";

  const goToSection = (targetId: string) => {
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      {previousId ? (
        <a
          href={previousId === "intro" ? "/" : `#${previousId}`}
          className="absolute top-6 left-1/2 -translate-x-1/2 hidden md:inline-flex items-center justify-center rounded-full border border-border bg-background/80 p-1.5 text-muted-foreground backdrop-blur-sm no-underline hover:text-foreground hover:bg-background transition"
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

      {nextId ? (
        <a
          href={`#${nextId}`}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden md:inline-flex items-center justify-center rounded-full border border-border bg-background/80 p-1.5 text-muted-foreground backdrop-blur-sm no-underline hover:text-foreground hover:bg-background transition"
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

export function SitePage({ staticMode = false }: SitePageProps) {
  const { pack } = useLocale();
  const dotNavSections = useMemo(() => getLocalizedDotNavSections(pack), [pack]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showAllMobileGuarantees, setShowAllMobileGuarantees] = useState(false);
  const [showAllMobileOutcomes, setShowAllMobileOutcomes] = useState(false);
  const [showAllMobileLearnMore, setShowAllMobileLearnMore] = useState(false);

  useEffect(() => {
    if (staticMode || typeof window === "undefined") return;

    const hashId = window.location.hash.replace(/^#/, "");
    if (!hashId || !DOT_NAV_SECTION_IDS.has(hashId)) return;

    // Wait one frame so layout/scroll container is ready before jumping.
    window.requestAnimationFrame(() => {
      const target = document.getElementById(hashId);
      if (target) {
        target.scrollIntoView({ behavior: "auto" });
      }
      // Top section: no hash in URL; lack of anchor signifies intro.
      if (hashId === "intro") {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`
        );
      }
    });
  }, [staticMode]);

  const handleActiveSectionChange = (sectionId: string) => {
    if (typeof window === "undefined") return;

    if (!DOT_NAV_SECTION_IDS.has(sectionId)) return;
    const baseUrl = `${window.location.pathname}${window.location.search}`;
    if (sectionId === "intro") {
      if (!window.location.hash) return;
      window.history.replaceState(null, "", baseUrl);
      return;
    }
    if (window.location.hash === `#${sectionId}`) return;
    window.history.replaceState(null, "", `${baseUrl}#${sectionId}`);
  };

  return (
    <>
      {!staticMode ? <SeoHead /> : null}

      <div
        ref={scrollContainerRef}
        className="h-screen overflow-y-auto scroll-smooth md:snap-y md:snap-mandatory"
      >
        {!staticMode && (
          <SectionDotNav
            sections={dotNavSections}
            scrollContainerRef={scrollContainerRef}
            onActiveSectionChange={handleActiveSectionChange}
          />
        )}

        {/* Slide 1: Hero */}
        <section id="intro" className={SLIDE_CLASS}>
          <FadeSection scrollContainerRef={scrollContainerRef} staticMode={staticMode}>
            <div className={SLIDE_INNER}>
              <div className="space-y-6 pt-0 md:pt-12">
                <div className="grid gap-10 lg:gap-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center">
                  <div className="space-y-5">
                    <h1 className="text-[28px] font-medium tracking-[-0.02em]">
                      {pack.homeHero.titlePrefix}{" "}
                      <span className="intro-hero-word-wrap">
                        <span className="text-foreground">{pack.homeHero.titleFocus}</span>
                      </span>
                    </h1>

                    <div>
                      <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                        {pack.homeHero.withoutStateLayer}
                      </p>
                      <ul className="list-none pl-0 space-y-1">
                        {pack.homeHero.bullets.map((text) => (
                          <li
                            key={text}
                            className="text-[14px] leading-6 text-muted-foreground flex items-center gap-2"
                          >
                            <span className="text-rose-400 shrink-0" aria-hidden="true">
                              ×
                            </span>
                            {text}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <p className="text-[15px] leading-6 font-medium text-foreground">
                      {pack.homeHero.summary}
                    </p>

                    <div>
                      <TooltipProvider delayDuration={300}>
                        <div className="flex flex-wrap gap-2">
                          {(
                            [
                              {
                                tag: "Versioned",
                                Icon: GitBranch,
                                to: "/versioned-history",
                                tip: "Every change creates a new version. Earlier states are preserved and accessible.",
                              },
                              {
                                tag: "Schema-bound",
                                Icon: FileCode,
                                to: "/schema-constraints",
                                tip: "Entities conform to defined types. Invalid data is rejected, not silently accepted.",
                              },
                              {
                                tag: "Replayable",
                                Icon: RotateCcw,
                                to: "/replayable-timeline",
                                tip: "Replay observations from the beginning to reconstruct any historical state.",
                              },
                              {
                                tag: "Auditable",
                                Icon: Eye,
                                to: "/auditable-change-log",
                                tip: "Every change records who made it, when, and from what source.",
                              },
                            ] as const
                          ).map(({ tag, Icon, to, tip }) => (
                            <Tooltip key={tag}>
                              <TooltipTrigger asChild>
                                <Link
                                  to={to}
                                  className="inline-flex items-center gap-1.5 rounded border border-sky-500/20 bg-sky-500/5 px-2.5 py-1 text-[12px] font-medium text-sky-600 hover:bg-sky-500/10 dark:text-sky-400"
                                >
                                  <Icon className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" aria-hidden />
                                  {tag}
                                </Link>
                              </TooltipTrigger>
                              <TooltipContent
                                side="bottom"
                                className="max-w-[240px] text-xs leading-snug"
                              >
                                {tip}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </TooltipProvider>
                    </div>

                    <p className="text-[13px] leading-5 text-muted-foreground">
                      {pack.homeHero.subcopy}
                    </p>

                    <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                      <a
                        href="#memory-guarantees"
                        className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5 rounded-md border border-foreground bg-foreground px-4 py-2 text-[14px] font-medium text-background no-underline hover:bg-foreground/90 transition-colors"
                        onClick={(e) => {
                          sendCtaClick("view_guarantees");
                          if (isModifiedClick(e)) return;
                          e.preventDefault();
                          document
                            .getElementById("memory-guarantees")
                            ?.scrollIntoView({ behavior: "smooth" });
                        }}
                      >
                        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
                        {pack.homeHero.ctaViewGuarantees}
                      </a>
                      <a
                        href="#install"
                        className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5 rounded-md border border-emerald-600 bg-emerald-600 px-4 py-2 text-[14px] font-medium text-white no-underline shadow-sm shadow-emerald-600/30 hover:border-emerald-500 hover:bg-emerald-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950 dark:shadow-emerald-500/30 dark:hover:border-emerald-400 dark:hover:bg-emerald-400 dark:hover:text-emerald-950 transition-colors"
                        onClick={(e) => {
                          sendCtaClick("install");
                          if (isModifiedClick(e)) return;
                          e.preventDefault();
                          document
                            .getElementById("install")
                            ?.scrollIntoView({ behavior: "smooth" });
                        }}
                      >
                        <Download className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="hidden sm:inline">
                          {pack.homeHero.ctaInstall}
                        </span>
                        <span className="sm:hidden">Install in 5 minutes</span>
                      </a>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
                      <span>Open-source</span>
                      <span className="text-border">·</span>
                      <span>{`v${REPO_VERSION}`}</span>
                      <span className="text-border">·</span>
                      <span>{`${REPO_RELEASES_COUNT} releases`}</span>
                      <span className="text-border">·</span>
                      <span>MIT-licensed</span>
                    </div>

                    <div className="pt-1 grid gap-4 md:grid-cols-2 md:items-start">
                      <div className="space-y-2">
                        <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/80">
                          Works with
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to="/neotoma-with-claude-code"
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] text-foreground/90 no-underline transition-colors hover:bg-muted hover:border-border"
                          >
                            <SiClaude className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            Claude Code
                          </Link>
                          <Link
                            to="/neotoma-with-claude"
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] text-foreground/90 no-underline transition-colors hover:bg-muted hover:border-border"
                          >
                            <SiClaude className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            Claude
                          </Link>
                          <Link
                            to="/neotoma-with-chatgpt"
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] text-foreground/90 no-underline transition-colors hover:bg-muted hover:border-border"
                          >
                            <SiOpenai className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            ChatGPT
                          </Link>
                          <Link
                            to="/neotoma-with-codex"
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] text-foreground/90 no-underline transition-colors hover:bg-muted hover:border-border"
                          >
                            <SiOpenai className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            Codex
                          </Link>
                          <Link
                            to="/neotoma-with-cursor"
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] text-foreground/90 no-underline transition-colors hover:bg-muted hover:border-border"
                          >
                            <CursorIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            Cursor
                          </Link>
                          <Link
                            to="/neotoma-with-openclaw"
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] text-foreground/90 no-underline transition-colors hover:bg-muted hover:border-border"
                          >
                            <OpenClawIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            OpenClaw
                          </Link>
                        </div>
                      </div>
                      <div className="space-y-2 md:text-right">
                        <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/80">
                          Ideal for
                        </p>
                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                          <Link
                            to="/ai-infrastructure-engineers"
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] text-foreground/90 no-underline transition-colors hover:bg-muted hover:border-border"
                          >
                            <HardHat className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            AI infrastructure engineers
                          </Link>
                          <Link
                            to="/agentic-systems-builders"
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] text-foreground/90 no-underline transition-colors hover:bg-muted hover:border-border"
                          >
                            <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            Agent system builders
                          </Link>
                          <Link
                            to="/ai-native-operators"
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] text-foreground/90 no-underline transition-colors hover:bg-muted hover:border-border"
                          >
                            <Brain className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            AI-native operators
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <ForgetfulAgentIllustration className={VISUAL_PANEL_CLASS} />
                  </div>
                </div>
              </div>
            </div>
            <SectionEdgeIndicators sectionId="intro" />
          </FadeSection>
        </section>

        {/* Slide 2: Failure Scenarios */}
        <section id="outcomes" className={SLIDE_CLASS}>
          <FadeSection scrollContainerRef={scrollContainerRef} staticMode={staticMode}>
            <div className={SLIDE_INNER}>
              <div className="space-y-5 md:space-y-8 max-w-5xl mx-auto">
                <div className="space-y-2">
                  <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    The problem
                  </p>
                  <h2 className="flex items-center gap-2 text-[24px] font-medium tracking-[-0.02em]">
                    <Scale
                      className="hidden md:block h-5 w-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span>Same question, different outcome</span>
                  </h2>
                  <p className="text-[15px] leading-7 text-foreground/90 max-w-2xl">
                    Without a state layer, agents return stale or wrong data. With Neotoma, every
                    response reads from versioned, schema-bound state.
                  </p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-10">
                  {FAILURE_CARDS.map(
                    ({ category, Icon, title, description, scenarioIndex }, idx) => {
                      const s = SCENARIOS[scenarioIndex];
                      const hiddenOnMobile =
                        !showAllMobileOutcomes && idx >= MOBILE_OUTCOME_PREVIEW_COUNT;
                      return (
                        <div
                          key={category}
                          className={`space-y-3${hiddenOnMobile ? " hidden lg:block" : ""}`}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              {category}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            <FailureIllustration human={s.left} fail={s.fail} />
                            <SuccessIllustration human={s.left} succeed={s.succeed} />
                          </div>
                          <div className="space-y-1 px-0.5">
                            <p className="text-[14px] font-medium leading-5 text-foreground">
                              {title}
                            </p>
                            <p className="text-[13px] leading-5 text-muted-foreground">
                              {description}
                            </p>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
                {FAILURE_CARDS.length > MOBILE_OUTCOME_PREVIEW_COUNT && (
                  <button
                    type="button"
                    className="w-full lg:hidden rounded-lg border border-border bg-card px-3 py-2.5 text-[13px] font-medium text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    onClick={() =>
                      setShowAllMobileOutcomes(!showAllMobileOutcomes)
                    }
                  >
                    {showAllMobileOutcomes
                      ? "Show fewer"
                      : `Show all ${FAILURE_CARDS.length} examples`}
                  </button>
                )}
              </div>
            </div>
            <SectionEdgeIndicators sectionId="outcomes" />
          </FadeSection>
        </section>

        {/* Slide 3: Memory Guarantees */}
        <section id="memory-guarantees" className={SLIDE_CLASS}>
          <FadeSection scrollContainerRef={scrollContainerRef} staticMode={staticMode}>
            <div className={SLIDE_INNER}>
              <div className="space-y-5 md:space-y-8 max-w-5xl mx-auto">
                <div className="space-y-2">
                  <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    Guarantees
                  </p>
                  <h2 className="flex items-center gap-2 text-[24px] font-medium tracking-[-0.02em]">
                    <ShieldCheck
                      className="hidden md:block h-5 w-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span>Agent memory systems make different guarantees</span>
                  </h2>
                  <p className="text-[15px] leading-7 text-foreground/90 max-w-2xl">
                    Most AI memory systems optimize storage or retrieval. Neotoma enforces state
                    integrity.
                  </p>
                </div>
                <div className="hidden md:flex flex-wrap gap-2">
                  {(
                    [
                      {
                        label: "Deterministic state evolution",
                        to: "/deterministic-state-evolution",
                      },
                      { label: "Replayable timeline", to: "/replayable-timeline" },
                      { label: "Auditable change log", to: "/auditable-change-log" },
                      { label: "Schema constraints", to: "/schema-constraints" },
                    ] as const
                  ).map(({ label, to }) => (
                    <Link
                      key={label}
                      to={to}
                      className="inline-flex items-center gap-1.5 rounded border border-sky-500/20 bg-sky-500/5 px-2.5 py-1 text-[12px] font-medium text-sky-600 hover:bg-sky-500/10 dark:text-sky-400 no-underline"
                    >
                      <Check className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" aria-hidden />
                      {label}
                    </Link>
                  ))}
                </div>
                <div className="md:hidden -mt-2 space-y-2 text-[13px] leading-5 text-muted-foreground">
                  <ul className="list-none pl-0 space-y-1.5">
                    <li>
                      <span className="font-medium text-foreground">Platform</span>: built-in
                      chat memory from Claude, ChatGPT, Gemini and others.
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Retrieval / RAG</span>:
                      vector stores like Mem0 and Zep that recall by similarity.
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Files</span>: markdown,
                      JSON, or CRDT docs the agent reads and writes directly.
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Deterministic</span>:
                      Neotoma&rsquo;s append-only state layer with versioned, auditable guarantees.
                    </li>
                  </ul>
                </div>
                <div className="space-y-2 md:hidden">
                  <TooltipProvider delayDuration={200}>
                    <Collapsible className="rounded-lg border border-border bg-card overflow-hidden">
                      <header className="bg-muted/50 border-b border-border/50">
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="group w-full px-3 py-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <span className="text-[13px] font-medium text-foreground">
                                  Vendors
                                </span>
                                <p className="text-[11px] leading-4 text-muted-foreground break-words">
                                  Representative providers for each memory approach
                                </p>
                              </div>
                              <ChevronDown
                                className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                                aria-hidden
                              />
                            </div>
                          </button>
                        </CollapsibleTrigger>
                      </header>
                      <CollapsibleContent>
                        <dl className="text-[12px] leading-5 divide-y divide-border/50">
                          {(["platform", "retrieval", "file", "neotoma"] as const).map((key) => (
                            <div
                              key={key}
                              className="px-3 py-1.5 flex items-center justify-between gap-2"
                            >
                              <dt className="font-medium text-foreground shrink-0">
                                {key === "neotoma"
                                  ? "Deterministic"
                                  : key === "retrieval"
                                    ? "Retrieval / RAG"
                                    : key === "file"
                                      ? "Files"
                                      : "Platform"}
                              </dt>
                              <dd className="text-muted-foreground text-right truncate">
                                {MEMORY_MODEL_VENDORS[key]}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </CollapsibleContent>
                    </Collapsible>
                    {(showAllMobileGuarantees
                      ? MEMORY_GUARANTEE_ROWS
                      : MEMORY_GUARANTEE_ROWS.slice(0, MOBILE_GUARANTEE_PREVIEW_COUNT)
                    ).map((row) => (
                      <Collapsible
                        key={row.property}
                        defaultOpen
                        className="rounded-lg border border-border bg-card overflow-hidden"
                      >
                        <header className="bg-muted/50 border-b border-border/50">
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="group w-full px-3 py-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <span className="text-[13px] font-medium text-foreground">
                                    {row.property}
                                  </span>
                                  <p className="text-[11px] leading-4 text-muted-foreground break-words">
                                    {row.tooltip}
                                  </p>
                                </div>
                                <ChevronDown
                                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                                  aria-hidden
                                />
                              </div>
                            </button>
                          </CollapsibleTrigger>
                        </header>
                        <CollapsibleContent>
                          <div className="grid grid-cols-4 divide-x divide-border/50">
                            {(
                              [
                                { key: "platform" as const, label: "Plat." },
                                { key: "retrieval" as const, label: "RAG" },
                                { key: "file" as const, label: "Files" },
                                { key: "neotoma" as const, label: "Det." },
                              ] as const
                            ).map(({ key, label }) => (
                              <div key={key} className="flex flex-col items-center gap-0.5 px-1 py-1.5">
                                <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                                  {label}
                                </span>
                                <GuaranteeCell level={row[key]} />
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                    {MEMORY_GUARANTEE_ROWS.length > MOBILE_GUARANTEE_PREVIEW_COUNT && (
                      <button
                        type="button"
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-medium text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                        onClick={() =>
                          setShowAllMobileGuarantees(!showAllMobileGuarantees)
                        }
                      >
                        {showAllMobileGuarantees
                          ? "Show fewer"
                          : `Show all ${MEMORY_GUARANTEE_ROWS.length} guarantees`}
                      </button>
                    )}
                  </TooltipProvider>
                </div>
                <div
                  className="hidden md:block overflow-x-auto -mx-2 px-2"
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  <MemoryGuaranteesTable />
                </div>
              </div>
            </div>
            <SectionEdgeIndicators sectionId="memory-guarantees" />
          </FadeSection>
        </section>

        {/* Slide 3b: Agent evaluation prompt */}
        <section id="evaluate" className={SLIDE_CLASS}>
          <FadeSection scrollContainerRef={scrollContainerRef} staticMode={staticMode}>
            <div className={SLIDE_INNER}>
              <div className="space-y-8 max-w-5xl mx-auto">
                <div className="space-y-2">
                  <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    Ask your agent
                  </p>
                  <h2 className="flex items-center gap-2 text-[24px] font-medium tracking-[-0.02em]">
                    <MessageSquare
                      className="hidden md:block h-5 w-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span>Let your AI decide if Neotoma is worth it</span>
                  </h2>
                </div>
                <div className={SECTION_WITH_VISUAL_GRID}>
                  <div className="min-w-0 space-y-4">
                    <p className="text-[15px] leading-7 text-foreground/90">
                      Paste this into Claude, ChatGPT, Cursor, or any agent you already use.
                      It will evaluate Neotoma against your actual workflow and give you a
                      specific recommendation.
                    </p>
                    <CodeBlock
                      code={SITE_CODE_SNIPPETS.agentEvaluationPrompt}
                      staticMode={staticMode}
                    />
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded border border-border bg-muted px-2.5 py-1 text-[12px] font-medium text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Works in any AI tool
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded border border-border bg-muted px-2.5 py-1 text-[12px] font-medium text-muted-foreground">
                        <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Personalized to your context
                      </span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-6 sm:p-8 space-y-5">
                    <div className="space-y-2">
                      <h3 className="text-[16px] font-medium">Share your results</h3>
                      <p className="text-[14px] leading-6 text-muted-foreground">
                        If the evaluation looks interesting, send it over. I&rsquo;ll
                        review what your agent found and help you get set up with a
                        hands-on walkthrough.
                      </p>
                    </div>
                    <a
                      href={`mailto:${SITE_CODE_SNIPPETS.agentEvaluationShareEmail}?subject=${encodeURIComponent(SITE_CODE_SNIPPETS.agentEvaluationShareSubject)}&body=${encodeURIComponent("Here's what my agent said:\n\n[Paste your agent's evaluation here]\n\n---\nOptional: what tools/workflows do you use day-to-day?\n")}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2.5 text-[14px] font-medium text-white shadow-sm shadow-emerald-600/30 hover:border-emerald-500 hover:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950 dark:shadow-emerald-500/30 dark:hover:border-emerald-400 dark:hover:bg-emerald-400"
                      onClick={() => sendCtaClick("evaluate_share_results")}
                    >
                      <Mail className="h-4 w-4 shrink-0" aria-hidden />
                      Email your evaluation
                    </a>
                    <p className="text-[12px] text-muted-foreground">
                      No obligation. Just a way to start a conversation if the fit is there.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <SectionEdgeIndicators sectionId="evaluate" />
          </FadeSection>
        </section>

        {/* Slide 4: Install */}
        <section id="install" className={SLIDE_CLASS}>
          <FadeSection scrollContainerRef={scrollContainerRef} staticMode={staticMode}>
            <div className={SLIDE_INNER}>
              <div className="space-y-8 max-w-5xl mx-auto">
                <div className="space-y-2">
                  <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    Get started
                  </p>
                  <h2 className="flex items-center gap-2 text-[24px] font-medium tracking-[-0.02em]">
                    <Download
                      className="hidden md:block h-5 w-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span>Agents install Neotoma themselves</span>
                  </h2>
                </div>
                <div className={SECTION_WITH_VISUAL_GRID}>
                  <div className="min-w-0 space-y-4">
                    <p className="text-[15px] leading-7 text-foreground/90">
                      Paste this prompt into Claude Code, Codex, Cursor, or OpenClaw. The agent
                      handles npm install, initialization, and MCP configuration.
                    </p>
                    <CodeBlock
                      code={SITE_CODE_SNIPPETS.agentInstallPrompt}
                      staticMode={staticMode}
                      previewLineCount={6}
                    />
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded border border-border bg-muted px-2.5 py-1 text-[12px] font-medium text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        5-minute integration
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded border border-border bg-muted px-2.5 py-1 text-[12px] font-medium text-muted-foreground">
                        <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Fully reversible
                      </span>
                    </div>
                    <p className="text-[13px] leading-5 text-muted-foreground">
                      More options:{" "}
                      <a
                        href="https://github.com/markmhendrickson/neotoma?tab=readme-ov-file#install"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground underline underline-offset-2 hover:no-underline"
                        onClick={() =>
                          sendOutboundClick(
                            "https://github.com/markmhendrickson/neotoma?tab=readme-ov-file#install",
                            "Manual install"
                          )
                        }
                      >
                        Manual install
                      </a>
                      {" · "}
                      <Link
                        to="/install#docker"
                        className="text-foreground underline underline-offset-2 hover:no-underline"
                      >
                        Docker
                      </Link>
                      {" · "}
                      <Link
                        to="/cli"
                        className="text-foreground underline underline-offset-2 hover:no-underline"
                      >
                        CLI reference
                      </Link>
                    </p>
                  </div>
                  <div>
                    <GetStartedSimulationVisual className={VISUAL_PANEL_CLASS} />
                    <p className="mt-2 text-[12px] text-muted-foreground text-center">
                      Agent installs and initializes via npm, scans context and platform memory,
                      previews candidates with provenance, and stores only what you approve.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <SectionEdgeIndicators sectionId="install" />
          </FadeSection>
        </section>

        {/* Slide 5: Inspect Agent State */}
        <section id="inspect" className={SLIDE_CLASS}>
          <FadeSection scrollContainerRef={scrollContainerRef} staticMode={staticMode}>
            <div className={SLIDE_INNER}>
              <div className="space-y-8 max-w-5xl mx-auto">
                <div className="space-y-2">
                  <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    State inspection
                  </p>
                  <h2 className="flex items-center gap-2 text-[22px] sm:text-[24px] font-medium tracking-[-0.02em]">
                    <Eye
                      className="hidden md:block h-5 w-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span>Inspect agent state like version control</span>
                  </h2>
                  <p className="text-[14px] sm:text-[15px] leading-6 sm:leading-7 text-foreground/90 max-w-2xl">
                    When a production agent sends the wrong data, you need to trace why. Neotoma
                    stores every state mutation as a versioned observation so the full timeline can
                    be inspected and replayed.
                  </p>
                </div>

                <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      Observation timeline
                    </p>
                    <pre className="rounded-lg border code-block-palette p-3 sm:p-4 overflow-x-auto font-mono text-[11px] sm:text-[13px] leading-5 sm:leading-6 whitespace-pre-wrap md:whitespace-pre break-words">
                      <code>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                          $ neotoma observations list --entity-id contract:Kline
                        </span>
                        {"\n\n"}
                        <span className="text-foreground/90 dark:text-foreground/80">
                          {`  #   observed_at   source              change
  1   Oct 10        import:drive        (created)
  2   Oct 12        agent:renewal       renewal_date
  3   Oct 14        agent:amendment     payment_terms`}
                        </span>
                      </code>
                    </pre>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      Entity snapshot with version history
                    </p>
                    <pre className="rounded-lg border code-block-palette p-3 sm:p-4 overflow-x-auto font-mono text-[11px] sm:text-[13px] leading-5 sm:leading-6 whitespace-pre-wrap md:whitespace-pre break-words">
                      <code>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                          $ neotoma entities get contract:Kline
                        </span>
                        {"\n\n"}
                        <span className="text-foreground/90 dark:text-foreground/80">
                          {`  entity_type:   contract
  entity_id:     contract:Kline
  version:       3
  payment_terms: Net 30
  renewal_date:  2026-01-15

  Previous (v2): payment_terms: Net 60`}
                        </span>
                      </code>
                    </pre>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 sm:gap-3">
                  <Link
                    to="/cli"
                    className="inline-flex w-full sm:w-auto items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                  >
                    CLI reference →
                  </Link>
                  <Link
                    to="/replayable-timeline"
                    className="inline-flex w-full sm:w-auto items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                  >
                    Replayable timeline →
                  </Link>
                  <Link
                    to="/auditable-change-log"
                    className="inline-flex w-full sm:w-auto items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                  >
                    Auditable change log →
                  </Link>
                </div>
              </div>
            </div>
            <SectionEdgeIndicators sectionId="inspect" />
          </FadeSection>
        </section>

        {/* Slide 6: Architecture + Foundations */}
        <section id="architecture" className={SLIDE_CLASS}>
          <FadeSection scrollContainerRef={scrollContainerRef} staticMode={staticMode}>
            <div className={SLIDE_INNER}>
              <div className="space-y-8 max-w-5xl mx-auto">
                <div className="space-y-2">
                  <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    How it works
                  </p>
                  <h2 className="flex items-center gap-2 text-[24px] font-medium tracking-[-0.02em]">
                    <Network
                      className="hidden md:block h-5 w-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span>Architecture</span>
                  </h2>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {THREE_FOUNDATIONS.map((f) => {
                    const Icon = FOUNDATION_ICONS[f.icon];
                    return (
                      <Link
                        key={f.title}
                        to={f.link}
                        className="rounded-lg border border-border bg-card px-5 py-4 space-y-2 no-underline transition-colors hover:border-emerald-500/40 hover:bg-card/80"
                      >
                        <div className="flex items-center gap-2">
                          {Icon && (
                            <Icon className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden />
                          )}
                          <p className="text-[15px] font-medium text-foreground">{f.title}</p>
                        </div>
                        <ul className="list-none pl-0 space-y-1">
                          {f.lines.map((line) => (
                            <li
                              key={line}
                              className="text-[13px] leading-5 text-muted-foreground flex items-start gap-1.5"
                            >
                              <span
                                className="text-muted-foreground/60 shrink-0 select-none"
                                aria-hidden
                              >
                                &bull;
                              </span>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      </Link>
                    );
                  })}
                </div>

                <div className="grid gap-8 lg:gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
                  <div>
                    <StateFlowDiagram className="w-full min-h-[280px] sm:min-h-[320px]" />
                  </div>
                  <div className="space-y-4">
                    <p className="text-[15px] leading-7 font-medium text-foreground">
                      Neotoma treats memory as state evolution, not retrieval. Every state change is
                      versioned with full provenance.
                    </p>

                    <ul className="list-none pl-0 space-y-2">
                      {[
                        {
                          label: "Deterministic",
                          desc: "Same observations always produce the same versioned entity snapshots. No ordering sensitivity.",
                        },
                        {
                          label: "Immutable",
                          desc: "Append-only observations. Corrections add new data; they never erase.",
                        },
                        {
                          label: "Replayable",
                          desc: "Inspect any entity at any point in time. Diff versions. Reconstruct history from the observation log.",
                        },
                        {
                          label: "Structure-first",
                          desc: "Schema-first extraction with deterministic retrieval. Optional similarity search when embeddings are configured.",
                        },
                      ].map((item) => (
                        <li key={item.label} className="flex items-start gap-2.5">
                          <span
                            className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60"
                            aria-hidden
                          />
                          <span className="text-[14px] leading-6">
                            <span className="font-medium text-foreground">{item.label}.</span>{" "}
                            <span className="text-muted-foreground">{item.desc}</span>
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="flex flex-wrap gap-3">
                      <Link
                        to="/architecture"
                        className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                      >
                        Full architecture →
                      </Link>
                      <Link
                        to="/terminology"
                        className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                      >
                        Terminology →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <SectionEdgeIndicators sectionId="architecture" />
          </FadeSection>
        </section>

        {/* === Use cases: curated verticals grid === */}
        <section id="use-cases" className={SLIDE_CLASS}>
          <FadeSection scrollContainerRef={scrollContainerRef} staticMode={staticMode}>
            <div className={SLIDE_INNER}>
              <div className="space-y-8">
                <div className="space-y-2">
                  <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    Use cases
                  </p>
                  <h2 className="flex items-center gap-2 text-[24px] font-medium tracking-[-0.02em]">
                    <Network
                      className="hidden md:block h-5 w-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span>Any workflow where provenance matters</span>
                  </h2>
                  <p className="text-[14px] md:text-[15px] text-muted-foreground max-w-2xl leading-6">
                    Replace &ldquo;vendor&rdquo; with &ldquo;contract&rdquo;,
                    &ldquo;patient&rdquo;, or &ldquo;shipment&rdquo; and the
                    guarantees are identical. Same state layer, different domain.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                  {VERTICALS.filter((v) =>
                    ["/compliance", "/crm", "/healthcare", "/financial-ops", "/contracts", "/logistics"].includes(v.href)
                  ).map((v) => {
                    const Icon = v.icon;
                    return (
                      <Link
                        key={v.href}
                        to={v.href}
                        className={`group relative flex flex-col rounded-xl border p-5 no-underline transition-all hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 ${v.accentBorder} ${v.accentBg}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Icon className={`h-4 w-4 ${v.accent}`} />
                          <span className={`text-[13px] font-medium ${v.accent}`}>
                            {v.label}
                          </span>
                        </div>
                        <p className="text-[15px] font-medium text-foreground mb-1.5">
                          {v.title}
                        </p>
                        <p className="text-[13px] leading-5 text-muted-foreground mb-3 flex-1">
                          {v.tagline}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {v.entityExamples.slice(0, 3).map((e) => (
                            <span
                              key={e}
                              className="rounded border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-mono text-muted-foreground"
                            >
                              {e}
                            </span>
                          ))}
                        </div>
                        <p className="text-[12px] italic leading-4 text-muted-foreground/80">
                          &ldquo;{v.thenQuestion}&rdquo;
                        </p>
                      </Link>
                    );
                  })}
                </div>
                <div className="text-center pt-1">
                  <Link
                    to="/verticals"
                    className="inline-flex items-center gap-1.5 text-[14px] font-medium text-foreground no-underline hover:text-foreground/80 transition-colors"
                  >
                    See all {VERTICALS.length} verticals
                    <span aria-hidden className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
                  </Link>
                </div>
              </div>
            </div>
            <SectionEdgeIndicators sectionId="use-cases" />
          </FadeSection>
        </section>

        {/* Slide 7: Interfaces */}
        <section id="interfaces" className={SLIDE_CLASS}>
          <FadeSection scrollContainerRef={scrollContainerRef} staticMode={staticMode}>
            <div className={SLIDE_INNER}>
              <div className="space-y-8 max-w-5xl mx-auto">
                <div className="space-y-2">
                  <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    Interfaces
                  </p>
                  <h2 className="flex items-center gap-2 text-[24px] font-medium tracking-[-0.02em]">
                    <Waypoints
                      className="hidden md:block h-5 w-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span>Three interfaces. One state invariant.</span>
                  </h2>
                  <p className="text-[14px] md:text-[15px] leading-7 text-foreground/90 max-w-2xl">
                    Every interface provides the same deterministic behavior regardless of how you
                    access the agent state layer.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {[
                    {
                      name: "REST API",
                      count: `${apiEndpointCount} endpoints`,
                      desc: "Full HTTP interface for application integration. Build dashboards, services, and automations on top of Neotoma state.",
                      link: "/api",
                      imageSrc: interfacesOptionBRest,
                      imageAlt: "REST API data flow illustration",
                      imageZoneBg: "bg-[#efeafe]",
                      contentZoneClass:
                        "bg-[#efeafe] dark:bg-[#251f35] border-[#dfd4f8] dark:border-[#3d3555]",
                      pillClass:
                        "rounded border border-violet-500/30 bg-transparent px-2 py-0.5 text-[11px] font-mono text-violet-700 dark:text-violet-300",
                      details: [
                        "Entities, relationships, observations",
                        "Schema discovery and validation",
                        "Timeline and version history",
                      ],
                    },
                    {
                      name: "MCP Server",
                      count: `${mcpActionCount} actions`,
                      desc: "Model Context Protocol for Claude Code, Claude, ChatGPT, Cursor, Codex, and OpenClaw. Agents store and retrieve state through structured tool calls.",
                      link: "/mcp",
                      imageSrc: interfacesOptionBMcp,
                      imageAlt: "MCP server tool-call illustration",
                      imageZoneBg: "bg-[#e7f7f3]",
                      contentZoneClass:
                        "bg-[#e7f7f3] dark:bg-[#1a2828] border-[#c5ebe2] dark:border-[#2d4a48]",
                      pillClass:
                        "rounded border border-teal-500/30 bg-transparent px-2 py-0.5 text-[11px] font-mono text-teal-700 dark:text-teal-300",
                      details: [
                        "store, retrieve, create_relationship",
                        "Entity extraction and linking",
                        "Mandatory store-before-respond",
                      ],
                    },
                    {
                      name: "CLI",
                      count: `${cliCommandCount} commands`,
                      desc: "Command-line for scripting and direct access. Inspect entities, replay timelines, and manage state from the terminal.",
                      link: "/cli",
                      imageSrc: interfacesOptionBCli,
                      imageAlt: "Neotoma CLI terminal illustration",
                      imageZoneBg: "bg-[#fcebd7]",
                      contentZoneClass:
                        "bg-[#fcebd7] dark:bg-[#2d251f] border-[#f0d9bc] dark:border-[#4a3d2d]",
                      pillClass:
                        "rounded border border-orange-500/30 bg-transparent px-2 py-0.5 text-[11px] font-mono text-orange-700 dark:text-orange-300",
                      details: [
                        "Entity listing and inspection",
                        "Version diffing and timeline replay",
                        "Init, config, and diagnostics",
                      ],
                    },
                  ].map((iface) => (
                    <Link
                      key={iface.name}
                      to={iface.link}
                      className={`flex flex-row md:flex-col overflow-hidden rounded-lg border no-underline transition-[transform,color,border-color] duration-200 ease-out group hover:scale-[1.03] hover:border-opacity-80 ${iface.contentZoneClass}`}
                    >
                      <div
                        className={`hidden md:flex w-[116px] shrink-0 items-center justify-center rounded-l-lg p-2 md:w-auto md:rounded-l-none md:rounded-t-lg md:pt-4 md:px-5 md:pb-3 ${iface.imageZoneBg}`}
                      >
                        <img
                          src={iface.imageSrc}
                          alt={iface.imageAlt}
                          width={280}
                          height={280}
                          className="aspect-square size-[96px] object-contain object-center md:size-[280px]"
                          loading="lazy"
                        />
                      </div>
                      <div className="flex flex-1 flex-col min-h-0 px-3 py-3 md:px-5 md:py-4">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="text-[16px] md:text-[18px] font-medium text-foreground">
                            {iface.name}
                          </p>
                          <span className={iface.pillClass}>{iface.count}</span>
                        </div>
                        <p className="text-[14px] md:text-[15px] text-muted-foreground leading-6 mb-3 flex-1">
                          {iface.desc}
                        </p>
                        <div className="hidden md:flex flex-wrap gap-1.5 mb-3">
                          {iface.details.map((detail) => (
                            <span key={detail} className={iface.pillClass}>
                              {detail}
                            </span>
                          ))}
                        </div>
                        <span className="text-[12px] font-medium text-muted-foreground group-hover:text-foreground transition-colors mt-auto">
                          Full reference →
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            <SectionEdgeIndicators sectionId="interfaces" />
          </FadeSection>
        </section>

        {/* Slide 8: Learn More */}
        <section id="learn-more" className={SLIDE_CLASS}>
          <FadeSection scrollContainerRef={scrollContainerRef} staticMode={staticMode}>
            <div className={SLIDE_INNER}>
              <div className="space-y-5 md:space-y-8 max-w-3xl mx-auto">
                <div className="space-y-2">
                  <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    Resources
                  </p>
                  <h2 className="flex items-center gap-2 text-[24px] font-medium tracking-[-0.02em]">
                    <BookOpen
                      className="hidden md:block h-5 w-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span>Learn more</span>
                  </h2>
                </div>
                {(() => {
                  const allItems = [
                    LEARN_MORE_REPO_CARD,
                    LEARN_MORE_DOCUMENTATION_CARD,
                    LEARN_MORE_GUARANTEES_CARD_WITH_IMAGE,
                    ...LEARN_MORE_POSTS.slice(0, 5),
                  ];
                  const MOBILE_LEARN_MORE_PREVIEW = 3;
                  const visibleItems = showAllMobileLearnMore
                    ? allItems
                    : allItems.slice(0, MOBILE_LEARN_MORE_PREVIEW);
                  const hiddenItems = showAllMobileLearnMore
                    ? []
                    : allItems.slice(MOBILE_LEARN_MORE_PREVIEW);
                  return (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {visibleItems.map((item) => (
                          <LearnMoreCard key={item.href} item={item} />
                        ))}
                        {hiddenItems.map((item) => (
                          <div key={item.href} className="hidden sm:block">
                            <LearnMoreCard item={item} />
                          </div>
                        ))}
                      </div>
                      {allItems.length > MOBILE_LEARN_MORE_PREVIEW && (
                        <button
                          type="button"
                          className="w-full sm:hidden rounded-lg border border-border bg-card px-3 py-2.5 text-[13px] font-medium text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                          onClick={() =>
                            setShowAllMobileLearnMore(!showAllMobileLearnMore)
                          }
                        >
                          {showAllMobileLearnMore
                            ? "Show fewer"
                            : `Show all ${allItems.length} resources`}
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
            <SectionEdgeIndicators sectionId="learn-more" />
          </FadeSection>
        </section>
      </div>
    </>
  );
}

export function SitePageStatic() {
  return <SitePage staticMode={true} />;
}

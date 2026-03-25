import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Layers,
  Network,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SeoHead } from "../../SeoHead";
import { sendCtaClick, sendOutboundClick } from "@/utils/analytics";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface VerticalScenario {
  human: string;
  fail: string;
  succeed: string;
  version: string;
  category: string;
  failTitle: string;
  failDesc: string;
  Icon: LucideIcon;
}

export interface VerticalProblemCard {
  Icon: LucideIcon;
  title: string;
  desc: string;
}

export interface VerticalCapability {
  Icon: LucideIcon;
  title: string;
  desc: string;
  tags: string[];
}

export interface VerticalStep {
  Icon: LucideIcon;
  title: string;
  desc: string;
  detail: string;
}

export interface VerticalArchConfig {
  topLabel: string;
  topDesc: string;
  interfaces: { label: string; Icon: LucideIcon }[];
  dataSources: string[];
}

export interface VerticalCaseStudy {
  companyName: string;
  companyUrl: string;
  companyDesc: string;
  features: string[];
  guarantees: string[];
  generalizesTitle: string;
  generalizesDesc: string;
}

export interface VerticalConfig {
  accentColor: AccentColor;
  badgeIcon: LucideIcon;
  badgeText: string;
  heroTitle: string;
  heroHighlight: string;
  heroDesc: string;
  heroTags: { tag: string; Icon: LucideIcon }[];
  heroFeatures: string[];
  analyticsPrefix: string;
  problemTitle: string;
  problemDesc: string;
  problemCards: VerticalProblemCard[];
  problemCallout: string;
  problemCalloutDesc: string;
  scenarios: VerticalScenario[];
  outcomeTitle: string;
  outcomeSubtitle: string;
  outcomeDesc: string;
  howTitle: string;
  steps: VerticalStep[];
  capTitle: string;
  capSubtitle: string;
  capDesc: string;
  capabilities: VerticalCapability[];
  archHeadline: string;
  archDesc: string;
  archConfig: VerticalArchConfig;
  archSteps: { label: string; desc: string }[];
  caseStudy: VerticalCaseStudy;
  ctaHeadline: string;
  ctaHighlight: string;
  ctaDesc: string;
  ctaFeatures: string[];
  agentLabel: string;
}

/* ------------------------------------------------------------------ */
/*  Accent-color theme system                                          */
/* ------------------------------------------------------------------ */

export type AccentColor =
  | "amber"
  | "emerald"
  | "indigo"
  | "sky"
  | "violet"
  | "cyan"
  | "teal"
  | "orange";

interface VTheme {
  badgeBorderBg: string;
  text: string;
  textDarker: string;
  textMuted: string;
  textDetail: string;
  icon: string;
  borderLight: string;
  borderMed: string;
  border30: string;
  border40: string;
  bg5: string;
  bg10: string;
  bg3: string;
  dot: string;
  cta: string;
  archBorder: string;
}

const T: Record<AccentColor, VTheme> = {
  amber: {
    badgeBorderBg: "border-amber-500/20 bg-amber-500/5",
    text: "text-amber-600 dark:text-amber-400",
    textDarker: "text-amber-700 dark:text-amber-300",
    textMuted: "text-amber-600/70 dark:text-amber-400/70",
    textDetail: "text-amber-600/80 dark:text-amber-400/80",
    icon: "text-amber-500",
    borderLight: "border-amber-500/20",
    borderMed: "border-amber-500/25",
    border30: "border-amber-500/30",
    border40: "border-amber-500/40",
    bg5: "bg-amber-500/5",
    bg10: "bg-amber-500/10",
    bg3: "bg-amber-500/[0.03]",
    dot: "bg-amber-500",
    cta: "border-amber-600 bg-amber-600 shadow-amber-600/30 hover:bg-amber-500 dark:border-amber-500 dark:bg-amber-500 dark:text-amber-950",
    archBorder: "border-2 border-amber-500/40 bg-amber-500/5",
  },
  emerald: {
    badgeBorderBg: "border-emerald-500/20 bg-emerald-500/5",
    text: "text-emerald-600 dark:text-emerald-400",
    textDarker: "text-emerald-700 dark:text-emerald-300",
    textMuted: "text-emerald-600/70 dark:text-emerald-400/70",
    textDetail: "text-emerald-600/80 dark:text-emerald-400/80",
    icon: "text-emerald-500",
    borderLight: "border-emerald-500/20",
    borderMed: "border-emerald-500/25",
    border30: "border-emerald-500/30",
    border40: "border-emerald-500/40",
    bg5: "bg-emerald-500/5",
    bg10: "bg-emerald-500/10",
    bg3: "bg-emerald-500/[0.03]",
    dot: "bg-emerald-500",
    cta: "border-emerald-600 bg-emerald-600 shadow-emerald-600/30 hover:bg-emerald-500 dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950",
    archBorder: "border-2 border-emerald-500/40 bg-emerald-500/5",
  },
  indigo: {
    badgeBorderBg: "border-indigo-500/20 bg-indigo-500/5",
    text: "text-indigo-600 dark:text-indigo-400",
    textDarker: "text-indigo-700 dark:text-indigo-300",
    textMuted: "text-indigo-600/70 dark:text-indigo-400/70",
    textDetail: "text-indigo-600/80 dark:text-indigo-400/80",
    icon: "text-indigo-500",
    borderLight: "border-indigo-500/20",
    borderMed: "border-indigo-500/25",
    border30: "border-indigo-500/30",
    border40: "border-indigo-500/40",
    bg5: "bg-indigo-500/5",
    bg10: "bg-indigo-500/10",
    bg3: "bg-indigo-500/[0.03]",
    dot: "bg-indigo-500",
    cta: "border-indigo-600 bg-indigo-600 shadow-indigo-600/30 hover:bg-indigo-500 dark:border-indigo-500 dark:bg-indigo-500 dark:text-indigo-950",
    archBorder: "border-2 border-indigo-500/40 bg-indigo-500/5",
  },
  sky: {
    badgeBorderBg: "border-sky-500/20 bg-sky-500/5",
    text: "text-sky-600 dark:text-sky-400",
    textDarker: "text-sky-700 dark:text-sky-300",
    textMuted: "text-sky-600/70 dark:text-sky-400/70",
    textDetail: "text-sky-600/80 dark:text-sky-400/80",
    icon: "text-sky-500",
    borderLight: "border-sky-500/20",
    borderMed: "border-sky-500/25",
    border30: "border-sky-500/30",
    border40: "border-sky-500/40",
    bg5: "bg-sky-500/5",
    bg10: "bg-sky-500/10",
    bg3: "bg-sky-500/[0.03]",
    dot: "bg-sky-500",
    cta: "border-sky-600 bg-sky-600 shadow-sky-600/30 hover:bg-sky-500 dark:border-sky-500 dark:bg-sky-500 dark:text-sky-950",
    archBorder: "border-2 border-sky-500/40 bg-sky-500/5",
  },
  violet: {
    badgeBorderBg: "border-violet-500/20 bg-violet-500/5",
    text: "text-violet-600 dark:text-violet-400",
    textDarker: "text-violet-700 dark:text-violet-300",
    textMuted: "text-violet-600/70 dark:text-violet-400/70",
    textDetail: "text-violet-600/80 dark:text-violet-400/80",
    icon: "text-violet-500",
    borderLight: "border-violet-500/20",
    borderMed: "border-violet-500/25",
    border30: "border-violet-500/30",
    border40: "border-violet-500/40",
    bg5: "bg-violet-500/5",
    bg10: "bg-violet-500/10",
    bg3: "bg-violet-500/[0.03]",
    dot: "bg-violet-500",
    cta: "border-violet-600 bg-violet-600 shadow-violet-600/30 hover:bg-violet-500 dark:border-violet-500 dark:bg-violet-500 dark:text-violet-950",
    archBorder: "border-2 border-violet-500/40 bg-violet-500/5",
  },
  cyan: {
    badgeBorderBg: "border-cyan-500/20 bg-cyan-500/5",
    text: "text-cyan-600 dark:text-cyan-400",
    textDarker: "text-cyan-700 dark:text-cyan-300",
    textMuted: "text-cyan-600/70 dark:text-cyan-400/70",
    textDetail: "text-cyan-600/80 dark:text-cyan-400/80",
    icon: "text-cyan-500",
    borderLight: "border-cyan-500/20",
    borderMed: "border-cyan-500/25",
    border30: "border-cyan-500/30",
    border40: "border-cyan-500/40",
    bg5: "bg-cyan-500/5",
    bg10: "bg-cyan-500/10",
    bg3: "bg-cyan-500/[0.03]",
    dot: "bg-cyan-500",
    cta: "border-cyan-600 bg-cyan-600 shadow-cyan-600/30 hover:bg-cyan-500 dark:border-cyan-500 dark:bg-cyan-500 dark:text-cyan-950",
    archBorder: "border-2 border-cyan-500/40 bg-cyan-500/5",
  },
  teal: {
    badgeBorderBg: "border-teal-500/20 bg-teal-500/5",
    text: "text-teal-600 dark:text-teal-400",
    textDarker: "text-teal-700 dark:text-teal-300",
    textMuted: "text-teal-600/70 dark:text-teal-400/70",
    textDetail: "text-teal-600/80 dark:text-teal-400/80",
    icon: "text-teal-500",
    borderLight: "border-teal-500/20",
    borderMed: "border-teal-500/25",
    border30: "border-teal-500/30",
    border40: "border-teal-500/40",
    bg5: "bg-teal-500/5",
    bg10: "bg-teal-500/10",
    bg3: "bg-teal-500/[0.03]",
    dot: "bg-teal-500",
    cta: "border-teal-600 bg-teal-600 shadow-teal-600/30 hover:bg-teal-500 dark:border-teal-500 dark:bg-teal-500 dark:text-teal-950",
    archBorder: "border-2 border-teal-500/40 bg-teal-500/5",
  },
  orange: {
    badgeBorderBg: "border-orange-500/20 bg-orange-500/5",
    text: "text-orange-600 dark:text-orange-400",
    textDarker: "text-orange-700 dark:text-orange-300",
    textMuted: "text-orange-600/70 dark:text-orange-400/70",
    textDetail: "text-orange-600/80 dark:text-orange-400/80",
    icon: "text-orange-500",
    borderLight: "border-orange-500/20",
    borderMed: "border-orange-500/25",
    border30: "border-orange-500/30",
    border40: "border-orange-500/40",
    bg5: "bg-orange-500/5",
    bg10: "bg-orange-500/10",
    bg3: "bg-orange-500/[0.03]",
    dot: "bg-orange-500",
    cta: "border-orange-600 bg-orange-600 shadow-orange-600/30 hover:bg-orange-500 dark:border-orange-500 dark:bg-orange-500 dark:text-orange-950",
    archBorder: "border-2 border-orange-500/40 bg-orange-500/5",
  },
};

/* ------------------------------------------------------------------ */
/*  Layout constants                                                   */
/* ------------------------------------------------------------------ */

const SLIDE_CLASS =
  "min-h-[100svh] md:snap-start flex items-center justify-center relative";
const SLIDE_INNER =
  "w-full max-w-6xl mx-auto px-6 md:px-12 lg:px-16 py-20 md:py-12";

const LANDING_SECTIONS = [
  { id: "hero", label: "Overview" },
  { id: "problem", label: "The Problem" },
  { id: "outcomes", label: "Before / After" },
  { id: "how-it-works", label: "How It Works" },
  { id: "capabilities", label: "Capabilities" },
  { id: "architecture", label: "Architecture" },
  { id: "case-study", label: "In Practice" },
  { id: "get-started", label: "Get Started" },
];

/* ------------------------------------------------------------------ */
/*  Chat demo animation                                                */
/* ------------------------------------------------------------------ */

const SCENE_MS = 5000;
const TYPE_MS = 1700;
const THINK_MS = 900;
const TRANS_FADE_MS = 1000;
const TRANS_DELAY_MS = 1200;
const TRANS_MS = TRANS_FADE_MS + TRANS_DELAY_MS + TRANS_FADE_MS;
const MOBILE_OUTCOME_PREVIEW_COUNT = 2;

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

function buildPhaseMessages(
  scenarios: VerticalScenario[],
  phaseElapsed: number,
  fail: boolean,
  prefix: string,
): IllustMsg[] {
  const msgs: IllustMsg[] = [];
  for (let i = 0; i < scenarios.length; i++) {
    const se = phaseElapsed - i * SCENE_MS;
    if (se < 0) break;
    const s = scenarios[i];
    if (se >= TYPE_MS) {
      msgs.push({ key: `${prefix}-h-${i}`, role: "human", text: s.human, thinking: false, fail });
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

function AgentChatDemo({
  scenarios,
  agentLabel,
  className = "",
}: {
  scenarios: VerticalScenario[];
  agentLabel: string;
  className?: string;
}) {
  const PHASE_MS = scenarios.length * SCENE_MS;
  const END_DELAY_MS = TRANS_DELAY_MS;
  const TOTAL_MS = PHASE_MS + TRANS_MS + PHASE_MS + END_DELAY_MS;
  const MODE_SWITCH_MS = PHASE_MS + TRANS_FADE_MS + TRANS_DELAY_MS;
  const BEFORE_RATIO = MODE_SWITCH_MS / TOTAL_MS;

  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const wasInViewRef = useRef(false);
  const prevRef = useRef(0);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const nowInView = entry.isIntersecting;
        setIsInView(nowInView);
        if (nowInView && !wasInViewRef.current) {
          prevRef.current = 0;
          setElapsed(0);
          setPlaying(true);
        }
        wasInViewRef.current = nowInView;
      },
      { threshold: 0.35 },
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
      setElapsed((p) => {
        const n = p + dt;
        if (n >= TOTAL_MS) {
          prevRef.current = 0;
          return 0;
        }
        const mono = Math.max(n, prevRef.current);
        prevRef.current = mono;
        return mono;
      });
    }, 80);
    return () => window.clearInterval(id);
  }, [playing, dragging, isInView, TOTAL_MS]);

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
    msgs = buildPhaseMessages(scenarios, elapsed, true, "b");
  } else if (!isAfter) {
    msgs =
      elapsed < fadeInStart
        ? buildPhaseMessages(scenarios, PHASE_MS, true, "b")
        : [{ key: "lbl-a", role: "label", text: "with state integrity layer", thinking: false, fail: false }];
  } else {
    const ae = Math.min(elapsed - PHASE_MS - TRANS_MS, PHASE_MS);
    msgs = [
      { key: "lbl-a", role: "label", text: "with state integrity layer", thinking: false, fail: false },
      ...buildPhaseMessages(scenarios, ae, false, "a"),
    ];
  }

  let composerText = "";
  let composerTyping = false;
  let composerTypeKey = "idle";
  let composerDelayMs = 40;
  const resolveComposer = (base: number) => {
    const idx = Math.min(Math.floor(base / SCENE_MS), scenarios.length - 1);
    const se = base - idx * SCENE_MS;
    if (se < TYPE_MS) {
      composerText = scenarios[idx].human;
      composerTyping = true;
      composerTypeKey = `${isBefore ? "b" : "a"}-${idx}`;
      composerDelayMs = Math.max(14, Math.floor(TYPE_MS / Math.max(1, composerText.length)));
    }
  };
  if (isBefore) resolveComposer(elapsed);
  else if (isAfter) resolveComposer(Math.min(elapsed - PHASE_MS - TRANS_MS, PHASE_MS));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
  }, [msgs.length]);

  const seekTo = useCallback(
    (clientX: number) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * TOTAL_MS;
      prevRef.current = next;
      setElapsed(next);
    },
    [TOTAL_MS],
  );

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      barRef.current?.setPointerCapture(e.pointerId);
      setDragging(true);
      setPlaying(false);
      seekTo(e.clientX);
    },
    [seekTo],
  );
  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      seekTo(e.clientX);
    },
    [dragging, seekTo],
  );
  const onUp = useCallback(() => setDragging(false), []);

  const progress = elapsed / TOTAL_MS;

  const borderClass = failMode
    ? "border border-rose-500/25 bg-gradient-to-b from-white via-slate-50 to-rose-50/30 shadow-[0_14px_50px_rgba(0,0,0,0.08)] dark:border-rose-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_14px_50px_rgba(0,0,0,0.45)]"
    : "border border-emerald-500/25 bg-gradient-to-b from-white via-slate-50 to-emerald-50/30 shadow-[0_14px_50px_rgba(0,0,0,0.08)] dark:border-emerald-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_14px_50px_rgba(0,0,0,0.45)]";

  const glowClass = failMode
    ? "bg-[radial-gradient(circle_at_20%_20%,rgba(244,63,94,0.12),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(239,68,68,0.08),transparent_35%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(244,63,94,0.18),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(239,68,68,0.12),transparent_35%)]"
    : "bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.12),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.08),transparent_35%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.18),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.12),transparent_35%)]";

  const innerBorder = failMode
    ? "border border-rose-500/30 bg-white/95 dark:border-rose-400/25 dark:bg-slate-950/90"
    : "border border-emerald-500/30 bg-white/95 dark:border-emerald-400/25 dark:bg-slate-950/90";

  const headerBorder = failMode
    ? "border-rose-500/25 text-rose-800/90 dark:border-rose-400/20 dark:text-rose-200/70"
    : "border-emerald-500/25 text-emerald-800/90 dark:border-emerald-400/20 dark:text-emerald-200/70";

  const composerBorder = failMode
    ? "border-rose-400/40 bg-slate-100/95 shadow-rose-500/15 dark:border-rose-400/25 dark:bg-slate-900/95 dark:shadow-rose-500/10"
    : "border-emerald-400/40 bg-slate-100/95 shadow-emerald-500/15 dark:border-emerald-400/25 dark:bg-slate-900/95 dark:shadow-emerald-500/10";

  const inputBorder = failMode
    ? "border-rose-400/40 dark:border-rose-400/25"
    : "border-emerald-400/40 dark:border-emerald-400/25";

  return (
    <div
      ref={viewportRef}
      className={`relative h-[400px] overflow-hidden rounded-xl p-3 transition-colors duration-500 md:h-[500px] ${borderClass} ${className}`}
    >
      <div className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${glowClass}`} />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(to_bottom,rgba(100,116,139,0.2)_1px,transparent_1px)] [background-size:100%_10px] dark:opacity-20 dark:[background-image:linear-gradient(to_bottom,rgba(148,163,184,0.28)_1px,transparent_1px)]" />
      <div className={`relative flex h-full flex-col overflow-hidden rounded-lg transition-colors duration-500 ${innerBorder}`}>
        <div className={`grid shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b px-3 py-2 text-[10px] uppercase tracking-wide transition-colors duration-500 ${headerBorder}`}>
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-400/75 dark:bg-rose-500/80" />
            <span className="h-2 w-2 rounded-full bg-amber-300/75 dark:bg-amber-500/80" />
            <span className="h-2 w-2 rounded-full bg-emerald-400/75 dark:bg-emerald-500/80" />
          </div>
          <span className="col-span-3 sm:col-span-1 text-center">
            {agentLabel} · {failMode ? "without state integrity" : "with state integrity"}
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
                    <span className="font-mono text-[8px] uppercase tracking-wider text-emerald-500/60 dark:text-emerald-400/60">
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
                      <p className={`flex items-center gap-1 leading-4 ${m.fail ? "text-rose-600/90 dark:text-rose-200/70" : "text-emerald-600/90 dark:text-emerald-200/70"}`}>
                        {[0, 150, 300].map((d) => (
                          <span
                            key={d}
                            className={`h-1 w-1 rounded-full animate-bounce [animation-delay:${d}ms] ${m.fail ? "bg-rose-600 dark:bg-rose-300/80" : "bg-emerald-600 dark:bg-emerald-300/80"}`}
                          />
                        ))}
                      </p>
                    ) : (
                      <p className="leading-4">
                        <span>{m.role === "human" ? m.text || "\u00A0" : m.text ? null : "\u00A0"}</span>
                        {m.role === "agent" && m.text ? <TypewriterBadge text={m.text} delayMs={18} /> : null}
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
          <div className={`rounded-md border p-1.5 shadow-sm transition-colors duration-500 ${composerBorder}`}>
            <div className={`flex h-8 items-center rounded border bg-white px-2 font-mono text-[11px] leading-4 text-black dark:text-white transition-colors duration-500 dark:bg-slate-950 ${inputBorder}`}>
              <span className="mr-1 text-black/70 dark:text-white/70">$</span>
              <span className={composerText ? "" : "text-black/50 dark:text-white/50"}>
                {composerTyping ? (
                  <TypewriterBadge key={composerTypeKey} text={composerText} delayMs={composerDelayMs} />
                ) : (
                  composerText || "\u00A0"
                )}
              </span>
              {composerTyping && <span className="ml-0.5 inline-block w-[1px] animate-pulse text-black dark:text-white">|</span>}
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
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
            >
              <div className="pointer-events-none absolute inset-y-0 left-0 right-0 my-auto h-1.5 overflow-hidden rounded-full">
                <div className="absolute inset-y-0 left-0 bg-rose-300/40 dark:bg-rose-500/25" style={{ width: `${BEFORE_RATIO * 100}%` }} />
                <div className="absolute inset-y-0 right-0 bg-emerald-300/40 dark:bg-emerald-500/25" style={{ width: `${(1 - BEFORE_RATIO) * 100}%` }} />
              </div>
              <div
                className="pointer-events-none absolute inset-y-0 my-auto h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-slate-500 shadow dark:bg-slate-300"
                style={{ left: `${progress * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Static before/after mini-illustrations                             */
/* ------------------------------------------------------------------ */

function FailIllust({ human, fail }: { human: string; fail: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-rose-500/25 bg-gradient-to-b from-white via-slate-50 to-rose-50/30 p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:border-rose-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(244,63,94,0.10),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(239,68,68,0.06),transparent_35%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(244,63,94,0.14),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(239,68,68,0.10),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(to_bottom,rgba(100,116,139,0.2)_1px,transparent_1px)] [background-size:100%_10px] dark:opacity-15" />
      <div className="relative overflow-hidden rounded-lg border border-rose-500/30 bg-white/95 dark:border-rose-400/25 dark:bg-slate-950/90">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-rose-500/25 px-3 py-1.5 text-[9px] uppercase tracking-wide text-rose-800/90 dark:border-rose-400/20 dark:text-rose-200/70">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400/75 dark:bg-rose-500/80" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300/75 dark:bg-amber-500/80" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/75 dark:bg-emerald-500/80" />
          </div>
          <span className="text-center whitespace-nowrap">without state integrity</span>
          <div />
        </div>
        <div className="flex flex-col gap-1.5 p-2.5">
          <div className="flex justify-end">
            <div className="max-w-[90%] rounded-md border border-slate-300 bg-slate-200 px-2 py-1 text-right font-mono text-[10px] leading-4 text-slate-800 shadow-sm dark:border-slate-600/80 dark:bg-slate-900 dark:text-slate-200">{human}</div>
          </div>
          <div className="flex justify-start">
            <div className="w-full border-l-2 border-rose-500/45 px-2 py-1 font-mono text-[10px] leading-4 text-rose-900 dark:border-rose-400/55 dark:text-rose-100">{fail}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuccessIllust({ human, succeed }: { human: string; succeed: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-emerald-500/25 bg-gradient-to-b from-white via-slate-50 to-emerald-50/30 p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:border-emerald-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.10),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.06),transparent_35%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.14),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.10),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(to_bottom,rgba(100,116,139,0.2)_1px,transparent_1px)] [background-size:100%_10px] dark:opacity-15" />
      <div className="relative overflow-hidden rounded-lg border border-emerald-500/30 bg-white/95 dark:border-emerald-400/25 dark:bg-slate-950/90">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-emerald-500/25 px-3 py-1.5 text-[9px] uppercase tracking-wide text-emerald-800/90 dark:border-emerald-400/20 dark:text-emerald-200/70">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400/75 dark:bg-rose-500/80" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300/75 dark:bg-amber-500/80" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/75 dark:bg-emerald-500/80" />
          </div>
          <span className="text-center whitespace-nowrap">with state integrity</span>
          <div />
        </div>
        <div className="flex flex-col gap-1.5 p-2.5">
          <div className="flex justify-end">
            <div className="max-w-[90%] rounded-md border border-slate-300 bg-slate-200 px-2 py-1 text-right font-mono text-[10px] leading-4 text-slate-800 shadow-sm dark:border-slate-600/80 dark:bg-slate-900 dark:text-slate-200">{human}</div>
          </div>
          <div className="flex justify-start">
            <div className="w-full border-l-2 border-emerald-500/45 px-2 py-1 font-mono text-[10px] leading-4 text-emerald-900 dark:border-emerald-400/55 dark:text-emerald-100">{succeed}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Architecture diagram                                               */
/* ------------------------------------------------------------------ */

function ArchDiagram({ config, t }: { config: VerticalArchConfig; t: VTheme }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div className="space-y-3">
        <div className="rounded-lg border-2 border-sky-500/30 bg-sky-500/5 px-4 py-3 text-center">
          <p className="text-[13px] font-medium text-sky-700 dark:text-sky-300">{config.topLabel}</p>
          <p className="text-[11px] text-sky-600/70 dark:text-sky-400/70">{config.topDesc}</p>
        </div>
        <div className="flex justify-center">
          <div className="flex flex-col items-center gap-0.5 text-muted-foreground/50">
            <div className="h-3 w-px bg-current" />
            <ChevronDown className="h-3 w-3" />
          </div>
        </div>
        <div className={`rounded-lg px-4 py-3 ${t.archBorder}`}>
          <div className="text-center">
            <p className={`text-[13px] font-medium ${t.textDarker}`}>Neotoma State Integrity Layer</p>
            <p className={`text-[11px] ${t.textMuted}`}>Versioned, deterministic, auditable</p>
          </div>
          <div className={`mt-3 grid gap-2`} style={{ gridTemplateColumns: `repeat(${Math.min(config.interfaces.length, 4)}, minmax(0, 1fr))` }}>
            {config.interfaces.map(({ label, Icon }) => (
              <div key={label} className={`flex items-center justify-center gap-1 rounded border ${t.borderLight} ${t.bg5} px-2 py-1.5`}>
                <Icon className={`h-3 w-3 ${t.text}`} />
                <span className={`text-[10px] font-mono ${t.textDarker}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-center">
          <div className="flex flex-col items-center gap-0.5 text-muted-foreground/50">
            <div className="h-3 w-px bg-current" />
            <ChevronDown className="h-3 w-3" />
          </div>
        </div>
        <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${Math.min(config.dataSources.length, 3)}, minmax(0, 1fr))` }}>
          {config.dataSources.map((source) => (
            <div key={source} className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-center">
              <p className="text-[10px] font-mono text-muted-foreground">{source}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main shell                                                         */
/* ------------------------------------------------------------------ */

export function VerticalLandingShell({ config }: { config: VerticalConfig }) {
  const t = T[config.accentColor];
  const BadgeIcon = config.badgeIcon;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState("hero");
  const [showAllMobileOutcomes, setShowAllMobileOutcomes] = useState(false);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        }
      },
      { root: container, threshold: 0.5 },
    );
    for (const section of LANDING_SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <SeoHead />
      <div ref={scrollContainerRef} className="h-screen overflow-y-auto scroll-smooth md:snap-y md:snap-mandatory">
        {/* Dot nav */}
        <nav className="fixed right-4 top-1/2 z-50 hidden -translate-y-1/2 flex-col gap-2 md:flex" aria-label="Page sections">
          {LANDING_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`group relative flex items-center justify-end ${activeSection === s.id ? "opacity-100" : "opacity-50"} hover:opacity-100 transition-opacity`}
              onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" })}
              aria-label={s.label}
            >
              <span className="pointer-events-none absolute right-full mr-2 hidden whitespace-nowrap text-[10px] font-mono text-muted-foreground group-hover:block">{s.label}</span>
              <span className={`h-2 w-2 rounded-full transition-colors ${activeSection === s.id ? t.dot : "bg-muted-foreground/30"}`} />
            </button>
          ))}
        </nav>

        {/* Hero */}
        <section id="hero" className={SLIDE_CLASS}>
          <div className={SLIDE_INNER}>
            <div className="grid gap-10 lg:gap-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center">
              <div className="space-y-6 pt-0 md:pt-12">
                <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${t.badgeBorderBg}`}>
                  <BadgeIcon className={`h-3.5 w-3.5 ${t.icon}`} />
                  <span className={`text-[12px] font-medium ${t.text}`}>{config.badgeText}</span>
                </div>
                <h1 className="text-[28px] md:text-[36px] font-medium tracking-[-0.02em] leading-tight">
                  {config.heroTitle}{" "}
                  <span className={t.text}>{config.heroHighlight}</span>
                </h1>
                <p className="text-[15px] md:text-[17px] leading-7 text-muted-foreground max-w-xl">{config.heroDesc}</p>
                <div className="flex flex-wrap gap-2">
                  {config.heroTags.map(({ tag, Icon }) => (
                    <span key={tag} className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[12px] font-medium ${t.badgeBorderBg} ${t.text}`}>
                      <Icon className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" aria-hidden />
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    to="/install"
                    className={`inline-flex w-full sm:w-auto justify-center items-center gap-1.5 rounded-md border px-5 py-2.5 text-[14px] font-medium text-white no-underline shadow-sm transition-colors ${t.cta}`}
                    onClick={() => sendCtaClick(`${config.analyticsPrefix}_install_neotoma`)}
                  >
                    Install Neotoma
                  </Link>
                  <a
                    href="#architecture"
                    className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5 rounded-md border border-border bg-card px-5 py-2.5 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById("architecture")?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    See the architecture
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
                  {config.heroFeatures.map((f, i) => (
                    <span key={f}>
                      {i > 0 && <span className="text-border mr-3">&middot;</span>}
                      {f}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <AgentChatDemo scenarios={config.scenarios} agentLabel={config.agentLabel} />
              </div>
            </div>
          </div>
        </section>

        {/* Problem */}
        <section id="problem" className={SLIDE_CLASS}>
          <div className={SLIDE_INNER}>
            <div className="space-y-8 max-w-5xl mx-auto">
              <div className="space-y-2">
                <p className={`text-[11px] font-mono uppercase tracking-widest ${t.text}`}>The problem</p>
                <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">{config.problemTitle}</h2>
                <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">{config.problemDesc}</p>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {config.problemCards.map(({ Icon, title, desc }) => (
                  <div key={title} className="rounded-lg border border-rose-500/15 bg-rose-500/[0.03] p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-rose-500/70" />
                      <span className="text-[13px] font-medium text-foreground">{title}</span>
                    </div>
                    <p className="text-[13px] leading-5 text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-border bg-card p-5 space-y-3">
                <p className="flex items-center gap-2 text-[14px] font-medium text-foreground">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                  {config.problemCallout}
                </p>
                <p className="text-[13px] leading-6 text-muted-foreground">{config.problemCalloutDesc}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Outcomes */}
        <section id="outcomes" className={SLIDE_CLASS}>
          <div className={SLIDE_INNER}>
            <div className="space-y-5 md:space-y-8 max-w-5xl mx-auto">
              <div className="space-y-2">
                <p className={`text-[11px] font-mono uppercase tracking-widest ${t.text}`}>Before &amp; after</p>
                <h2 className="text-[24px] font-medium tracking-[-0.02em]">{config.outcomeTitle}</h2>
                <p className="text-[15px] leading-7 text-foreground/90 max-w-2xl">{config.outcomeDesc}</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-10">
                {config.scenarios.map(({ category, human, fail, succeed, failTitle, failDesc, Icon }, idx) => {
                  const hidden = !showAllMobileOutcomes && idx >= MOBILE_OUTCOME_PREVIEW_COUNT;
                  return (
                    <div key={category} className={`space-y-3${hidden ? " hidden lg:block" : ""}`}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{category}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        <FailIllust human={human} fail={fail} />
                        <SuccessIllust human={human} succeed={succeed} />
                      </div>
                      <div className="space-y-1 px-0.5">
                        <p className="text-[14px] font-medium leading-5 text-foreground">{failTitle}</p>
                        <p className="text-[13px] leading-5 text-muted-foreground">{failDesc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {config.scenarios.length > MOBILE_OUTCOME_PREVIEW_COUNT && (
                <button
                  type="button"
                  className="w-full lg:hidden rounded-lg border border-border bg-card px-3 py-2.5 text-[13px] font-medium text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  onClick={() => setShowAllMobileOutcomes(!showAllMobileOutcomes)}
                >
                  {showAllMobileOutcomes ? "Show fewer" : `Show all ${config.scenarios.length} examples`}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className={SLIDE_CLASS}>
          <div className={SLIDE_INNER}>
            <div className="space-y-8 max-w-5xl mx-auto">
              <div className="space-y-2">
                <p className={`text-[11px] font-mono uppercase tracking-widest ${t.text}`}>How it works</p>
                <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">{config.howTitle}</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                {config.steps.map(({ Icon, title, desc, detail }, i) => (
                  <div key={title} className="rounded-lg border border-border bg-card p-5 space-y-3 relative">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full border text-[14px] font-medium ${t.border30} ${t.bg10} ${t.text}`}>{i + 1}</span>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-[16px] font-medium text-foreground">{title}</span>
                      </div>
                    </div>
                    <p className="text-[14px] leading-6 text-muted-foreground">{desc}</p>
                    <p className={`text-[12px] font-medium ${t.textDetail}`}>{detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section id="capabilities" className={SLIDE_CLASS}>
          <div className={SLIDE_INNER}>
            <div className="space-y-8 max-w-5xl mx-auto">
              <div className="space-y-2">
                <p className={`text-[11px] font-mono uppercase tracking-widest ${t.text}`}>{config.capSubtitle}</p>
                <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">{config.capTitle}</h2>
                <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">{config.capDesc}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {config.capabilities.map(({ Icon, title, desc, tags }) => (
                  <div key={title} className="rounded-lg border border-border bg-card p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${t.icon}`} />
                      <span className="text-[15px] font-medium text-foreground">{title}</span>
                    </div>
                    <p className="text-[13px] leading-6 text-muted-foreground">{desc}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <span key={tag} className={`rounded border px-2 py-0.5 text-[10px] font-mono ${t.borderLight} ${t.bg5} ${t.text}`}>{tag}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Architecture */}
        <section id="architecture" className={SLIDE_CLASS}>
          <div className={SLIDE_INNER}>
            <div className="space-y-8 max-w-5xl mx-auto">
              <div className="space-y-2">
                <p className={`text-[11px] font-mono uppercase tracking-widest ${t.text}`}>Architecture</p>
                <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">{config.archHeadline}</h2>
              </div>
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
                <ArchDiagram config={config.archConfig} t={t} />
                <div className="space-y-5">
                  <p className="text-[15px] leading-7 text-muted-foreground">{config.archDesc}</p>
                  <ul className="list-none pl-0 space-y-3">
                    {config.archSteps.map((item) => (
                      <li key={item.label} className="flex items-start gap-2.5">
                        <span className={`mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} />
                        <span className="text-[14px] leading-6">
                          <span className="font-medium text-foreground">{item.label}.</span>{" "}
                          <span className="text-muted-foreground">{item.desc}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-3">
                    <Link to="/architecture" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors">
                      <Network className="h-4 w-4" />
                      Full architecture
                    </Link>
                    <Link to="/mcp" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors">
                      <Layers className="h-4 w-4" />
                      MCP reference
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Case study */}
        <section id="case-study" className={SLIDE_CLASS}>
          <div className={SLIDE_INNER}>
            <div className="space-y-8 max-w-5xl mx-auto">
              <div className="space-y-2">
                <p className={`text-[11px] font-mono uppercase tracking-widest ${t.text}`}>In practice</p>
                <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                  How {config.caseStudy.companyName} uses Neotoma as its integrity layer
                </h2>
                <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
                  <a
                    href={config.caseStudy.companyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
                    onClick={() => sendOutboundClick(config.caseStudy.companyUrl, `${config.caseStudy.companyName} case study`)}
                  >
                    {config.caseStudy.companyName}
                  </a>{" "}
                  {config.caseStudy.companyDesc}
                </p>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-sky-500" />
                    <span className="text-[14px] font-medium text-foreground">What {config.caseStudy.companyName} does</span>
                  </div>
                  <ul className="list-none pl-0 space-y-2.5">
                    {config.caseStudy.features.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-[13px] leading-5 text-muted-foreground">
                        <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-sky-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={`rounded-lg border p-5 space-y-4 ${t.borderMed} ${t.bg3}`}>
                  <div className="flex items-center gap-2">
                    <Check className={`h-4 w-4 ${t.icon}`} />
                    <span className="text-[14px] font-medium text-foreground">What Neotoma guarantees underneath</span>
                  </div>
                  <ul className="list-none pl-0 space-y-2.5">
                    {config.caseStudy.guarantees.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-[13px] leading-5 text-muted-foreground">
                        <Check className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${t.icon}`} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/10">
                    <Building2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[14px] font-medium text-foreground">{config.caseStudy.generalizesTitle}</p>
                    <p className="text-[13px] leading-6 text-muted-foreground">{config.caseStudy.generalizesDesc}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href={config.caseStudy.companyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                  onClick={() => sendOutboundClick(config.caseStudy.companyUrl, `${config.caseStudy.companyName} visit`)}
                >
                  Visit {config.caseStudy.companyName}
                  <ArrowRight className="h-4 w-4" />
                </a>
                <Link to="/memory-guarantees" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors">
                  Memory guarantees
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section id="get-started" className={SLIDE_CLASS}>
          <div className={SLIDE_INNER}>
            <div className="max-w-3xl mx-auto text-center space-y-8">
              <div className="space-y-4">
                <p className={`text-[11px] font-mono uppercase tracking-widest ${t.text}`}>Get started</p>
                <h2 className="text-[28px] md:text-[32px] font-medium tracking-[-0.02em]">
                  {config.ctaHeadline}{" "}
                  <span className={t.text}>{config.ctaHighlight}</span>
                </h2>
                <p className="text-[15px] md:text-[17px] leading-7 text-muted-foreground max-w-xl mx-auto">{config.ctaDesc}</p>
              </div>
              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <Link
                  to="/install"
                  className={`inline-flex justify-center items-center gap-1.5 rounded-md border px-6 py-2.5 text-[14px] font-medium text-white no-underline shadow-sm transition-colors ${t.cta}`}
                  onClick={() => sendCtaClick(`${config.analyticsPrefix}_install_neotoma_bottom`)}
                >
                  Install Neotoma
                </Link>
                <Link to="/docs" className="inline-flex justify-center items-center gap-1.5 rounded-md border border-border bg-card px-6 py-2.5 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors">
                  Read the docs
                </Link>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-4 text-[12px] text-muted-foreground">
                {config.ctaFeatures.map((label) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <Check className={`h-3.5 w-3.5 ${t.icon}`} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <Link to="/" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-[13px] font-medium text-foreground no-underline hover:bg-muted transition-colors">Neotoma home</Link>
                <Link to="/architecture" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-[13px] font-medium text-foreground no-underline hover:bg-muted transition-colors">Architecture</Link>
                <Link to="/memory-guarantees" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-[13px] font-medium text-foreground no-underline hover:bg-muted transition-colors">Memory guarantees</Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

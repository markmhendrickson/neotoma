import {
  AlertTriangle,
  ArrowRight,
  Brain,
  Building2,
  Check,
  ChevronDown,
  Database,
  Eraser,
  Eye,
  FileCode,
  Fingerprint,
  GitBranch,
  Globe2,
  Handshake,
  History,
  Layers,
  Link2,
  Network,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SeoHead } from "../SeoHead";
import { sendCtaClick, sendOutboundClick } from "@/utils/analytics";
import { SiClaude, SiOpenai } from "react-icons/si";
import { CursorIcon } from "../icons/CursorIcon";
import { OpenClawIcon } from "../icons/OpenClawIcon";

const PROSPECT_CRM_URL = "https://preview--debut-domicile.lovable.app/";

const SLIDE_CLASS = "min-h-[100svh] md:snap-start flex items-center justify-center relative";
const SLIDE_INNER = "w-full max-w-6xl mx-auto px-6 md:px-12 lg:px-16 py-20 md:py-12";

const CRM_SCENARIOS = [
  {
    human: "Who should I loop in on the Meridian renewal?",
    fail: "Sending to Sarah Kim, VP of Partnerships at Meridian.",
    succeed:
      "Sarah Kim left Meridian in January. Current VP of Partnerships is Dana Park (started Feb 1). Loop in James from solutions engineering; he ran the last QBR on Mar 3.",
    version: "account\u00B7v8",
    category: "Account intelligence",
    failTitle: "Stale contact, wrong person",
    failDesc:
      "The AI pulled a contact who left the company two months ago. Without versioned records, there was no way to know the role had changed, so the outreach went to someone who no longer works there.",
  },
  {
    human: "What happened with the Apex deal after last quarter?",
    fail: "Apex deal is $50K ARR, closed-won in November.",
    succeed:
      "Apex deal was $50K ARR, closed-won Nov 15. Expansion negotiation reopened Feb 28 for $120K; legal redlined clause 4.2. VP Sales call Mar 12, verbal commitment pending procurement.",
    version: "opportunity\u00B7v11",
    category: "Pipeline tracking",
    failTitle: "Missing the expansion, stuck on stale data",
    failDesc:
      "The original deal closed, but a $120K expansion was reopened in February. The CRM only shows the last-written stage, so the AI reported the old close and missed an active six-figure negotiation.",
  },
  {
    human: "Show me all contacts who changed roles this quarter.",
    fail: "No role changes found in Q1.",
    succeed:
      "7 contacts changed roles in Q1: 3 moved to target accounts, 2 promoted to decision-making roles. Highest priority: Carla Reyes, now VP Ops at Keystone.",
    version: "contact\u00B7v14",
    category: "Relationship management",
    failTitle: "Zero changes reported, seven actually happened",
    failDesc:
      "Without version history on contact records, role changes are invisible: the old title is silently overwritten. The AI reported zero changes while seven contacts moved, three into target accounts.",
  },
  {
    human: "Has anyone on our team talked to NovaTech recently?",
    fail: "No recent activity found for NovaTech.",
    succeed:
      "3 touchpoints this month: Sarah had a discovery call Mar 5, Mike sent a proposal Mar 11, Eva met their CTO at CloudConf on Mar 18.",
    version: "activity\u00B7v6",
    category: "Engagement history",
    failTitle: "Three touchpoints, completely invisible",
    failDesc:
      "Emails, calls, and event encounters lived in three separate systems. The CRM only tracked logged meetings, so the AI saw nothing and the rep unknowingly duplicated outreach the following week.",
  },
];

const SCENE_MS = 5000;
const TYPE_MS = 1700;
const THINK_MS = 900;
const TRANS_FADE_MS = 1000;
const TRANS_DELAY_MS = 1200;
const TRANS_MS = TRANS_FADE_MS + TRANS_DELAY_MS + TRANS_FADE_MS;
const PHASE_MS = CRM_SCENARIOS.length * SCENE_MS;
const END_DELAY_MS = TRANS_DELAY_MS;
const TOTAL_MS = PHASE_MS + TRANS_MS + PHASE_MS + END_DELAY_MS;
const MODE_SWITCH_MS = PHASE_MS + TRANS_FADE_MS + TRANS_DELAY_MS;
const BEFORE_RATIO = MODE_SWITCH_MS / TOTAL_MS;

type CrmIllustMsg = {
  key: string;
  role: "human" | "agent" | "label";
  text: string;
  thinking: boolean;
  fail: boolean;
  version?: string;
};

function CrmTypewriterBadge({ text, delayMs = 35 }: { text: string; delayMs?: number }) {
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

function buildCrmPhaseMessages(
  phaseElapsed: number,
  fail: boolean,
  prefix: string
): CrmIllustMsg[] {
  const msgs: CrmIllustMsg[] = [];
  for (let i = 0; i < CRM_SCENARIOS.length; i++) {
    const se = phaseElapsed - i * SCENE_MS;
    if (se < 0) break;
    const s = CRM_SCENARIOS[i];
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

function AgentChatDemo({ className = "" }: { className?: string }) {
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

  let msgs: CrmIllustMsg[] = [];
  if (isBefore) {
    msgs = [...buildCrmPhaseMessages(elapsed, true, "b")];
  } else if (!isAfter) {
    if (elapsed < fadeInStart) {
      msgs = [...buildCrmPhaseMessages(PHASE_MS, true, "b")];
    } else {
      msgs = [
        { key: "lbl-a", role: "label", text: "with state layer", thinking: false, fail: false },
      ];
    }
  } else {
    const afterElapsed = Math.min(elapsed - PHASE_MS - TRANS_MS, PHASE_MS);
    msgs = [
      { key: "lbl-a", role: "label", text: "with state layer", thinking: false, fail: false },
      ...buildCrmPhaseMessages(afterElapsed, false, "a"),
    ];
  }

  let composerText = "";
  let composerTyping = false;
  let composerTypeKey = "idle";
  let composerDelayMs = 40;
  if (isBefore) {
    const idx = Math.min(Math.floor(elapsed / SCENE_MS), CRM_SCENARIOS.length - 1);
    const se = elapsed - idx * SCENE_MS;
    if (se < TYPE_MS) {
      composerText = CRM_SCENARIOS[idx].human;
      composerTyping = true;
      composerTypeKey = `b-${idx}`;
      composerDelayMs = Math.max(14, Math.floor(TYPE_MS / Math.max(1, composerText.length)));
    }
  } else if (isAfter) {
    const ae = Math.min(elapsed - PHASE_MS - TRANS_MS, PHASE_MS);
    const idx = Math.min(Math.floor(ae / SCENE_MS), CRM_SCENARIOS.length - 1);
    const se = ae - idx * SCENE_MS;
    if (se < TYPE_MS) {
      composerText = CRM_SCENARIOS[idx].human;
      composerTyping = true;
      composerTypeKey = `a-${idx}`;
      composerDelayMs = Math.max(14, Math.floor(TYPE_MS / Math.max(1, composerText.length)));
    }
  }

  useEffect(() => {
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
                          <CrmTypewriterBadge text={m.text} delayMs={18} />
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
                  <CrmTypewriterBadge
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
                  className="absolute inset-y-0 right-0 bg-emerald-300/40 dark:bg-emerald-500/25"
                  style={{ width: `${(1 - BEFORE_RATIO) * 100}%` }}
                />
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

function CrmFailureIllustration({ human, fail }: { human: string; fail: string }) {
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

function CrmSuccessIllustration({ human, succeed }: { human: string; succeed: string }) {
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

function ArchitectureDiagram({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-6 space-y-4 ${className}`}>
      <div className="space-y-3">
        <div className="rounded-lg border-2 border-sky-500/30 bg-sky-500/5 px-4 py-3 text-center">
          <p className="text-[13px] font-medium text-sky-700 dark:text-sky-300">
            Your Next-Gen CRM
          </p>
          <p className="text-[11px] text-sky-600/70 dark:text-sky-400/70">
            AI-native features, dashboards, workflows
          </p>
        </div>

        <div className="flex justify-center">
          <div className="flex flex-col items-center gap-0.5 text-muted-foreground/50">
            <div className="h-3 w-px bg-current" />
            <ChevronDown className="h-3 w-3" />
          </div>
        </div>

        <div className="rounded-lg border-2 border-emerald-500/40 bg-emerald-500/5 px-4 py-3">
          <div className="text-center">
            <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-300">
              Neotoma State Layer
            </p>
            <p className="text-[11px] text-emerald-600/70 dark:text-emerald-400/70">
              Deterministic, versioned, auditable
            </p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { label: "MCP", icon: Zap },
              { label: "REST API", icon: Globe2 },
              { label: "CLI", icon: FileCode },
            ].map(({ label, icon: Icon }) => (
              <div
                key={label}
                className="flex items-center justify-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5"
              >
                <Icon className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300">
                  {label}
                </span>
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

        <div className="grid grid-cols-3 gap-2">
          {["Email / Calendar", "Social / Enrichment", "Legacy Systems"].map((source) => (
            <div
              key={source}
              className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-center"
            >
              <p className="text-[10px] font-mono text-muted-foreground">{source}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const MOBILE_OUTCOME_PREVIEW_COUNT = 2;

const LANDING_SECTIONS = [
  { id: "hero", label: "Overview" },
  { id: "problem", label: "The Problem" },
  { id: "outcomes", label: "Before / After" },
  { id: "how-it-works", label: "How It Works" },
  { id: "capabilities", label: "Capabilities" },
  { id: "architecture", label: "Architecture" },
  { id: "case-study", label: "Case Study" },
  { id: "get-started", label: "Get Started" },
];

export function CrmLandingPage() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState("hero");
  const [showAllMobileOutcomes, setShowAllMobileOutcomes] = useState(false);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { root: container, threshold: 0.5 }
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
      <div
        ref={scrollContainerRef}
        className="h-screen overflow-y-auto scroll-smooth md:snap-y md:snap-mandatory"
      >
        {/* Dot nav */}
        <nav
          className="fixed right-4 top-1/2 z-50 hidden -translate-y-1/2 flex-col gap-2 md:flex"
          aria-label="Page sections"
        >
          {LANDING_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`group relative flex items-center justify-end ${
                activeSection === section.id ? "opacity-100" : "opacity-50"
              } hover:opacity-100 transition-opacity`}
              onClick={() =>
                document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth" })
              }
              aria-label={section.label}
            >
              <span className="pointer-events-none absolute right-full mr-2 hidden whitespace-nowrap text-[10px] font-mono text-muted-foreground group-hover:block">
                {section.label}
              </span>
              <span
                className={`h-2 w-2 rounded-full transition-colors ${
                  activeSection === section.id ? "bg-emerald-500" : "bg-muted-foreground/30"
                }`}
              />
            </button>
          ))}
        </nav>

        {/* Section 1: Hero */}
        <section id="hero" className={SLIDE_CLASS}>
          <div className={SLIDE_INNER}>
            <div className="grid gap-10 lg:gap-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center">
              <div className="space-y-6 pt-0 md:pt-12">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1">
                  <Building2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
                    Neotoma for CRM
                  </span>
                </div>

                <h1 className="text-[28px] md:text-[36px] font-medium tracking-[-0.02em] leading-tight">
                  The state layer for{" "}
                  <span className="text-emerald-600 dark:text-emerald-400">
                    next-generation CRM
                  </span>
                </h1>

                <p className="text-[15px] md:text-[17px] leading-7 text-muted-foreground max-w-xl">
                  The next wave of CRM platforms will be AI-native from day one, but intelligence is
                  only as good as the state underneath. Neotoma provides the deterministic
                  foundation where every contact, deal, and relationship is versioned, schema-bound,
                  auditable, and never silently wrong.
                </p>

                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/80">
                    Key data to store
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { tag: "Contacts", Icon: Users },
                      { tag: "Accounts", Icon: Building2 },
                      { tag: "Deals", Icon: Handshake },
                      { tag: "Activities", Icon: History },
                      { tag: "Relationships", Icon: Network },
                    ].map(({ tag, Icon }) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 rounded border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-[12px] font-medium text-emerald-600 dark:text-emerald-400"
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" aria-hidden />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    to="/install"
                    className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5 rounded-md border border-emerald-600 bg-emerald-600 px-5 py-2.5 text-[14px] font-medium text-white no-underline shadow-sm shadow-emerald-600/30 hover:bg-emerald-500 transition-colors dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950"
                    onClick={() => sendCtaClick("crm_install_neotoma")}
                  >
                    Install Neotoma
                  </Link>
                  <a
                    href="#architecture"
                    className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5 rounded-md border border-border bg-card px-5 py-2.5 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      document
                        .getElementById("architecture")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    See the architecture
                    <ArrowRight className="h-4 w-4" />
                  </a>
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
                      Guarantees
                    </p>
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      {[
                        { tag: "Versioned", Icon: GitBranch },
                        { tag: "Schema-bound", Icon: FileCode },
                        { tag: "Auditable", Icon: Eye },
                        { tag: "Replayable", Icon: RotateCcw },
                      ].map(({ tag, Icon }) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] text-foreground/90"
                        >
                          <Icon className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <AgentChatDemo />
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: The Problem */}
        <section id="problem" className={SLIDE_CLASS}>
          <div className={SLIDE_INNER}>
            <div className="space-y-8 max-w-5xl mx-auto">
              <div className="space-y-2">
                <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  The problem
                </p>
                <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                  Legacy CRMs weren&apos;t built for AI. The next ones need to be.
                </h2>
                <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
                  Traditional CRMs store records in flat tables with no versioning, no provenance,
                  and no schema enforcement. When AI tries to reason over that data, it inherits
                  every inconsistency. The next generation of CRM needs a fundamentally different
                  state architecture.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    Icon: History,
                    title: "No version history",
                    desc: "A contact's role changed, but the old record was overwritten. The AI has no way to know what it used to say or why it changed.",
                  },
                  {
                    Icon: Eraser,
                    title: "Silent overwrites",
                    desc: "Two integrations updated the same deal record. One won. No audit trail, no conflict detection, no way to recover the other version.",
                  },
                  {
                    Icon: Eye,
                    title: "No provenance",
                    desc: "The AI recommends an action, but nobody can trace which data points drove the recommendation or when they were last verified.",
                  },
                  {
                    Icon: FileCode,
                    title: "Schema drift",
                    desc: "Fields are added ad hoc, types are inconsistent, required data is missing. The AI reasons over a schema that nobody enforces.",
                  },
                ].map(({ Icon, title, desc }) => (
                  <div
                    key={title}
                    className="rounded-lg border border-rose-500/15 bg-rose-500/[0.03] p-4 space-y-2"
                  >
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
                  Building AI-native CRM on legacy data infrastructure is a dead end.
                </p>
                <p className="text-[13px] leading-6 text-muted-foreground">
                  The next generation of CRM platforms needs a state layer designed for AI from the
                  ground up: versioned entities, schema enforcement, full provenance, and
                  deterministic resolution. Neotoma provides that foundation so you can build
                  intelligent CRM features on data you can trust.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Same question, different outcome */}
        <section id="outcomes" className={SLIDE_CLASS}>
          <div className={SLIDE_INNER}>
            <div className="space-y-5 md:space-y-8 max-w-5xl mx-auto">
              <div className="space-y-2">
                <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  Before &amp; after
                </p>
                <h2 className="flex items-center gap-2 text-[24px] font-medium tracking-[-0.02em]">
                  <Scale
                    className="hidden md:block h-5 w-5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span>Same question, different outcome</span>
                </h2>
                <p className="text-[15px] leading-7 text-foreground/90 max-w-2xl">
                  Without a state layer, your CRM&apos;s AI returns stale contacts, lost deal
                  history, and invisible activity. With Neotoma, every response reads from
                  versioned, schema-bound state.
                </p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-10">
                {CRM_SCENARIOS.map(
                  ({ category, human, fail, succeed, failTitle, failDesc }, idx) => {
                    const Icon = [Users, Handshake, Network, Search][idx] ?? Users;
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
                          <CrmFailureIllustration human={human} fail={fail} />
                          <CrmSuccessIllustration human={human} succeed={succeed} />
                        </div>
                        <div className="space-y-1 px-0.5">
                          <p className="text-[14px] font-medium leading-5 text-foreground">
                            {failTitle}
                          </p>
                          <p className="text-[13px] leading-5 text-muted-foreground">{failDesc}</p>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
              {CRM_SCENARIOS.length > MOBILE_OUTCOME_PREVIEW_COUNT && (
                <button
                  type="button"
                  className="w-full lg:hidden rounded-lg border border-border bg-card px-3 py-2.5 text-[13px] font-medium text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  onClick={() => setShowAllMobileOutcomes(!showAllMobileOutcomes)}
                >
                  {showAllMobileOutcomes
                    ? "Show fewer"
                    : `Show all ${CRM_SCENARIOS.length} examples`}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Section 4: How it works */}
        <section id="how-it-works" className={SLIDE_CLASS}>
          <div className={SLIDE_INNER}>
            <div className="space-y-8 max-w-5xl mx-auto">
              <div className="space-y-2">
                <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  How it works
                </p>
                <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                  Build your CRM on a state layer designed for AI
                </h2>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                {[
                  {
                    step: "1",
                    Icon: Link2,
                    title: "Ingest",
                    desc: "Bring in contacts, accounts, deals, and interactions from any source (email, calendar, enrichment APIs, legacy systems). Every record arrives as a versioned observation with full provenance.",
                    detail: "No migration required. Your sources stay intact.",
                  },
                  {
                    step: "2",
                    Icon: Database,
                    title: "Resolve",
                    desc: "Neotoma deduplicates, merges, and schema-validates every entity. Conflicting records are flagged, not silently overwritten. Each contact, account, and opportunity gets a canonical, versioned identity.",
                    detail: "Deterministic entity resolution. Same inputs, same state.",
                  },
                  {
                    step: "3",
                    Icon: Brain,
                    title: "Serve",
                    desc: "Your platform's AI features read from Neotoma's state layer via MCP or REST API. Every recommendation, score, and summary traces back to versioned facts, not inference.",
                    detail: "Answers grounded in auditable state, not approximation.",
                  },
                ].map(({ step, Icon, title, desc, detail }) => (
                  <div
                    key={step}
                    className="rounded-lg border border-border bg-card p-5 space-y-3 relative"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[14px] font-medium text-emerald-600 dark:text-emerald-400">
                        {step}
                      </span>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-[16px] font-medium text-foreground">{title}</span>
                      </div>
                    </div>
                    <p className="text-[14px] leading-6 text-muted-foreground">{desc}</p>
                    <p className="text-[12px] text-emerald-600/80 dark:text-emerald-400/80 font-medium">
                      {detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Capabilities */}
        <section id="capabilities" className={SLIDE_CLASS}>
          <div className={SLIDE_INNER}>
            <div className="space-y-8 max-w-5xl mx-auto">
              <div className="space-y-2">
                <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  What Neotoma enables
                </p>
                <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                  Guarantees that legacy CRMs can&apos;t offer
                </h2>
                <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
                  Traditional CRM databases store the latest value and discard the rest. Neotoma
                  gives your platform state guarantees that make AI features trustworthy from day
                  one.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {[
                  {
                    Icon: GitBranch,
                    title: "Versioned contact graph",
                    desc: "Every contact change (title, company, email, account assignment) creates a new version. Your platform always reads the latest, with full change history available for audit or rollback.",
                    tags: ["contact\u00B7v12", "account\u00B7v6"],
                  },
                  {
                    Icon: ShieldCheck,
                    title: "Schema-validated pipeline",
                    desc: "Opportunities follow defined schemas: stage, value, owner, close date. Invalid transitions (e.g., skipping qualification) are rejected at the state layer, not papered over by the AI.",
                    tags: ["opportunity\u00B7v8", "pipeline\u00B7v3"],
                  },
                  {
                    Icon: Eye,
                    title: "Auditable provenance",
                    desc: "When the AI recommends an action, every claim traces to a specific observation: this email thread, that calendar event, this CRM field update. No black-box scoring.",
                    tags: ["activity\u00B7v5", "provenance\u00B7audit"],
                  },
                  {
                    Icon: RotateCcw,
                    title: "Replayable account history",
                    desc: "Reconstruct the state of any account, pipeline, or relationship at any point in time. Useful for QBRs, forecasting audits, and compliance reviews.",
                    tags: ["account\u00B7v9", "snapshot\u00B7replay"],
                  },
                  {
                    Icon: Search,
                    title: "Structured retrieval",
                    desc: "Query by entity type, relationship, or time window. 'Show all contacts from closed-won deals in 2024 who moved companies' resolves to structured state, not keyword search.",
                    tags: ["graph\u00B7query", "structured\u00B7retrieval"],
                  },
                  {
                    Icon: Fingerprint,
                    title: "Privacy-first, local-first",
                    desc: "Customer data, deal terms, and relationship graphs stay on your infrastructure. Neotoma runs locally: no cloud sync, no third-party access, no training on your data.",
                    tags: ["local\u00B7storage", "zero\u00B7cloud"],
                  },
                ].map(({ Icon, title, desc, tags }) => (
                  <div
                    key={title}
                    className="rounded-lg border border-border bg-card p-5 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-emerald-500" />
                      <span className="text-[15px] font-medium text-foreground">{title}</span>
                    </div>
                    <p className="text-[13px] leading-6 text-muted-foreground">{desc}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-[10px] font-mono text-emerald-600 dark:text-emerald-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Architecture */}
        <section id="architecture" className={SLIDE_CLASS}>
          <div className={SLIDE_INNER}>
            <div className="space-y-8 max-w-5xl mx-auto">
              <div className="space-y-2">
                <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  Architecture
                </p>
                <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                  Your platform reads intelligence. Neotoma guarantees truth.
                </h2>
              </div>

              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
                <ArchitectureDiagram className="w-full" />
                <div className="space-y-5">
                  <p className="text-[15px] leading-7 text-muted-foreground">
                    Neotoma sits beneath your CRM platform as its state foundation. It ingests raw
                    data as immutable observations, resolves entities deterministically, and serves
                    a versioned state graph that your AI features read from.
                  </p>
                  <ul className="list-none pl-0 space-y-3">
                    {[
                      {
                        label: "Ingest",
                        desc: "Email threads, calendar events, CRM field updates, and enrichment data arrive as observations with source provenance.",
                      },
                      {
                        label: "Resolve",
                        desc: "Entity resolution merges duplicates, links relationships, and enforces schema constraints. Conflicts surface for review rather than being silently resolved.",
                      },
                      {
                        label: "Serve",
                        desc: "Your platform queries the state layer via MCP or REST API. Every response carries version metadata and provenance.",
                      },
                      {
                        label: "Audit",
                        desc: "Inspect any entity at any version. Diff states between dates. Replay the observation log to reconstruct historical state.",
                      },
                    ].map((item) => (
                      <li key={item.label} className="flex items-start gap-2.5">
                        <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
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
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                    >
                      <Network className="h-4 w-4" />
                      Full architecture
                    </Link>
                    <Link
                      to="/mcp"
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                    >
                      <Layers className="h-4 w-4" />
                      MCP reference
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 6: Case study (ProspectCRM) */}
        <section id="case-study" className={SLIDE_CLASS}>
          <div className={SLIDE_INNER}>
            <div className="space-y-8 max-w-5xl mx-auto">
              <div className="space-y-2">
                <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  In practice
                </p>
                <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em]">
                  How ProspectCRM uses Neotoma as its truth layer
                </h2>
                <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl">
                  <a
                    href={PROSPECT_CRM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
                    onClick={() =>
                      sendOutboundClick(PROSPECT_CRM_URL, "ProspectCRM case study link")
                    }
                  >
                    ProspectCRM
                  </a>{" "}
                  is an AI relationship intelligence platform built for venture capital firms. It
                  surfaces warm intros, tracks deal diligence, and flags LP re-up windows, all
                  backed by Neotoma&apos;s deterministic state layer.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-sky-500" />
                    <span className="text-[14px] font-medium text-foreground">
                      What ProspectCRM does
                    </span>
                  </div>
                  <ul className="list-none pl-0 space-y-2.5">
                    {[
                      "Discovers warm intro paths across LinkedIn, email, and meeting history",
                      "Generates contextual follow-ups based on recent activity and deal stage",
                      "Scores network contacts by relevance to the firm's current investment thesis",
                      "Alerts partners when LPs approach re-up windows or commitment deadlines",
                    ].map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-[13px] leading-5 text-muted-foreground"
                      >
                        <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-sky-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.03] p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    <span className="text-[14px] font-medium text-foreground">
                      What Neotoma guarantees underneath
                    </span>
                  </div>
                  <ul className="list-none pl-0 space-y-2.5">
                    {[
                      "Every contact, deal, and LP commitment is a versioned entity with full observation history",
                      "Warm intro recommendations trace to specific LinkedIn connections and email threads with auditable provenance",
                      "Deal stage transitions are schema-validated: no skipping diligence, no silent field overwrites",
                      "Fund state is replayable: reconstruct any LP commitment or pipeline snapshot at any prior date",
                    ].map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-[13px] leading-5 text-muted-foreground"
                      >
                        <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
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
                    <p className="text-[14px] font-medium text-foreground">
                      The pattern generalizes
                    </p>
                    <p className="text-[13px] leading-6 text-muted-foreground">
                      ProspectCRM is one example of a next-generation CRM built on a deterministic
                      state layer. The same architecture applies to enterprise sales, customer
                      success, recruiting, and any domain where relationship data drives AI-native
                      features. Replace &ldquo;LP commitments&rdquo; with &ldquo;enterprise
                      renewals&rdquo; and the guarantees are identical.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <a
                  href={PROSPECT_CRM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                  onClick={() => sendOutboundClick(PROSPECT_CRM_URL, "ProspectCRM visit")}
                >
                  Visit ProspectCRM
                  <ArrowRight className="h-4 w-4" />
                </a>
                <Link
                  to="/memory-guarantees"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Memory guarantees
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Section 7: CTA */}
        <section id="get-started" className={SLIDE_CLASS}>
          <div className={SLIDE_INNER}>
            <div className="max-w-3xl mx-auto text-center space-y-8">
              <div className="space-y-4">
                <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  Get started
                </p>
                <h2 className="text-[28px] md:text-[32px] font-medium tracking-[-0.02em]">
                  Build the next CRM on{" "}
                  <span className="text-emerald-600 dark:text-emerald-400">reliable state</span>
                </h2>
                <p className="text-[15px] md:text-[17px] leading-7 text-muted-foreground max-w-xl mx-auto">
                  Neotoma is open-source, installs in 5 minutes, and runs locally. Use it as the
                  state foundation for your AI-native CRM platform, so every feature you ship is
                  grounded in data you can trust.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <Link
                  to="/install"
                  className="inline-flex justify-center items-center gap-1.5 rounded-md border border-emerald-600 bg-emerald-600 px-6 py-2.5 text-[14px] font-medium text-white no-underline shadow-sm shadow-emerald-600/30 hover:bg-emerald-500 transition-colors dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950"
                  onClick={() => sendCtaClick("crm_install_neotoma_bottom")}
                >
                  Install Neotoma
                </Link>
                <Link
                  to="/docs"
                  className="inline-flex justify-center items-center gap-1.5 rounded-md border border-border bg-card px-6 py-2.5 text-[14px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                >
                  Read the docs
                </Link>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-4 text-[12px] text-muted-foreground">
                {["Open-source", "Privacy-first", "No cloud sync required", "MIT-licensed"].map(
                  (label) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                      <span>{label}</span>
                    </div>
                  )
                )}
              </div>

              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <Link
                  to="/"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-[13px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                >
                  Neotoma home
                </Link>
                <Link
                  to="/architecture"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-[13px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                >
                  Architecture
                </Link>
                <Link
                  to="/memory-guarantees"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-[13px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
                >
                  Memory guarantees
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

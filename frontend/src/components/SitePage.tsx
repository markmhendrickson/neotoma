import {
  ArrowLeftRight,
  Bug,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  ListChecks,
  Download,
  Receipt,
  Scale,
  Server,
  MessageSquare,
  Users,
  Waypoints,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SiClaude, SiOpenai } from "react-icons/si";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  REPO_RELEASES_COUNT,
  REPO_STARS_COUNT,
  REPO_VERSION,
  MEMORY_GUARANTEE_ROWS,
  ICP_PROFILES,
} from "../site/site_data";
import { useRepoMetaClient } from "../hooks/useRepoMetaClient";
import { HOME_EVALUATE_CTA_CLASS } from "./code_block_copy_button_classes";
import { HomeEvaluatePromptBlock } from "./HomeEvaluatePromptBlock";
import { SeoHead } from "./SeoHead";
import { SectionDotNav } from "./SectionDotNav";
import { SiteTailpiece } from "./SiteTailpiece";
import { CursorIcon } from "./icons/CursorIcon";
import { OpenClawIcon } from "./icons/OpenClawIcon";
import { StateFlowDiagram } from "./illustrations/StateFlowDiagram";
import { WhoProfileCardVisual } from "./WhoProfileCardVisual";
import guaranteeDeterministicStateIllus from "@/assets/images/guarantees/guarantee_sym_deterministic_square.png";
import guaranteeVersionedHistoryIllus from "@/assets/images/guarantees/guarantee_sym_versioned_square.png";
import guaranteeAuditableChangeLogIllus from "@/assets/images/guarantees/guarantee_sym_audit_square.png";
import guaranteeSilentMutationPreventionIllus from "@/assets/images/guarantees/guarantee_sym_silent_square.png";
import guaranteeSchemaConstraintsIllus from "@/assets/images/guarantees/guarantee_sym_schema_square.png";
import guaranteeReproducibleReconstructionIllus from "@/assets/images/guarantees/guarantee_sym_rebuild_square.png";
import heroEvaluateIllus from "@/assets/images/hero/hero_illus_evaluate_agent_page.png";

import { useLocale } from "@/i18n/LocaleContext";
import { sendCtaClick } from "@/utils/analytics";
interface SitePageProps {
  staticMode?: boolean;
}

/** Full home scroll order (edge indicators, sidebar hash targets). FAQ block is not a dot-nav stop. */
const SECTION_ORDER: readonly string[] = [
  "intro",
  "outcomes",
  "who",
  "memory-guarantees",
  "record-types",
  "evaluate",
  "common-questions",
];

const HOME_HASH_SECTION_IDS = new Set<string>(SECTION_ORDER);
/** Right rail dots only: excludes `common-questions` (natural flow before footer). */
const DOT_NAV_SECTION_IDS = new Set<string>(
  SECTION_ORDER.filter((id) => id !== "common-questions")
);

function getLocalizedDotNavSections(pack: ReturnType<typeof useLocale>["pack"]) {
  return [
    { id: "intro", label: pack.siteSections.intro },
    { id: "outcomes", label: pack.siteSections.beforeAfter },
    { id: "who", label: pack.siteSections.who ?? "Who" },
    { id: "memory-guarantees", label: pack.siteSections.guarantees },
    { id: "record-types", label: pack.siteSections.recordTypes ?? "Record types" },
    { id: "evaluate", label: pack.siteSections.evaluate ?? "Evaluate" },
  ];
}

const GUARANTEE_PREVIEW_CARDS: {
  slug: string;
  property: string;
  brief: string;
  status: "guaranteed" | "prevented";
  illus: string;
}[] = [
  {
    slug: "deterministic-state-evolution",
    property: "Deterministic state",
    brief: "Same observations always produce the same entity state - no ordering bugs.",
    status: "guaranteed",
    illus: guaranteeDeterministicStateIllus,
  },
  {
    slug: "versioned-history",
    property: "Versioned history",
    brief: "Every change creates a new version. Nothing is overwritten.",
    status: "guaranteed",
    illus: guaranteeVersionedHistoryIllus,
  },
  {
    slug: "auditable-change-log",
    property: "Auditable change log",
    brief: "Who changed what, when, and from which source.",
    status: "guaranteed",
    illus: guaranteeAuditableChangeLogIllus,
  },
  {
    slug: "silent-mutation-risk",
    property: "Silent mutation prevention",
    brief: "No hidden overwrites or silent data drops.",
    status: "prevented",
    illus: guaranteeSilentMutationPreventionIllus,
  },
  {
    slug: "schema-constraints",
    property: "Schema constraints",
    brief: "Invalid writes rejected at store time.",
    status: "guaranteed",
    illus: guaranteeSchemaConstraintsIllus,
  },
  {
    slug: "reproducible-state-reconstruction",
    property: "Reproducible reconstruction",
    brief: "Rebuild complete state from observations alone.",
    status: "guaranteed",
    illus: guaranteeReproducibleReconstructionIllus,
  },
];

const GUARANTEE_QA: { q: string; a: string }[] = [
  {
    q: "Platform memory (Claude, ChatGPT) is good enough - why add another tool?",
    a: "Platform memory stores what one vendor decides to remember, in a format you can't inspect or export. It doesn't version, doesn't detect conflicts, and vanishes if you switch tools. Neotoma gives you structured, cross-tool state you control.",
  },
  {
    q: "Can't I just build this with SQLite or a JSON file?",
    a: "You can start there - many teams do. But you'll eventually need versioning, conflict detection, schema evolution, and cross-tool sync. That's months of infrastructure work. Neotoma ships those guarantees on day one.",
  },
  {
    q: "Is this production-ready?",
    a: "Neotoma is in developer preview - used daily by real agent workflows. The core guarantees (deterministic state, versioned history, append-only log) are stable. Install in 5 minutes and let your agent evaluate the fit.",
  },
];

/** Home FAQ accordion (before footer); superset of guarantee-focused Q&A plus common install/privacy topics. */
const HOME_FAQ_PREVIEW_ITEMS: { q: string; a: string }[] = [
  ...GUARANTEE_QA,
  {
    q: "Does Neotoma send my data to the cloud?",
    a: "No. Neotoma runs locally by default. Your data stays on your machine in a local SQLite database. There is no cloud sync, no telemetry, and no training on your data unless you choose to expose the API (for example for remote MCP clients).",
  },
  {
    q: "What's the difference between RAG memory and deterministic memory?",
    a: "RAG stores text chunks and retrieves them by similarity for prompts. Neotoma stores structured observations and composes entity state with reducers; the same observations always yield the same snapshot. RAG optimizes relevance; deterministic memory optimizes integrity, versioning, and auditability.",
  },
];

/** Agent memory scenarios: failure (without Neotoma) and success (with Neotoma) variants.
 *  First 4 map to personal-OS data types from the ICP:
 *  [0] Contacts, [1] Tasks & commitments, [2] Financial data, [3] Decisions & provenance */
const SCENARIOS = [
  {
    left: "Send that update to Sarah from the call last week.",
    fail: "No contact named Sarah found.",
    succeed: "Sending to Sarah Chen, met at demo call Mar 24.",
    version: "contact\u00B7v3",
  },
  {
    left: "What did I say I'd follow up on with Nick?",
    fail: "No follow-up items found.",
    succeed: "You committed to sending the architecture doc by Friday.",
    version: "task\u00B7v2",
  },
  {
    left: "How much did I spend on cloud hosting last month?",
    fail: "No hosting expenses found.",
    succeed: "$847 across AWS and Vercel, up 12% from February.",
    version: "transaction\u00B7v5",
  },
  {
    left: "Why did my agent post that tweet yesterday?",
    fail: "No record of a tweet action.",
    succeed: "Drafted from your content pipeline, approved in session #412.",
    version: "decision\u00B7v3",
  },
  {
    left: "Continue where we left off yesterday.",
    fail: "Resuming based on thread from two weeks ago.",
    succeed: "Resuming yesterday's thread on the migration plan.",
    version: "conversation\u00B7v7",
  },
  {
    left: "What's the status of my Modelo 720 filing?",
    fail: "No tax filing data found.",
    succeed: "Draft complete, 14 assets declared, due Mar 31.",
    version: "tax_filing\u00B7v4",
  },
  {
    left: "Which agent session updated my contact list?",
    fail: "No session history available.",
    succeed: "Session #389 in Cursor added 3 contacts from email triage.",
    version: "agent_session\u00B7v2",
  },
  {
    left: "Was the invoice from Acme Corp paid?",
    fail: "Unpaid as of Feb 2.",
    succeed: "Paid Feb 14 via Wise transfer.",
    version: "transaction\u00B7v3",
  },
  {
    left: "Show my open tasks across all projects.",
    fail: "Showing 18 open items.",
    succeed: "Showing 7 open items, 3 due this week.",
    version: "task\u00B7v5",
  },
  {
    left: "Use the new email I gave you for Alex.",
    fail: "Sent to alex@oldcompany.com.",
    succeed: "Sent to alex@newstartup.io, updated Mar 28.",
    version: "contact\u00B7v4",
  },
  {
    left: "When's my next appointment this week?",
    fail: "No upcoming events found.",
    succeed: "Thursday 10am, dentist. Friday 4pm, call with Simon.",
    version: "event\u00B7v2",
  },
];

const OUTCOME_CARDS: {
  category: string;
  Icon: LucideIcon;
  failTitle: string;
  failDescription: string;
  successTitle: string;
  successDescription: string;
  scenarioIndex: number;
}[] = [
  {
    category: "Contacts & people",
    Icon: Users,
    failTitle: "Lost contact, broken handoff",
    failDescription:
      "You mentioned someone in a call last week. Your agent in Cursor has no idea who they are. You re-explain every person, every session, across every tool.",
    successTitle: "One contact graph, every tool",
    successDescription:
      "People mentioned in any session are stored once with versioned history. Switch from Claude to Cursor and the contact is already there - name, context, and last interaction.",
    scenarioIndex: 0,
  },
  {
    category: "Tasks & commitments",
    Icon: ListChecks,
    failTitle: "Forgotten follow-up, dropped commitment",
    failDescription:
      'You said "I\'ll send that doc by Friday" in a call. No agent recorded it. By Monday, the commitment is gone - no reminder, no trace it existed.',
    successTitle: "Every commitment persisted, every session",
    successDescription:
      "Tasks and commitments are captured from conversation and stored with due dates and context. Your agent surfaces them before they slip - across sessions and tools.",
    scenarioIndex: 1,
  },
  {
    category: "Financial data",
    Icon: Receipt,
    failTitle: "Missing transaction, wrong balance",
    failDescription:
      "You asked about last month's spending. Your agent has no memory of the transactions you tracked two weeks ago in a different tool. You start over.",
    successTitle: "Versioned transactions, consistent totals",
    successDescription:
      "Every transaction is stored with provenance and version history. Ask from any tool and the numbers match - no re-entry, no conflicting snapshots.",
    scenarioIndex: 2,
  },
  {
    category: "Decisions & provenance",
    Icon: CalendarClock,
    failTitle: "No trace of why the agent acted",
    failDescription:
      "Your agent posted a tweet, sent an email, or made a recommendation. When you ask why, there's no record of the reasoning or the data it used.",
    successTitle: "Full audit trail for every action",
    successDescription:
      'Every decision is stored with its inputs, rationale, and the session that produced it. When you ask "why did you do that?", the agent can show you exactly.',
    scenarioIndex: 3,
  },
];

const RECORD_TYPE_CARDS: {
  icon: LucideIcon;
  label: string;
  description: string;
  entities: string[];
  href: string;
  accent: string;
}[] = [
  {
    icon: Users,
    label: "Contacts",
    description: "People, companies, roles, and the relationships between them.",
    entities: ["contact", "company", "account"],
    href: "/types/contacts",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  {
    icon: ListChecks,
    label: "Tasks",
    description: "Obligations, deadlines, habits, and goals - tracked across sessions.",
    entities: ["task", "habit", "goal"],
    href: "/types/tasks",
    accent: "text-violet-600 dark:text-violet-400",
  },
  {
    icon: Receipt,
    label: "Transactions",
    description: "Payments, receipts, invoices, and ledger entries - versioned, not overwritten.",
    entities: ["transaction", "invoice", "receipt"],
    href: "/types/transactions",
    accent: "text-teal-600 dark:text-teal-400",
  },
  {
    icon: Scale,
    label: "Contracts",
    description: "Agreements, clauses, and amendments - what the terms were on any date.",
    entities: ["contract", "clause", "amendment"],
    href: "/types/contracts",
    accent: "text-indigo-600 dark:text-indigo-400",
  },
  {
    icon: Waypoints,
    label: "Decisions",
    description: "Choices, rationale, and the audit trail that proves why.",
    entities: ["decision", "assessment", "review"],
    href: "/types/decisions",
    accent: "text-amber-600 dark:text-amber-400",
  },
  {
    icon: CalendarClock,
    label: "Events",
    description: "Meetings, milestones, and the outcomes attached to them.",
    entities: ["event", "meeting", "milestone"],
    href: "/types/events",
    accent: "text-sky-600 dark:text-sky-400",
  },
];

const ANIM_SCENARIOS = SCENARIOS.slice(0, 4);
const SCENE_MS = 5000;
const TYPE_MS = 1700;
const THINK_MS = 900;
const MINI_TRANS_MS = 1600;
const INTER_SCENE_MS = 1000;
const FULL_SCENARIO_MS = SCENE_MS + MINI_TRANS_MS + SCENE_MS + INTER_SCENE_MS;
const TOTAL_MS = ANIM_SCENARIOS.length * FULL_SCENARIO_MS;

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

function buildSceneMessages(
  sceneElapsed: number,
  fail: boolean,
  scenario: (typeof ANIM_SCENARIOS)[number],
  prefix: string
): IllustMsg[] {
  const msgs: IllustMsg[] = [];
  if (sceneElapsed < TYPE_MS) return msgs;
  msgs.push({ key: `${prefix}-h`, role: "human", text: scenario.left, thinking: false, fail });
  const replyStart = TYPE_MS + THINK_MS;
  const resp = fail ? scenario.fail : scenario.succeed;
  const showReply = sceneElapsed >= replyStart;
  msgs.push({
    key: `${prefix}-a`,
    role: "agent",
    text: showReply ? resp : "",
    thinking: sceneElapsed >= TYPE_MS && sceneElapsed < replyStart,
    fail,
    version: !fail && showReply ? scenario.version : undefined,
  });
  return msgs;
}

function ForgetfulAgentIllustration({
  className = "",
  onStateChange,
}: {
  className?: string;
  onStateChange?: (state: { scenarioIndex: number; failMode: boolean }) => void;
}) {
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

  const activeScenarioIndex = Math.min(
    Math.floor(elapsed / FULL_SCENARIO_MS),
    ANIM_SCENARIOS.length - 1
  );
  const sceneOffset = elapsed - activeScenarioIndex * FULL_SCENARIO_MS;
  const scenario = ANIM_SCENARIOS[activeScenarioIndex];

  const isFailScene = sceneOffset < SCENE_MS;
  const isMiniTrans = sceneOffset >= SCENE_MS && sceneOffset < SCENE_MS + MINI_TRANS_MS;
  const isSuccessScene =
    sceneOffset >= SCENE_MS + MINI_TRANS_MS && sceneOffset < SCENE_MS + MINI_TRANS_MS + SCENE_MS;
  const failMode = isFailScene || (isMiniTrans && sceneOffset < SCENE_MS + MINI_TRANS_MS / 2);

  useEffect(() => {
    onStateChange?.({ scenarioIndex: activeScenarioIndex, failMode });
  }, [activeScenarioIndex, failMode, onStateChange]);

  let contentOpacity = 1;
  const failMsgs = buildSceneMessages(
    isFailScene ? sceneOffset : SCENE_MS,
    true,
    scenario,
    `f-${activeScenarioIndex}`
  );
  let msgs: IllustMsg[] = [];

  if (isFailScene) {
    msgs = failMsgs;
  } else if (isMiniTrans) {
    const tp = (sceneOffset - SCENE_MS) / MINI_TRANS_MS;
    msgs = [...failMsgs];
    if (tp > 0.5) {
      msgs.push({
        key: `lbl-${activeScenarioIndex}`,
        role: "label",
        text: "with Neotoma",
        thinking: false,
        fail: false,
      });
    }
  } else if (isSuccessScene) {
    const se = sceneOffset - SCENE_MS - MINI_TRANS_MS;
    msgs = [
      ...failMsgs,
      {
        key: `lbl-${activeScenarioIndex}`,
        role: "label",
        text: "with Neotoma",
        thinking: false,
        fail: false,
      },
      ...buildSceneMessages(se, false, scenario, `s-${activeScenarioIndex}`),
    ];
  } else {
    msgs = [
      ...failMsgs,
      {
        key: `lbl-${activeScenarioIndex}`,
        role: "label",
        text: "with Neotoma",
        thinking: false,
        fail: false,
      },
      ...buildSceneMessages(SCENE_MS, false, scenario, `s-${activeScenarioIndex}`),
    ];
    const gp = (sceneOffset - SCENE_MS - MINI_TRANS_MS - SCENE_MS) / INTER_SCENE_MS;
    if (gp > 0.5) contentOpacity = Math.max(0, 1 - (gp - 0.5) / 0.5);
  }

  let composerText = "";
  let composerTyping = false;
  let composerTypeKey = "idle";
  let composerDelayMs = 40;
  if (isFailScene && sceneOffset < TYPE_MS) {
    composerText = scenario.left;
    composerTyping = true;
    composerTypeKey = `f-${activeScenarioIndex}`;
    composerDelayMs = Math.max(14, Math.floor(TYPE_MS / Math.max(1, composerText.length)));
  } else if (isSuccessScene) {
    const se = sceneOffset - SCENE_MS - MINI_TRANS_MS;
    if (se < TYPE_MS) {
      composerText = scenario.left;
      composerTyping = true;
      composerTypeKey = `s-${activeScenarioIndex}`;
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
      className={`relative overflow-hidden rounded-xl p-3 transition-colors duration-500 ${
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
            agent session · {failMode ? "without Neotoma" : "with Neotoma"}
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
                {ANIM_SCENARIOS.map((_, i) => {
                  const n = ANIM_SCENARIOS.length;
                  const segPct = 100 / n;
                  return (
                    <div
                      key={`track-${i}`}
                      className="pointer-events-none absolute inset-y-0 bg-[linear-gradient(90deg,rgba(253,164,175,0.4)_0%,rgba(253,164,175,0.4)_50%,rgba(110,231,183,0.4)_50%,rgba(110,231,183,0.4)_100%)] dark:bg-[linear-gradient(90deg,rgba(244,63,94,0.25)_0%,rgba(244,63,94,0.25)_50%,rgba(16,185,129,0.25)_50%,rgba(16,185,129,0.25)_100%)]"
                      style={{ left: `${(i / n) * 100}%`, width: `${segPct}%` }}
                    />
                  );
                })}
              </div>
              <div className="pointer-events-none absolute inset-y-0 left-0 right-0 my-auto h-1.5 overflow-hidden rounded-full">
                <div
                  className={`h-full rounded-full transition-colors duration-300 ${
                    failMode ? "bg-rose-500 dark:bg-rose-400" : "bg-emerald-500 dark:bg-emerald-400"
                  }`}
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              {ANIM_SCENARIOS.slice(1).map((_, i) => (
                <div
                  key={i}
                  className="pointer-events-none absolute inset-y-0 w-px bg-white/70 shadow-[0_0_0_0.5px_rgba(0,0,0,0.1)] dark:bg-slate-500/50 dark:shadow-none"
                  style={{
                    left: `${((i + 1) / ANIM_SCENARIOS.length) * 100}%`,
                  }}
                  aria-hidden
                />
              ))}
              <div
                className={`pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow transition-colors duration-300 dark:border-slate-900 ${
                  failMode ? "bg-rose-500 dark:bg-rose-400" : "bg-emerald-500 dark:bg-emerald-400"
                }`}
                style={{ left: `${progress * 100}%` }}
              />
            </div>
            <div className="flex shrink-0 gap-0.5 text-[7px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {ANIM_SCENARIOS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    const target = i * FULL_SCENARIO_MS;
                    prevElapsedWithinRunRef.current = target;
                    setElapsed(target);
                    setPlaying(true);
                  }}
                  className={`cursor-pointer rounded px-1 py-0.5 hover:bg-slate-200/60 dark:hover:bg-slate-700/50 ${
                    activeScenarioIndex === i
                      ? failMode
                        ? "font-semibold text-rose-500 dark:text-rose-400"
                        : "font-semibold text-emerald-500 dark:text-emerald-400"
                      : ""
                  }`}
                  aria-label={`Jump to scenario ${i + 1}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OutcomeContextPanel({
  activeScenarioIndex,
  failMode,
}: {
  activeScenarioIndex: number;
  failMode: boolean;
}) {
  const card = OUTCOME_CARDS[activeScenarioIndex];
  if (!card) return null;
  const { Icon, category } = card;
  const title = failMode ? card.failTitle : card.successTitle;
  const description = failMode ? card.failDescription : card.successDescription;
  const contentKey = `${activeScenarioIndex}-${failMode}`;

  return (
    <div
      className={`flex h-full flex-col justify-center rounded-xl border p-6 lg:p-8 transition-colors duration-500 ${
        failMode
          ? "border-rose-200/60 bg-gradient-to-br from-rose-50/80 via-white to-slate-50 dark:border-rose-500/20 dark:from-rose-950/30 dark:via-slate-950 dark:to-slate-950"
          : "border-emerald-200/60 bg-gradient-to-br from-emerald-50/80 via-white to-slate-50 dark:border-emerald-500/20 dark:from-emerald-950/30 dark:via-slate-950 dark:to-slate-950"
      }`}
    >
      <div className="flex items-center gap-1.5 mb-6">
        {OUTCOME_CARDS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === activeScenarioIndex
                ? `w-6 ${failMode ? "bg-rose-500 dark:bg-rose-400" : "bg-emerald-500 dark:bg-emerald-400"}`
                : i < activeScenarioIndex
                  ? `w-1.5 ${failMode ? "bg-rose-300 dark:bg-rose-600" : "bg-emerald-300 dark:bg-emerald-600"}`
                  : "w-1.5 bg-slate-200 dark:bg-slate-700"
            }`}
          />
        ))}
      </div>

      <div key={contentKey} className="animate-[outcome-card-in_0.4s_ease-out]">
        <div className="flex items-center gap-2 mb-3">
          <Icon
            className={`h-4 w-4 shrink-0 transition-colors duration-500 ${
              failMode
                ? "text-rose-500 dark:text-rose-400"
                : "text-emerald-500 dark:text-emerald-400"
            }`}
            aria-hidden
          />
          <span
            className={`text-[11px] font-mono uppercase tracking-wide transition-colors duration-500 ${
              failMode
                ? "text-rose-600 dark:text-rose-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {category}
          </span>
        </div>

        <h3 className="text-[17px] sm:text-[19px] font-medium leading-6 sm:leading-7 text-foreground mb-2">
          {title}
        </h3>
        <p className="text-[13px] sm:text-[14px] leading-6 text-muted-foreground mb-5">
          {description}
        </p>

        <div
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors duration-500 ${
            failMode
              ? "border-rose-300/50 text-rose-600 dark:border-rose-500/30 dark:text-rose-300"
              : "border-emerald-300/50 text-emerald-600 dark:border-emerald-500/30 dark:text-emerald-300"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              failMode ? "bg-rose-500 dark:bg-rose-400" : "bg-emerald-500 dark:bg-emerald-400"
            }`}
          />
          {failMode ? "without Neotoma" : "with Neotoma"}
        </div>
      </div>
    </div>
  );
}

function OutcomesSlide({
  scrollContainerRef,
  staticMode,
}: {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  staticMode: boolean;
}) {
  const [animState, setAnimState] = useState({ scenarioIndex: 0, failMode: true });

  return (
    <section id="outcomes" className={SLIDE_CLASS}>
      <FadeSection scrollContainerRef={scrollContainerRef} staticMode={staticMode}>
        <div className={SLIDE_INNER}>
          <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto">
            <div className="space-y-2 text-center">
              <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                Before &amp; after
              </p>
              <h2 className={HOME_SECTION_H2_CLASS}>Same question, different outcome</h2>
              <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl mx-auto">
                Without a state layer, agents return stale or wrong data. With Neotoma, every
                response reads from versioned, schema-bound state.
              </p>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-stretch">
              <div className="w-full lg:w-[42%] flex">
                <OutcomeContextPanel
                  activeScenarioIndex={animState.scenarioIndex}
                  failMode={animState.failMode}
                />
              </div>
              <div className="w-full lg:w-[58%] shrink-0">
                <ForgetfulAgentIllustration
                  className="w-full h-[360px] sm:h-[400px] lg:h-full lg:min-h-[460px]"
                  onStateChange={setAnimState}
                />
              </div>
            </div>
          </div>
        </div>
        <SectionEdgeIndicators sectionId="outcomes" />
      </FadeSection>
    </section>
  );
}

const SLIDE_CLASS = "min-h-[100svh] md:snap-start flex items-center justify-center relative";
/** Extra md+ vertical padding so SectionEdgeIndicators (absolute top-6/bottom-6) do not overlap copy. */
const SLIDE_INNER =
  "w-full max-w-6xl mx-auto px-6 md:px-12 lg:px-16 py-12 md:pt-16 md:pb-16";

const ICP_ICON_MAP: Record<string, LucideIcon> = {
  Server,
  Workflow,
  ArrowLeftRight,
  Bug,
};
/** Home page slide section titles (below hero) - single source for visual hierarchy. */
const HOME_SECTION_H2_CLASS =
  "text-[26px] sm:text-[28px] md:text-[32px] font-medium tracking-[-0.02em] leading-[1.15]";
const HERO_TITLE_RECORD_EMPHASIS_CLASS = "text-blue-600 dark:text-blue-400";
const HERO_TITLE_TOOLS_EMPHASIS_CLASS = "text-emerald-600 dark:text-emerald-400";

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

/** Tool chip row reused in hero and evaluate section. */
function HomeAgentToolChips({ align = "center" }: { align?: "center" | "start" }) {
  const chipClass =
    "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] text-foreground/90 no-underline transition-colors hover:bg-muted";
  const alignmentClass = align === "start" ? "justify-center lg:justify-start" : "justify-center";
  return (
    <div
      className={`flex flex-wrap items-center gap-2 pt-1 ${alignmentClass}`}
      aria-label="AI agents and tools"
    >
      <Link to="/neotoma-with-claude" className={chipClass}>
        <SiClaude className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Claude
      </Link>
      <Link to="/neotoma-with-chatgpt" className={chipClass}>
        <SiOpenai className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ChatGPT
      </Link>
      <Link to="/neotoma-with-cursor" className={chipClass}>
        <CursorIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Cursor
      </Link>
      <Link to="/neotoma-with-openclaw" className={chipClass}>
        <OpenClawIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        OpenClaw
      </Link>
    </div>
  );
}

const heroProofStripItemClass =
  "rounded-full border border-border/80 bg-background/80 px-3 py-1.5 text-[11px] font-medium text-muted-foreground lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-0";

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
      ·
    </span>
  );
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-medium text-muted-foreground lg:inline-flex lg:gap-x-2 lg:gap-y-1 lg:rounded-full lg:border lg:border-border/80 lg:bg-background/80 lg:px-3 lg:py-1.5 lg:justify-start">
      <span className={heroProofStripItemClass}>Cross-tool memory for AI agents</span>
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

function HeroStatePreview() {
  return (
    <div className="mx-auto w-full max-w-[420px] lg:max-w-none">
      <StateFlowDiagram variant="hero" className="shadow-[0_18px_48px_-28px_rgba(15,23,42,0.45)]" />
      <p className="mt-3 text-center text-[12px] leading-5 text-muted-foreground lg:text-left">
        Facts are stored under your control. Any agent can retrieve exactly what it needs, with
        full versioning and provenance.{" "}
        <Link
          to="/architecture"
          className="font-medium text-foreground underline decoration-muted-foreground/70 underline-offset-2 transition-colors hover:decoration-foreground"
        >
          See architecture
        </Link>
        .
      </p>
    </div>
  );
}

function EvaluateSectionCta() {
  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-4 text-center max-w-lg">
        <HomeEvaluatePromptBlock copyFeedbackId="evaluate-section-prompt" />
        <HomeAgentToolChips />
      </div>
    </div>
  );
}

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

/**
 * Lines trace to docs/foundation/field_validation.md; attributions are anonymized for the public site.
 */
const HERO_QUOTES: { text: string; attribution: string }[] = [
  {
    text: "State integrity, not retrieval quality.",
    attribution: "Agentic app builder",
  },
  {
    text: "Very relevant problem, most people rolling their own.",
    attribution: "Developer tooling founder",
  },
  {
    text: "Genuinely useful for production agents, overkill for hobbyist chatbots.",
    attribution: "Production agent evaluator",
  },
  {
    text: "CI/CD for agent state.",
    attribution: "Infrastructure engineer",
  },
];

const QUOTE_ROTATE_INTERVAL_MS = 7000;

function RotatingHeroQuote({ quotes }: { quotes: typeof HERO_QUOTES }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (quotes.length <= 1) return;
    const id = window.setInterval(
      () => setIndex((prev) => (prev + 1) % quotes.length),
      QUOTE_ROTATE_INTERVAL_MS
    );
    return () => window.clearInterval(id);
  }, [quotes]);

  if (quotes.length === 0) return null;

  return (
    <div
      className="relative h-[3.25em] sm:h-[2.5em] max-w-xl mx-auto lg:mx-0"
      aria-live="polite"
      aria-atomic="true"
    >
      {quotes.map((q, i) => (
        <p
          key={i}
          className={`absolute inset-0 text-[13px] leading-5 italic text-muted-foreground transition-opacity duration-500 ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        >
          &ldquo;{q.text}&rdquo;
          <span className="not-italic text-muted-foreground/60"> - {q.attribution}</span>
        </p>
      ))}
    </div>
  );
}

const RECORD_ROTATE_INTERVAL_MS = 2400;

function RotatingRecordType({ words }: { words: string[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (words.length <= 1) return;
    const id = window.setInterval(
      () => setIndex((prev) => (prev + 1) % words.length),
      RECORD_ROTATE_INTERVAL_MS
    );
    return () => window.clearInterval(id);
  }, [words]);

  if (words.length === 0) return null;

  return (
    <span
      className="inline-grid justify-items-center align-middle rounded-md bg-accent/55 px-2.5 py-0.5 dark:bg-muted/45"
      aria-live="polite"
      aria-atomic="true"
    >
      {words.map((word, i) => (
        <span
          key={`${i}-${word}`}
          className={`col-start-1 row-start-1 inline-block text-foreground font-semibold transition-opacity duration-300 ${
            i === index ? "visible animate-[hero-record-swap_0.35s_ease-out]" : "invisible"
          }`}
        >
          {word}
        </span>
      ))}
    </span>
  );
}

export function SitePage({ staticMode = false }: SitePageProps) {
  const { pack } = useLocale();
  const navigate = useNavigate();
  const dotNavSections = useMemo(() => getLocalizedDotNavSections(pack), [pack]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const heroEvaluateCtaRowRef = useRef<HTMLDivElement>(null);
  const evaluateSectionRef = useRef<HTMLElement>(null);
  /** While true, ignore SectionDotNav-driven hash updates so initial /#section is not cleared by intro. */
  const suppressDotNavHashSyncRef = useRef(false);
  /** Hero evaluate row visible in the scroll container - hide fixed banner while in hero. */
  const [heroEvaluateCtaInView, setHeroEvaluateCtaInView] = useState(true);
  /** Evaluate section visible - hide banner when user is already looking at the evaluate CTA. */
  const [evaluateSectionInView, setEvaluateSectionInView] = useState(false);

  const showEvaluateScrollBanner = !heroEvaluateCtaInView && !evaluateSectionInView;

  useEffect(() => {
    if (staticMode || typeof window === "undefined") return;

    const hashId = window.location.hash.replace(/^#/, "");
    if (!hashId || !HOME_HASH_SECTION_IDS.has(hashId)) return;

    suppressDotNavHashSyncRef.current = true;

    const applyHashScroll = () => {
      const target = document.getElementById(hashId);
      if (target) {
        target.scrollIntoView({ behavior: "auto", block: "start" });
      }
    };

    // Wait for layout: inner scroll root + mobile WebKit often need more than one frame.
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

    // Top section: no hash in URL; lack of anchor signifies intro.
    if (hashId === "intro") {
      window.requestAnimationFrame(() => {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`
        );
      });
    }
  }, [staticMode]);

  useLayoutEffect(() => {
    if (staticMode || typeof window === "undefined") return;
    const scrollEl = scrollContainerRef.current;
    const ctaRow = heroEvaluateCtaRowRef.current;
    if (!scrollEl || !ctaRow) return;

    const evalSection = evaluateSectionRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === ctaRow) {
            setHeroEvaluateCtaInView(entry.isIntersecting);
          } else if (entry.target === evalSection) {
            setEvaluateSectionInView(entry.isIntersecting);
          }
        }
      },
      { root: scrollEl, threshold: 0, rootMargin: "0px" }
    );
    observer.observe(ctaRow);
    if (evalSection) observer.observe(evalSection);

    return () => {
      observer.disconnect();
    };
  }, [staticMode]);

  const handleActiveSectionChange = (sectionId: string) => {
    if (typeof window === "undefined") return;
    if (suppressDotNavHashSyncRef.current) return;

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
        data-site-header-scroll-root
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
          <div className="relative z-10 w-full min-w-0">
            <FadeSection scrollContainerRef={scrollContainerRef} staticMode={staticMode}>
              <div className={SLIDE_INNER}>
                <div className="mx-auto max-w-6xl pt-4 md:pt-20 lg:pt-12">
                  <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.92fr)] lg:items-center">
                    <div className="space-y-6 text-center lg:text-left">
                      <HeroProofStrip />

                      <h1 className="text-[36px] md:text-[48px] font-semibold tracking-[-0.035em] leading-[1.1]">
                        {pack.homeHero.titlePrefix}{" "}
                        <span className={HERO_TITLE_RECORD_EMPHASIS_CLASS}>
                          {pack.homeHero.titleAccent}
                        </span>{" "}
                        {pack.homeHero.titleMid}{" "}
                        <span className={`whitespace-nowrap ${HERO_TITLE_TOOLS_EMPHASIS_CLASS}`}>
                          {pack.homeHero.titleFocus}
                        </span>
                      </h1>

                      <p className="text-[17px] md:text-[19px] leading-7 text-muted-foreground max-w-xl mx-auto lg:mx-0">
                        {(() => {
                          const parts = pack.homeHero.summary.split("{record}");
                          if (parts.length < 2) return pack.homeHero.summary;
                          return (
                            <>
                              {parts[0]}
                              <RotatingRecordType words={pack.homeHero.summaryRecordTypes} />
                              {parts[1]}
                            </>
                          );
                        })()}
                      </p>

                      <div
                        ref={heroEvaluateCtaRowRef}
                        className="flex flex-col sm:flex-row sm:flex-wrap justify-center gap-3 pt-1 lg:justify-start"
                      >
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
                          className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5 rounded-md border border-border bg-card px-5 py-2.5 text-[15px] font-medium text-foreground no-underline hover:bg-muted transition-colors"
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

                      <RotatingHeroQuote quotes={HERO_QUOTES} />
                      <HomeAgentToolChips align="start" />
                    </div>

                    <HeroStatePreview />
                  </div>
                </div>
              </div>
              <SectionEdgeIndicators sectionId="intro" />
            </FadeSection>
          </div>
        </section>

        {/* Slide 2: Before / After */}
        <OutcomesSlide scrollContainerRef={scrollContainerRef} staticMode={staticMode} />

        {/* One archetype, three operational modes */}
        <section id="who" className={SLIDE_CLASS}>
          <FadeSection scrollContainerRef={scrollContainerRef} staticMode={staticMode}>
            <div className={SLIDE_INNER}>
              <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto">
                <div className="space-y-2 text-center">
                  <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    Who this is for
                  </p>
                  <h2 className={HOME_SECTION_H2_CLASS}>
                    You run AI agents across tools and sessions...
                    <span className="mt-1.5 block text-muted-foreground sm:mt-2">
                      ...becoming the human sync layer.
                    </span>
                  </h2>
                  <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl mx-auto">
                    Stop spending real effort re-prompting context, patching state gaps, and
                    compensating for memory that doesn&rsquo;t persist across AI tools and custom
                    scripts. The cost shows up differently depending on what you&rsquo;re doing.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {ICP_PROFILES.map((profile) => {
                    const Icon = ICP_ICON_MAP[profile.iconName] ?? Server;
                    return (
                      <Link
                        key={profile.slug}
                        to={`/${profile.slug}`}
                        className="group flex flex-col rounded-xl border border-border bg-card/50 p-4 no-underline transition-colors hover:bg-muted/60 hover:border-border/80 sm:p-5"
                      >
                        <WhoProfileCardVisual
                          profileSlug={profile.slug}
                          modeLabel={profile.modeLabel}
                          Icon={Icon}
                        />
                        <div className="flex min-h-0 flex-1 flex-col px-1 pt-4">
                          <p className="text-[15px] font-medium text-foreground">{profile.name}</p>
                          <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                            {profile.tagline}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
            <SectionEdgeIndicators sectionId="who" />
          </FadeSection>
        </section>

        {/* Slide 3: Memory Guarantees - concise card preview */}
        <section id="memory-guarantees" className={SLIDE_CLASS}>
          <FadeSection scrollContainerRef={scrollContainerRef} staticMode={staticMode}>
            <div className={SLIDE_INNER}>
              <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto">
                <div className="space-y-2 text-center">
                  <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    Guarantees
                  </p>
                  <h2 className={HOME_SECTION_H2_CLASS}>
                    Neotoma provides state integrity, not just storage
                  </h2>
                  <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl mx-auto">
                    Most AI memory optimizes retrieval. Neotoma enforces guarantees other systems
                    don&rsquo;t provide.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {GUARANTEE_PREVIEW_CARDS.map((card) => (
                    <Link
                      key={card.slug}
                      to={`/memory-guarantees#${card.slug}`}
                      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card/50 no-underline transition-colors hover:bg-muted/60 hover:border-border/80"
                    >
                      <div className="relative mx-auto w-full max-w-[104px] sm:max-w-[120px] aspect-square bg-gradient-to-b from-muted/30 to-transparent">
                        <img
                          src={card.illus}
                          alt=""
                          width={1024}
                          height={1024}
                          className="absolute inset-0 h-full w-full rounded-lg object-contain object-center p-1.5 sm:p-2 opacity-[0.95] dark:opacity-100 transition-transform duration-300 group-hover:scale-[1.03]"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                      <div className="flex min-h-0 items-start gap-3 p-4">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                          <Check className="h-3 w-3 stroke-[2.5]" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[14px] font-medium text-foreground leading-5">
                            {card.property}
                          </p>
                          <p className="text-[13px] leading-5 text-muted-foreground mt-0.5">
                            {card.brief}
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
            <SectionEdgeIndicators sectionId="memory-guarantees" />
          </FadeSection>
        </section>

        {/* Slide 4: Record types - entity type cards */}
        <section id="record-types" className={SLIDE_CLASS}>
          <FadeSection scrollContainerRef={scrollContainerRef} staticMode={staticMode}>
            <div className={SLIDE_INNER}>
              <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto">
                <div className="space-y-2 text-center">
                  <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    What you store
                  </p>
                  <h2 className={HOME_SECTION_H2_CLASS}>
                    You deserve structured records, not raw text
                  </h2>
                  <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl mx-auto">
                    Neotoma stores typed entities with versioned history and provenance. Each guide
                    shows how to store and retrieve that type via CLI, MCP, and API.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {RECORD_TYPE_CARDS.map((card) => {
                    const CardIcon = card.icon;
                    return (
                      <Link
                        key={card.label}
                        to={card.href}
                        className="group flex flex-col rounded-xl border border-border bg-card/50 p-5 no-underline transition-colors hover:bg-muted/60 hover:border-border/80"
                      >
                        <div className="flex items-center gap-2.5 mb-2">
                          <span
                            className={`flex items-center justify-center w-7 h-7 rounded-lg ${card.accent
                              .replace("text-", "bg-")
                              .replace(/dark:text-[^\s]+/, "")
                              .trim()}/10 ${card.accent} shrink-0`}
                          >
                            <CardIcon className="w-3.5 h-3.5" />
                          </span>
                          <p className="text-[15px] font-medium text-foreground">{card.label}</p>
                        </div>
                        <p className="text-[13px] leading-5 text-muted-foreground mb-3">
                          {card.description}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-auto">
                          {card.entities.map((entity) => (
                            <code
                              key={entity}
                              className="bg-muted/60 px-1.5 py-0.5 rounded text-[11px] text-muted-foreground"
                            >
                              {entity}
                            </code>
                          ))}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
            <SectionEdgeIndicators sectionId="record-types" />
          </FadeSection>
        </section>

        {/* Slide 5+: Evaluate - agent-led evaluation CTA */}
        <section id="evaluate" ref={evaluateSectionRef} className={SLIDE_CLASS}>
          <FadeSection scrollContainerRef={scrollContainerRef} staticMode={staticMode}>
            <div className={SLIDE_INNER}>
              <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto">
                <div className="space-y-3 text-center flex flex-col items-center">
                  <img
                    src={heroEvaluateIllus}
                    alt="Neotoma evaluate page preview"
                    className="w-full max-w-[200px] sm:max-w-[240px] rounded-lg h-auto object-contain mx-auto"
                    loading="lazy"
                  />
                  <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    Evaluate it
                  </p>
                  <h2 className={HOME_SECTION_H2_CLASS}>Let your agent decide if Neotoma fits</h2>
                  <p className="text-[15px] leading-7 text-muted-foreground max-w-2xl mx-auto">
                    We provide an evaluation page your AI agent can read. It assesses your workflow,
                    asks one or two questions, and tells you honestly whether Neotoma is a fit.
                  </p>
                </div>

                <EvaluateSectionCta />
              </div>
            </div>
            <SectionEdgeIndicators sectionId="evaluate" />
          </FadeSection>
        </section>

        {/* FAQ preview before footer: natural-height block, no viewport snap (unlike full slides). */}
        <section id="common-questions" className="relative w-full shrink-0 scroll-mt-12">
          <div className={SLIDE_INNER}>
            <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto">
              <h2 className={`${HOME_SECTION_H2_CLASS} text-center`}>
                {pack.siteSections.frequentlyAskedQuestions ?? "Frequently asked questions"}
              </h2>
              <div className="max-w-2xl mx-auto">
                <div className="divide-y divide-border/40 rounded-xl border border-border/60 bg-card/30 px-4 py-1 sm:px-5">
                  {HOME_FAQ_PREVIEW_ITEMS.map((qa) => (
                    <details key={qa.q} className="group py-3 text-left first:pt-2">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-normal leading-snug text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                        {qa.q}
                        <ChevronDown
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform group-open:rotate-180"
                          aria-hidden
                        />
                      </summary>
                      <p className="mt-2.5 pl-0 text-[12px] leading-6 text-muted-foreground/90">
                        {qa.a}
                      </p>
                    </details>
                  ))}
                </div>
                <p className="mt-6 text-center text-[12px] text-muted-foreground/80">
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
          <SectionEdgeIndicators sectionId="common-questions" />
        </section>

        {/* Mandatory scroll snap only applies to snap-aligned children; without this, the footer is unreachable on md+. */}
        <div id="site-footer" className="w-full shrink-0 scroll-mt-12 md:snap-start md:snap-always">
          <SiteTailpiece />
        </div>
      </div>

      {!staticMode ? (
        <div
          className={`fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.12)] backdrop-blur-md transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none supports-[backdrop-filter]:bg-background/85 dark:shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.35)] ${
            showEvaluateScrollBanner
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-full opacity-0"
          }`}
          role="region"
          aria-label={pack.homeHero.ctaEvaluateWithAgent}
          aria-hidden={!showEvaluateScrollBanner}
        >
          <div className="mx-auto flex w-full max-w-6xl justify-center px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] md:px-12 lg:px-16">
            <div
              className={`w-full sm:w-auto md:rounded-xl md:border md:border-emerald-500/30 md:bg-emerald-500/10 md:px-3 md:py-2 md:shadow-[0_14px_32px_-20px_rgba(16,185,129,0.9)] md:backdrop-blur-sm ${
                showEvaluateScrollBanner ? "evaluate-cta-soft-bounce" : ""
              }`}
            >
              <a
                href="/evaluate"
                className={`${HOME_EVALUATE_CTA_CLASS} w-full sm:w-auto md:min-w-[320px]`}
                onClick={(e) => {
                  sendCtaClick("hero_evaluate_scroll_banner");
                  if (isModifiedClick(e)) return;
                  e.preventDefault();
                  navigate("/evaluate");
                }}
              >
                <MessageSquare className="h-4 w-4 shrink-0" aria-hidden />
                {pack.homeHero.ctaEvaluateWithAgent}
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function SitePageStatic() {
  return <SitePage staticMode={true} />;
}

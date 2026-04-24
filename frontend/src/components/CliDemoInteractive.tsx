import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type PointerEvent as DomPointerEvent,
} from "react";
import { Terminal, Bot, Braces, LayoutDashboard, Download, MessageSquare } from "lucide-react";
import { HOME_DEMO_INSTALL_CTA_CLASS } from "./code_block_copy_button_classes";
import { InspectorPreviewIllustration } from "./illustrations/InspectorPreviewIllustration";

interface DemoStep {
  comment: string;
  command: string;
  output: string[];
}

interface DemoScenario {
  label: string;
  steps: DemoStep[];
}

type DemoMode = "chat" | "cli" | "agentic" | "api" | "inspector";

/**
 * Inserts a zero-width non-joiner before each `@` so iOS/macOS Data Detectors do not
 * promote demo email literals to mailto links. Source strings stay unchanged (lengths
 * for typing animation and layout estimates use raw `step.command` / output).
 */
function breakEmailAutoLinks(text: string): string {
  return text.replace(/@/g, "\u200c@");
}

const CLI_SCENARIOS: DemoScenario[] = [
  {
    label: "Cross-tool sync",
    steps: [
      {
        comment: "Store a contact from any agent session",
        command:
          'neotoma store --json=\'[{"entity_type":"contact", "name":"Sarah Chen", "email":"sarah@newstartup.io"}]\'',
        output: ["Stored 1 entity: contact \u00b7 sarah-chen \u00b7 v1"],
      },
      {
        comment: "Query from a different tool \u2014 same state",
        command: 'neotoma entities search "Sarah Chen"',
        output: [
          "contact \u00b7 sarah-chen \u00b7 v3 \u00b7 updated 2h ago",
          "  email: sarah@newstartup.io <changed>(changed from sarah@oldcompany.com in v2)</changed>",
        ],
      },
      {
        comment: "Show version history for this contact",
        command: "neotoma history sarah-chen",
        output: [
          "v3 \u00b7 2h ago \u00b7 Cursor session #412 \u00b7 email \u2192 sarah@newstartup.io",
          "v2 \u00b7 3d ago \u00b7 Claude Code \u00b7 email \u2192 sarah@oldcompany.com",
          "v1 \u00b7 2w ago \u00b7 ChatGPT \u00b7 initial import",
        ],
      },
    ],
  },
  {
    label: "Replay & debug",
    steps: [
      {
        comment: "Pipeline run #47 gave wrong output \u2014 what did the agent believe?",
        command: "neotoma replay --entity acme-corp --at 2025-03-15T14:30:00",
        output: [
          "State at 2025-03-15 14:30:00:",
          "  company \u00b7 acme-corp \u00b7 v4",
          "  status: active_client  \u00b7  revenue: $48,000",
          "  primary_contact: james@acme.com",
        ],
      },
      {
        comment: "Compare state between two pipeline runs",
        command: "neotoma diff acme-corp v4 v6",
        output: [
          "<changed>\u2212 status: active_client</changed>",
          "<added>\u002B status: churned</added>",
          "<changed>\u2212 revenue: $48,000</changed>",
          "<added>\u002B revenue: $0</added>",
          "  Changed by: Claude Code session #318 \u00b7 3d ago",
        ],
      },
      {
        comment: "Trace which session caused the state change",
        command: "neotoma history acme-corp --field status",
        output: [
          "v6 \u00b7 3d ago \u00b7 Claude Code #318 \u00b7 status \u2192 churned",
          "v4 \u00b7 2w ago \u00b7 Cursor #290 \u00b7 status \u2192 active_client",
          "v1 \u00b7 1mo ago \u00b7 ChatGPT \u00b7 status \u2192 prospect",
        ],
      },
    ],
  },
];

const AGENTIC_SCENARIOS: DemoScenario[] = [
  {
    label: "Cross-tool sync",
    steps: [
      {
        comment: "Cursor agent stores a contact during your conversation",
        command:
          'store_structured({ entities: [{ entity_type: "contact", name: "Sarah Chen", email: "sarah@newstartup.io" }] })',
        output: ["entity_id: sarah-chen \u00b7 version: 1 \u00b7 stored"],
      },
      {
        comment: "Claude Code retrieves the same contact \u2014 no export needed",
        command: 'retrieve_entity_by_identifier({ identifier: "Sarah Chen" })',
        output: [
          "contact \u00b7 sarah-chen \u00b7 v3 \u00b7 updated 2h ago",
          "  email: sarah@newstartup.io <changed>(changed from sarah@oldcompany.com in v2)</changed>",
        ],
      },
      {
        comment: "Any agent can inspect the full version trail",
        command: 'list_observations({ entity_id: "sarah-chen" })',
        output: [
          "v3 \u00b7 2h ago \u00b7 Cursor session #412 \u00b7 email \u2192 sarah@newstartup.io",
          "v2 \u00b7 3d ago \u00b7 Claude Code \u00b7 email \u2192 sarah@oldcompany.com",
          "v1 \u00b7 2w ago \u00b7 ChatGPT \u00b7 initial import",
        ],
      },
    ],
  },
  {
    label: "Replay & debug",
    steps: [
      {
        comment: "Pipeline gave wrong output \u2014 agent inspects state at that time",
        command:
          'retrieve_entity_snapshot({ identifier: "acme-corp", at: "2025-03-15T14:30:00" })',
        output: [
          "State at 2025-03-15 14:30:00:",
          "  company \u00b7 acme-corp \u00b7 v4",
          "  status: active_client  \u00b7  revenue: $48,000",
          "  primary_contact: james@acme.com",
        ],
      },
      {
        comment: "Agent diffs between versions to find the regression",
        command:
          'diff_entity({ identifier: "acme-corp", from_version: 4, to_version: 6 })',
        output: [
          "<changed>\u2212 status: active_client</changed>",
          "<added>\u002B status: churned</added>",
          "<changed>\u2212 revenue: $48,000</changed>",
          "<added>\u002B revenue: $0</added>",
          "  Changed by: Claude Code session #318 \u00b7 3d ago",
        ],
      },
      {
        comment: "Agent traces which session caused the state change",
        command: 'list_observations({ entity_id: "acme-corp", field: "status" })',
        output: [
          "v6 \u00b7 3d ago \u00b7 Claude Code #318 \u00b7 status \u2192 churned",
          "v4 \u00b7 2w ago \u00b7 Cursor #290 \u00b7 status \u2192 active_client",
          "v1 \u00b7 1mo ago \u00b7 ChatGPT \u00b7 status \u2192 prospect",
        ],
      },
    ],
  },
];

const API_SCENARIOS: DemoScenario[] = [
  {
    label: "Cross-tool sync",
    steps: [
      {
        comment: "Store a contact via the REST API",
        command:
          "curl -s -X POST localhost:3080/store -H 'Content-Type: application/json' -d '{\"entities\":[{\"entity_type\":\"contact\",\"name\":\"Sarah Chen\",\"email\":\"sarah@newstartup.io\"}]}'",
        output: [
          '{ "entities": [{ "entity_id": "sarah-chen", "entity_type": "contact", "version": 1 }] }',
        ],
      },
      {
        comment: "Search for the contact from any HTTP client",
        command: 'curl -s "localhost:3080/entities/search?identifier=Sarah+Chen"',
        output: [
          "contact \u00b7 sarah-chen \u00b7 v3 \u00b7 updated 2h ago",
          "  email: sarah@newstartup.io <changed>(changed from sarah@oldcompany.com in v2)</changed>",
        ],
      },
      {
        comment: "Retrieve full observation history",
        command: 'curl -s "localhost:3080/entities/sarah-chen/observations"',
        output: [
          "v3 \u00b7 2h ago \u00b7 Cursor session #412 \u00b7 email \u2192 sarah@newstartup.io",
          "v2 \u00b7 3d ago \u00b7 Claude Code \u00b7 email \u2192 sarah@oldcompany.com",
          "v1 \u00b7 2w ago \u00b7 ChatGPT \u00b7 initial import",
        ],
      },
    ],
  },
  {
    label: "Replay & debug",
    steps: [
      {
        comment: "Retrieve entity state at a specific point in time",
        command:
          'curl -s "localhost:3080/entities/acme-corp/snapshot?at=2025-03-15T14:30:00"',
        output: [
          "State at 2025-03-15 14:30:00:",
          "  company \u00b7 acme-corp \u00b7 v4",
          "  status: active_client  \u00b7  revenue: $48,000",
          "  primary_contact: james@acme.com",
        ],
      },
      {
        comment: "Diff between two entity versions",
        command: 'curl -s "localhost:3080/entities/acme-corp/diff?from=4&to=6"',
        output: [
          "<changed>\u2212 status: active_client</changed>",
          "<added>\u002B status: churned</added>",
          "<changed>\u2212 revenue: $48,000</changed>",
          "<added>\u002B revenue: $0</added>",
          "  Changed by: Claude Code session #318 \u00b7 3d ago",
        ],
      },
      {
        comment: "List observations filtered by field",
        command:
          'curl -s "localhost:3080/entities/acme-corp/observations?field=status"',
        output: [
          "v6 \u00b7 3d ago \u00b7 Claude Code #318 \u00b7 status \u2192 churned",
          "v4 \u00b7 2w ago \u00b7 Cursor #290 \u00b7 status \u2192 active_client",
          "v1 \u00b7 1mo ago \u00b7 ChatGPT \u00b7 status \u2192 prospect",
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Chat UX demo                                                       */
/* ------------------------------------------------------------------ */

interface ChatMsg {
  role: "user" | "assistant" | "tool" | "divider";
  content: string;
  toolName?: string;
  toolLines?: string[];
}

interface ChatScenario {
  label: string;
  messages: ChatMsg[];
}

const CHAT_SCENARIOS: ChatScenario[] = [
  {
    label: "Cross-tool sync",
    messages: [
      { role: "divider", content: "Cursor" },
      {
        role: "user",
        content:
          "I just spoke with Sarah Chen \u2014 she moved to a new startup. Her new email is sarah@newstartup.io",
      },
      {
        role: "tool",
        content: "",
        toolName: "store_structured",
        toolLines: ["Stored 1 entity: contact \u00b7 sarah-chen \u00b7 v1"],
      },
      {
        role: "assistant",
        content: "Done \u2014 I\u2019ve saved Sarah Chen\u2019s updated contact info.",
      },
      { role: "divider", content: "Claude Code" },
      {
        role: "user",
        content:
          "Can you find Sarah Chen\u2019s email? I need to send her the contract.",
      },
      {
        role: "tool",
        content: "",
        toolName: "retrieve_entity_by_identifier",
        toolLines: [
          "contact \u00b7 sarah-chen \u00b7 v3 \u00b7 updated 2h ago",
          "  email: sarah@newstartup.io <changed>(changed from sarah@oldcompany.com in v2)</changed>",
        ],
      },
      {
        role: "assistant",
        content:
          "Sarah\u2019s email is sarah@newstartup.io \u2014 updated from sarah@oldcompany.com. The change was recorded in your Cursor session 2 hours ago.",
      },
    ],
  },
  {
    label: "Replay & debug",
    messages: [
      { role: "divider", content: "Codex" },
      {
        role: "user",
        content:
          "Pipeline run #47 gave wrong results for Acme Corp. What did the agent see at that point?",
      },
      {
        role: "tool",
        content: "",
        toolName: "retrieve_entity_snapshot",
        toolLines: [
          "State at 2025-03-15 14:30:00:",
          "  company \u00b7 acme-corp \u00b7 v4",
          "  status: active_client  \u00b7  revenue: $48,000",
        ],
      },
      {
        role: "assistant",
        content:
          "At the time of run #47, Acme Corp was still an active client with $48K revenue.",
      },
      { role: "divider", content: "ChatGPT" },
      {
        role: "user",
        content: "Something changed with Acme Corp since March. Can you diff the versions?",
      },
      {
        role: "tool",
        content: "",
        toolName: "diff_entity",
        toolLines: [
          "<changed>\u2212 status: active_client</changed>",
          "<added>\u002B status: churned</added>",
          "<changed>\u2212 revenue: $48,000</changed>",
          "<added>\u002B revenue: $0</added>",
          "  Changed by: Codex session #318 \u00b7 3d ago",
        ],
      },
      {
        role: "assistant",
        content:
          "Found it \u2014 Codex session #318 changed status from active_client to churned and zeroed revenue 3 days ago. That\u2019s your regression.",
      },
    ],
  },
];

const CHAT_MSG_FADE_MS = 200;

const CHAT_MSG_HOLD_MS: Record<string, number> = {
  user: 1000,
  assistant: 1200,
  tool: 700,
  divider: 600,
};

function chatMsgDurationMs(msg: ChatMsg): number {
  return CHAT_MSG_FADE_MS + (CHAT_MSG_HOLD_MS[msg.role] ?? 800);
}

/** Inner content width (px) for estimating wrapped monospace lines inside max-w-3xl terminal (padding subtracted). */
const CLI_DEMO_ESTIMATE_INNER_WIDTH_PX = 688;
/** Approximate average character width at `text-[12px] font-mono`. */
const CLI_DEMO_MONO_CHAR_WIDTH_PX = 7.2;
/** Matches terminal `leading-6` (1.5rem at 16px root). */
const CLI_DEMO_LINE_HEIGHT_PX = 24;
/** Title row (traffic lights + scenario tabs) + `mb-3` — expressed as extra line equivalents plus px fudge. */
const CLI_DEMO_CHROME_EXTRA_PX = 52;
/** Vertical padding `p-4` / `md:p-5` (use md for stable min-height). */
const CLI_DEMO_VERTICAL_PADDING_PX = 40;

const ALL_CLI_DEMO_SCENARIOS: DemoScenario[] = [
  ...CLI_SCENARIOS,
  ...AGENTIC_SCENARIOS,
  ...API_SCENARIOS,
];

function cliDemoWrappedLineCount(text: string): number {
  const charsPerLine = Math.max(
    28,
    Math.floor(CLI_DEMO_ESTIMATE_INNER_WIDTH_PX / CLI_DEMO_MONO_CHAR_WIDTH_PX),
  );
  return text.split("\n").reduce((acc, segment) => {
    const len = segment.length;
    return acc + (len === 0 ? 1 : Math.ceil(len / charsPerLine));
  }, 0);
}

function cliDemoStepBodyLines(step: DemoStep, promptChar: string): number {
  return (
    cliDemoWrappedLineCount(`# ${step.comment}`) +
    cliDemoWrappedLineCount(`${promptChar} ${step.command}`) +
    step.output.reduce((n, line) => n + cliDemoWrappedLineCount(line), 0)
  );
}

function cliDemoScenarioMaxBodyLines(scenario: DemoScenario): number {
  const promptChars = ["$", "\u25b8", "$"] as const;
  let max = 0;
  for (const pc of promptChars) {
    let total = 0;
    scenario.steps.forEach((step, i) => {
      if (i > 0) total += 1;
      total += cliDemoStepBodyLines(step, pc);
    });
    max = Math.max(max, total);
  }
  return max;
}

/** Extra body lines so font metrics / long tokens do not clip. */
const CLI_DEMO_MIN_HEIGHT_SAFETY_LINES = 2;

const CLI_DEMO_TERMINAL_MIN_HEIGHT_PX =
  CLI_DEMO_VERTICAL_PADDING_PX +
  CLI_DEMO_CHROME_EXTRA_PX +
  (Math.max(...ALL_CLI_DEMO_SCENARIOS.map(cliDemoScenarioMaxBodyLines)) +
    CLI_DEMO_MIN_HEIGHT_SAFETY_LINES) *
    CLI_DEMO_LINE_HEIGHT_PX;

const scenarioTabClass = (active: boolean) =>
  `px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer select-none ${
    active
      ? "bg-slate-700 text-slate-200"
      : "text-slate-500 hover:text-slate-400"
  }`;

const modeTabClass = (active: boolean) =>
  `inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors cursor-pointer select-none ${
    active
      ? "bg-slate-800 text-slate-100 shadow-sm"
      : "text-slate-400 hover:text-slate-300"
  }`;

/** After the last output line of a step, pause before advancing to the next command. */
const CLI_DEMO_AFTER_STEP_MS = 380;

/** Delay before command typing starts (after comment is visible). */
const CLI_DEMO_AFTER_COMMENT_MS = 140;
/** Milliseconds per character for simulated command typing. */
const CLI_DEMO_TYPING_CHAR_MS = 9;
/** Delay between each output line appearing after the command finishes. */
const CLI_DEMO_OUTPUT_STAGGER_MS = 52;

interface CliDemoStepSegment {
  stepIdx: number;
  startMs: number;
  durationMs: number;
}

function demoStepDurationMs(step: DemoStep): number {
  const typing = step.command.length * CLI_DEMO_TYPING_CHAR_MS;
  const outputPhase =
    step.output.length === 0
      ? CLI_DEMO_AFTER_STEP_MS
      : CLI_DEMO_OUTPUT_STAGGER_MS * step.output.length + CLI_DEMO_AFTER_STEP_MS;
  return CLI_DEMO_AFTER_COMMENT_MS + typing + outputPhase;
}

/** Timeline for one scenario tab (Cross-tool sync or Replay & debug). */
function buildStepsTimeline(steps: DemoStep[]): {
  segments: CliDemoStepSegment[];
  totalMs: number;
} {
  const segments: CliDemoStepSegment[] = [];
  let startMs = 0;
  for (let i = 0; i < steps.length; i++) {
    const durationMs = demoStepDurationMs(steps[i]);
    segments.push({ stepIdx: i, startMs, durationMs });
    startMs += durationMs;
  }
  return { segments, totalMs: startMs };
}

function buildChatTimeline(messages: ChatMsg[]): {
  segments: CliDemoStepSegment[];
  totalMs: number;
} {
  const segments: CliDemoStepSegment[] = [];
  let startMs = 0;
  for (let i = 0; i < messages.length; i++) {
    const durationMs = chatMsgDurationMs(messages[i]);
    segments.push({ stepIdx: i, startMs, durationMs });
    startMs += durationMs;
  }
  return { segments, totalMs: startMs };
}

function computeDemoStepFrame(
  step: DemoStep,
  tMs: number,
  reduceMotion: boolean
): { cmdLen: number; outCount: number } {
  if (reduceMotion) {
    return {
      cmdLen: step.command.length,
      outCount: step.output.length,
    };
  }
  const dur = demoStepDurationMs(step);
  const t = Math.max(0, Math.min(dur, tMs));

  if (t < CLI_DEMO_AFTER_COMMENT_MS) {
    return { cmdLen: 0, outCount: 0 };
  }
  let rem = t - CLI_DEMO_AFTER_COMMENT_MS;
  const typingDuration = step.command.length * CLI_DEMO_TYPING_CHAR_MS;
  if (rem < typingDuration) {
    const nChars = Math.min(
      step.command.length,
      Math.floor(rem / CLI_DEMO_TYPING_CHAR_MS)
    );
    return { cmdLen: nChars, outCount: 0 };
  }
  rem -= typingDuration;
  if (step.output.length === 0) {
    return { cmdLen: step.command.length, outCount: 0 };
  }
  const outCount = Math.min(
    step.output.length,
    Math.floor(rem / CLI_DEMO_OUTPUT_STAGGER_MS)
  );
  return { cmdLen: step.command.length, outCount };
}

function mapElapsedToStepPosition(
  elapsed: number,
  segments: CliDemoStepSegment[],
  totalMs: number
): {
  segmentIndex: number;
  localT: number;
  atEnd: boolean;
} {
  if (segments.length === 0 || totalMs <= 0) {
    return { segmentIndex: 0, localT: 0, atEnd: true };
  }
  if (elapsed >= totalMs) {
    const last = segments[segments.length - 1];
    return {
      segmentIndex: segments.length - 1,
      localT: last.durationMs,
      atEnd: true,
    };
  }
  const e = Math.max(0, elapsed);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const end = seg.startMs + seg.durationMs;
    if (e < end) {
      return {
        segmentIndex: i,
        localT: Math.max(0, e - seg.startMs),
        atEnd: false,
      };
    }
  }
  const last = segments[segments.length - 1];
  return {
    segmentIndex: segments.length - 1,
    localT: last.durationMs,
    atEnd: true,
  };
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduce;
}

function OutputLine({ line, className }: { line: string; className?: string }) {
  return (
    <p className={className ? `text-slate-400 ${className}` : "text-slate-400"}>
      {line.includes("<changed>") ? (
        <>
          {breakEmailAutoLinks(line.split("<changed>")[0] ?? "")}
          <span className="text-red-400/80">
            {breakEmailAutoLinks(
              line.split("<changed>")[1]?.replace("</changed>", "") ?? ""
            )}
          </span>
        </>
      ) : line.includes("<added>") ? (
        <>
          {breakEmailAutoLinks(line.split("<added>")[0] ?? "")}
          <span className="text-emerald-400/80">
            {breakEmailAutoLinks(line.split("<added>")[1]?.replace("</added>", "") ?? "")}
          </span>
        </>
      ) : (
        breakEmailAutoLinks(line)
      )}
    </p>
  );
}

function DemoStepBlock({
  step,
  promptChar,
  promptColor,
}: {
  step: DemoStep;
  promptChar: string;
  promptColor: string;
}) {
  return (
    <>
      <p className="text-slate-500 select-none"># {breakEmailAutoLinks(step.comment)}</p>
      <p>
        <span className={promptColor}>{promptChar}</span>{" "}
        {breakEmailAutoLinks(step.command)}
      </p>
      {step.output.map((line, j) => (
        <OutputLine key={j} line={line} />
      ))}
    </>
  );
}

function DemoStepLiveBlock({
  step,
  promptChar,
  promptColor,
  cmdLen,
  outCount,
}: {
  step: DemoStep;
  promptChar: string;
  promptColor: string;
  cmdLen: number;
  outCount: number;
}) {
  const cmdVisible = breakEmailAutoLinks(step.command.slice(0, cmdLen));
  const typingCommand = cmdLen < step.command.length;

  return (
    <>
      <p className="text-slate-500 select-none motion-reduce:opacity-100 cli-demo-comment-in">
        # {breakEmailAutoLinks(step.comment)}
      </p>
      <p>
        <span className={promptColor}>{promptChar}</span>{" "}
        <span className="whitespace-pre-wrap break-all">{cmdVisible}</span>
        {typingCommand ? (
          <span
            className="ml-px inline-block h-4 w-[7px] translate-y-0.5 bg-slate-400 animate-pulse align-baseline"
            aria-hidden
          />
        ) : null}
      </p>
      {step.output.slice(0, outCount).map((line, j) => (
        <OutputLine
          key={`out-${j}`}
          line={line}
          className="motion-reduce:opacity-100 cli-demo-output-line-in"
        />
      ))}
    </>
  );
}

function ChatMsgBlock({ msg, opacity }: { msg: ChatMsg; opacity: number }) {
  const style: React.CSSProperties | undefined =
    opacity < 1 ? { opacity } : undefined;

  if (msg.role === "divider") {
    return (
      <div className="flex items-center gap-3 py-1" style={style}>
        <div className="flex-1 border-t border-dashed border-slate-700/40" />
        <span className="whitespace-nowrap text-[10px] font-medium text-slate-500">
          {msg.content}
        </span>
        <div className="flex-1 border-t border-dashed border-slate-700/40" />
      </div>
    );
  }

  if (msg.role === "user") {
    return (
      <div className="flex justify-end" style={style}>
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-blue-600/80 px-3.5 py-2 text-[12.5px] leading-relaxed text-white">
          {breakEmailAutoLinks(msg.content)}
        </div>
      </div>
    );
  }

  if (msg.role === "tool") {
    return (
      <div className="ml-8" style={style}>
        <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 px-3 py-2 font-mono text-[11px]">
          <p className="mb-1 text-[10px] font-medium text-violet-400/70">
            {msg.toolName}
          </p>
          {(msg.toolLines ?? []).map((line, j) => (
            <OutputLine key={j} line={line} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5" style={style}>
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-700/60 bg-slate-800">
        <Bot className="h-3 w-3 text-slate-400" />
      </div>
      <p className="pt-0.5 text-[12.5px] leading-relaxed text-slate-300">
        {breakEmailAutoLinks(msg.content)}
      </p>
    </div>
  );
}

function scenarioCountForMode(m: DemoMode): number {
  if (m === "inspector") return 0;
  if (m === "chat") return CHAT_SCENARIOS.length;
  return m === "cli"
    ? CLI_SCENARIOS.length
    : m === "agentic"
      ? AGENTIC_SCENARIOS.length
      : API_SCENARIOS.length;
}

export function CliDemoInteractive() {
  const [mode, setMode] = useState<DemoMode>("chat");
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [elapsedByScenario, setElapsedByScenario] = useState<number[]>(() =>
    new Array(scenarioCountForMode("chat")).fill(0)
  );
  const [playing, setPlaying] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const wasInViewRef = useRef(false);
  const playingRef = useRef(playing);
  const reduceMotion = usePrefersReducedMotion();

  playingRef.current = playing;

  const scenarios =
    mode === "cli" ? CLI_SCENARIOS : mode === "agentic" ? AGENTIC_SCENARIOS : API_SCENARIOS;

  useEffect(() => {
    const n = scenarioCountForMode(mode);
    setElapsedByScenario(new Array(n).fill(0));
    setScenarioIndex(0);
  }, [mode]);

  const currentScenario = scenarios[scenarioIndex] ?? scenarios[0];
  const { segments, totalMs } = useMemo(() => {
    if (mode === "chat") {
      return buildChatTimeline(
        CHAT_SCENARIOS[scenarioIndex]?.messages ?? [],
      );
    }
    if (mode === "inspector") {
      return { segments: [] as CliDemoStepSegment[], totalMs: 0 };
    }
    const modeScenarios =
      mode === "cli"
        ? CLI_SCENARIOS
        : mode === "agentic"
          ? AGENTIC_SCENARIOS
          : API_SCENARIOS;
    return buildStepsTimeline(modeScenarios[scenarioIndex]?.steps ?? []);
  }, [mode, scenarioIndex]);

  const elapsed = elapsedByScenario[scenarioIndex] ?? 0;

  const promptChar = mode === "agentic" ? "\u25b8" : "$";
  const promptColor =
    mode === "cli" ? "text-emerald-400" : mode === "agentic" ? "text-blue-400" : "text-amber-400";

  const timelinePos = useMemo(
    () => mapElapsedToStepPosition(elapsed, segments, totalMs),
    [elapsed, segments, totalMs]
  );

  const activeSeg = segments[timelinePos.segmentIndex];
  const activeStepIdx = activeSeg?.stepIdx ?? 0;
  const scenario = currentScenario;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const nowInView = entry.isIntersecting;
        setIsInView(nowInView);
        if (nowInView && !wasInViewRef.current) {
          setPlaying(true);
          const n = scenarioCountForMode(mode);
          setElapsedByScenario(new Array(n).fill(0));
          setScenarioIndex(0);
        }
        wasInViewRef.current = nowInView;
      },
      { threshold: 0.3 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [mode]);

  useEffect(() => {
    if (!playing || dragging || !isInView || mode === "inspector" || totalMs <= 0) return;

    let rafId = 0;
    let prev = performance.now();

    const tick = (now: number) => {
      if (!playingRef.current) return;

      const dt = Math.min(48, Math.max(0, now - prev));
      prev = now;

      let continuePlaying = true;

      setElapsedByScenario((arr) => {
        const idx = scenarioIndex;
        const cur = arr[idx] ?? 0;
        if (cur >= totalMs) {
          continuePlaying = false;
          return arr;
        }
        const n = cur + dt;
        if (n >= totalMs) {
          continuePlaying = false;
          playingRef.current = false;
          queueMicrotask(() => setPlaying(false));
          const next = [...arr];
          next[idx] = totalMs;
          return next;
        }
        const next = [...arr];
        next[idx] = n;
        return next;
      });

      if (continuePlaying && playingRef.current) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing, dragging, isInView, mode, scenarioIndex, totalMs]);

  const seekToMs = useCallback(
    (ms: number) => {
      setElapsedByScenario((arr) => {
        if (arr.length === 0) return arr;
        const next = [...arr];
        next[scenarioIndex] = Math.max(0, Math.min(ms, totalMs));
        return next;
      });
    },
    [scenarioIndex, totalMs]
  );

  const seekTo = useCallback(
    (clientX: number) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect || totalMs <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      seekToMs(ratio * totalMs);
    },
    [seekToMs, totalMs]
  );

  const onBarPointerDown = useCallback(
    (e: DomPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      barRef.current?.setPointerCapture(e.pointerId);
      setDragging(true);
      setPlaying(false);
      seekTo(e.clientX);
    },
    [seekTo]
  );

  const onBarPointerMove = useCallback(
    (e: DomPointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      seekTo(e.clientX);
    },
    [dragging, seekTo]
  );

  const onBarPointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  const selectScenario = useCallback((idx: number) => {
    setScenarioIndex(idx);
    setElapsedByScenario((arr) => {
      const next = [...arr];
      if (idx >= 0 && idx < next.length) next[idx] = 0;
      return next;
    });
    setPlaying(true);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    const cur = elapsedByScenario[scenarioIndex] ?? 0;
    if (totalMs > 0 && cur >= totalMs) {
      seekToMs(0);
    }
    setPlaying(true);
  }, [playing, elapsedByScenario, scenarioIndex, totalMs, seekToMs]);

  const switchMode = useCallback((m: DemoMode) => {
    setMode(m);
    setPlaying(m !== "inspector");
  }, []);

  const progress = totalMs > 0 ? Math.min(1, elapsed / totalMs) : 0;

  return (
    <div ref={containerRef} className="max-w-3xl mx-auto">
      <div className="flex items-center justify-center mb-4">
        <div className="inline-flex rounded-lg bg-slate-900 border border-slate-800 p-0.5 gap-0.5">
          <button
            type="button"
            className={modeTabClass(mode === "chat")}
            onClick={() => switchMode("chat")}
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            Chat
          </button>
          <button
            type="button"
            className={modeTabClass(mode === "cli")}
            onClick={() => switchMode("cli")}
          >
            <Terminal className="h-3.5 w-3.5" aria-hidden />
            CLI
          </button>
          <button
            type="button"
            className={modeTabClass(mode === "agentic")}
            onClick={() => switchMode("agentic")}
          >
            <Bot className="h-3.5 w-3.5" aria-hidden />
            MCP
          </button>
          <button
            type="button"
            className={modeTabClass(mode === "api")}
            onClick={() => switchMode("api")}
          >
            <Braces className="h-3.5 w-3.5" aria-hidden />
            API
          </button>
          <button
            type="button"
            className={modeTabClass(mode === "inspector")}
            onClick={() => switchMode("inspector")}
          >
            <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
            Inspector
          </button>
        </div>
      </div>

      {mode === "inspector" ? (
        <InspectorPreviewIllustration variant="demo-teaser" />
      ) : (
        <>
          {mode === "chat" ? (
            <div
              className="box-border flex w-full min-w-0 max-w-3xl flex-col rounded-xl border border-border/60 bg-slate-950 p-4 md:p-5 dark:border-slate-800 dark:bg-slate-950"
              style={{ minHeight: CLI_DEMO_TERMINAL_MIN_HEIGHT_PX }}
            >
              <div className="mb-4 flex items-center justify-between -mt-1">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500/70" />
                </div>
                <div className="flex items-center gap-1">
                  {CHAT_SCENARIOS.map((s, i) => (
                    <button
                      key={s.label}
                      type="button"
                      className={scenarioTabClass(i === scenarioIndex)}
                      onClick={() => selectScenario(i)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 space-y-3">
                {(CHAT_SCENARIOS[scenarioIndex]?.messages ?? []).map(
                  (msg, i) => {
                    if (i > activeStepIdx) return null;
                    const opacity =
                      i === activeStepIdx && !reduceMotion
                        ? Math.min(1, timelinePos.localT / CHAT_MSG_FADE_MS)
                        : 1;
                    return (
                      <ChatMsgBlock
                        key={`chat-${scenarioIndex}-${i}`}
                        msg={msg}
                        opacity={opacity}
                      />
                    );
                  },
                )}
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-800/50 bg-slate-900/30 px-3 py-2">
                <span className="flex-1 select-none text-[12px] text-slate-600">
                  Ask anything...
                </span>
              </div>
            </div>
          ) : (
          <div
            className="box-border w-full min-w-0 max-w-3xl rounded-xl border border-border/60 bg-slate-950 p-4 md:p-5 font-mono text-[12px] leading-6 text-slate-300 overflow-x-auto dark:bg-slate-950 dark:border-slate-800"
            style={{ minHeight: CLI_DEMO_TERMINAL_MIN_HEIGHT_PX }}
          >
            <div className="flex items-center justify-between mb-3 -mt-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500/70" />
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500/70" />
              </div>
              <div className="flex items-center gap-1">
                {scenarios.map((s, i) => (
                  <button
                    key={s.label}
                    type="button"
                    className={scenarioTabClass(i === scenarioIndex)}
                    onClick={() => selectScenario(i)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {scenario.steps.map((step, i) => {
              const key = `${mode}-${scenarioIndex}-${i}`;
              const stepGap = i > 0 ? "mt-3" : "";

              if (i < activeStepIdx) {
                return (
                  <div key={key} className={stepGap}>
                    <DemoStepBlock
                      step={step}
                      promptChar={promptChar}
                      promptColor={promptColor}
                    />
                  </div>
                );
              }

              if (i === activeStepIdx) {
                const { cmdLen, outCount } = computeDemoStepFrame(
                  step,
                  timelinePos.localT,
                  reduceMotion
                );
                return (
                  <div key={key} className={stepGap}>
                    <DemoStepLiveBlock
                      step={step}
                      promptChar={promptChar}
                      promptColor={promptColor}
                      cmdLen={cmdLen}
                      outCount={outCount}
                    />
                  </div>
                );
              }

              return null;
            })}
          </div>
          )}

          <div className="max-w-3xl mx-auto mt-3 w-full px-0">
            <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 dark:bg-slate-950/90">
              <button
                type="button"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 hover:text-slate-300"
                onClick={handlePlayPause}
                aria-label={playing ? "Pause demo" : "Play demo"}
              >
                {playing ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
                    <rect x="1" y="1" width="3" height="8" rx="0.5" />
                    <rect x="6" y="1" width="3" height="8" rx="0.5" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
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
                onPointerCancel={onBarPointerUp}
                onLostPointerCapture={onBarPointerUp}
              >
                <div className="pointer-events-none absolute inset-y-0 left-0 right-0 my-auto h-1.5 overflow-hidden rounded-full bg-slate-700/45 dark:bg-slate-600/30" />
                <div className="pointer-events-none absolute inset-y-0 left-0 right-0 my-auto h-1.5 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full bg-emerald-500/90 dark:bg-emerald-400/90"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
                {segments.slice(1).map((seg) => (
                  <div
                    key={`tick-step-${seg.stepIdx}`}
                    className="pointer-events-none absolute inset-y-0 w-px bg-slate-950/80 shadow-[0_0_0_0.5px_rgba(255,255,255,0.12)] dark:bg-slate-950 dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.08)]"
                    style={{
                      left: `${totalMs > 0 ? (seg.startMs / totalMs) * 100 : 0}%`,
                    }}
                    aria-hidden
                  />
                ))}
                <div
                  className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-950 bg-emerald-500 shadow dark:border-slate-900 dark:bg-emerald-400"
                  style={{ left: `${progress * 100}%` }}
                />
              </div>
            </div>
          </div>
        </>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mt-3">
        <a href="/install" className={`${HOME_DEMO_INSTALL_CTA_CLASS} w-full sm:w-auto`}>
          <Download className="h-4 w-4 shrink-0" aria-hidden />
          Install in 5 minutes
        </a>
      </div>
    </div>
  );
}

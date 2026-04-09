import { useState, useCallback, useRef, useEffect } from "react";
import {
  Terminal,
  Bot,
  Braces,
  LayoutDashboard,
  Search,
  Clock,
  Table2,
  Network,
  Download,
  User,
  Box,
  Eye,
  FileText,
  Link2,
  Cpu,
  ListFilter,
  Settings,
  Activity,
  Github,
} from "lucide-react";
import { HOME_DEMO_INSTALL_CTA_CLASS } from "./code_block_copy_button_classes";
import { sendCtaClick } from "@/utils/analytics";

/** Source repo for the local Neotoma Inspector UI (`inspector` git submodule). */
const NEOTOMA_INSPECTOR_REPO_URL = "https://github.com/markmhendrickson/neotoma-inspector";

interface DemoStep {
  comment: string;
  command: string;
  output: string[];
}

interface DemoScenario {
  label: string;
  steps: DemoStep[];
}

type DemoMode = "cli" | "agentic" | "api" | "inspector";

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

const INSPECTOR_DASHBOARD_METRICS = [
  { label: "Entities", value: "23,633", Icon: Box },
  { label: "Observations", value: "30,692", Icon: Eye },
  { label: "Sources", value: "5,563", Icon: FileText },
  { label: "Relationships", value: "5,290", Icon: Link2 },
  { label: "Events", value: "35,751", Icon: Clock },
  { label: "Interpretations", value: "235", Icon: Cpu },
] as const;

const INSPECTOR_CHART_TYPES = [
  { label: "task", hPx: 52 },
  { label: "agent_message", hPx: 40 },
  { label: "contact", hPx: 34 },
  { label: "conversation", hPx: 28 },
  { label: "generic", hPx: 22 },
  { label: "post", hPx: 18 },
  { label: "transaction", hPx: 14 },
] as const;

const INSPECTOR_SIDEBAR_PRIMARY: {
  label: string;
  Icon: typeof LayoutDashboard;
  active?: boolean;
}[] = [
  { label: "Dashboard", Icon: LayoutDashboard, active: true },
  { label: "Entities", Icon: Search },
  { label: "Observations", Icon: Eye },
  { label: "Sources", Icon: FileText },
  { label: "Relationships", Icon: Link2 },
  { label: "Graph Explorer", Icon: Network },
];

const INSPECTOR_SIDEBAR_SECONDARY: { label: string; Icon: typeof Table2 }[] = [
  { label: "Schemas", Icon: Table2 },
  { label: "Recent Activity", Icon: Activity },
  { label: "Timeline", Icon: Clock },
  { label: "Interpretations", Icon: Cpu },
];

function InspectorPreview() {
  return (
    <div className="cursor-default overflow-hidden rounded-xl border border-slate-200 bg-white text-foreground shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:shadow-none">
      {/* App header — matches inspector shell */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-900 text-[10px] font-bold text-white dark:bg-violet-800"
            aria-hidden
          >
            N
          </div>
          <span className="text-[12px] font-semibold tracking-tight">Neotoma</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 text-[11px] font-medium text-emerald-600 sm:inline-flex dark:text-emerald-400">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
            Connected
          </span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <User className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            <span className="hidden sm:inline">Local user</span>
          </span>
        </div>
      </div>

      <div className="flex min-h-[320px]">
        {/* Sidebar — light rail */}
        <aside className="hidden w-[152px] shrink-0 border-r border-slate-200 bg-slate-50/90 p-2 sm:block dark:border-slate-800 dark:bg-slate-900/50">
          <nav className="space-y-0.5 pt-0.5" aria-label="Inspector preview navigation">
            {INSPECTOR_SIDEBAR_PRIMARY.map(({ label, Icon, active }) => (
              <div
                key={label}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-medium ${
                  active
                    ? "bg-white text-foreground shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-800 dark:ring-slate-700"
                    : "text-muted-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                <span className="min-w-0 truncate">{label}</span>
              </div>
            ))}
            <div className="my-2 border-t border-slate-200 dark:border-slate-800" />
            {INSPECTOR_SIDEBAR_SECONDARY.map(({ label, Icon }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-medium text-muted-foreground"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                <span className="min-w-0 truncate">{label}</span>
              </div>
            ))}
            <div className="my-2 border-t border-slate-200 dark:border-slate-800" />
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-medium text-muted-foreground">
              <Settings className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              Settings
            </div>
          </nav>
        </aside>

        {/* Main dashboard */}
        <div className="relative min-w-0 flex-1 bg-white p-3 dark:bg-slate-950">
          <div className="pointer-events-none select-none opacity-50 sm:opacity-[0.55]">
            <h2 className="text-[16px] font-semibold tracking-tight">Dashboard</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Last updated 4/9/2026, 12:39:53 PM
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              {INSPECTOR_DASHBOARD_METRICS.map(({ label, value, Icon }) => (
                <div
                  key={label}
                  className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900/40"
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
                  </div>
                  <p className="mt-2 text-[15px] font-semibold tabular-nums tracking-tight">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-stretch">
              <div className="min-h-[128px] flex-1 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold">Entities by Type</span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground dark:border-slate-700 dark:bg-slate-800/80">
                    <ListFilter className="h-3 w-3" aria-hidden />
                    10 of 358 types
                  </span>
                </div>
                <div className="flex h-[92px] items-end justify-between gap-0.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                  {INSPECTOR_CHART_TYPES.map(({ label, hPx }) => (
                    <div
                      key={label}
                      className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-end gap-1"
                    >
                      <div
                        className="w-full max-w-[16px] rounded-t-sm bg-slate-800 dark:bg-slate-600"
                        style={{ height: `${hPx}px` }}
                      />
                      <span className="max-w-[3.25rem] truncate text-center text-[7px] font-mono leading-tight text-muted-foreground sm:max-w-none sm:-rotate-45 sm:whitespace-nowrap sm:text-[8px]">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex w-full shrink-0 flex-col gap-2 lg:w-[42%]">
                <div className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900/40">
                  <p className="text-[11px] font-semibold">Health</p>
                  <p className="mt-2 text-[10px] leading-relaxed">
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">API:</span>{" "}
                    <span className="text-emerald-600 dark:text-emerald-400">Healthy</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">Port: 3180</p>
                  <p className="truncate font-mono text-[9px] text-muted-foreground">
                    http://127.0.0.1:3180/mcp
                  </p>
                  <div className="mt-2 inline-flex rounded-md border border-slate-200 bg-white px-2 py-1 text-[9px] font-medium text-foreground dark:border-slate-700 dark:bg-slate-950">
                    Check Snapshot Health
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900/40">
                  <p className="text-[11px] font-semibold">Recent Activity</p>
                  <ul className="mt-2 space-y-1.5 text-[9px] text-muted-foreground">
                    <li className="truncate">8m · Data Source · ent_42bf…</li>
                    <li className="truncate">1h · Observation · sarah-chen</li>
                    <li className="truncate">2h · Relationship · PART_OF</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Coming soon overlay — mobile: height = card only (no full-bleed inset-0); sm+: full panel frost */}
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex w-full flex-col items-center justify-start bg-white/55 px-3 pt-4 pb-3 backdrop-blur-[2px] dark:bg-slate-950/55 sm:inset-0 sm:justify-center sm:bg-white/50 sm:pt-0 sm:pb-0 sm:backdrop-blur-[1.5px] dark:sm:bg-slate-950/50">
            <div className="pointer-events-auto max-w-sm space-y-3 rounded-xl border border-slate-200 bg-white/95 px-5 py-4 text-center shadow-lg shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-900/95 dark:shadow-none">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
                Coming soon
              </div>
              <p className="text-[18px] font-semibold leading-snug text-foreground sm:text-[21px]">
                Hosted sandbox with seed data
              </p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Browse entities, explore the relationship graph, inspect version history, and diff
                state changes — all in the browser, no install required.
              </p>
              <div className="pt-0.5">
                <a
                  href={NEOTOMA_INSPECTOR_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-analytics-no-outbound
                  onClick={() => sendCtaClick("demo_inspector_github")}
                  className="inline-flex w-full cursor-pointer justify-center items-center gap-1.5 rounded-md border border-violet-700 bg-violet-700 px-3 py-1.5 text-[13px] font-medium text-white no-underline shadow-sm shadow-violet-700/30 hover:border-violet-600 hover:bg-violet-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 dark:border-violet-500 dark:bg-violet-600 dark:text-white dark:shadow-violet-950/50 dark:hover:border-violet-400 dark:hover:bg-violet-500 dark:hover:text-white dark:focus-visible:ring-violet-400 dark:focus-visible:ring-offset-slate-950 transition-colors sm:w-auto"
                >
                  <Github className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Open Inspector on GitHub
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** After the last output line of a step, pause before advancing to the next command. */
const CLI_DEMO_AFTER_STEP_MS = 450;
/** After all steps in a scenario finish, pause before auto-advancing to the next scenario. */
const HOLD_AFTER_SCENARIO_COMPLETE_MS = 5000;

/** Delay before command typing starts (after comment is visible). */
const CLI_DEMO_AFTER_COMMENT_MS = 200;
/** Milliseconds per character for simulated command typing. */
const CLI_DEMO_TYPING_CHAR_MS = 12;
/** Delay between each output line appearing after the command finishes. */
const CLI_DEMO_OUTPUT_STAGGER_MS = 72;

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
          {line.split("<changed>")[0]}
          <span className="text-red-400/80">
            {line.split("<changed>")[1]?.replace("</changed>", "")}
          </span>
        </>
      ) : line.includes("<added>") ? (
        <>
          {line.split("<added>")[0]}
          <span className="text-emerald-400/80">
            {line.split("<added>")[1]?.replace("</added>", "")}
          </span>
        </>
      ) : (
        line
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
      <p className="text-slate-500 select-none"># {step.comment}</p>
      <p>
        <span className={promptColor}>{promptChar}</span> {step.command}
      </p>
      {step.output.map((line, j) => (
        <OutputLine key={j} line={line} />
      ))}
    </>
  );
}

function AnimatedDemoStepBlock({
  step,
  promptChar,
  promptColor,
  animToken,
  onStepComplete,
}: {
  step: DemoStep;
  promptChar: string;
  promptColor: string;
  animToken: string;
  onStepComplete?: () => void;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const onCompleteRef = useRef(onStepComplete);
  onCompleteRef.current = onStepComplete;

  const [cmdLen, setCmdLen] = useState(() => (reduceMotion ? step.command.length : 0));
  const [outCount, setOutCount] = useState(() => (reduceMotion ? step.output.length : 0));

  useEffect(() => {
    const fireComplete = () => {
      onCompleteRef.current?.();
    };

    if (reduceMotion) {
      setCmdLen(step.command.length);
      setOutCount(step.output.length);
      const t = window.setTimeout(fireComplete, 0);
      return () => window.clearTimeout(t);
    }

    setCmdLen(0);
    setOutCount(0);
    let cancelled = false;
    const timeouts: number[] = [];
    const queue = (fn: () => void, ms: number) => {
      timeouts.push(
        window.setTimeout(() => {
          if (!cancelled) fn();
        }, ms)
      );
    };

    queue(() => {
      let n = 0;
      const typeChar = () => {
        if (cancelled) return;
        n += 1;
        setCmdLen(n);
        if (n < step.command.length) queue(typeChar, CLI_DEMO_TYPING_CHAR_MS);
        else if (step.output.length === 0) {
          queue(fireComplete, CLI_DEMO_AFTER_STEP_MS);
        } else {
          let line = 0;
          const addLine = () => {
            if (cancelled) return;
            line += 1;
            setOutCount(line);
            if (line < step.output.length) queue(addLine, CLI_DEMO_OUTPUT_STAGGER_MS);
            else queue(fireComplete, CLI_DEMO_AFTER_STEP_MS);
          };
          queue(addLine, CLI_DEMO_OUTPUT_STAGGER_MS);
        }
      };
      typeChar();
    }, CLI_DEMO_AFTER_COMMENT_MS);

    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [animToken, reduceMotion, step.command, step.output]);

  const cmdVisible = step.command.slice(0, cmdLen);
  const typingCommand = cmdLen < step.command.length;

  return (
    <>
      <p className="text-slate-500 select-none motion-reduce:opacity-100 cli-demo-comment-in">
        # {step.comment}
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
          key={`${animToken}-out-${j}`}
          line={line}
          className="motion-reduce:opacity-100 cli-demo-output-line-in"
        />
      ))}
    </>
  );
}

export function CliDemoInteractive() {
  const [mode, setMode] = useState<DemoMode>("cli");
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [isInView, setIsInView] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasInViewRef = useRef(false);
  const scenarios =
    mode === "cli" ? CLI_SCENARIOS : mode === "agentic" ? AGENTIC_SCENARIOS : API_SCENARIOS;
  const scenario = scenarios[scenarioIdx];

  const promptChar = mode === "agentic" ? "\u25b8" : "$";
  const promptColor =
    mode === "cli" ? "text-emerald-400" : mode === "agentic" ? "text-blue-400" : "text-amber-400";

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const nowInView = entry.isIntersecting;
        setIsInView(nowInView);
        if (nowInView && !wasInViewRef.current) {
          setAutoPlay(true);
          setScenarioIdx(0);
          setVisibleSteps(0);
        }
        wasInViewRef.current = nowInView;
      },
      { threshold: 0.3 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const handleStepComplete = useCallback(() => {
    setVisibleSteps((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!isInView || !autoPlay || mode === "inspector") return;
    if (visibleSteps < scenario.steps.length) return;

    const id = window.setTimeout(() => {
      setScenarioIdx((i) => (i + 1) % scenarios.length);
      setVisibleSteps(0);
    }, HOLD_AFTER_SCENARIO_COMPLETE_MS);

    return () => window.clearTimeout(id);
  }, [
    isInView,
    autoPlay,
    mode,
    visibleSteps,
    scenario.steps.length,
    scenarios.length,
  ]);

  const switchScenario = useCallback((idx: number) => {
    setAutoPlay(false);
    setScenarioIdx(idx);
    setVisibleSteps(0);
  }, []);

  const switchMode = useCallback((m: DemoMode) => {
    setAutoPlay(m !== "inspector");
    setMode(m);
    setScenarioIdx(0);
    setVisibleSteps(0);
  }, []);

  return (
    <div ref={containerRef} className="max-w-3xl mx-auto">
      <div className="flex items-center justify-center mb-4">
        <div className="inline-flex rounded-lg bg-slate-900 border border-slate-800 p-0.5 gap-0.5">
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
            Agent (MCP)
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
        <InspectorPreview />
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
                  className={scenarioTabClass(i === scenarioIdx)}
                  onClick={() => switchScenario(i)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {scenario.steps.map((step, i) => {
            const key = `${mode}-${scenarioIdx}-${i}`;
            const stepGap = i > 0 ? "mt-3" : "";

            if (i < visibleSteps) {
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

            if (i === visibleSteps && visibleSteps < scenario.steps.length) {
              return (
                <div key={key} className={stepGap}>
                  <AnimatedDemoStepBlock
                    step={step}
                    promptChar={promptChar}
                    promptColor={promptColor}
                    animToken={key}
                    onStepComplete={handleStepComplete}
                  />
                </div>
              );
            }

            return null;
          })}
        </div>
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

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Terminal,
  Bot,
  Braces,
  LayoutDashboard,
  Search,
  GitBranch,
  Clock,
  Table2,
  Network,
} from "lucide-react";

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

const INSPECTOR_FEATURES = [
  { icon: Search, label: "Entity browser", desc: "Search, filter, and drill into every entity and its full observation history" },
  { icon: Network, label: "Graph explorer", desc: "Interactive force-directed visualization of entity relationships" },
  { icon: Clock, label: "Timeline", desc: "Chronological event stream across all agent sessions" },
  { icon: GitBranch, label: "Version diff", desc: "Side-by-side comparison of any two entity versions" },
  { icon: Table2, label: "Schema registry", desc: "Browse and manage schemas, field provenance, and reducer config" },
  { icon: LayoutDashboard, label: "Dashboard", desc: "Entity counts, type breakdown, recent activity, and health status" },
];

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

function InspectorPreview() {
  return (
    <div className="rounded-xl border border-border/60 bg-slate-950 overflow-hidden dark:bg-slate-950 dark:border-slate-800">
      {/* Simulated app chrome */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-slate-800/80">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500/70" />
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500/70" />
        <span className="ml-3 text-[11px] text-slate-500 font-mono">
          inspector.neotoma.io
        </span>
      </div>

      <div className="flex min-h-[320px]">
        {/* Sidebar wireframe */}
        <div className="w-[140px] shrink-0 border-r border-slate-800/60 p-3 hidden sm:block">
          {["Dashboard", "Entities", "Graph", "Timeline", "Schemas", "Sources"].map(
            (item, i) => (
              <div
                key={item}
                className={`text-[11px] px-2 py-1.5 rounded-md mb-0.5 ${
                  i === 1
                    ? "bg-slate-800/80 text-slate-200"
                    : "text-slate-500"
                }`}
              >
                {item}
              </div>
            )
          )}
        </div>

        {/* Main content area */}
        <div className="flex-1 p-4 md:p-5 relative">
          {/* Wireframe entity table */}
          <div className="space-y-2 opacity-40">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-6 w-28 rounded bg-slate-800" />
              <div className="h-6 w-40 rounded bg-slate-800/60" />
            </div>
            {[
              { type: "contact", name: "sarah-chen", ver: "v3", time: "2h ago" },
              { type: "company", name: "acme-corp", ver: "v6", time: "3d ago" },
              { type: "task", name: "onboard-pilot", ver: "v2", time: "1w ago" },
              { type: "event", name: "q1-review", ver: "v1", time: "2w ago" },
              { type: "contact", name: "james-wu", ver: "v4", time: "3w ago" },
            ].map((row) => (
              <div
                key={row.name}
                className="flex items-center gap-3 text-[11px] font-mono py-1.5 border-b border-slate-800/40"
              >
                <span className="text-blue-400/80 w-16">{row.type}</span>
                <span className="text-slate-300 flex-1">{row.name}</span>
                <span className="text-slate-500 w-8">{row.ver}</span>
                <span className="text-slate-600 w-14 text-right">{row.time}</span>
              </div>
            ))}
          </div>

          {/* Coming soon overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-[2px]">
            <div className="rounded-lg border border-slate-700/80 bg-slate-900/95 px-6 py-5 max-w-sm text-center space-y-3">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-[11px] font-medium text-amber-400">
                Coming soon
              </div>
              <p className="text-[15px] font-medium text-slate-100">
                Hosted sandbox with seed data
              </p>
              <p className="text-[13px] leading-relaxed text-slate-400">
                Browse entities, explore the relationship graph, inspect version
                history, and diff state changes — all in the browser, no install required.
              </p>
              <div className="pt-1">
                <a
                  href="/install"
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-emerald-500 transition-colors no-underline"
                >
                  Install now to try it locally
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature strip */}
      <div className="border-t border-slate-800/60 px-4 py-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        {INSPECTOR_FEATURES.map((f) => (
          <div key={f.label} className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <f.icon className="h-3 w-3 shrink-0 text-slate-600" aria-hidden />
            {f.label}
          </div>
        ))}
      </div>
    </div>
  );
}

const STEP_INTERVAL_MS = 2500;
const HOLD_TICKS = 2;
const STEPS_PER_SCENARIO = 3;
const TICKS_PER_SCENARIO = STEPS_PER_SCENARIO + HOLD_TICKS;

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
  const allVisible = mode !== "inspector" && visibleSteps >= scenario.steps.length;

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

  useEffect(() => {
    if (!isInView || !autoPlay || mode === "inspector") return;
    const totalTicks = TICKS_PER_SCENARIO * scenarios.length;
    let tick = 0;

    const id = window.setInterval(() => {
      tick = (tick + 1) % totalTicks;
      const scen = Math.floor(tick / TICKS_PER_SCENARIO);
      const vis = Math.min(tick % TICKS_PER_SCENARIO, STEPS_PER_SCENARIO);
      setScenarioIdx(scen);
      setVisibleSteps(vis);
    }, STEP_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [isInView, autoPlay, mode, scenarios.length]);

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
        <>
          <div className="rounded-xl border border-border/60 bg-slate-950 p-4 md:p-5 font-mono text-[12px] leading-6 text-slate-300 overflow-x-auto dark:bg-slate-950 dark:border-slate-800">
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
              if (i >= visibleSteps) return null;
              return (
                <div key={`${mode}-${scenarioIdx}-${i}`} className={i > 0 ? "mt-3" : ""}>
                  <p className="text-slate-500 select-none"># {step.comment}</p>
                  <p>
                    <span className={promptColor}>{promptChar}</span> {step.command}
                  </p>
                  {step.output.map((line, j) => (
                    <p key={j} className="text-slate-400">
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
                  ))}
                </div>
              );
            })}

            {!allVisible && (
              <div className={visibleSteps > 0 ? "mt-3" : ""}>
                <p className="text-slate-500 select-none">
                  # {scenario.steps[visibleSteps].comment}
                </p>
                <p className="flex items-center gap-0">
                  <span className={promptColor}>{promptChar}</span>
                  <span className="ml-1 inline-block w-[7px] h-4 bg-slate-400 animate-pulse" />
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 mt-3">
            <a
              href="/install"
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-emerald-500 transition-colors no-underline"
            >
              Try it yourself &mdash; install in 60 seconds
            </a>
          </div>
        </>
      )}
    </div>
  );
}

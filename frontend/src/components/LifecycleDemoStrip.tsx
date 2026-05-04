import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const TERMINAL_SHELL =
  "rounded-xl border border-slate-800/80 bg-slate-950 p-3 sm:p-4 font-mono text-[10px] leading-relaxed text-slate-300 sm:text-[11px] md:text-[12px] overflow-x-auto shadow-inner shadow-black/40";

const INSPECTOR_SHELL =
  "rounded-xl border border-slate-700/60 bg-slate-900/90 p-3 sm:p-4 text-[11px] sm:text-[12px] text-slate-200 shadow-lg";

type Step = {
  id: string;
  title: string;
  cliLines: { tone: "prompt" | "out" | "err"; text: string }[];
};

const STEPS: Step[] = [
  {
    id: "install",
    title: "Install",
    cliLines: [
      { tone: "prompt", text: "$ npx neotoma@latest" },
      { tone: "out", text: "✓ CLI linked · ~/.local/bin/neotoma" },
      { tone: "out", text: "✓ MCP entries merged (Cursor, Claude Code)" },
      { tone: "out", text: "✓ Data dir ready · ~/.neotoma/ (SQLite)" },
      { tone: "out", text: "Run: neotoma doctor" },
    ],
  },
  {
    id: "store",
    title: "Store",
    cliLines: [
      {
        tone: "prompt",
        text: '$ neotoma store --json=\'[{"entity_type":"contact","name":"Sarah Chen","company":"Acme"}]\'',
      },
      { tone: "out", text: "Stored 1 entity · contact · sarah-chen · v1" },
      { tone: "out", text: "observation_id: obs_01 · source: cli" },
    ],
  },
  {
    id: "retrieve",
    title: "Retrieve across tools",
    cliLines: [
      { tone: "out", text: "// Cursor agent (Neotoma MCP)" },
      { tone: "prompt", text: '> retrieve_entity_by_identifier({ identifier: "Sarah Chen" })' },
      { tone: "out", text: "contact · sarah-chen · v1 · company: Acme" },
      { tone: "out", text: "fields: name, company · last_observation_at: 2m ago" },
    ],
  },
  {
    id: "version",
    title: "Version",
    cliLines: [
      {
        tone: "prompt",
        text:
          '$ neotoma store --json=\'[{"entity_type":"contact","name":"Sarah Chen","company":"Acme Corp","role":"CTO"}]\'',
      },
      { tone: "out", text: "Stored observation · contact · sarah-chen · v2" },
      { tone: "out", text: "diff: company Acme → Acme Corp · role added" },
    ],
  },
  {
    id: "diff",
    title: "Diff",
    cliLines: [
      { tone: "prompt", text: "$ neotoma diff --entity-id ent_sarah_chen" },
      { tone: "out", text: "v1 → v2" },
      { tone: "err", text: "- company: Acme" },
      { tone: "out", text: "+ company: Acme Corp" },
      { tone: "out", text: "+ role: CTO" },
    ],
  },
];

function InspectorInstallPanel() {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">What changed</p>
      <ul className="space-y-1.5 text-slate-300">
        <li className="flex gap-2">
          <span className="text-emerald-400">•</span>
          <span>CLI binary + shim under your user path</span>
        </li>
        <li className="flex gap-2">
          <span className="text-emerald-400">•</span>
          <span>MCP server blocks added to tool configs (merge, not wipe)</span>
        </li>
        <li className="flex gap-2">
          <span className="text-emerald-400">•</span>
          <span>Local SQLite at ~/.neotoma/ (empty until first store)</span>
        </li>
      </ul>
      <p className="border-t border-slate-700/80 pt-2 text-[10px] text-slate-500">
        Uninstall: remove MCP entries, delete data dir, unlink CLI — no remote teardown.
      </p>
    </div>
  );
}

function InspectorEntityCard({ highlightAccess }: { highlightAccess?: boolean }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="rounded border border-slate-600/80 bg-slate-800/80 px-2 py-0.5 font-mono text-[10px] text-slate-300">
          contact
        </span>
        <span className="font-mono text-[10px] text-slate-500">v1 · 2m ago</span>
      </div>
      <div className="rounded-lg border border-slate-700/80 bg-slate-950/60 p-3 font-mono text-[11px]">
        <div className="grid gap-1.5">
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">name</span>
            <span className="text-slate-100">Sarah Chen</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">company</span>
            <span className="text-slate-100">Acme</span>
          </div>
        </div>
      </div>
      {highlightAccess ? (
        <div className="mt-2 flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-200">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden />
          Last read by Cursor MCP · retrieval logged
        </div>
      ) : (
        <p className="mt-2 text-[10px] text-slate-500">source: cli · observation obs_01</p>
      )}
    </div>
  );
}

function InspectorVersionPanel() {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Observation timeline</p>
      <div className="space-y-2 border-l border-emerald-500/40 pl-3">
        <div>
          <p className="font-mono text-[10px] text-slate-500">v2 · now</p>
          <p className="text-slate-200">company → Acme Corp · role → CTO</p>
        </div>
        <div>
          <p className="font-mono text-[10px] text-slate-500">v1 · earlier</p>
          <p className="text-slate-400">company → Acme</p>
        </div>
      </div>
      <div className="rounded border border-slate-700/60 bg-slate-950/50 p-2 font-mono text-[10px] text-slate-400">
        Reducer merged fields deterministically — both rows preserved in log.
      </div>
    </div>
  );
}

function InspectorDiffPanel() {
  return (
    <div>
      <p className="mb-2 text-[10px] font-mono uppercase tracking-wider text-slate-500">Diff view</p>
      <div className="rounded-lg border border-slate-700/80 bg-slate-950/80 p-2 font-mono text-[11px] leading-6">
        <p className="text-rose-400/90">− company: Acme</p>
        <p className="text-emerald-400/90">+ company: Acme Corp</p>
        <p className="text-emerald-400/90">+ role: CTO</p>
      </div>
    </div>
  );
}

function InspectorPane({ stepIndex }: { stepIndex: number }) {
  return (
    <div className={INSPECTOR_SHELL} aria-label="Inspector preview (illustration)">
      {stepIndex === 0 ? <InspectorInstallPanel /> : null}
      {stepIndex === 1 ? <InspectorEntityCard /> : null}
      {stepIndex === 2 ? <InspectorEntityCard highlightAccess /> : null}
      {stepIndex === 3 ? <InspectorVersionPanel /> : null}
      {stepIndex === 4 ? <InspectorDiffPanel /> : null}
    </div>
  );
}

export function LifecycleDemoStrip() {
  const [idx, setIdx] = useState(0);
  const step = STEPS[idx]!;
  const last = STEPS.length - 1;

  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIdx((i) => Math.min(last, i + 1)), [last]);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4">
      <div className="flex flex-col gap-1 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            One lifecycle
          </p>
          <h2 className="mt-1 text-[22px] sm:text-[24px] md:text-[28px] font-medium tracking-[-0.02em] leading-snug text-foreground">
            From install to diff — same state in CLI and Inspector
          </h2>
        </div>
        <div className="flex items-center justify-center gap-2 sm:pb-0.5">
          <button
            type="button"
            onClick={prev}
            disabled={idx === 0}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            aria-label="Previous step"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[7rem] text-center font-mono text-[12px] text-muted-foreground">
            {idx + 1} / {STEPS.length}
          </span>
          <button
            type="button"
            onClick={next}
            disabled={idx === last}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            aria-label="Next step"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setIdx(i)}
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-medium transition",
              i === idx
                ? "border-emerald-600/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                : "border-border/60 bg-card/40 text-muted-foreground hover:bg-muted/50"
            )}
          >
            {s.title}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6 lg:items-stretch">
        <div>
          <p className="mb-2 text-center font-mono text-[11px] uppercase tracking-wide text-muted-foreground lg:text-left">
            {step.title}
          </p>
          <div className={TERMINAL_SHELL}>
            {step.cliLines.map((line, i) => (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap break-words",
                  line.tone === "prompt" && "text-emerald-400/95",
                  line.tone === "out" && "text-slate-400",
                  line.tone === "err" && "text-rose-400/90"
                )}
              >
                {line.text}
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-center font-mono text-[11px] uppercase tracking-wide text-muted-foreground lg:text-left">
            Inspector
          </p>
          <InspectorPane stepIndex={idx} />
        </div>
      </div>
    </div>
  );
}

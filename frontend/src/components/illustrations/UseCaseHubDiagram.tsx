interface UseCaseHubDiagramProps {
  className?: string;
}

const TOOLS = ["Claude", "Cursor", "Codex"];
const ENTITIES = ["tasks", "contacts", "documents", "events", "decisions", "runbooks"];

export function UseCaseHubDiagram({ className }: UseCaseHubDiagramProps) {
  return (
    <div
      className={`relative rounded-xl border border-emerald-500/25 bg-gradient-to-b from-white via-slate-50 to-emerald-50/30 p-6 shadow-[0_14px_50px_rgba(0,0,0,0.08)] dark:border-emerald-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_14px_50px_rgba(0,0,0,0.45)] ${className ?? ""}`}
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.06),transparent_50%)] dark:bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.1),transparent_50%)]" />
      <div className="relative flex flex-col items-center gap-4">
        <div className="flex items-center gap-3">
          {TOOLS.map((tool) => (
            <div
              key={tool}
              className="rounded border border-slate-300/50 bg-slate-200/60 px-3 py-1.5 font-mono text-[11px] text-slate-700 dark:border-slate-600/50 dark:bg-slate-800/60 dark:text-slate-300"
            >
              {tool}
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <span className="text-emerald-600/40 dark:text-emerald-400/50">↓</span>
          <span className="font-mono text-[9px] text-emerald-600/50 dark:text-emerald-300/40">MCP · REST · CLI</span>
          <span className="text-emerald-600/40 dark:text-emerald-400/50">↓</span>
        </div>

        <div className="flex items-center justify-center rounded-lg border-2 border-emerald-500/40 bg-emerald-100/50 px-5 py-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div className="text-center">
            <p className="font-mono text-[13px] font-bold text-emerald-700 dark:text-emerald-400">
              Neotoma
            </p>
            <p className="font-mono text-[9px] text-emerald-600/70 dark:text-emerald-300/60">
              deterministic state layer
            </p>
          </div>
        </div>

        <span className="text-emerald-600/40 dark:text-emerald-400/50">↓</span>

        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {ENTITIES.map((entity) => (
            <span
              key={entity}
              className="rounded border border-emerald-500/20 bg-emerald-50/60 px-2 py-0.5 font-mono text-[10px] text-emerald-600/80 dark:border-emerald-400/15 dark:bg-emerald-500/5 dark:text-emerald-300/70"
            >
              {entity}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

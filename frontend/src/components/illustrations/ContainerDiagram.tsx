interface ContainerDiagramProps {
  className?: string;
}

export function ContainerDiagram({ className }: ContainerDiagramProps) {
  return (
    <div
      className={`relative rounded-xl border border-emerald-500/25 bg-gradient-to-b from-white via-slate-50 to-emerald-50/30 p-6 shadow-[0_14px_50px_rgba(0,0,0,0.08)] dark:border-emerald-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_14px_50px_rgba(0,0,0,0.45)] ${className ?? ""}`}
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_50%_80%,rgba(59,130,246,0.05),transparent_40%)] dark:bg-[radial-gradient(circle_at_50%_80%,rgba(59,130,246,0.08),transparent_40%)]" />
      <div className="relative flex flex-col gap-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600/60 dark:text-emerald-300/50">
          docker container
        </p>
        <div className="rounded-lg border-2 border-dashed border-emerald-500/30 bg-white/40 p-4 dark:border-emerald-400/25 dark:bg-slate-900/40">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {["API Server", "CLI", "MCP Server"].map((svc) => (
              <div
                key={svc}
                className="rounded border border-emerald-500/25 bg-emerald-50/60 px-3 py-1.5 font-mono text-[11px] text-emerald-700/80 dark:border-emerald-400/20 dark:bg-emerald-500/5 dark:text-emerald-300/80"
              >
                {svc}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 text-center">
            <div className="inline-flex flex-col items-center gap-0.5">
              <span className="text-emerald-600/30 dark:text-emerald-400/40">↕</span>
              <span className="font-mono text-[9px] text-slate-500/70 dark:text-slate-400/60">
                :3080 HTTP
              </span>
            </div>
          </div>
          <div className="flex-1 text-center">
            <div className="inline-flex flex-col items-center gap-0.5">
              <span className="text-emerald-600/30 dark:text-emerald-400/40">↕</span>
              <span className="font-mono text-[9px] text-slate-500/70 dark:text-slate-400/60">
                stdio
              </span>
            </div>
          </div>
          <div className="flex-1 text-center">
            <div className="inline-flex flex-col items-center gap-0.5">
              <span className="text-emerald-600/30 dark:text-emerald-400/40">↕</span>
              <span className="font-mono text-[9px] text-slate-500/70 dark:text-slate-400/60">
                volume mount
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center rounded border border-slate-300/30 bg-slate-200/40 px-3 py-2 dark:border-slate-600/30 dark:bg-slate-800/40">
          <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
            host machine
          </span>
        </div>
      </div>
    </div>
  );
}

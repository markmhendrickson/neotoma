interface IntegrationDiagramProps {
  className?: string;
}

const INTERFACES = [
  { actor: "Agent", channel: "MCP (stdio)", icon: "⚡" },
  { actor: "Developer", channel: "CLI", icon: "▶" },
  { actor: "App", channel: "REST API (HTTP)", icon: "⟷" },
] as const;

export function IntegrationDiagram({ className }: IntegrationDiagramProps) {
  return (
    <div
      className={`relative rounded-xl border border-emerald-500/25 bg-gradient-to-b from-white via-slate-50 to-emerald-50/30 p-6 shadow-[0_14px_50px_rgba(0,0,0,0.08)] dark:border-emerald-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_14px_50px_rgba(0,0,0,0.45)] ${className ?? ""}`}
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_70%_30%,rgba(16,185,129,0.06),transparent_50%)] dark:bg-[radial-gradient(circle_at_70%_30%,rgba(16,185,129,0.1),transparent_50%)]" />
      <div className="relative flex flex-col gap-3">
        {INTERFACES.map((iface, i) => (
          <div key={iface.actor} className="flex items-center gap-3">
            <div className="w-[72px] shrink-0 rounded border border-slate-300/40 bg-slate-200/50 px-2 py-1.5 text-center font-mono text-[11px] text-slate-700 dark:border-slate-600/40 dark:bg-slate-800/50 dark:text-slate-300">
              {iface.actor}
            </div>
            <div className="flex flex-1 items-center gap-1.5">
              <span className="font-mono text-[10px] text-emerald-600/40 dark:text-emerald-400/40">
                {iface.icon}
              </span>
              <div className="h-px flex-1 border-t border-dashed border-emerald-400/20 dark:border-emerald-500/20" />
              <span className="font-mono text-[9px] text-emerald-600/50 dark:text-emerald-300/40">
                {iface.channel}
              </span>
              <div className="h-px flex-1 border-t border-dashed border-emerald-400/20 dark:border-emerald-500/20" />
              <span className="font-mono text-[10px] text-emerald-600/40 dark:text-emerald-400/40">
                →
              </span>
            </div>
            {i === 1 ? (
              <div className="w-[90px] shrink-0 rounded-lg border-2 border-emerald-500/40 bg-emerald-100/50 px-2 py-2.5 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <p className="font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                  Neotoma
                </p>
                <p className="font-mono text-[8px] text-emerald-600/60 dark:text-emerald-300/50">
                  state layer
                </p>
              </div>
            ) : (
              <div className="w-[90px]" />
            )}
          </div>
        ))}
        <div className="mt-2 rounded border border-emerald-500/20 bg-emerald-50/40 px-3 py-2 dark:border-emerald-400/15 dark:bg-emerald-500/5">
          <p className="font-mono text-[10px] text-emerald-600/70 dark:text-emerald-300/60">
            three interfaces · same deterministic guarantees
          </p>
        </div>
      </div>
    </div>
  );
}

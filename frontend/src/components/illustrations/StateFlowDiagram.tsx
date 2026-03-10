interface StateFlowDiagramProps {
  className?: string;
}

const LAYERS = [
  { label: "Source", sub: "file · text · JSON" },
  { label: "Observations", sub: "granular facts + provenance" },
  { label: "Entity Snapshots", sub: "current truth · versioned" },
  { label: "Memory Graph", sub: "entities + relationships + timeline" },
] as const;

const OPERATIONS = ["interpret", "reduce", "relate"] as const;

export function StateFlowDiagram({ className }: StateFlowDiagramProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-slate-300/60 bg-white p-5 dark:border-slate-700/60 dark:bg-slate-950 ${className ?? ""}`}
      aria-hidden="true"
    >
      {/* Blueprint grid overlay */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,rgba(148,163,184,1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,1)_1px,transparent_1px)] [background-size:20px_20px] dark:opacity-[0.06]" />

      <div className="relative flex flex-col gap-0">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
          state evolution pipeline
        </p>

        {LAYERS.map((layer, i) => (
          <div key={layer.label}>
            <div className="group flex items-center gap-3 rounded border border-slate-200 bg-slate-50 px-4 py-3 transition-colors dark:border-slate-700/40 dark:bg-slate-900/60">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-violet-600/50 bg-violet-100 font-mono text-[10px] font-bold text-violet-700 dark:border-violet-400/40 dark:bg-violet-500/10 dark:text-violet-300">
                {i + 1}
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[13px] font-medium text-slate-800 dark:text-slate-200">
                  {layer.label}
                </p>
                <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                  {layer.sub}
                </p>
              </div>
            </div>
            {i < LAYERS.length - 1 && (
              <div className="flex items-center gap-2 py-1 pl-7">
                <svg width="12" height="16" viewBox="0 0 12 16" className="shrink-0 text-violet-600/40 dark:text-violet-400/50">
                  <path d="M6 0 L6 12 M2 8 L6 13 L10 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="font-mono text-[10px] text-slate-400/80 dark:text-slate-500/70">
                  {OPERATIONS[i]}
                </span>
              </div>
            )}
          </div>
        ))}

        <div className="mt-3 flex items-center gap-2 rounded border border-dashed border-slate-300/50 bg-slate-100/50 px-3 py-2 dark:border-slate-600/40 dark:bg-slate-800/30">
          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400/80">
            ↻ replay · reconstruct state at any past point
          </span>
        </div>
      </div>
    </div>
  );
}

interface AgentLoopDiagramProps {
  className?: string;
}

const STEPS = [
  { num: "1", label: "Retrieve", desc: "bounded query for implied entities", highlight: false },
  { num: "2", label: "Store", desc: "persist conversation + entities", highlight: true },
  { num: "3", label: "Extract", desc: "facts → typed entities + relationships", highlight: false },
  { num: "4", label: "Respond", desc: "reply only after storage completes", highlight: false },
] as const;

export function AgentLoopDiagram({ className }: AgentLoopDiagramProps) {
  return (
    <div
      className={`relative rounded-xl border border-emerald-500/25 bg-gradient-to-b from-white via-slate-50 to-emerald-50/30 p-6 shadow-[0_14px_50px_rgba(0,0,0,0.08)] dark:border-emerald-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_14px_50px_rgba(0,0,0,0.45)] ${className ?? ""}`}
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_30%_70%,rgba(16,185,129,0.08),transparent_50%)] dark:bg-[radial-gradient(circle_at_30%_70%,rgba(16,185,129,0.12),transparent_50%)]" />
      <div className="relative flex flex-col gap-2">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-emerald-600/60 dark:text-emerald-300/50">
          mandatory agent loop
        </p>
        {STEPS.map((step, i) => (
          <div key={step.label}>
            <div
              className={`flex items-start gap-3 rounded-lg border px-4 py-2.5 ${
                step.highlight
                  ? "border-emerald-500/40 bg-emerald-100/50 dark:border-emerald-400/40 dark:bg-emerald-500/10"
                  : "border-emerald-500/20 bg-white/60 dark:border-emerald-400/15 dark:bg-slate-900/60"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                  step.highlight
                    ? "bg-emerald-500/30 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                    : "bg-slate-200/50 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400"
                }`}
              >
                {step.num}
              </span>
              <div className="min-w-0">
                <p
                  className={`font-mono text-[13px] font-medium ${
                    step.highlight
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-slate-800 dark:text-slate-200"
                  }`}
                >
                  {step.label}
                </p>
                <p className="font-mono text-[10px] text-slate-500/80 dark:text-slate-400/70">
                  {step.desc}
                </p>
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex items-center pl-7 py-0.5">
                <span className="text-emerald-600/30 dark:text-emerald-400/40">↓</span>
              </div>
            )}
          </div>
        ))}
        <div className="mt-2 rounded border border-rose-400/20 bg-rose-500/5 px-3 py-2 dark:border-rose-500/25 dark:bg-rose-50/30">
          <p className="font-mono text-[10px] text-rose-300/80 dark:text-rose-600/80">
            invariant: responding before storing is forbidden
          </p>
        </div>
      </div>
    </div>
  );
}

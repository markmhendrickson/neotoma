/**
 * Concrete illustration for agent system builders:
 * multiple agents -> traced document provenance.
 */
interface IcpAgenticBuildersIllustrationProps {
  className?: string;
}

export function IcpAgenticBuildersIllustration({ className = "" }: IcpAgenticBuildersIllustrationProps) {
  return (
    <div
      className={`relative flex h-[108px] w-full max-w-[220px] items-center justify-center overflow-hidden rounded-xl border border-emerald-500/25 bg-gradient-to-b from-white via-slate-50 to-emerald-50/30 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:border-emerald-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)] ${className}`}
      aria-hidden
    >
      <div className="pointer-events-none absolute inset-0 opacity-15 [background-image:linear-gradient(to_bottom,rgba(100,116,139,0.15)_1px,transparent_1px)] [background-size:100%_8px] dark:opacity-10" />
      <svg
        viewBox="0 0 200 80"
        className="relative h-full w-full max-h-[96px] max-w-[206px] shrink-0"
        fill="none"
        aria-hidden
      >
        {/* two agent heads */}
        <circle cx="34" cy="30" r="12" className="stroke-slate-400/60 dark:stroke-slate-500 fill-slate-100 dark:fill-slate-800/35" strokeWidth="1.4" />
        <circle cx="34" cy="54" r="12" className="stroke-slate-400/60 dark:stroke-slate-500 fill-slate-100 dark:fill-slate-800/35" strokeWidth="1.4" />
        <circle cx="34" cy="30" r="2" className="fill-slate-400 dark:fill-slate-500" />
        <circle cx="34" cy="54" r="2" className="fill-slate-400 dark:fill-slate-500" />

        {/* output document */}
        <rect x="118" y="18" width="56" height="44" rx="5" className="stroke-slate-400/60 dark:stroke-slate-500 fill-slate-100/80 dark:fill-slate-800/35" strokeWidth="1.3" />
        <path d="M127 30 L164 30 M127 38 L164 38 M127 46 L154 46" className="stroke-slate-400/70 dark:stroke-slate-500" strokeWidth="1.2" strokeLinecap="round" />

        {/* provenance lines */}
        <path d="M46 30 L118 30" className="stroke-emerald-500/50 dark:stroke-emerald-400/50" strokeWidth="1.5" strokeDasharray="4 3" />
        <path d="M46 54 L118 46" className="stroke-emerald-500/50 dark:stroke-emerald-400/50" strokeWidth="1.5" strokeDasharray="4 3" />

        {/* trace lens */}
        <circle cx="96" cy="40" r="10" className="stroke-emerald-500 dark:stroke-emerald-400 fill-emerald-500/10 dark:fill-emerald-400/10" strokeWidth="1.6" />
        <path d="M103 47 L110 54" className="stroke-emerald-500 dark:stroke-emerald-400" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M90 40 L102 40" className="stroke-emerald-600 dark:stroke-emerald-300" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/**
 * Concrete illustration for AI infrastructure engineers:
 * server runtime + integrity shield.
 */
interface IcpInfrastructureIllustrationProps {
  className?: string;
}

export function IcpInfrastructureIllustration({ className = "" }: IcpInfrastructureIllustrationProps) {
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
        {/* server rack */}
        <rect x="20" y="12" width="90" height="56" rx="8" className="stroke-slate-400/60 dark:stroke-slate-500 fill-slate-100/80 dark:fill-slate-800/35" strokeWidth="1.4" />
        <rect x="28" y="20" width="74" height="11" rx="3" className="stroke-slate-400/50 dark:stroke-slate-500 fill-slate-200/70 dark:fill-slate-700/50" strokeWidth="1" />
        <rect x="28" y="35" width="74" height="11" rx="3" className="stroke-slate-400/50 dark:stroke-slate-500 fill-slate-200/70 dark:fill-slate-700/50" strokeWidth="1" />
        <rect x="28" y="50" width="74" height="11" rx="3" className="stroke-slate-400/50 dark:stroke-slate-500 fill-slate-200/70 dark:fill-slate-700/50" strokeWidth="1" />
        <circle cx="34" cy="25.5" r="1.5" className="fill-emerald-500/70 dark:fill-emerald-400/70" />
        <circle cx="34" cy="40.5" r="1.5" className="fill-emerald-500/70 dark:fill-emerald-400/70" />
        <circle cx="34" cy="55.5" r="1.5" className="fill-emerald-500/70 dark:fill-emerald-400/70" />

        {/* protected runtime shield */}
        <path
          d="M140 14 L170 14 L182 24 L182 44 C182 57 171 67 155 72 C139 67 128 57 128 44 L128 24 Z"
          className="stroke-emerald-500 dark:stroke-emerald-400 fill-emerald-500/12 dark:fill-emerald-400/12"
          strokeWidth="1.8"
        />
        <path d="M146 43 L153 50 L166 35" className="stroke-emerald-600 dark:stroke-emerald-300" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

        {/* flow */}
        <path d="M110 40 L124 40" className="stroke-emerald-500/55 dark:stroke-emerald-400/55" strokeWidth="1.6" strokeDasharray="4 3" />
        <polygon points="121,36 128,40 121,44" className="fill-emerald-500/65 dark:fill-emerald-400/65" />
      </svg>
    </div>
  );
}

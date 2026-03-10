/**
 * Concrete illustration for AI-native operators:
 * one person using multiple tools backed by shared memory.
 */
interface IcpOperatorsIllustrationProps {
  className?: string;
}

export function IcpOperatorsIllustration({ className = "" }: IcpOperatorsIllustrationProps) {
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
        {/* person */}
        <circle cx="32" cy="24" r="8" className="stroke-slate-400/70 dark:stroke-slate-500 fill-slate-100 dark:fill-slate-800/40" strokeWidth="1.3" />
        <path d="M20 46 C20 36 44 36 44 46" className="stroke-slate-400/70 dark:stroke-slate-500" strokeWidth="1.6" strokeLinecap="round" />

        {/* tool windows */}
        <rect x="70" y="14" width="30" height="18" rx="4" className="stroke-slate-400/60 dark:stroke-slate-500 fill-slate-100/80 dark:fill-slate-800/35" strokeWidth="1.2" />
        <rect x="70" y="38" width="30" height="18" rx="4" className="stroke-slate-400/60 dark:stroke-slate-500 fill-slate-100/80 dark:fill-slate-800/35" strokeWidth="1.2" />
        <rect x="106" y="26" width="30" height="18" rx="4" className="stroke-slate-400/60 dark:stroke-slate-500 fill-slate-100/80 dark:fill-slate-800/35" strokeWidth="1.2" />

        {/* shared memory cylinder */}
        <ellipse cx="168" cy="28" rx="14" ry="5" className="stroke-emerald-500 dark:stroke-emerald-400 fill-emerald-500/15 dark:fill-emerald-400/15" strokeWidth="1.4" />
        <path d="M154 28 V48 C154 51 160 54 168 54 C176 54 182 51 182 48 V28" className="stroke-emerald-500 dark:stroke-emerald-400 fill-emerald-500/10 dark:fill-emerald-400/10" strokeWidth="1.4" />
        <ellipse cx="168" cy="48" rx="14" ry="5" className="stroke-emerald-500 dark:stroke-emerald-400 fill-emerald-500/10 dark:fill-emerald-400/10" strokeWidth="1.4" />

        {/* connections */}
        <path d="M44 24 L70 23" className="stroke-emerald-500/60 dark:stroke-emerald-400/60" strokeWidth="1.4" strokeDasharray="4 3" />
        <path d="M44 42 L70 47" className="stroke-emerald-500/60 dark:stroke-emerald-400/60" strokeWidth="1.4" strokeDasharray="4 3" />
        <path d="M136 35 L154 35" className="stroke-emerald-500/70 dark:stroke-emerald-400/70" strokeWidth="1.5" strokeDasharray="4 3" />
      </svg>
    </div>
  );
}

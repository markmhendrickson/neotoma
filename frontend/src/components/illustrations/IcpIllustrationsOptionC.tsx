/**
 * Option C: Pain→relief — rose (broken) on left, emerald (fixed) on right.
 * Mini before/after matching the hero aesthetic.
 */

const PANEL =
  "relative flex h-[108px] w-full max-w-[220px] items-center justify-center overflow-hidden rounded-xl border border-emerald-500/25 bg-gradient-to-b from-white via-slate-50 to-emerald-50/30 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:border-emerald-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]";
const GRID =
  "pointer-events-none absolute inset-0 opacity-15 [background-image:linear-gradient(to_bottom,rgba(100,116,139,0.15)_1px,transparent_1px)] [background-size:100%_8px] dark:opacity-10";
const SVG = "relative h-full w-full max-h-[96px] max-w-[206px] shrink-0";

/** Infra: broken pipeline (rose) → intact pipeline with check (emerald) */
export function IcpInfraIllustrationC({ className = "" }: { className?: string }) {
  return (
    <div className={`${PANEL} ${className}`} aria-hidden>
      <div className={GRID} />
      <svg viewBox="0 0 200 100" className={SVG} fill="none" aria-hidden>
        {/* LEFT: broken pipeline (rose) */}
        <rect x="10" y="20" width="28" height="16" rx="4" className="stroke-rose-400/60 dark:stroke-rose-400/60 fill-rose-500/10 dark:fill-rose-400/10" strokeWidth="1.3" />
        <rect x="46" y="20" width="28" height="16" rx="4" className="stroke-rose-400/60 dark:stroke-rose-400/60 fill-rose-500/10 dark:fill-rose-400/10" strokeWidth="1.3" />
        <path d="M38 28 L46 28" className="stroke-rose-400/50 dark:stroke-rose-400/50" strokeWidth="1.5" />
        {/* broken link */}
        <path d="M74 28 L82 28" className="stroke-rose-400/70 dark:stroke-rose-400/70" strokeWidth="1.5" />
        <line x1="78" y1="24" x2="78" y2="32" className="stroke-rose-400/70 dark:stroke-rose-400/70" strokeWidth="1.5" />
        <rect x="82" y="20" width="8" height="16" rx="3" className="stroke-rose-400/40 dark:stroke-rose-400/40 fill-rose-500/5" strokeWidth="1" strokeDasharray="2 2" />
        <text x="50" y="50" textAnchor="middle" className="fill-rose-500/50 dark:fill-rose-400/50" fontSize="7" fontFamily="monospace">non-reproducible</text>

        {/* arrow */}
        <path d="M98 50 L106 50" className="stroke-slate-400/40 dark:stroke-slate-500" strokeWidth="1.2" />
        <polygon points="104,47 109,50 104,53" className="fill-slate-400/40 dark:fill-slate-500" />

        {/* RIGHT: intact pipeline (emerald) */}
        <rect x="112" y="20" width="24" height="16" rx="4" className="stroke-emerald-500/60 dark:stroke-emerald-400/60 fill-emerald-500/10 dark:fill-emerald-400/10" strokeWidth="1.3" />
        <path d="M136 28 L142 28" className="stroke-emerald-500/50 dark:stroke-emerald-400/50" strokeWidth="1.5" />
        <polygon points="140,25 144,28 140,31" className="fill-emerald-500/50 dark:fill-emerald-400/50" />
        <rect x="144" y="20" width="24" height="16" rx="4" className="stroke-emerald-500/60 dark:stroke-emerald-400/60 fill-emerald-500/10 dark:fill-emerald-400/10" strokeWidth="1.3" />
        <path d="M168 28 L174 28" className="stroke-emerald-500/50 dark:stroke-emerald-400/50" strokeWidth="1.5" />
        <polygon points="172,25 176,28 172,31" className="fill-emerald-500/50 dark:fill-emerald-400/50" />
        <rect x="176" y="20" width="16" height="16" rx="4" className="stroke-emerald-500/60 dark:stroke-emerald-400/60 fill-emerald-500/15 dark:fill-emerald-400/15" strokeWidth="1.3" />
        {/* checkmark */}
        <path d="M180 28 L183 31 L189 25" className="stroke-emerald-600 dark:stroke-emerald-300" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <text x="155" y="50" textAnchor="middle" className="fill-emerald-600/50 dark:fill-emerald-300/50" fontSize="7" fontFamily="monospace">deterministic ✓</text>
      </svg>
    </div>
  );
}

/** Builders: disconnected agents (rose) → agents with shared state (emerald) */
export function IcpAgenticIllustrationC({ className = "" }: { className?: string }) {
  return (
    <div className={`${PANEL} ${className}`} aria-hidden>
      <div className={GRID} />
      <svg viewBox="0 0 200 100" className={SVG} fill="none" aria-hidden>
        {/* LEFT: disconnected (rose) */}
        <rect x="10" y="18" width="20" height="20" rx="5" className="stroke-rose-400/60 fill-rose-500/10" strokeWidth="1.2" />
        <circle cx="16" cy="26" r="2" className="fill-rose-400/60" />
        <circle cx="24" cy="26" r="2" className="fill-rose-400/60" />
        <rect x="38" y="18" width="20" height="20" rx="5" className="stroke-rose-400/60 fill-rose-500/10" strokeWidth="1.2" />
        <circle cx="44" cy="26" r="2" className="fill-rose-400/60" />
        <circle cx="52" cy="26" r="2" className="fill-rose-400/60" />
        <rect x="24" y="48" width="20" height="20" rx="5" className="stroke-rose-400/60 fill-rose-500/10" strokeWidth="1.2" />
        <circle cx="30" cy="56" r="2" className="fill-rose-400/60" />
        <circle cx="38" cy="56" r="2" className="fill-rose-400/60" />
        {/* broken connections */}
        <line x1="30" y1="28" x2="34" y2="28" className="stroke-rose-400/40" strokeWidth="1.2" />
        <line x1="35" y1="38" x2="35" y2="44" className="stroke-rose-400/40" strokeWidth="1.2" />
        <text x="34" y="82" textAnchor="middle" className="fill-rose-500/50 dark:fill-rose-400/50" fontSize="7" fontFamily="monospace">no provenance</text>

        {/* arrow */}
        <path d="M68 50 L76 50" className="stroke-slate-400/40 dark:stroke-slate-500" strokeWidth="1.2" />
        <polygon points="74,47 79,50 74,53" className="fill-slate-400/40 dark:fill-slate-500" />

        {/* RIGHT: connected with shared state (emerald) */}
        <rect x="88" y="18" width="20" height="20" rx="5" className="stroke-emerald-500/60 fill-emerald-500/10" strokeWidth="1.2" />
        <circle cx="94" cy="26" r="2" className="fill-emerald-500/60" />
        <circle cx="102" cy="26" r="2" className="fill-emerald-500/60" />
        <rect x="116" y="18" width="20" height="20" rx="5" className="stroke-emerald-500/60 fill-emerald-500/10" strokeWidth="1.2" />
        <circle cx="122" cy="26" r="2" className="fill-emerald-500/60" />
        <circle cx="130" cy="26" r="2" className="fill-emerald-500/60" />
        <rect x="102" y="48" width="20" height="20" rx="5" className="stroke-emerald-500/60 fill-emerald-500/10" strokeWidth="1.2" />
        <circle cx="108" cy="56" r="2" className="fill-emerald-500/60" />
        <circle cx="116" cy="56" r="2" className="fill-emerald-500/60" />
        {/* solid connections */}
        <path d="M108 28 L116 28" className="stroke-emerald-500/50" strokeWidth="1.5" />
        <path d="M106 38 L110 48" className="stroke-emerald-500/50" strokeWidth="1.5" />
        <path d="M128 38 L118 48" className="stroke-emerald-500/50" strokeWidth="1.5" />
        {/* state hub */}
        <rect x="148" y="32" width="40" height="26" rx="6" className="stroke-emerald-500/60 fill-emerald-500/12" strokeWidth="1.5" />
        <text x="168" y="44" textAnchor="middle" className="fill-emerald-600/60 dark:fill-emerald-300/60" fontSize="7" fontFamily="monospace">state</text>
        <text x="168" y="53" textAnchor="middle" className="fill-emerald-600/50 dark:fill-emerald-300/50" fontSize="7" fontFamily="monospace">layer</text>
        <path d="M136 28 L148 38" className="stroke-emerald-500/40" strokeWidth="1.3" strokeDasharray="3 2" />
        <path d="M122 56 L148 50" className="stroke-emerald-500/40" strokeWidth="1.3" strokeDasharray="3 2" />
        <text x="134" y="82" textAnchor="middle" className="fill-emerald-600/50 dark:fill-emerald-300/50" fontSize="7" fontFamily="monospace">traced ✓</text>
      </svg>
    </div>
  );
}

/** Operators: scattered fragments (rose) → unified memory (emerald) */
export function IcpOperatorsIllustrationC({ className = "" }: { className?: string }) {
  return (
    <div className={`${PANEL} ${className}`} aria-hidden>
      <div className={GRID} />
      <svg viewBox="0 0 200 100" className={SVG} fill="none" aria-hidden>
        {/* LEFT: scattered fragments (rose) */}
        <rect x="8" y="16" width="22" height="14" rx="3" className="stroke-rose-400/50 fill-rose-500/8" strokeWidth="1.1" transform="rotate(-8 19 23)" />
        <rect x="34" y="22" width="22" height="14" rx="3" className="stroke-rose-400/50 fill-rose-500/8" strokeWidth="1.1" transform="rotate(5 45 29)" />
        <rect x="14" y="42" width="22" height="14" rx="3" className="stroke-rose-400/50 fill-rose-500/8" strokeWidth="1.1" transform="rotate(-3 25 49)" />
        <rect x="40" y="46" width="22" height="14" rx="3" className="stroke-rose-400/50 fill-rose-500/8" strokeWidth="1.1" transform="rotate(7 51 53)" />
        <rect x="22" y="64" width="22" height="14" rx="3" className="stroke-rose-400/50 fill-rose-500/8" strokeWidth="1.1" transform="rotate(-5 33 71)" />
        <text x="36" y="90" textAnchor="middle" className="fill-rose-500/50 dark:fill-rose-400/50" fontSize="7" fontFamily="monospace">fragmented</text>

        {/* arrow */}
        <path d="M68 50 L76 50" className="stroke-slate-400/40 dark:stroke-slate-500" strokeWidth="1.2" />
        <polygon points="74,47 79,50 74,53" className="fill-slate-400/40 dark:fill-slate-500" />

        {/* RIGHT: unified memory (emerald) */}
        <rect x="86" y="16" width="22" height="14" rx="3" className="stroke-emerald-500/40 fill-emerald-500/8" strokeWidth="1.1" />
        <rect x="112" y="16" width="22" height="14" rx="3" className="stroke-emerald-500/40 fill-emerald-500/8" strokeWidth="1.1" />
        <rect x="86" y="36" width="22" height="14" rx="3" className="stroke-emerald-500/40 fill-emerald-500/8" strokeWidth="1.1" />
        <rect x="112" y="36" width="22" height="14" rx="3" className="stroke-emerald-500/40 fill-emerald-500/8" strokeWidth="1.1" />
        {/* converge lines */}
        <path d="M97 30 L155 55" className="stroke-emerald-500/30" strokeWidth="1" strokeDasharray="3 2" />
        <path d="M123 30 L155 55" className="stroke-emerald-500/30" strokeWidth="1" strokeDasharray="3 2" />
        <path d="M97 50 L155 60" className="stroke-emerald-500/30" strokeWidth="1" strokeDasharray="3 2" />
        <path d="M123 50 L155 60" className="stroke-emerald-500/30" strokeWidth="1" strokeDasharray="3 2" />
        {/* memory cylinder */}
        <ellipse cx="168" cy="50" rx="18" ry="6" className="stroke-emerald-500/70 fill-emerald-500/15" strokeWidth="1.5" />
        <path d="M150 50 V68 C150 72 159 76 168 76 C177 76 186 72 186 68 V50" className="stroke-emerald-500/70 fill-emerald-500/10" strokeWidth="1.5" />
        <ellipse cx="168" cy="68" rx="18" ry="6" className="stroke-emerald-500/70 fill-emerald-500/10" strokeWidth="1.5" />
        <text x="155" y="90" textAnchor="middle" className="fill-emerald-600/50 dark:fill-emerald-300/50" fontSize="7" fontFamily="monospace">unified ✓</text>
      </svg>
    </div>
  );
}

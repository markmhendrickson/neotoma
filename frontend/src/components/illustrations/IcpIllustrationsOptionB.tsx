/**
 * Option B: World snapshots — show what their daily environment looks like, no person.
 */

const PANEL =
  "relative flex h-[108px] w-full max-w-[220px] items-center justify-center overflow-hidden rounded-xl border border-emerald-500/25 bg-gradient-to-b from-white via-slate-50 to-emerald-50/30 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:border-emerald-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]";
const PANEL_TRANSPARENT =
  "relative flex h-[220px] w-[220px] items-center justify-center overflow-visible bg-transparent";
const GRID =
  "pointer-events-none absolute inset-0 opacity-15 [background-image:linear-gradient(to_bottom,rgba(100,116,139,0.15)_1px,transparent_1px)] [background-size:100%_8px] dark:opacity-10";
const SVG = "relative h-full w-full max-h-[96px] max-w-[206px] shrink-0";
const SVG_LARGE = "relative h-full w-full max-h-[200px] max-w-[200px] shrink-0";

/** Infra: layered pipeline stages with version numbers */
export function IcpInfraIllustrationB({
  className = "",
  transparent,
}: {
  className?: string;
  /** Use transparent background (for cards); no panel gradient. */
  transparent?: boolean;
}) {
  const wrapper = transparent ? PANEL_TRANSPARENT : PANEL;
  const svgClass = transparent ? SVG_LARGE : SVG;
  return (
    <div className={`${wrapper} ${className}`} aria-hidden>
      {!transparent && <div className={GRID} />}
      <svg viewBox="0 0 200 100" className={svgClass} fill="none" aria-hidden>
        {/* pipeline stages */}
        <rect
          x="10"
          y="16"
          width="52"
          height="22"
          rx="5"
          className="stroke-emerald-500/60 dark:stroke-emerald-400/60 fill-emerald-500/10 dark:fill-emerald-400/10"
          strokeWidth="1.4"
        />
        <text
          x="36"
          y="30"
          textAnchor="middle"
          className="fill-emerald-600/70 dark:fill-emerald-300/70"
          fontSize="8"
          fontFamily="monospace"
        >
          ingest
        </text>
        <rect
          x="74"
          y="16"
          width="52"
          height="22"
          rx="5"
          className="stroke-emerald-500/60 dark:stroke-emerald-400/60 fill-emerald-500/10 dark:fill-emerald-400/10"
          strokeWidth="1.4"
        />
        <text
          x="100"
          y="30"
          textAnchor="middle"
          className="fill-emerald-600/70 dark:fill-emerald-300/70"
          fontSize="8"
          fontFamily="monospace"
        >
          process
        </text>
        <rect
          x="138"
          y="16"
          width="52"
          height="22"
          rx="5"
          className="stroke-emerald-500/60 dark:stroke-emerald-400/60 fill-emerald-500/10 dark:fill-emerald-400/10"
          strokeWidth="1.4"
        />
        <text
          x="164"
          y="30"
          textAnchor="middle"
          className="fill-emerald-600/70 dark:fill-emerald-300/70"
          fontSize="8"
          fontFamily="monospace"
        >
          deploy
        </text>
        {/* arrows */}
        <path
          d="M62 27 L74 27"
          className="stroke-emerald-500/50 dark:stroke-emerald-400/50"
          strokeWidth="1.5"
        />
        <polygon
          points="71,24 76,27 71,30"
          className="fill-emerald-500/50 dark:fill-emerald-400/50"
        />
        <path
          d="M126 27 L138 27"
          className="stroke-emerald-500/50 dark:stroke-emerald-400/50"
          strokeWidth="1.5"
        />
        <polygon
          points="135,24 140,27 135,30"
          className="fill-emerald-500/50 dark:fill-emerald-400/50"
        />
        {/* version history underneath */}
        <rect
          x="10"
          y="52"
          width="180"
          height="32"
          rx="5"
          className="stroke-slate-300/50 dark:stroke-slate-600/50 fill-slate-100/50 dark:fill-slate-800/30"
          strokeWidth="1"
        />
        <text
          x="20"
          y="66"
          className="fill-slate-500/70 dark:fill-slate-400/70"
          fontSize="7"
          fontFamily="monospace"
        >
          run·v3
        </text>
        <text
          x="20"
          y="78"
          className="fill-slate-400/60 dark:fill-slate-500/60"
          fontSize="7"
          fontFamily="monospace"
        >
          run·v2
        </text>
        <circle cx="62" cy="63" r="3" className="fill-emerald-500/50 dark:fill-emerald-400/50" />
        <text
          x="70"
          y="66"
          className="fill-emerald-600/60 dark:fill-emerald-300/60"
          fontSize="7"
          fontFamily="monospace"
        >
          ✓ deterministic
        </text>
        <circle cx="62" cy="75" r="3" className="fill-emerald-500/30 dark:fill-emerald-400/30" />
        <text
          x="70"
          y="78"
          className="fill-slate-400/60 dark:fill-slate-500/60"
          fontSize="7"
          fontFamily="monospace"
        >
          ✓ deterministic
        </text>
      </svg>
    </div>
  );
}

/** Builders: constellation of connected bot icons in a workflow */
export function IcpAgenticIllustrationB({
  className = "",
  transparent,
}: {
  className?: string;
  transparent?: boolean;
}) {
  const wrapper = transparent ? PANEL_TRANSPARENT : PANEL;
  const svgClass = transparent ? SVG_LARGE : SVG;
  return (
    <div className={`${wrapper} ${className}`} aria-hidden>
      {!transparent && <div className={GRID} />}
      <svg viewBox="0 0 200 100" className={svgClass} fill="none" aria-hidden>
        {/* bot nodes at various positions */}
        <rect
          x="16"
          y="30"
          width="30"
          height="30"
          rx="8"
          className="stroke-slate-400/60 dark:stroke-slate-500 fill-slate-100 dark:fill-slate-800/35"
          strokeWidth="1.3"
        />
        <circle cx="26" cy="42" r="3" className="fill-slate-400/70 dark:fill-slate-500" />
        <circle cx="36" cy="42" r="3" className="fill-slate-400/70 dark:fill-slate-500" />
        <path
          d="M24 50 Q31 54 38 50"
          className="stroke-slate-400/50 dark:stroke-slate-500"
          strokeWidth="1"
          fill="none"
        />

        <rect
          x="76"
          y="12"
          width="30"
          height="30"
          rx="8"
          className="stroke-slate-400/60 dark:stroke-slate-500 fill-slate-100 dark:fill-slate-800/35"
          strokeWidth="1.3"
        />
        <circle cx="86" cy="24" r="3" className="fill-slate-400/70 dark:fill-slate-500" />
        <circle cx="96" cy="24" r="3" className="fill-slate-400/70 dark:fill-slate-500" />
        <path
          d="M84 32 Q91 36 98 32"
          className="stroke-slate-400/50 dark:stroke-slate-500"
          strokeWidth="1"
          fill="none"
        />

        <rect
          x="76"
          y="56"
          width="30"
          height="30"
          rx="8"
          className="stroke-slate-400/60 dark:stroke-slate-500 fill-slate-100 dark:fill-slate-800/35"
          strokeWidth="1.3"
        />
        <circle cx="86" cy="68" r="3" className="fill-slate-400/70 dark:fill-slate-500" />
        <circle cx="96" cy="68" r="3" className="fill-slate-400/70 dark:fill-slate-500" />
        <path
          d="M84 76 Q91 80 98 76"
          className="stroke-slate-400/50 dark:stroke-slate-500"
          strokeWidth="1"
          fill="none"
        />

        {/* connections */}
        <path
          d="M46 45 L76 27"
          className="stroke-emerald-500/50 dark:stroke-emerald-400/50"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <path
          d="M46 45 L76 71"
          className="stroke-emerald-500/50 dark:stroke-emerald-400/50"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <path
          d="M106 27 L126 45"
          className="stroke-emerald-500/50 dark:stroke-emerald-400/50"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <path
          d="M106 71 L126 55"
          className="stroke-emerald-500/50 dark:stroke-emerald-400/50"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />

        {/* central shared state */}
        <rect
          x="126"
          y="34"
          width="56"
          height="32"
          rx="7"
          className="stroke-emerald-500/70 dark:stroke-emerald-400/70 fill-emerald-500/15 dark:fill-emerald-400/12"
          strokeWidth="1.6"
        />
        <text
          x="154"
          y="48"
          textAnchor="middle"
          className="fill-emerald-600/70 dark:fill-emerald-300/70"
          fontSize="7"
          fontFamily="monospace"
        >
          shared
        </text>
        <text
          x="154"
          y="58"
          textAnchor="middle"
          className="fill-emerald-600/60 dark:fill-emerald-300/60"
          fontSize="7"
          fontFamily="monospace"
        >
          state
        </text>
      </svg>
    </div>
  );
}

/** Operators: familiar app icons with a single connecting thread */
export function IcpOperatorsIllustrationB({
  className = "",
  transparent,
}: {
  className?: string;
  transparent?: boolean;
}) {
  const wrapper = transparent ? PANEL_TRANSPARENT : PANEL;
  const svgClass = transparent ? SVG_LARGE : SVG;
  return (
    <div className={`${wrapper} ${className}`} aria-hidden>
      {!transparent && <div className={GRID} />}
      <svg viewBox="0 0 200 100" className={svgClass} fill="none" aria-hidden>
        {/* app windows */}
        <rect
          x="14"
          y="14"
          width="36"
          height="28"
          rx="5"
          className="stroke-slate-400/60 dark:stroke-slate-500 fill-slate-100/80 dark:fill-slate-800/35"
          strokeWidth="1.2"
        />
        <rect
          x="14"
          y="14"
          width="36"
          height="8"
          rx="5"
          className="fill-slate-200/80 dark:fill-slate-700/50"
        />
        <circle cx="20" cy="18" r="1.5" className="fill-rose-400/50" />
        <circle cx="26" cy="18" r="1.5" className="fill-amber-400/50" />
        <circle cx="32" cy="18" r="1.5" className="fill-emerald-400/50" />
        <text
          x="32"
          y="34"
          textAnchor="middle"
          className="fill-slate-400/70 dark:fill-slate-500"
          fontSize="7"
          fontFamily="monospace"
        >
          chat
        </text>

        <rect
          x="82"
          y="14"
          width="36"
          height="28"
          rx="5"
          className="stroke-slate-400/60 dark:stroke-slate-500 fill-slate-100/80 dark:fill-slate-800/35"
          strokeWidth="1.2"
        />
        <rect
          x="82"
          y="14"
          width="36"
          height="8"
          rx="5"
          className="fill-slate-200/80 dark:fill-slate-700/50"
        />
        <circle cx="88" cy="18" r="1.5" className="fill-rose-400/50" />
        <circle cx="94" cy="18" r="1.5" className="fill-amber-400/50" />
        <circle cx="100" cy="18" r="1.5" className="fill-emerald-400/50" />
        <text
          x="100"
          y="34"
          textAnchor="middle"
          className="fill-slate-400/70 dark:fill-slate-500"
          fontSize="7"
          fontFamily="monospace"
        >
          code
        </text>

        <rect
          x="150"
          y="14"
          width="36"
          height="28"
          rx="5"
          className="stroke-slate-400/60 dark:stroke-slate-500 fill-slate-100/80 dark:fill-slate-800/35"
          strokeWidth="1.2"
        />
        <rect
          x="150"
          y="14"
          width="36"
          height="8"
          rx="5"
          className="fill-slate-200/80 dark:fill-slate-700/50"
        />
        <circle cx="156" cy="18" r="1.5" className="fill-rose-400/50" />
        <circle cx="162" cy="18" r="1.5" className="fill-amber-400/50" />
        <circle cx="168" cy="18" r="1.5" className="fill-emerald-400/50" />
        <text
          x="168"
          y="34"
          textAnchor="middle"
          className="fill-slate-400/70 dark:fill-slate-500"
          fontSize="7"
          fontFamily="monospace"
        >
          email
        </text>

        {/* connecting thread from all three down to shared memory */}
        <path
          d="M32 42 L60 62"
          className="stroke-emerald-500/50 dark:stroke-emerald-400/50"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <path
          d="M100 42 L100 62"
          className="stroke-emerald-500/50 dark:stroke-emerald-400/50"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <path
          d="M168 42 L140 62"
          className="stroke-emerald-500/50 dark:stroke-emerald-400/50"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />

        {/* shared memory bar */}
        <rect
          x="50"
          y="62"
          width="100"
          height="22"
          rx="6"
          className="stroke-emerald-500/60 dark:stroke-emerald-400/60 fill-emerald-500/12 dark:fill-emerald-400/10"
          strokeWidth="1.5"
        />
        <text
          x="100"
          y="76"
          textAnchor="middle"
          className="fill-emerald-600/70 dark:fill-emerald-300/70"
          fontSize="8"
          fontFamily="monospace"
        >
          one memory
        </text>
      </svg>
    </div>
  );
}

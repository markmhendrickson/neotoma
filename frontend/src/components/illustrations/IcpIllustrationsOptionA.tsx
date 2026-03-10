/**
 * Option A: Role vignettes — person in their context.
 * Sophisticated rendered style: gradient fills, soft shadows, tonal depth.
 * No line-drawing; forms suggested by light and volume.
 */

const PANEL =
  "relative flex h-[108px] w-full max-w-[220px] items-center justify-center overflow-hidden rounded-xl border border-emerald-500/25 bg-gradient-to-b from-white via-slate-50 to-emerald-50/30 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:border-emerald-400/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]";
const SVG = "relative h-full w-full max-h-[96px] max-w-[206px] shrink-0";

/** Shared defs: gradients and shadow for rendered look */
function RenderedDefs() {
  return (
    <defs>
      {/* Soft drop shadow */}
      <filter id="icp-drop-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
        <feOffset in="blur" dx="0" dy="1" result="offset" />
        <feFlood floodColor="#0f172a" floodOpacity="0.25" result="color" />
        <feComposite in="color" in2="offset" operator="in" result="shadow" />
        <feBlend in="SourceGraphic" in2="shadow" mode="normal" />
      </filter>
      {/* Person / organic form: top-left light */}
      <radialGradient id="icp-person-head" cx="35%" cy="35%" r="65%" fx="30%" fy="28%">
        <stop offset="0%" stopColor="#f8fafc" />
        <stop offset="50%" stopColor="#e2e8f0" />
        <stop offset="100%" stopColor="#94a3b8" />
      </radialGradient>
      <linearGradient id="icp-person-torso" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#cbd5e1" />
        <stop offset="100%" stopColor="#64748b" />
      </linearGradient>
      {/* Hard hat / equipment */}
      <linearGradient id="icp-hat" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#99f6e4" />
        <stop offset="40%" stopColor="#2dd4bf" />
        <stop offset="100%" stopColor="#0d9488" />
      </linearGradient>
      {/* Pipeline layers: stacked, top lit */}
      <linearGradient id="icp-layer-top" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ccfbf1" />
        <stop offset="100%" stopColor="#5eead4" />
      </linearGradient>
      <linearGradient id="icp-layer-mid" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#b8f0e5" />
        <stop offset="100%" stopColor="#2dd4bf" />
      </linearGradient>
      <linearGradient id="icp-layer-bottom" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#a7f3ec" />
        <stop offset="100%" stopColor="#14b8a6" />
      </linearGradient>
      {/* Agent nodes: soft glassy */}
      <linearGradient id="icp-node" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f1f5f9" />
        <stop offset="100%" stopColor="#cbd5e1" />
      </linearGradient>
      {/* Windows: subtle glass */}
      <linearGradient id="icp-window" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#f8fafc" />
        <stop offset="100%" stopColor="#e2e8f0" />
      </linearGradient>
      {/* Dark mode overrides via class on parent; use currentColor-friendly stops where needed */}
      <radialGradient id="icp-person-head-dark" cx="35%" cy="35%" r="65%" fx="30%" fy="28%">
        <stop offset="0%" stopColor="#475569" />
        <stop offset="60%" stopColor="#334155" />
        <stop offset="100%" stopColor="#1e293b" />
      </radialGradient>
      <linearGradient id="icp-hat-dark" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#34d399" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
    </defs>
  );
}

/** Infra engineer: figure with hard hat, stacked pipeline layers. Rendered. */
export function IcpInfraIllustrationA({ className = "" }: { className?: string }) {
  return (
    <div className={`${PANEL} ${className}`} aria-hidden>
      <svg viewBox="0 0 200 100" className={SVG} fill="none" aria-hidden>
        <RenderedDefs />
        {/* Figure: head (filled, no stroke) */}
        <circle cx="52" cy="32" r="11" fill="url(#icp-person-head)" className="dark:fill-[url(#icp-person-head-dark)]" />
        {/* Torso: rounded shape with gradient */}
        <path
          d="M40 44 L42 62 Q52 68 62 62 L66 44 Q52 38 40 44 Z"
          fill="url(#icp-person-torso)"
          className="opacity-90 dark:opacity-80"
        />
        {/* Hard hat: filled form with highlight */}
        <path
          d="M42 28 L42 20 Q42 12 52 12 Q62 12 62 20 L62 28 Z"
          fill="url(#icp-hat)"
          className="dark:fill-[url(#icp-hat-dark)]"
        />
        <rect x="42" y="26" width="20" height="4" rx="1" fill="url(#icp-hat)" className="dark:fill-[url(#icp-hat-dark)]" />
        {/* Arm: soft tapered shape */}
        <path d="M64 46 Q82 42 92 44" stroke="url(#icp-person-torso)" strokeWidth="5" strokeLinecap="round" fill="none" className="opacity-80" />
        {/* Stacked layers with shadow and gradient */}
        <g filter="url(#icp-drop-shadow)">
          <rect x="94" y="18" width="74" height="16" rx="5" fill="url(#icp-layer-top)" />
          <rect x="94" y="40" width="74" height="16" rx="5" fill="url(#icp-layer-mid)" />
          <rect x="94" y="62" width="74" height="16" rx="5" fill="url(#icp-layer-bottom)" />
        </g>
        {/* Subtle connector (gradient stroke, not line art) */}
        <line x1="92" y1="44" x2="94" y2="44" stroke="url(#icp-layer-mid)" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      </svg>
    </div>
  );
}

/** Agentic builder: figure with tool, connected agent nodes. Rendered. */
export function IcpAgenticIllustrationA({ className = "" }: { className?: string }) {
  return (
    <div className={`${PANEL} ${className}`} aria-hidden>
      <svg viewBox="0 0 200 100" className={SVG} fill="none" aria-hidden>
        <RenderedDefs />
        {/* Figure */}
        <circle cx="36" cy="36" r="11" fill="url(#icp-person-head)" className="dark:fill-[url(#icp-person-head-dark)]" />
        <path
          d="M24 50 L26 66 Q36 72 46 66 L50 50 Q36 44 24 50 Z"
          fill="url(#icp-person-torso)"
          className="opacity-90 dark:opacity-80"
        />
        {/* Wrench/tool: solid form */}
        <path
          d="M48 38 L70 26 L74 30 L52 42 Z"
          fill="url(#icp-hat)"
          className="dark:fill-[url(#icp-hat-dark)]"
        />
        <circle cx="76" cy="28" r="6" fill="url(#icp-hat)" className="dark:fill-[url(#icp-hat-dark)]" />
        {/* Agent nodes: glassy rounded rects with shadow */}
        <g filter="url(#icp-drop-shadow)">
          <rect x="90" y="14" width="28" height="28" rx="8" fill="url(#icp-node)" />
          <rect x="132" y="14" width="28" height="28" rx="8" fill="url(#icp-node)" />
          <rect x="111" y="52" width="28" height="28" rx="8" fill="url(#icp-node)" />
        </g>
        {/* Face dots: subtle filled circles (not strokes) */}
        <circle cx="98" cy="32" r="2.5" fill="#64748b" className="dark:fill-slate-400" />
        <circle cx="108" cy="32" r="2.5" fill="#64748b" className="dark:fill-slate-400" />
        <circle cx="140" cy="32" r="2.5" fill="#64748b" className="dark:fill-slate-400" />
        <circle cx="150" cy="32" r="2.5" fill="#64748b" className="dark:fill-slate-400" />
        <circle cx="119" cy="64" r="2.5" fill="#64748b" className="dark:fill-slate-400" />
        <circle cx="129" cy="64" r="2.5" fill="#64748b" className="dark:fill-slate-400" />
        {/* Connections: soft gradient lines */}
        <line x1="118" y1="28" x2="132" y2="28" stroke="url(#icp-layer-mid)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
        <path d="M112 42 Q120 48 122 52" stroke="url(#icp-layer-mid)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.5" />
        <path d="M146 42 Q138 48 136 52" stroke="url(#icp-layer-mid)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.5" />
      </svg>
    </div>
  );
}

/** AI-native operator: figure at laptop, floating windows. Rendered. */
export function IcpOperatorsIllustrationA({ className = "" }: { className?: string }) {
  return (
    <div className={`${PANEL} ${className}`} aria-hidden>
      <svg viewBox="0 0 200 100" className={SVG} fill="none" aria-hidden>
        <RenderedDefs />
        {/* Figure */}
        <circle cx="40" cy="34" r="11" fill="url(#icp-person-head)" className="dark:fill-[url(#icp-person-head-dark)]" />
        <path
          d="M28 48 L30 64 Q40 70 50 64 L52 48 Q40 42 28 48 Z"
          fill="url(#icp-person-torso)"
          className="opacity-90 dark:opacity-80"
        />
        {/* Laptop: solid base with gradient */}
        <path
          d="M24 70 L56 70 L54 76 L26 76 Z"
          fill="url(#icp-person-torso)"
          className="opacity-85 dark:opacity-75"
        />
        <rect x="28" y="68" width="24" height="6" rx="2" fill="url(#icp-node)" />
        {/* Floating windows: glass panels with shadow */}
        <g filter="url(#icp-drop-shadow)">
          <rect x="74" y="10" width="44" height="32" rx="6" fill="url(#icp-window)" />
          <rect x="122" y="18" width="44" height="32" rx="6" fill="url(#icp-window)" />
          <rect x="90" y="48" width="44" height="32" rx="6" fill="url(#icp-window)" />
        </g>
        {/* Window content suggestion: soft bars (filled, not lines) */}
        <rect x="80" y="20" width="32" height="2" rx="1" fill="#94a3b8" className="opacity-40 dark:opacity-50" />
        <rect x="80" y="26" width="24" height="2" rx="1" fill="#94a3b8" className="opacity-30 dark:opacity-40" />
        <rect x="128" y="28" width="32" height="2" rx="1" fill="#94a3b8" className="opacity-40 dark:opacity-50" />
        <rect x="128" y="34" width="28" height="2" rx="1" fill="#94a3b8" className="opacity-30 dark:opacity-40" />
        <rect x="96" y="58" width="32" height="2" rx="1" fill="#94a3b8" className="opacity-40 dark:opacity-50" />
        <rect x="96" y="64" width="26" height="2" rx="1" fill="#94a3b8" className="opacity-30 dark:opacity-40" />
        {/* Soft connection feel from figure to screens */}
        <path d="M52 46 L72 26" stroke="url(#icp-layer-mid)" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
        <path d="M52 52 L92 58" stroke="url(#icp-layer-mid)" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      </svg>
    </div>
  );
}

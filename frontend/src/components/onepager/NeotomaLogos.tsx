import { NEOTOMA_LOGO_DRAFTING } from "./neotoma_logo_drafting.generated";

/**
 * Accepted Neotoma identity (symbol "Retained sheets", wordmark N2). Sources and derivation:
 * frontend/public/brand/PROVENANCE.json. Nothing here is redrawn.
 */

/** Solid accepted lockup. Light and dark exports are the accepted files, swapped by theme. */
export function SolidLockup({ className = "" }: { className?: string }) {
  return (
    <span className={`plan-solid-logo ${className}`} role="img" aria-label="Neotoma">
      <img
        className="plan-logo-light"
        src="/brand/n2-nav-light.svg"
        alt=""
        width={132}
        height={28}
      />
      <img className="plan-logo-dark" src="/brand/n2-nav-dark.svg" alt="" width={132} height={28} />
    </span>
  );
}

/**
 * Drafting variant: the same path data and transforms as the accepted lockup, drawn as
 * outline linework (see scripts/derive_neotoma_logo_drafting.mjs). Decorative in title blocks.
 */
export function DraftingLogo({ height = 20 }: { height?: number }) {
  const { viewBox, width, height: h, groups } = NEOTOMA_LOGO_DRAFTING;
  const ratio = Number(width) / Number(h);
  return (
    <svg
      className="plan-drafting-logo"
      viewBox={viewBox}
      width={height * ratio}
      height={height}
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      {groups.map((g, gi) => (
        <g key={gi} transform={g.transform}>
          {g.paths.map((p, pi) => (
            <path
              key={pi}
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              transform={p.transform ?? undefined}
              d={p.d}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

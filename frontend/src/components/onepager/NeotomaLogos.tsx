import { useId } from "react";
import { NEOTOMA_LOGO_DRAFTING, NEOTOMA_LOGO_EDGE } from "./neotoma_logo_drafting.generated";

/**
 * Accepted Neotoma identity (symbol "Retained sheets", wordmark N2). Sources and derivation:
 * frontend/public/brand/PROVENANCE.json. Nothing here is redrawn.
 *
 * Size rule: the solid lockup is used in the masthead, the footer, the /install chrome, phone
 * title blocks and on 1x displays. The drafting variant is used only in sheet title blocks, about
 * 160 px wide (capped at 170) and only on displays of 2x or more: the hairline outline needs a
 * device pixel narrower than a CSS pixel, and at 1x it renders heavy and doubled.
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
 * Drafting variant: the same path data and transforms as the accepted lockup, outlined as the
 * union of the shapes by an SVG filter (see scripts/derive_neotoma_logo_drafting.mjs). Decorative.
 * The width is capped, the outline radius scales with the render width, and the outline follows
 * the theme through currentColor.
 */
export function DraftingLogo({ width = NEOTOMA_LOGO_EDGE.width }: { width?: number }) {
  const { viewBox, width: w, height: h, groups } = NEOTOMA_LOGO_DRAFTING;
  const rendered = Math.min(width, NEOTOMA_LOGO_EDGE.maxWidth);
  // Radius in viewBox units that draws a hairline (edgePx CSS px) at this render width.
  const radius =
    Math.round(((NEOTOMA_LOGO_EDGE.edgePx * viewBoxWidth(viewBox)) / rendered) * 1000) / 1000;
  // Unique per instance: several drafting logos share one page and one id space.
  const id = `neotoma-edge-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg
      className="plan-drafting-logo"
      viewBox={viewBox}
      width={rendered}
      height={(rendered * Number(h)) / Number(w)}
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id={id} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius={radius} result="d" />
          <feComposite in="d" in2="SourceAlpha" operator="out" result="edge" />
          <feFlood floodColor="currentColor" result="ink" />
          <feComposite in="ink" in2="edge" operator="in" result="line" />
          <feFlood
            floodColor="currentColor"
            floodOpacity={NEOTOMA_LOGO_EDGE.tintOpacity}
            result="t"
          />
          <feComposite in="t" in2="SourceAlpha" operator="in" result="tin" />
          <feMerge>
            <feMergeNode in="tin" />
            <feMergeNode in="line" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${id})`}>
        {groups.map((g, gi) => (
          <g key={gi} transform={g.transform}>
            {g.paths.map((p, pi) => (
              <path key={pi} fill="currentColor" transform={p.transform ?? undefined} d={p.d} />
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}

function viewBoxWidth(viewBox: string): number {
  return Number(viewBox.split(/\s+/)[2]);
}

/** Sheet title block: drafting logo on wide 2x displays, solid lockup everywhere else. */
export function PlanTitleBlock({ sheet, title }: { sheet: string; title: string }) {
  return (
    <div className="plan-titleblock" aria-hidden="true">
      <span className="plan-tb-logo">
        <span className="plan-tb-draft">
          <DraftingLogo width={NEOTOMA_LOGO_EDGE.width} />
        </span>
        <span className="plan-tb-solid">
          <SolidLockup />
        </span>
      </span>
      <span>{title}</span>
      <span>SHEET {sheet}</span>
      <span>REV A · NTS</span>
    </div>
  );
}

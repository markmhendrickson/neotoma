import { PLATE_ALT, PLATE_NOTE } from "./onepager_copy";
import { cloudPath } from "./onepager_figures";

/**
 * Sheet 01 plate (FIG. A-1): the accepted overhead paper-object photograph with drafting
 * annotations drawn over it as inline SVG. The photograph is used as accepted (derivation and
 * hashes: frontend/public/brand/PROVENANCE.json, "plate"); nothing is drawn into the image files.
 *
 * The paper objects carry no text and were composed for a different walk-through, so no words or
 * invoice data are placed on them. The overlay uses only numbered keys (matching FIGURE_LEGEND),
 * dimension lines, leaders and one revision cloud, plus three labels in the empty paper margin:
 * the figure label, the "synthetic example" tag and the title-block note.
 *
 * All geometry is in the source frame (1536 x 1024). The wide plate shows the whole frame. The
 * narrow plate is a separate crop of the same frame (NARROW_VIEW, kept in step with
 * scripts/derive_neotoma_plate.mjs) and draws its linework and type larger in source units, so
 * line weights and text stay the same size on screen.
 */

export const PLATE_WIDE = { width: 1536, height: 1024, src: "/brand/plate/neotoma-plate-a1-wide" };
export const PLATE_NARROW = {
  width: 728,
  height: 843,
  src: "/brand/plate/neotoma-plate-a1-narrow",
};
/** Window of the source frame that the narrow files show: left, top, width, height. */
export const NARROW_VIEW = { x: 652, y: 0, w: 884, h: 1024 } as const;

/** Fixed colors: the plate keeps its own paper ground in both themes, so it does not follow them. */
const INK = "#28372f";
const RUST = "#a84d33";
const KEY_FILL = "#fffbf2";

type Variant = "wide" | "narrow";

/** Source units per CSS pixel at the largest size each variant is shown (about 1028 and 314 px). */
const UNIT: Record<Variant, number> = { wide: 1536 / 1028, narrow: NARROW_VIEW.w / 314 };

function Key({ n, x, y, u }: { n: number; x: number; y: number; u: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={11 * u} fill={KEY_FILL} stroke={RUST} strokeWidth={1.5 * u} />
      <text
        x={x}
        y={y + 4.2 * u}
        textAnchor="middle"
        fill={RUST}
        fontFamily="ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
        fontSize={12.5 * u}
        fontWeight={700}
      >
        {n}
      </text>
    </g>
  );
}

/** Dimension line with end ticks, drawn between two points. */
function Dim({ x1, y1, x2, y2, u }: { x1: number; y1: number; x2: number; y2: number; u: number }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular tick through each end, plus the architectural oblique slash.
  const t = 5 * u;
  const tick = (x: number, y: number) =>
    `M${x - uy * t},${y + ux * t} L${x + uy * t},${y - ux * t} M${x - ux * t * 0.8 - uy * t * 0.8},${y - uy * t * 0.8 + ux * t * 0.8} L${x + ux * t * 0.8 + uy * t * 0.8},${y + uy * t * 0.8 - ux * t * 0.8}`;
  return (
    <path
      d={`M${x1},${y1} L${x2},${y2} ${tick(x1, y1)} ${tick(x2, y2)}`}
      fill="none"
      stroke={INK}
      strokeWidth={1.1 * u}
      strokeLinecap="butt"
    />
  );
}

function Overlay({ variant }: { variant: Variant }) {
  const u = UNIT[variant];
  const narrow = variant === "narrow";
  const view = narrow ? NARROW_VIEW : { x: 0, y: 0, w: 1536, h: 1024 };
  const mono = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
  const fs = (px: number) => px * u;
  const hair = 1.1 * u;

  // Revision cloud around the changed line of the record (the fourth ruled line and its marker).
  const cloud = cloudPath({ x: 974, y: 702, w: 272, h: 62, r: 5 * u });

  // Labels in the empty paper margin.
  const labelX = narrow ? 676 : 80;
  const labelY = narrow ? 52 : 66;
  const tagText = "SYNTHETIC EXAMPLE";
  const tagCharW = 0.6 * fs(12);
  const tagW = tagText.length * tagCharW + 2 * 10 * u;
  const tagRight = narrow ? 1514 : 1456;
  const tagH = 24 * u;

  const noteY0 = narrow ? 936 : 944;
  const noteH = narrow ? 82 : 56;
  const noteX0 = narrow ? 676 : 80;
  const noteX1 = narrow ? 1514 : 1456;
  const noteCell = (narrow ? 52 : 62) * u;

  // Provenance leader: from the cloud up through the gap, then onto the later observation.
  const leader = "M1226,702 V452 H1204 V300";
  const arrow = (x: number, y: number) => `M${x},${y} l${-4.5 * u},${9 * u} l${9 * u},0 Z`;

  return (
    <svg
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      className={`plan-plate-overlay plan-plate-overlay-${variant}`}
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      fontFamily={mono}
    >
      {/* Figure label and the synthetic example tag */}
      <text x={labelX} y={labelY} fill={INK} fontSize={fs(12.5)} letterSpacing={0.4 * u}>
        <tspan fontWeight={700}>FIG. A-1</tspan>
        {narrow ? null : <tspan>{" · RECORD PLAN · INVOICE INV-2041"}</tspan>}
      </text>
      <rect
        x={tagRight - tagW}
        y={labelY - 17 * u}
        width={tagW}
        height={tagH}
        fill="none"
        stroke={INK}
        strokeWidth={hair}
      />
      <text
        x={tagRight - tagW / 2}
        y={labelY - 0.5 * u}
        textAnchor="middle"
        fill={INK}
        fontSize={fs(12)}
        letterSpacing={0.3 * u}
      >
        {tagText}
      </text>

      {/* Key 1: dimension across the two source pieces at lower right */}
      <path
        d="M1470,656 H1504 M1448,912 H1504"
        fill="none"
        stroke={INK}
        strokeWidth={0.8 * u}
        strokeDasharray={`${3 * u} ${2.5 * u}`}
      />
      <Dim x1={1498} y1={656} x2={1498} y2={912} u={u} />
      <Key n={1} x={1498} y={narrow ? 610 : 622} u={u} />
      <path d="M1498,633 V656" stroke={INK} strokeWidth={hair} fill="none" />

      {/* Key 2: the rule, the card with the round mark */}
      <path d="M1094,192 L965,243" fill="none" stroke={INK} strokeWidth={hair} />
      <circle cx={962} cy={244} r={3.2 * u} fill={INK} />
      <Key n={2} x={1106} y={188} u={u} />

      {/* Key 3: revision cloud with a leader back to the later observation */}
      <path d={cloud} fill="none" stroke={RUST} strokeWidth={1.4 * u} />
      <path d={leader} fill="none" stroke={INK} strokeWidth={hair} />
      <path d={arrow(1204, 288)} fill={INK} />
      <Key n={3} x={1226} y={560} u={u} />

      {/* Key 4: both observations stay */}
      <path
        d="M1306,217 H1352 M1306,272 H1352"
        fill="none"
        stroke={INK}
        strokeWidth={0.8 * u}
        strokeDasharray={`${3 * u} ${2.5 * u}`}
      />
      <Dim x1={1346} y1={217} x2={1346} y2={272} u={u} />
      <path d="M1346,244.5 H1380" stroke={INK} strokeWidth={hair} fill="none" />
      <Key n={4} x={1380 + 11 * u} y={244.5} u={u} />

      {/* Title-block note */}
      <rect
        x={noteX0}
        y={noteY0}
        width={noteX1 - noteX0}
        height={noteH}
        fill="none"
        stroke={INK}
        strokeWidth={hair}
      />
      <path
        d={`M${noteX0 + noteCell},${noteY0} V${noteY0 + noteH}`}
        stroke={INK}
        strokeWidth={hair}
        fill="none"
      />
      <text
        x={noteX0 + noteCell / 2}
        y={noteY0 + noteH / 2 + 4.2 * u}
        textAnchor="middle"
        fill={INK}
        fontSize={fs(11.5)}
        fontWeight={700}
        letterSpacing={0.3 * u}
      >
        NOTE
      </text>
      {narrow ? (
        PLATE_NOTE.map((line, i) => (
          <text
            key={line}
            x={noteX0 + noteCell + 8 * u}
            y={noteY0 + noteH / 2 + (i === 0 ? -4 : 12) * u}
            fill={INK}
            fontSize={fs(10)}
          >
            {line.toUpperCase()}
          </text>
        ))
      ) : (
        <text
          x={noteX0 + noteCell + 12 * u}
          y={noteY0 + noteH / 2 + 4.2 * u}
          fill={INK}
          fontSize={fs(11.5)}
        >
          {PLATE_NOTE.join(" ").toUpperCase()}
        </text>
      )}
    </svg>
  );
}

/**
 * The plate. One <picture> serves the wide frame above 860 px and the narrow crop at 860 px and
 * below, so only the file for the current width is fetched. The image is above the fold on the
 * first screen, so it is never lazy-loaded and is the first-screen image with high fetch priority.
 * Explicit width and height (and the matching source dimensions) reserve the space before it loads.
 */
export function RecordPlate() {
  // `fetchpriority` is lower-case: React 18 passes unknown lower-case attributes through to the DOM.
  const priority = { fetchpriority: "high" } as Record<string, string>;
  return (
    <div className="plan-plate">
      <picture>
        <source
          media="(max-width: 860px)"
          srcSet={`${PLATE_NARROW.src}.webp`}
          type="image/webp"
          width={PLATE_NARROW.width}
          height={PLATE_NARROW.height}
        />
        <source
          media="(max-width: 860px)"
          srcSet={`${PLATE_NARROW.src}.jpg`}
          type="image/jpeg"
          width={PLATE_NARROW.width}
          height={PLATE_NARROW.height}
        />
        <source
          srcSet={`${PLATE_WIDE.src}.webp`}
          type="image/webp"
          width={PLATE_WIDE.width}
          height={PLATE_WIDE.height}
        />
        <img
          className="plan-plate-img"
          src={`${PLATE_WIDE.src}.jpg`}
          width={PLATE_WIDE.width}
          height={PLATE_WIDE.height}
          alt={PLATE_ALT}
          decoding="async"
          {...priority}
        />
      </picture>
      <Overlay variant="wide" />
      <Overlay variant="narrow" />
    </div>
  );
}

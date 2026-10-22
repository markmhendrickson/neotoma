import { PLATE_ALT, PLATE_NOTE } from "./onepager_copy";
import { cloudPath } from "./onepager_figures";
import { PLATE_NARROW_LAYOUT, PLATE_WIDE_LAYOUT, type PlateFrame, type Pt } from "./plate_layout";

/**
 * Sheet 01 plate (FIG. A-1): a paper-object plate under inline SVG drafting callouts. The image files
 * are generated rasters derived from the accepted earlier-site hero (derivation and hashes:
 * frontend/public/brand/PROVENANCE.json, "plate"); nothing is drawn into them.
 *
 * Every position comes from plate_layout.ts, the single source for both frames and their callouts.
 * The objects carry no text and no invoice data. The callouts are numbered keys matching
 * FIGURE_LEGEND, dimension lines, leaders, one revision cloud, the printed connectors between objects
 * (arrowheads where an agent writes a source in or reads the current snapshot out, key 5), and three
 * labels in the empty paper margin: the figure label, the "synthetic example" tag and the note.
 */

/**
 * Each frame ships as WebP plus a JPEG fallback for browsers without WebP (Safari before 14). The
 * JPEG is never fetched by a browser that takes the WebP source.
 */
export const PLATE_WIDE = {
  width: PLATE_WIDE_LAYOUT.width,
  height: PLATE_WIDE_LAYOUT.height,
  src: "/brand/plate/neotoma-plate-a1-r2-wide",
};
export const PLATE_NARROW = {
  width: PLATE_NARROW_LAYOUT.width,
  height: PLATE_NARROW_LAYOUT.height,
  src: "/brand/plate/neotoma-plate-a1-r2-narrow",
};

/** Fixed colors: the plate keeps its own paper ground in both themes, so it does not follow them. */
const INK = "#28372f";
const RUST = "#a84d33";
/** The revision cloud is a thin outline, so it is drawn darker than the keys for contrast on the paper. */
const CLOUD = "#7f3420";
const KEY_FILL = "#fffbf2";
const PRINT = "#33465a";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

type Variant = "wide" | "narrow";
const LAYOUT: Record<Variant, PlateFrame> = {
  wide: PLATE_WIDE_LAYOUT,
  narrow: PLATE_NARROW_LAYOUT,
};

const line = (pts: readonly Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");

function Key({ n, at: [x, y], u }: { n: number; at: Pt; u: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={11 * u} fill={KEY_FILL} stroke={RUST} strokeWidth={1.5 * u} />
      <text
        x={x}
        y={y + 4.2 * u}
        textAnchor="middle"
        fill={RUST}
        fontSize={12.5 * u}
        fontWeight={700}
      >
        {n}
      </text>
    </g>
  );
}

/** Dimension line with end ticks; horizontal lines may leave gaps where a leader crosses. */
function Dim({ from, to, gaps, u }: { from: Pt; to: Pt; gaps?: readonly Pt[]; u: number }) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const t = 5 * u;
  const tick = (x: number, y: number) =>
    `M${x - uy * t},${y + ux * t} L${x + uy * t},${y - ux * t} M${x - ux * t * 0.8 - uy * t * 0.8},${y - uy * t * 0.8 + ux * t * 0.8} L${x + ux * t * 0.8 + uy * t * 0.8},${y + uy * t * 0.8 - ux * t * 0.8}`;
  let segs = `M${x1},${y1} L${x2},${y2}`;
  if (gaps && gaps.length) {
    const xs = [x1, ...gaps.flat(), x2];
    segs = "";
    for (let i = 0; i < xs.length; i += 2) segs += `M${xs[i]},${y1} L${xs[i + 1]},${y1} `;
  }
  return (
    <path
      d={`${segs} ${tick(x1, y1)} ${tick(x2, y2)}`}
      fill="none"
      stroke={INK}
      strokeWidth={1.1 * u}
    />
  );
}

/** Printed connector: an end bar at each end, or an arrowhead at the far end (write or read). */
function Connector({ points, arrow, u }: { points: readonly Pt[]; arrow?: boolean; u: number }) {
  const w = 1.9 * u;
  const L = 9 * u;
  const bar = (p: Pt, q: Pt) =>
    p[0] === q[0] ? `M${p[0] - L},${p[1]} H${p[0] + L}` : `M${p[0]},${p[1] - L} V${p[1] + L}`;
  const first = points[0];
  const second = points[1];
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  let head = "";
  if (arrow) {
    const s = 7 * u;
    if (prev[0] === last[0]) {
      const dir = last[1] > prev[1] ? 1 : -1;
      head = `M${last[0]},${last[1]} l${-s * 0.6},${-dir * s} l${s * 1.2},0 Z`;
    } else {
      const dir = last[0] > prev[0] ? 1 : -1;
      head = `M${last[0]},${last[1]} l${-dir * s},${-s * 0.6} l0,${s * 1.2} Z`;
    }
  }
  return (
    <g>
      <path d={line(points)} fill="none" stroke={PRINT} strokeWidth={w} strokeLinejoin="miter" />
      <path d={bar(first, second)} stroke={PRINT} strokeWidth={w} />
      {arrow ? (
        <path d={head} fill={PRINT} />
      ) : (
        <path d={bar(last, prev)} stroke={PRINT} strokeWidth={w} />
      )}
    </g>
  );
}

function Overlay({ variant }: { variant: Variant }) {
  const f = LAYOUT[variant];
  const u = f.width / f.displayWidth;
  const narrow = variant === "narrow";
  const hair = 1.1 * u;
  const fs = (px: number) => px * u;
  const [labelX, labelY] = f.label.at;

  const tagText = "SYNTHETIC EXAMPLE";
  const tagW = tagText.length * 0.6 * fs(12) + 2 * 10 * u;
  const tagH = 24 * u;
  const { note } = f;
  const noteCell = note.cell * u;

  return (
    <svg
      viewBox={`0 0 ${f.width} ${f.height}`}
      className={`plan-plate-overlay plan-plate-overlay-${variant}`}
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      fontFamily={MONO}
    >
      {/* Printed connectors: source to observation (write, key 5), observation to rule, rule to
          record, and out of the record (read, key 5) */}
      {f.connectors.map((c, i) => (
        <Connector key={i} points={c.points} arrow={c.arrow} u={u} />
      ))}

      {/* Figure label and the synthetic example tag */}
      <text x={labelX} y={labelY} fill={INK} fontSize={fs(12.5)} letterSpacing={0.4 * u}>
        <tspan fontWeight={700}>FIG. A-1</tspan>
        {f.label.full ? <tspan>{" · RECORD PLAN · INVOICE INV-2041"}</tspan> : null}
      </text>
      <rect
        x={f.tagRight - tagW}
        y={labelY - 17 * u}
        width={tagW}
        height={tagH}
        fill="none"
        stroke={INK}
        strokeWidth={hair}
      />
      <text
        x={f.tagRight - tagW / 2}
        y={labelY - 0.5 * u}
        textAnchor="middle"
        fill={INK}
        fontSize={fs(12)}
        letterSpacing={0.3 * u}
      >
        {tagText}
      </text>

      {f.extensions.map((pts, i) => (
        <path
          key={`e${i}`}
          d={line(pts)}
          fill="none"
          stroke={INK}
          strokeWidth={0.8 * u}
          strokeDasharray={`${3 * u} ${2.5 * u}`}
        />
      ))}
      {f.dims.map((d, i) => (
        <Dim key={`d${i}`} from={d.from} to={d.to} gaps={d.gaps} u={u} />
      ))}

      {/* Key 3: revision cloud on the changed line, leader back to the later observation */}
      <path
        d={cloudPath({ ...f.cloud, r: 5 * u })}
        fill="none"
        stroke={CLOUD}
        strokeWidth={1.6 * u}
      />
      {f.leaders.map((l, i) => {
        const end = l.points[l.points.length - 1];
        return (
          <g key={`l${i}`}>
            <path d={line(l.points)} fill="none" stroke={INK} strokeWidth={hair} />
            {l.dot ? (
              <circle cx={l.points[0][0]} cy={l.points[0][1]} r={3.2 * u} fill={INK} />
            ) : null}
            {l.arrowUp ? (
              <path d={`M${end[0]},${end[1] - 8} l${-4.5 * u},${9 * u} l${9 * u},0 Z`} fill={INK} />
            ) : null}
          </g>
        );
      })}
      {f.keys.map((k, i) => (
        <Key key={`k${i}`} n={k.n} at={k.at} u={u} />
      ))}

      {/* Title-block note */}
      <rect
        x={note.x0}
        y={note.y}
        width={note.x1 - note.x0}
        height={note.h}
        fill="none"
        stroke={INK}
        strokeWidth={hair}
      />
      <path
        d={`M${note.x0 + noteCell},${note.y} V${note.y + note.h}`}
        stroke={INK}
        strokeWidth={hair}
        fill="none"
      />
      <text
        x={note.x0 + noteCell / 2}
        y={note.y + note.h / 2 + 4.2 * u}
        textAnchor="middle"
        fill={INK}
        fontSize={fs(11.5)}
        fontWeight={700}
        letterSpacing={0.3 * u}
      >
        NOTE
      </text>
      {narrow ? (
        PLATE_NOTE.map((text, i) => (
          <text
            key={text}
            x={note.x0 + noteCell + 6 * u}
            y={note.y + note.h / 2 + (i === 0 ? -0.45 : 1.2) * note.size * u}
            fill={INK}
            fontSize={fs(note.size)}
          >
            {text.toUpperCase()}
          </text>
        ))
      ) : (
        <text
          x={note.x0 + noteCell + 12 * u}
          y={note.y + note.h / 2 + 4.2 * u}
          fill={INK}
          fontSize={fs(note.size)}
        >
          {PLATE_NOTE.join(" ").toUpperCase()}
        </text>
      )}
    </svg>
  );
}

/**
 * The plate. One <picture> serves the desktop frame above 860 px and the phone frame at 860 px and
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

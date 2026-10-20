/**
 * Plan-style figures for the neotoma.io developer one-pager.
 *
 * Every figure is inline SVG drawn as a technical plan: thin linework, hatch for
 * cut material, dimension lines, numbered callouts and revision clouds. Colors come
 * from CSS variables on `.plan` so light and dark themes share one drawing.
 *
 * Text inside the SVG is kept to short labels. The same facts are repeated in the
 * HTML legend under each figure so they stay readable at 390 px.
 */

type CloudProps = { x: number; y: number; w: number; h: number; r?: number };

/** Scalloped revision cloud around a rectangle (drafting convention for a changed value). */
export function cloudPath({ x, y, w, h, r = 7 }: CloudProps): string {
  const nx = Math.max(2, Math.round(w / (2 * r)));
  const ny = Math.max(2, Math.round(h / (2 * r)));
  const sx = w / nx;
  const sy = h / ny;
  let d = `M${x},${y}`;
  for (let i = 0; i < nx; i++) d += ` a${sx / 2},${r} 0 0 1 ${sx},0`;
  for (let i = 0; i < ny; i++) d += ` a${r},${sy / 2} 0 0 1 0,${sy}`;
  for (let i = 0; i < nx; i++) d += ` a${sx / 2},${r} 0 0 1 ${-sx},0`;
  for (let i = 0; i < ny; i++) d += ` a${r},${sy / 2} 0 0 1 0,${-sy}`;
  return `${d}Z`;
}

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <marker
        id={`${id}-arrow`}
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto-start-reverse"
      >
        <path d="M0,1 L9,5 L0,9 Z" className="pl-fill-ink" />
      </marker>
      <marker
        id={`${id}-dim`}
        viewBox="0 0 10 10"
        refX="5"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M5,0 L5,10" className="pl-stroke-slate" fill="none" />
        <path d="M1,9 L9,1" className="pl-stroke-slate" fill="none" />
      </marker>
      <pattern
        id={`${id}-hatch`}
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line x1="0" y1="0" x2="0" y2="6" className="pl-stroke-ink" strokeWidth="1" />
      </pattern>
    </defs>
  );
}

/** Figure B: the local service drawn as a room with four doors (MCP, REST, CLI, Inspector). */
export function ServicePlan() {
  const id = "svc";
  return (
    <svg
      viewBox="0 0 420 330"
      role="img"
      aria-labelledby="svc-t svc-d"
      className="plan-svg plan-svg-service"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="svc-t">Plan of the local Neotoma service</title>
      <desc id="svc-d">
        A single room holds the record. Four doors lead in: an MCP server, a REST API, a command
        line, and the Inspector web app.
      </desc>
      <Defs id={id} />
      <text x="10" y="20" className="pl-label">
        FIG. B · LOCAL SERVICE, PLAN
      </text>
      <rect x="100" y="52" width="220" height="196" className="pl-wall" />
      {/* door gaps */}
      <path d="M180,52 H240" className="pl-gap" />
      <path d="M320,110 V190" className="pl-gap" />
      <path d="M180,248 H240" className="pl-gap" />
      <path d="M100,110 V190" className="pl-gap" />
      {/* door leaves and swings */}
      <path d="M180,52 V94 A42,42 0 0 0 222,52" className="pl-swing" />
      <path d="M320,110 H278 A42,42 0 0 0 320,152" className="pl-swing" />
      <path d="M180,248 V206 A42,42 0 0 1 222,248" className="pl-swing" />
      <path d="M100,110 H142 A42,42 0 0 1 100,152" className="pl-swing" />
      <text x="210" y="40" textAnchor="middle" className="pl-t pl-b">
        MCP
      </text>
      <text x="336" y="134" className="pl-t pl-b">
        REST API
      </text>
      <text x="210" y="270" textAnchor="middle" className="pl-t pl-b">
        CLI
      </text>
      <text x="88" y="134" textAnchor="end" className="pl-t pl-b">
        Inspector
      </text>
      <text x="210" y="142" textAnchor="middle" className="pl-serif pl-serif-sm">
        the record
      </text>
      <text x="210" y="164" textAnchor="middle" className="pl-t pl-m">
        observations
      </text>
      <text x="210" y="180" textAnchor="middle" className="pl-t pl-m">
        snapshots
      </text>
      <text x="210" y="196" textAnchor="middle" className="pl-t pl-m">
        provenance
      </text>
      <path
        d="M100,304 H320"
        className="pl-dim"
        markerStart={`url(#${id}-dim)`}
        markerEnd={`url(#${id}-dim)`}
      />
      <text x="210" y="322" textAnchor="middle" className="pl-t pl-m">
        your machine or your server
      </text>
    </svg>
  );
}

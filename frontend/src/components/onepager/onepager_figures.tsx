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
      <pattern id={`${id}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" className="pl-stroke-ink" strokeWidth="1" />
      </pattern>
    </defs>
  );
}

function Key({ n, x, y }: { n: number; x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={11} className="pl-key-dot" />
      <text x={x} y={y + 4} textAnchor="middle" className="pl-key-num">
        {n}
      </text>
    </g>
  );
}

/** Figure A-1, wide plan: two sources, two observations, one rule, one current snapshot. */
export function RecordPlanWide() {
  const id = "rpw";
  const cloud = cloudPath({ x: 708, y: 196, w: 214, h: 40, r: 6 });
  return (
    <svg
      viewBox="0 0 960 430"
      role="img"
      aria-labelledby="rpw-t rpw-d"
      className="plan-svg plan-svg-wide"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="rpw-t">Record plan for invoice INV-2041</title>
      <desc id="rpw-d">
        Two sources become two observations. A rule computes the current snapshot. The due date comes from the
        later observation and carries a revision mark. The earlier observation stays on record.
      </desc>
      <Defs id={id} />
      <text x="30" y="28" className="pl-label">
        FIG. A-1 · RECORD PLAN · INVOICE INV-2041 (SYNTHETIC EXAMPLE)
      </text>

      {/* Sources */}
      <rect x="30" y="60" width="200" height="130" className="pl-box" />
      <text x="44" y="86" className="pl-t pl-b">S1  invoice.pdf</text>
      <text x="44" y="118" className="pl-t">amount   3,200 USD</text>
      <text x="44" y="140" className="pl-t">due      22 Oct</text>
      <rect x="30" y="250" width="200" height="130" className="pl-box" />
      <text x="44" y="276" className="pl-t pl-b">S2  email, 14 Oct</text>
      <text x="44" y="308" className="pl-t">amendment</text>
      <text x="44" y="330" className="pl-t">due      29 Oct</text>

      {/* Source to observation */}
      <path d="M230,125 H298" className="pl-line" markerEnd={`url(#${id}-arrow)`} />
      <path d="M230,315 H298" className="pl-line" markerEnd={`url(#${id}-arrow)`} />

      {/* Observations */}
      <rect x="300" y="60" width="200" height="130" className="pl-box" />
      <rect x="300" y="60" width="14" height="130" fill={`url(#${id}-hatch)`} className="pl-hatch-edge" />
      <text x="328" y="86" className="pl-t pl-b">O1  observation</text>
      <text x="328" y="108" className="pl-t pl-m">from S1 · import</text>
      <text x="328" y="140" className="pl-t">amount_due  3,200</text>
      <text x="328" y="162" className="pl-t">date_due    22 Oct</text>
      <rect x="300" y="250" width="200" height="130" className="pl-box" />
      <rect x="300" y="250" width="14" height="130" fill={`url(#${id}-hatch)`} className="pl-hatch-edge" />
      <text x="328" y="276" className="pl-t pl-b">O2  observation</text>
      <text x="328" y="298" className="pl-t pl-m">from S2 · llm_summary</text>
      <text x="328" y="330" className="pl-t">date_due    29 Oct</text>

      {/* Dimension: both observations stay */}
      <path d="M404,196 V244" className="pl-dim" markerStart={`url(#${id}-dim)`} markerEnd={`url(#${id}-dim)`} />
      <text x="414" y="224" className="pl-t pl-m">both kept</text>

      {/* To reducer */}
      <path d="M500,125 L566,196" className="pl-line" markerEnd={`url(#${id}-arrow)`} />
      <path d="M500,315 L566,250" className="pl-line" markerEnd={`url(#${id}-arrow)`} />
      <circle cx="600" cy="223" r="36" className="pl-box" />
      <text x="600" y="229" textAnchor="middle" className="pl-serif">R</text>
      <text x="600" y="282" textAnchor="middle" className="pl-t pl-m">reducer</text>
      <text x="600" y="298" textAnchor="middle" className="pl-t pl-m">last_write per field</text>
      <path d="M636,223 H698" className="pl-line" markerEnd={`url(#${id}-arrow)`} />

      {/* Snapshot */}
      <rect x="700" y="100" width="230" height="250" className="pl-box pl-box-strong" />
      <rect x="700" y="100" width="230" height="30" className="pl-band" />
      <text x="714" y="120" className="pl-t pl-b">CURRENT SNAPSHOT</text>
      <text x="714" y="158" className="pl-t">invoice_number</text>
      <text x="916" y="158" textAnchor="end" className="pl-t pl-b">INV-2041</text>
      <text x="714" y="186" className="pl-t">vendor_name</text>
      <text x="916" y="186" textAnchor="end" className="pl-t pl-b">Acme</text>
      <path d={cloud} className="pl-cloud" />
      <text x="714" y="222" className="pl-t">date_due</text>
      <text x="916" y="222" textAnchor="end" className="pl-t pl-b">29 Oct</text>
      <text x="714" y="258" className="pl-t">amount_due</text>
      <text x="916" y="258" textAnchor="end" className="pl-t pl-b">3,200</text>
      <path d="M714,290 H916" className="pl-hair" />
      <text x="714" y="312" className="pl-t pl-m">observations kept</text>
      <text x="916" y="312" textAnchor="end" className="pl-t pl-b">2</text>

      {/* Callouts */}
      <Key n={1} x={30} y={60} />
      <Key n={2} x={566} y={160} />
      <Key n={3} x={942} y={216} />
      <Key n={4} x={942} y={252} />
    </svg>
  );
}

/** Figure A-1, narrow plan: the same drawing stacked for phone widths. */
export function RecordPlanNarrow() {
  const id = "rpn";
  const cloud = cloudPath({ x: 18, y: 513, w: 278, h: 32, r: 6 });
  return (
    <svg
      viewBox="0 0 340 650"
      role="img"
      aria-labelledby="rpn-t rpn-d"
      className="plan-svg plan-svg-narrow"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="rpn-t">Record plan for invoice INV-2041</title>
      <desc id="rpn-d">
        Two sources become two observations. A rule computes the current snapshot. The due date comes from the
        later observation and carries a revision mark. The earlier observation stays on record.
      </desc>
      <Defs id={id} />
      <text x="10" y="20" className="pl-label">FIG. A-1 · INVOICE INV-2041 (SYNTHETIC)</text>

      <rect x="10" y="40" width="150" height="92" className="pl-box" />
      <text x="20" y="62" className="pl-t pl-b">S1 invoice.pdf</text>
      <text x="20" y="90" className="pl-t">amount 3,200</text>
      <text x="20" y="110" className="pl-t">due 22 Oct</text>
      <rect x="180" y="40" width="150" height="92" className="pl-box" />
      <text x="190" y="62" className="pl-t pl-b">S2 email 14 Oct</text>
      <text x="190" y="90" className="pl-t">amendment</text>
      <text x="190" y="110" className="pl-t">due 29 Oct</text>

      <path d="M85,132 V168" className="pl-line" markerEnd={`url(#${id}-arrow)`} />
      <path d="M255,132 V168" className="pl-line" markerEnd={`url(#${id}-arrow)`} />

      <rect x="10" y="170" width="150" height="104" className="pl-box" />
      <rect x="10" y="170" width="10" height="104" fill={`url(#${id}-hatch)`} className="pl-hatch-edge" />
      <text x="28" y="192" className="pl-t pl-b">O1 observation</text>
      <text x="28" y="210" className="pl-t pl-m">import</text>
      <text x="28" y="238" className="pl-t">amount 3,200</text>
      <text x="28" y="258" className="pl-t">due 22 Oct</text>
      <rect x="180" y="170" width="150" height="104" className="pl-box" />
      <rect x="180" y="170" width="10" height="104" fill={`url(#${id}-hatch)`} className="pl-hatch-edge" />
      <text x="198" y="192" className="pl-t pl-b">O2 observation</text>
      <text x="198" y="210" className="pl-t pl-m">llm_summary</text>
      <text x="198" y="238" className="pl-t">due 29 Oct</text>

      <path d="M160,222 H180" className="pl-dim" markerStart={`url(#${id}-dim)`} markerEnd={`url(#${id}-dim)`} />
      <text x="170" y="294" textAnchor="middle" className="pl-t pl-m">both kept</text>

      <path d="M85,274 L150,340" className="pl-line" markerEnd={`url(#${id}-arrow)`} />
      <path d="M255,274 L190,340" className="pl-line" markerEnd={`url(#${id}-arrow)`} />
      <circle cx="170" cy="370" r="30" className="pl-box" />
      <text x="170" y="376" textAnchor="middle" className="pl-serif">R</text>
      <text x="170" y="418" textAnchor="middle" className="pl-t pl-m">reducer · last_write per field</text>
      <path d="M170,424 V452" className="pl-line" markerEnd={`url(#${id}-arrow)`} />

      <rect x="10" y="456" width="320" height="184" className="pl-box pl-box-strong" />
      <rect x="10" y="456" width="320" height="28" className="pl-band" />
      <text x="22" y="475" className="pl-t pl-b">CURRENT SNAPSHOT</text>
      <text x="22" y="508" className="pl-t">invoice_number</text>
      <text x="288" y="508" textAnchor="end" className="pl-t pl-b">INV-2041</text>
      <path d={cloud} className="pl-cloud" />
      <text x="22" y="534" className="pl-t">date_due</text>
      <text x="288" y="534" textAnchor="end" className="pl-t pl-b">29 Oct</text>
      <text x="22" y="566" className="pl-t">amount_due</text>
      <text x="288" y="566" textAnchor="end" className="pl-t pl-b">3,200</text>
      <path d="M22,584 H318" className="pl-hair" />
      <text x="22" y="608" className="pl-t pl-m">observations kept</text>
      <text x="288" y="608" textAnchor="end" className="pl-t pl-b">2</text>
      <Key n={2} x={150} y={332} />
      <Key n={3} x={316} y={530} />
      <Key n={4} x={316} y={562} />
      <Key n={1} x={10} y={40} />
    </svg>
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
        A single room holds the record. Four doors lead in: an MCP server, a REST API, a command line, and the
        Inspector web app.
      </desc>
      <Defs id={id} />
      <text x="10" y="20" className="pl-label">FIG. B · LOCAL SERVICE, PLAN</text>
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
      <text x="210" y="40" textAnchor="middle" className="pl-t pl-b">MCP</text>
      <text x="336" y="134" className="pl-t pl-b">REST API</text>
      <text x="210" y="270" textAnchor="middle" className="pl-t pl-b">CLI</text>
      <text x="88" y="134" textAnchor="end" className="pl-t pl-b">Inspector</text>
      <text x="210" y="142" textAnchor="middle" className="pl-serif pl-serif-sm">the record</text>
      <text x="210" y="164" textAnchor="middle" className="pl-t pl-m">observations</text>
      <text x="210" y="180" textAnchor="middle" className="pl-t pl-m">snapshots</text>
      <text x="210" y="196" textAnchor="middle" className="pl-t pl-m">provenance</text>
      <path d="M100,304 H320" className="pl-dim" markerStart={`url(#${id}-dim)`} markerEnd={`url(#${id}-dim)`} />
      <text x="210" y="322" textAnchor="middle" className="pl-t pl-m">your machine or your server</text>
    </svg>
  );
}

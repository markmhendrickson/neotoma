/** Authored paper-record diagrams. All three depict planned governance, not current product UI. */
function Paper({
  x,
  y,
  width = 84,
  height = 76,
  children,
}: {
  x: number;
  y: number;
  width?: number;
  height?: number;
  children?: React.ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g data-vision-record="">
        <rect x="3" y="4" width={width} height={height} rx="2" className="vision-shadow" />
        <path d={`M0 0 H${width - 14} L${width} 14 V${height} H0 Z`} className="vision-paper" />
        <path d={`M${width - 14} 0 V14 H${width}`} className="vision-fold" />
        {children}
      </g>
    </g>
  );
}
function Lines({ y = 35 }: { y?: number }) {
  return (
    <g className="vision-lines">
      <path d={`M12 ${y} H61 M12 ${y + 10} H54 M12 ${y + 20} H43`} />
    </g>
  );
}
function DomainDiagram() {
  return (
    <svg viewBox="0 0 340 220" aria-hidden="true" className="plan-vision-diagram">
      <path
        d="M118 105 H165 V66 H211 M165 105 V157 H211"
        pathLength="1"
        data-vision-connection=""
        className="vision-connector"
      />
      <Paper x={28} y={67} width={92} height={100}>
        <circle cx="23" cy="23" r="8" className="vision-ink" />
        <Lines y={46} />
      </Paper>
      <Paper x={213} y={31} width={92} height={67}>
        <rect x="12" y="18" width="49" height="6" className="vision-sage" />
        <Lines y={36} />
      </Paper>
      <Paper x={213} y={127} width={92} height={67}>
        <rect x="12" y="18" width="49" height="6" className="vision-rust" />
        <Lines y={36} />
      </Paper>
      <circle cx="165" cy="105" r="6" className="vision-node" />
    </svg>
  );
}
function PositionsDiagram() {
  return (
    <svg viewBox="0 0 340 220" aria-hidden="true" className="plan-vision-diagram">
      <path
        d="M104 58 H145 V104 H199 M104 163 H145 V114 H199"
        pathLength="1"
        data-vision-connection=""
        className="vision-connector"
      />
      <Paper x={24} y={24} width={80} height={69}>
        <rect x="12" y="18" width="40" height="6" className="vision-rust" />
        <Lines y={38} />
      </Paper>
      <Paper x={24} y={129} width={80} height={69}>
        <rect x="12" y="18" width="40" height="6" className="vision-sage" />
        <Lines y={38} />
      </Paper>
      <Paper x={199} y={61} width={112} height={100}>
        <circle cx="28" cy="25" r="12" className="vision-sage" />
        <path d="m22 25 4 4 8-9" className="vision-check" />
        <Lines y={53} />
      </Paper>
      <circle cx="145" cy="109" r="13" className="vision-node" />
      <path d="M141 105 L149 113 M149 105 L141 113" className="vision-dispute" />
    </svg>
  );
}
function ExplanationDiagram() {
  return (
    <svg viewBox="0 0 340 220" aria-hidden="true" className="plan-vision-diagram">
      <path
        d="M107 105 H143 M218 105 H252"
        pathLength="1"
        data-vision-connection=""
        className="vision-connector"
      />
      <Paper x={18} y={55} width={89} height={105}>
        <Lines y={26} />
        <rect x="10" y="55" width="67" height="17" className="vision-highlight" />
        <path d="M15 64 H68" className="vision-lines" />
      </Paper>
      <Paper x={143} y={77} width={75} height={58}>
        <path d="M14 19 H59 M14 30 H50 M14 41 H43" className="vision-lines" />
      </Paper>
      <Paper x={252} y={39} width={68} height={133}>
        <circle cx="33" cy="32" r="15" className="vision-sage" />
        <path d="m26 32 5 5 10-12" className="vision-check" />
        <path d="M13 72 H55 M13 84 H48 M13 96 H53" className="vision-lines" />
      </Paper>
    </svg>
  );
}
const ambitions = [
  {
    title: "Give each domain a clear owner",
    Diagram: DomainDiagram,
    text: "Define who may correct which part of the record, with authority scoped to the domain.",
  },
  {
    title: "Keep disagreement on the record",
    Diagram: PositionsDiagram,
    text: "Represent competing claims, unresolved disputes and official positions explicitly.",
  },
  {
    title: "Make authority easier to inspect",
    Diagram: ExplanationDiagram,
    text: "Show why a value holds, whose authority it follows and what a change would affect.",
  },
];
export function VisionGallery() {
  return (
    <div className="plan-vision-gallery">
      {ambitions.map(({ title, Diagram, text }, index) => (
        <article className="plan-vision-card" key={title}>
          <div className="plan-vision-art">
            <Diagram />
          </div>
          <p className="plan-label">Planned direction · {String(index + 1).padStart(2, "0")}</p>
          <h3>{title}</h3>
          <p>{text}</p>
        </article>
      ))}
    </div>
  );
}

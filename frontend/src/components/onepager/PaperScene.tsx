import { createContext, useContext, useId, type ReactNode } from "react";
import { OCTOBER_RENDERS } from "./october_renders";
import "./paper_scene.css";

export type PaperSceneKind = keyof typeof OCTOBER_RENDERS;
const Materials = createContext("");
type Tone = "cream" | "sage" | "blue" | "navy" | "rust";
type Shape = "sheet" | "folder" | "notch" | "tag" | "torn";

function silhouette(w: number, h: number, shape: Shape) {
  if (shape === "folder")
    return `M0 17 H${w * 0.47} L${w * 0.5} 0 H${w * 0.8} L${w * 0.84} 17 H${w} V${h} H0 Z`;
  if (shape === "notch")
    return `M0 0 H${w * 0.36} C${w * 0.36} 30 ${w * 0.64} 30 ${w * 0.64} 0 H${w} V${h} H0 Z`;
  if (shape === "tag") return `M0 0 H${w - 28} L${w} 28 V${h} H0 Z`;
  if (shape === "torn")
    return `M0 3 L${w * 0.14} 0 L${w * 0.25} 4 L${w * 0.44} 1 L${w * 0.62} 4 L${w * 0.8} 0 L${w} 3 V${h - 4} L${w * 0.86} ${h} L${w * 0.7} ${h - 3} L${w * 0.53} ${h} L${w * 0.3} ${h - 3} L${w * 0.12} ${h} L0 ${h - 3} Z`;
  return `M0 0 H${w} V${h} H0 Z`;
}

/** Placement stays outside the animated group, so motion cannot replace the authored composition. */
function Piece({
  x,
  y,
  w,
  h,
  angle = 0,
  tone = "cream",
  shape = "sheet",
  from = "left",
  delay = 0,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  angle?: number;
  tone?: Tone;
  shape?: Shape;
  from?: "left" | "right" | "top" | "bottom";
  delay?: number;
  children?: ReactNode;
}) {
  const id = useContext(Materials);
  const vectors = {
    left: [-1050, 35, -5],
    right: [1050, -25, 5],
    top: [-25, -760, -4],
    bottom: [25, 760, 4],
  };
  const [dx, dy, turn] = vectors[from];
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle} ${w / 2} ${h / 2})`}>
      <g
        data-paper-object=""
        data-enter-x={dx}
        data-enter-y={dy}
        data-enter-rotation={turn}
        data-enter-delay={delay}
        filter={`url(#${id}-shadow)`}
      >
        <path
          d={silhouette(w, h, shape)}
          fill={`url(#${id}-${tone})`}
          filter={`url(#${id}-grain)`}
          className="paper-edge"
        />
        <path
          d={`M1 ${shape === "folder" ? 18 : 1} V${h - 1} H${w - 1}`}
          className="paper-underedge"
        />
        {children}
      </g>
    </g>
  );
}
function Bars({
  x = 18,
  y = 28,
  w = 110,
  count = 2,
  gap = 16,
  thick = 7,
  tone = "navy",
}: {
  x?: number;
  y?: number;
  w?: number;
  count?: number;
  gap?: number;
  thick?: number;
  tone?: Tone;
}) {
  return (
    <g fill={`var(--paper-${tone})`}>
      {Array.from({ length: count }, (_, i) => (
        <rect key={i} x={x} y={y + i * gap} width={i % 3 === 2 ? w * 0.72 : w} height={thick} />
      ))}
    </g>
  );
}
function Writing({
  x = 20,
  y = 32,
  w = 170,
  rows = 9,
}: {
  x?: number;
  y?: number;
  w?: number;
  rows?: number;
}) {
  return (
    <g className="paper-writing">
      {Array.from({ length: rows }, (_, row) => (
        <path key={row} d={`M${x} ${y + row * 18} h${w * [1, 0.82, 0.94, 0.62, 0.88][row % 5]}`} />
      ))}
    </g>
  );
}
function Thread({
  d,
  tone = "navy",
  dashed = false,
}: {
  d: string;
  tone?: Tone;
  dashed?: boolean;
}) {
  return (
    <g className="paper-thread" style={{ color: `var(--paper-${tone})` }}>
      <path
        d={d}
        pathLength="1"
        data-paper-connection=""
        className={dashed ? "paper-thread-dashed" : undefined}
      />
    </g>
  );
}
function Punch({ x, y }: { x: number; y: number }) {
  return (
    <>
      <circle cx={x + 1} cy={y + 1} r="5" className="paper-hole-rim" />
      <circle cx={x} cy={y} r="3.2" className="paper-hole" />
    </>
  );
}
function Hero() {
  return (
    <>
      <Thread d="M374 157 H472 M634 157 H713" />
      <Thread d="M552 261 V326" />
      <Piece x={52} y={74} w={320} h={446} shape="folder" from="left">
        <Bars x={30} y={83} w={238} thick={18} gap={29} />
        <Bars x={30} y={342} w={164} thick={14} gap={24} />
        <path d="M18 19 V445" className="paper-fold" />
      </Piece>
      <Piece x={472} y={66} w={161} h={195} shape="notch" from="top" delay={120}>
        <circle cx="80" cy="78" r="29" fill="var(--paper-sage)" />
        <path d="M22 168 H139" className="paper-writing" />
      </Piece>
      <Piece x={714} y={69} w={104} h={191} shape="tag" from="right" delay={220}>
        <circle cx="24" cy="59" r="7" fill="var(--paper-rust)" />
        <circle cx="24" cy="98" r="7" fill="var(--paper-rust)" />
        <path d="M39 62 H88 M39 101 H88" className="paper-writing" />
      </Piece>
      <Piece x={400} y={333} w={398} h={184} from="bottom" delay={320}>
        <path d="M16 15 H167 V162 H16 Z" className="paper-writing" />
        <path
          d="M97 16 94 31 98 49 94 62 97 78 93 92 97 113 94 129 98 145 96 162 H166 V16 Z"
          fill="var(--paper-sage)"
          opacity=".72"
        />
        <Writing x={192} y={43} w={145} rows={4} />
        <Bars x={192} y={137} w={150} thick={7} gap={14} />
      </Piece>
      <Piece x={780} y={409} w={82} h={128} shape="tag" from="right" delay={420}>
        <Bars x={15} y={43} w={53} thick={9} gap={17} />
      </Piece>
      <Piece x={765} y={532} w={89} h={28} shape="torn" from="bottom" delay={490}>
        <circle cx="13" cy="13" r="4" fill="var(--paper-rust)" />
        <path d="M25 14 H71" className="paper-writing" />
      </Piece>
    </>
  );
}

const scenes: Partial<Record<PaperSceneKind, () => ReactNode>> = { hero: Hero };

/** Authored animated counterpart of the October paper composition; no raster underneath. */
export function PaperScene({ scene }: { scene: PaperSceneKind }) {
  const id = `paper-${useId().replace(/:/g, "")}`;
  const Scene = scenes[scene] ?? Hero;
  return (
    <Materials.Provider value={id}>
      <svg
        className="paper-scene"
        data-paper-scene={scene}
        viewBox="0 0 900 600"
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>{OCTOBER_RENDERS[scene].alt}</title>
        <desc id={`${id}-desc`}>
          A tactile paper composition. Individual paper objects assemble, then their connections are
          drawn.
        </desc>
        <defs>
          {(
            [
              ["cream", "#f5efe3", "#ded3be"],
              ["sage", "#b2b79f", "#8c987f"],
              ["blue", "#c3d2db", "#91abb9"],
              ["navy", "#304b5b", "#172b39"],
              ["rust", "#c4734c", "#a14624"],
            ] as const
          ).map(([name, light, dark]) => (
            <linearGradient id={`${id}-${name}`} key={name} x2=".75" y2="1">
              <stop stopColor={light} />
              <stop offset="1" stopColor={dark} />
            </linearGradient>
          ))}
          <radialGradient id={`${id}-ground`}>
            <stop stopColor="#f0e9dc" />
            <stop offset="1" stopColor="#ddd1bd" />
          </radialGradient>
          <filter id={`${id}-shadow`} x="-30%" y="-30%" width="170%" height="180%">
            <feDropShadow dx="3" dy="7" stdDeviation="4" floodColor="#4e3d27" floodOpacity=".25" />
          </filter>
          <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency=".72"
              numOctaves="3"
              seed="17"
              result="noise"
            />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="0 0 0 0 0.35 0 0 0 0 0.3 0 0 0 0 0.22 0 0 0 .14 0"
              result="grain"
            />
            <feComposite in="grain" in2="SourceGraphic" operator="in" result="clipped" />
            <feBlend in="SourceGraphic" in2="clipped" mode="multiply" />
          </filter>
        </defs>
        <rect width="900" height="600" fill={`url(#${id}-ground)`} filter={`url(#${id}-grain)`} />
        <Scene />
      </svg>
    </Materials.Provider>
  );
}

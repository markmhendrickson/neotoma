import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { OCTOBER_RENDERS } from "./october_renders";
import { staticAssetPath } from "@/site/spa_path";
import { useOptionalLocale } from "@/i18n/LocaleContext";
import { PAPER_SCENE_ALTS_ES } from "./paper_scene_alts_es";
import { isOverheadScene, OverheadPaperScene } from "./OverheadPaperScene";
import {
  TOPIC_DRAWINGS,
  type TopicDrawingId,
  type TopicDrawingSpec,
  type TopicNode,
} from "../../site/topic_drawings";

export const VISION_SCENE_ALTS = {
  visionDomain:
    "Planned domain ownership: an authority key reaches one bounded archive while a second domain stays separate",
  visionPositions:
    "Planned position tracking: two retained claims connect to a dossier where one position is marked as selected",
  visionExplanation:
    "Planned explanation: lifted current field reveals its basis and a bounded set of effects",
  sharedInstance:
    "Supported sharing: three collaborator identity badges reach visible records in one configured archive",
  scopedAccess:
    "Supported access: an admitted signed request establishes identity, and a separate active grant permits one bounded record action",
  peering:
    "Supported peering: two distinct instances exchange only selected record slips in both directions",
} as const;
type MainSceneKind = keyof typeof OCTOBER_RENDERS | keyof typeof VISION_SCENE_ALTS;
export type PaperSceneKind = MainSceneKind | TopicDrawingId;
export const PAPER_SCENE_ALTS: Record<PaperSceneKind, string> = {
  ...Object.fromEntries(Object.entries(OCTOBER_RENDERS).map(([key, render]) => [key, render.alt])),
  ...VISION_SCENE_ALTS,
  ...Object.fromEntries(Object.entries(TOPIC_DRAWINGS).map(([id, spec]) => [id, spec.caption])),
  hero: "An itemized invoice, person dossier, task clipboard, email and revised date connect in one record graph",
  source:
    "An original invoice and email remain whole inside a folio, held separately by two retaining bands before any interpretation",
  observation:
    "An original invoice and a later email each produce a retained observation, with the later email revealing its revised date",
  entity:
    "Two observations carry the same type and identifying marks into one stable entity dossier",
  snapshot:
    "A current record presents two rule-selected fields while earlier observations remain behind it",
  invoiceExample:
    "An invoice and later email feed separate retained observations; the current record keeps the amount from the invoice and due date from the email",
  sharedInstance: "Three distinct connected tool slips lead to one shared Neotoma filing box",
  scopedAccess:
    "An admitted signed request and a separate active scoped grant both precede a bounded record action",
  peering: "Two distinct instances exchange only selected record slips in both directions",
  visionPositions:
    "Planned position tracking preserves both date claims while an explicit decision locks the initial date",
  visionExplanation:
    "Planned explanation traces a current value to its source and authority, then shows the connected records a change could affect",
} as Record<PaperSceneKind, string>;
const Materials = createContext("");
const EditorialComparison = createContext(false);
type Tone = "cream" | "sage" | "blue" | "navy" | "rust";
type Shape = "sheet" | "folder" | "notch" | "tag" | "torn" | "round";
type Cutout = "paper-ivory" | "folder-sage" | "envelope-blue";
const cutoutPath = (name: Cutout) => staticAssetPath(`/brand/october/hybrid/${name}.webp`);
// Inset silhouettes stay within the opaque part of each cutout when the image loads.
export const CLIENT_UNDERLAY_OUTLINES = {
  conversation:
    "M812 92 L864 96 896 136 964 460 940 504 888 520 212 604 176 600 144 572 92 252 92 228 124 188Z",
  command: "M828 64 L852 64 968 488 300 636 240 412 196 412 88 440 172 208Z",
  tool: "M240 52 L612 156 972 276 984 292 980 316 880 632 844 648 132 420 44 272 120 268 188 260 188 188 118 188 58 185 96 128Z",
} as const;
const archiveUnderlayOutline =
  "M292 64 L644 132 708 228 696 276 680 284 680 468 736 484 740 520 560 704 160 560 160 528 224 484 220 284 316 212 316 172 264 120Z";

function silhouette(w: number, h: number, shape: Shape) {
  if (shape === "folder")
    return `M0 17 H${w * 0.47} L${w * 0.5} 0 H${w * 0.8} L${w * 0.84} 17 H${w} V${h} H0 Z`;
  if (shape === "notch")
    return `M0 0 H${w * 0.36} C${w * 0.36} 30 ${w * 0.64} 30 ${w * 0.64} 0 H${w} V${h} H0 Z`;
  if (shape === "tag") return `M0 0 H${w - 28} L${w} 28 V${h} H0 Z`;
  if (shape === "round")
    return `M0 0 H${w - 42} Q${w - 8} 0 ${w} 29 V${h - 40} Q${w} ${h} ${w - 42} ${h} H0 Z`;
  if (shape === "torn")
    return `M0 3 L${w * 0.14} 0 L${w * 0.25} 4 L${w * 0.44} 1 L${w * 0.62} 4 L${w * 0.8} 0 L${w} 3 V${h - 4} L${w * 0.86} ${h} L${w * 0.7} ${h - 3} L${w * 0.53} ${h} L${w * 0.3} ${h - 3} L${w * 0.12} ${h} L0 ${h - 3} Z`;
  return `M0 1 Q${w * 0.31} -1 ${w * 0.57} 1 L${w} 0 V${h - 2} Q${w * 0.73} ${h + 1} ${w * 0.42} ${h - 1} L0 ${h} Z`;
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
  raster,
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
  raster?: Cutout;
  children?: ReactNode;
}) {
  const id = useContext(Materials);
  const editorial = useContext(EditorialComparison);
  const clipId = `${id}-cut-${useId().replace(/:/g, "")}`;
  const directCutout: Cutout | undefined = editorial
    ? undefined
    : (raster ??
      (tone === "cream" && shape === "sheet" && h > w * 1.1 && w >= 180
        ? "paper-ivory"
        : tone === "sage" && shape === "folder" && w > h * 1.2
          ? "folder-sage"
          : undefined));
  // Static reader pages have no hydration; the raster is the initial, settled object.
  const [cutoutReady, setCutoutReady] = useState(true);
  const body = silhouette(w, h, shape);
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
      >
        <path
          d={body}
          transform="translate(1.5 2.5)"
          fill="#403322"
          opacity={cutoutReady && directCutout ? 0 : 0.16}
        />
        <path
          d={body}
          transform="translate(4 7)"
          fill="#4e3d27"
          opacity={cutoutReady && directCutout ? 0 : 0.065}
        />
        <path
          d={body}
          transform="translate(6 9)"
          fill="#4e3d27"
          opacity={cutoutReady && directCutout ? 0 : 0.035}
          stroke="#4e3d27"
          strokeWidth="10"
          strokeLinejoin="round"
          strokeOpacity=".025"
        />
        <path
          d={body}
          transform="translate(0 1.5)"
          fill="#b9a991"
          opacity={cutoutReady && directCutout ? 0 : 0.45}
        />
        <path
          d={body}
          transform="translate(0 2)"
          fill="none"
          stroke="#7f6b50"
          strokeWidth="2.5"
          strokeLinejoin="round"
          opacity={cutoutReady && directCutout ? 0 : 0.16}
        />
        <g className="paper-raster-fallback" opacity={cutoutReady && directCutout ? 0 : 1}>
          <path
            d={body}
            fill={
              editorial
                ? {
                    cream: "#eee6d6",
                    sage: "#99a58e",
                    blue: "#a6bbc7",
                    navy: "#223e50",
                    rust: "#b15b38",
                  }[tone]
                : `url(#${id}-${tone})`
            }
            className="paper-edge"
          />
          <path
            d={body}
            fill={`url(#${id}-fiber)`}
            opacity={editorial ? 0 : ".38"}
            style={{ mixBlendMode: "multiply" }}
          />
          <path
            d={`M1 ${shape === "folder" ? 18 : 1} V${h - 1} H${w - 1}`}
            className="paper-underedge"
          />
          {raster === "envelope-blue" && (
            <>
              <path
                d={`M1 ${h - 1} L${w / 2} ${h * 0.48} L${w - 1} ${h - 1} Z`}
                fill="#a9c0ca"
                stroke="#849ba6"
                strokeWidth="1"
                data-envelope-flap="lower"
              />
              <path
                d={`M1 1 L${w / 2} ${h * 0.56} L${w - 1} 1 Z`}
                fill="#c3d1d6"
                stroke="#849ba6"
                strokeWidth="1"
                data-envelope-flap="closing"
              />
            </>
          )}
        </g>
        {directCutout ? (
          <image
            href={cutoutPath(directCutout)}
            width={w}
            height={h}
            preserveAspectRatio="none"
            onLoad={() => setCutoutReady(true)}
            onError={() => setCutoutReady(false)}
            data-paper-cutout={directCutout}
          />
        ) : (
          <>
            <defs>
              <clipPath id={clipId}>
                <path d={body} />
              </clipPath>
            </defs>
            {editorial ? (
              <g clipPath={`url(#${clipId})`} data-paper-editorial-material={tone}>
                <svg
                  width={w}
                  height={h}
                  viewBox="180 470 700 380"
                  preserveAspectRatio="none"
                  opacity={tone === "cream" ? ".9" : ".32"}
                  style={{ mixBlendMode: "multiply" }}
                >
                  <image
                    href={staticAssetPath("/brand/october/essay/materials/b13701ca89a9a7b3.webp")}
                    width="1254"
                    height="1254"
                  />
                </svg>
              </g>
            ) : (
              <image
                href={cutoutPath(tone === "sage" ? "folder-sage" : "paper-ivory")}
                width={w}
                height={h}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#${clipId})`}
                opacity={tone === "cream" ? ".72" : tone === "sage" ? ".42" : ".25"}
                style={{ mixBlendMode: "multiply" }}
                data-paper-material={tone}
              />
            )}
          </>
        )}
        {editorial ? <g mask={`url(#${id}-screenprint)`}>{children}</g> : children}
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
function Tack({ x, y }: { x: number; y: number }) {
  return (
    <g className="paper-tack" data-paper-decoration="tack">
      <circle cx={x + 2} cy={y + 3} r="7" fill="#523a29" opacity=".18" />
      <circle cx={x} cy={y} r="5.2" fill="var(--paper-rust)" />
      <circle cx={x - 1.4} cy={y - 1.7} r="1.5" fill="#e9b28d" />
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
      <Thread d="M552 261 V333" />
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
      <Piece x={400} y={333} w={398} h={184} shape="round" from="bottom" delay={320}>
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
    </>
  );
}

function Envelope({
  x,
  y,
  w,
  h,
  angle = 0,
  delay = 0,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  angle?: number;
  delay?: number;
}) {
  return (
    <Piece
      x={x}
      y={y}
      w={w}
      h={h}
      tone="blue"
      angle={angle}
      from="bottom"
      delay={delay}
      raster="envelope-blue"
    />
  );
}
function Before() {
  const scraps = [
    [136, 87, 263, 61, -10, "cream"],
    [486, 76, 155, 116, 18, "sage"],
    [664, 103, 99, 155, -12, "cream"],
    [57, 212, 111, 126, -9, "cream"],
    [193, 183, 124, 174, 12, "cream"],
    [369, 190, 110, 180, -13, "cream"],
    [518, 202, 209, 58, 24, "cream"],
    [742, 235, 82, 92, 22, "cream"],
    [292, 327, 198, 121, 8, "sage"],
    [547, 330, 127, 114, -22, "cream"],
    [721, 405, 117, 111, -8, "sage"],
    [108, 403, 145, 42, -3, "cream"],
    [357, 464, 100, 98, -17, "cream"],
    [151, 495, 83, 66, 10, "cream"],
    [575, 481, 151, 81, 13, "cream"],
    [97, 87, 330, 60, 7, "cream"],
    [388, 395, 390, 65, 8, "cream"],
  ] as const;
  return (
    <>
      {scraps.map(([x, y, w, h, angle, tone], i) => (
        <Piece
          key={i}
          x={x}
          y={y}
          w={w}
          h={h}
          angle={angle}
          tone={tone}
          shape={i % 4 === 0 ? "tag" : "torn"}
          from={(["left", "top", "right", "bottom"] as const)[i % 4]}
          delay={i * 30}
        >
          {i % 4 === 1 ? (
            <rect
              x={w * 0.14}
              y={h * 0.23}
              width={w * 0.7}
              height={h * 0.45}
              fill="var(--paper-sage)"
              opacity=".7"
            />
          ) : i % 3 === 0 ? (
            <>
              <circle cx="19" cy={h * 0.5} r="6" fill="var(--paper-rust)" />
              <path d={`M35 ${h * 0.5} H${w - 15}`} className="paper-writing" />
            </>
          ) : (
            <Bars
              x={15}
              y={h * 0.25}
              w={w - 30}
              count={h > 95 ? 3 : 2}
              thick={h > 90 ? 7 : 9}
              gap={17}
            />
          )}
        </Piece>
      ))}
    </>
  );
}
function After() {
  return (
    <>
      <Thread d="M193 321 C244 315 244 329 280 340 M193 410 C253 421 252 398 286 401 M575 278 H707" />
      <Piece x={48} y={69} w={556} h={455} shape="folder" from="left" />
      <Piece x={213} y={117} w={255} h={187} from="top" delay={90}>
        <Bars x={21} y={25} w={210} thick={14} gap={24} />
      </Piece>
      <Piece x={192} y={186} w={383} h={297} shape="tag" from="bottom" delay={180}>
        <Bars x={26} y={41} w={185} thick={14} gap={24} />
        <circle cx="340" cy="55" r="11" fill="var(--paper-rust)" />
        <rect x="27" y="107" width="305" height="149" fill="var(--paper-sage)" opacity=".8" />
        <Writing x={66} y={181} w={200} rows={3} />
      </Piece>
      <Piece x={516} y={320} w={66} h={140} shape="torn" tone="rust" from="right" delay={300}>
        <circle cx="22" cy="36" r="8" fill="var(--paper-cream)" />
        <path d="M47 4 Q59 -9 57 9 L43 56 Q34 67 34 53 L47 4" className="paper-clip" />
      </Piece>
      <Piece x={72} y={287} w={136} h={70} shape="torn" from="left" delay={260}>
        <Bars x={19} y={27} w={88} count={1} thick={12} />
      </Piece>
      <Piece x={72} y={374} w={136} h={77} shape="torn" from="left" delay={350}>
        <Bars x={19} y={22} w={88} thick={9} gap={17} />
      </Piece>
      <Piece x={707} y={203} w={128} h={184} shape="tag" from="right" delay={420}>
        <circle cx="28" cy="39" r="9" fill="var(--paper-rust)" />
        <Writing x={19} y={84} w={84} rows={3} />
      </Piece>
    </>
  );
}
function Source() {
  return (
    <>
      <Thread d="M290 207 C427 239 422 141 555 162 M286 229 C450 238 468 290 623 318 M283 247 C448 274 461 351 485 397" />
      <Piece x={-25} y={-20} w={408} h={461} angle={10} from="left">
        <Writing x={37} y={39} w={303} rows={20} />
        <path d="M303 208 h10 v53 h-10" className="paper-bracket" />
      </Piece>
      <Piece x={552} y={81} w={244} h={116} angle={-11} from="right" delay={130}>
        <Writing x={25} y={34} w={158} rows={4} />
        <path d="M212 0 H244 V31Z" fill="var(--paper-navy)" />
      </Piece>
      <Piece x={620} y={258} w={220} h={165} tone="blue" angle={12} from="right" delay={240}>
        <Writing x={23} y={35} w={160} rows={6} />
        <path d="M0 82 H220" className="paper-fold" />
      </Piece>
      <Piece x={445} y={394} w={125} h={176} tone="sage" angle={-15} from="bottom" delay={350}>
        <Writing x={18} y={31} w={81} rows={7} />
        <rect x="105" y="113" width="4" height="63" fill="var(--paper-rust)" />
      </Piece>
    </>
  );
}
function Observation() {
  return (
    <>
      <Thread d="M322 146 C385 155 377 91 451 106 M309 207 C388 226 407 167 472 180 M296 269 C369 309 373 261 430 274 M678 406 C738 401 723 358 776 368 M680 455 C739 501 744 445 794 472" />
      <Piece x={73} y={43} w={250} h={302} angle={12} from="left">
        <Bars x={30} y={36} w={183} count={7} thick={10} gap={28} />
        {[78, 141, 204].map((y) => (
          <Punch x={236} y={y} key={y} />
        ))}
      </Piece>
      {[
        { x: 451, y: 69, a: -10 },
        { x: 470, y: 160, a: 7 },
        { x: 429, y: 256, a: 12 },
      ].map(({ x, y, a }, i) => (
        <Piece x={x} y={y} w={113} h={54} angle={a} from="right" delay={140 + i * 70} key={y}>
          <Bars x={14} y={19} w={53} count={1} thick={8} />
          <circle cx="88" cy="23" r="5" fill="var(--paper-rust)" />
        </Piece>
      ))}
      <Envelope x={426} y={363} w={257} h={174} angle={9} delay={330} />
      {[
        { x: 772, y: 345, a: -10 },
        { x: 791, y: 455, a: 9 },
      ].map(({ x, y, a }, i) => (
        <Piece x={x} y={y} w={96} h={52} angle={a} from="right" delay={410 + i * 70} key={y}>
          <Bars x={13} y={19} w={46} count={1} thick={7} />
          <circle cx="77" cy="23" r="4" fill="var(--paper-rust)" />
        </Piece>
      ))}
    </>
  );
}
function IdentityMark({ x, y }: { x: number; y: number }) {
  return (
    <g data-identity-mark="" transform={`translate(${x} ${y})`}>
      <path d="M0 -21 L20 0 L0 21 L-20 0Z" fill="var(--paper-navy)" />
      <path d="M-11 -2 L0 -13 L11 -2 L0 9Z" fill="#f5e8cf" />
      <path d="M-6 10 L0 16 L6 10" fill="none" stroke="var(--paper-rust)" strokeWidth="3" />
    </g>
  );
}
function Entity() {
  return (
    <>
      <Thread d="M297.44 113.92 C405 117 419 184 508 190 M285.41 247.3 C402 249 421 266 508 266 M293.83 357.07 C400 355 423 345 508 345 M303.79 494.42 C410 490 441 412 508 412" />
      <Piece x={510} y={105} w={300} h={388} shape="folder" from="right" delay={90}>
        <path d="M21 55 H282 V370 H21Z" fill="#eee4d0" stroke="#aa987a" strokeWidth="1.4" />
        <IdentityMark x={252} y={92} />
        <path d="M43 130 H170 M43 149 H203" className="paper-writing" />
        <path d="M41 190 H260 M41 266 H260 M41 342 H260" className="paper-fold" />
        <Writing x={60} y={216} w={145} rows={2} />
        <Writing x={60} y={291} w={132} rows={2} />
        <Bars x={60} y={350} w={121} count={1} thick={5} />
        {[85, 161, 240, 307].map((y) => (
          <Tack key={y} x={-2} y={y} />
        ))}
      </Piece>
      {[
        { x: 115, y: 83, angle: -8, tone: "cream" as const },
        { x: 103, y: 197, angle: 6, tone: "blue" as const },
        { x: 111, y: 322, angle: -5, tone: "cream" as const },
        { x: 122, y: 440, angle: 9, tone: "sage" as const },
      ].map(({ x, y, angle, tone }, i) => (
        <Piece
          key={y}
          x={x}
          y={y}
          w={207}
          h={81}
          angle={angle}
          tone={tone}
          shape="tag"
          from="left"
          delay={130 + i * 70}
        >
          <Writing x={25} y={20} w={123} rows={2} />
          <Tack x={183} y={42} />
        </Piece>
      ))}
    </>
  );
}
function Reducer() {
  return (
    <>
      {[144, 307, 470].map((y) => (
        <Thread d={`M354 ${y - 10} C390 ${y - 3} 408 ${y} 463 ${y}`} key={y} />
      ))}
      <Piece x={464} y={64} w={347} h={468} from="right">
        <Bars x={27} y={66} w={280} count={3} thick={19} gap={163} />
      </Piece>
      {[0, 1, 2].map((row) => (
        <g key={row}>
          <Piece
            x={91 - row * 4}
            y={106 + row * 163}
            w={218}
            h={78}
            tone={row === 1 ? "blue" : "sage"}
            angle={-10}
            from="left"
            delay={70 + row * 60}
          >
            <Bars x={20} y={27} w={120} count={1} />
          </Piece>
          <Piece
            x={101}
            y={91 + row * 163}
            w={218}
            h={78}
            angle={3}
            from="left"
            delay={130 + row * 60}
          >
            <Bars x={20} y={27} w={120} count={1} />
          </Piece>
          <Piece
            x={128}
            y={76 + row * 163}
            w={225}
            h={78}
            angle={11}
            from="top"
            delay={270 + row * 80}
          >
            <Bars x={25} y={27} w={129} count={1} thick={15} />
            <Punch x={208} y={39} />
            {row === 1 && <rect width="9" height="78" fill="var(--paper-rust)" />}
          </Piece>
        </g>
      ))}
    </>
  );
}
function Snapshot() {
  return (
    <>
      <Thread d="M371 284 C455 284 503 264 599 265" />
      <Piece x={56} y={80} w={315} h={430} from="left">
        <IdentityMark x={268} y={50} />
        <Bars x={30} y={46} w={143} count={1} thick={13} />
        <Writing x={30} y={84} w={225} rows={2} />
        <g className="paper-table">
          {[143, 184, 225, 266, 307].map((y) => (
            <path key={y} d={`M28 ${y} H285`} />
          ))}
          <path d="M28 143 V307 M165 143 V307 M285 143 V307" />
        </g>
        <rect
          x="166"
          y="188"
          width="116"
          height="33"
          fill="var(--paper-blue)"
          opacity=".68"
          data-selected-cell=""
        />
        <path d="M179 201 H264 M179 211 H240" className="paper-writing" />
        <Writing x={30} y={351} w={230} rows={3} />
        <path d="M282 204 H315" className="paper-cell-trace" data-selected-cell-trace="" />
        <Tack x={282} y={204} />
      </Piece>
      <Piece x={559} y={100} w={277} h={367} tone="blue" from="right" delay={120}>
        <Writing x={33} y={45} w={202} rows={12} />
        <rect
          x="27"
          y="138"
          width="223"
          height="54"
          fill="#e7e3d4"
          opacity=".74"
          data-evidence-passage=""
        />
        <path d="M40 153 H229 M40 173 H194" className="paper-writing" />
        <path d="M27 133 h-10 v64 h10 M250 133 h10 v64 h-10" className="paper-bracket" />
        <path d="M53 261 H230" className="paper-fold" />
        <Writing x={42} y={291} w={180} rows={3} />
        <Tack x={40} y={165} />
      </Piece>
      <Piece x={737} y={397} w={99} h={124} shape="tag" from="bottom" delay={230}>
        <Writing x={18} y={26} w={63} rows={4} />
      </Piece>
    </>
  );
}
function Invoice() {
  return (
    <>
      <Thread d="M336 209 C465 205 488 285 592 298 M329 450 C465 444 505 369 592 349 M742 328 C767 331 785 330 809 326" />
      <Piece x={68} y={58} w={300} h={246} from="left">
        <Bars x={23} y={27} w={159} count={1} thick={14} />
        <g className="paper-table">
          {[69, 101, 133, 165, 197, 221].map((y) => (
            <path key={y} d={`M20 ${y} H274`} />
          ))}
          <path d="M20 69 V221 M185 69 V221 M274 69 V221" />
        </g>
        <path d="M40 86 H133 M40 119 H113 M40 151 H145" className="paper-writing" />
        <rect x="188" y="168" width="83" height="25" fill="var(--paper-sage)" opacity=".72" />
        <Punch x={268} y={195} />
        <Tack x={268} y={151} />
      </Piece>
      <Piece
        x={78}
        y={360}
        w={290}
        h={174}
        tone="blue"
        from="bottom"
        delay={100}
        raster="envelope-blue"
      >
        <Tack x={251} y={90} />
      </Piece>
      <Piece x={590} y={213} w={154} h={213} from="right" delay={280}>
        <IdentityMark x={119} y={35} />
        <Writing x={21} y={80} w={108} rows={5} />
        <rect x="19" y="142" width="112" height="26" fill="var(--paper-sage)" opacity=".72" />
        <Tack x={2} y={85} />
        <Tack x={2} y={136} />
        <Tack x={152} y={115} />
      </Piece>
      <Piece x={809} y={301} w={75} h={53} shape="tag" from="right" delay={360}>
        <Punch x={15} y={27} />
        <Bars x={29} y={23} w={29} count={1} thick={6} />
        <Tack x={0} y={25} />
      </Piece>
    </>
  );
}
/** One recognizable multi-record instance, reused without client-specific decoration. */
function InstanceArchive({
  x,
  y,
  width,
  children,
}: {
  x: number;
  y: number;
  width: number;
  children?: ReactNode;
}) {
  const height = width * (1124 / 1272);
  const [imageReady, setImageReady] = useState(true);
  const id = useContext(Materials);
  const clipId = `${id}-archive-underlay-${useId().replace(/:/g, "")}`;
  const imageTop = (height - width * (750 / 900)) / 2;
  const outlineTransform = `translate(0 ${imageTop}) scale(${width / 900})`;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g
        data-paper-object=""
        data-enter-x="0"
        data-enter-y="760"
        data-enter-rotation="0"
        data-enter-delay="80"
        data-instance-archive=""
      >
        <ellipse
          cx={width * 0.55}
          cy={height * 0.94}
          rx={width * 0.35}
          ry={height * 0.035}
          fill="#403322"
          opacity=".17"
          style={{ filter: `blur(${width * 0.025}px)` }}
        />
        <defs>
          <clipPath id={clipId}>
            <path d={archiveUnderlayOutline} transform={outlineTransform} />
          </clipPath>
        </defs>
        <g data-instance-fallback="" clipPath={`url(#${clipId})`}>
          <path d={archiveUnderlayOutline} transform={outlineTransform} fill="var(--paper-cream)" />
          <path
            d={`M${width * 0.11} ${height * 0.31} H${width * 0.88} V${height * 0.9} H${width * 0.11}Z`}
            fill="var(--paper-cream)"
            stroke="var(--paper-navy)"
            strokeWidth="3"
          />
          {[0, 1, 2].map((index) => (
            <g key={index}>
              <path
                d={`M${width * (0.22 + index * 0.12)} ${height * (0.37 - index * 0.035)} H${width * (0.64 + index * 0.07)} V${height * 0.57} H${width * (0.22 + index * 0.12)}Z`}
                fill={index === 1 ? "var(--paper-sage)" : "var(--paper-blue)"}
                stroke="var(--paper-navy)"
                strokeWidth="2"
              />
              <path
                d={`M${width * (0.27 + index * 0.12)} ${height * (0.42 - index * 0.035)} h${width * 0.18}`}
                className="paper-writing"
              />
            </g>
          ))}
          <path
            d={`M${width * 0.11} ${height * 0.56} H${width * 0.88} V${height * 0.9} H${width * 0.11}Z`}
            fill="var(--paper-cream)"
            stroke="var(--paper-navy)"
            strokeWidth="3"
          />
          <path
            d={`M${width * 0.11} ${height * 0.69} H${width * 0.88}`}
            stroke="var(--paper-navy)"
            strokeWidth="4"
          />
        </g>
        <image
          href={staticAssetPath("/brand/october/hybrid/instance-archive-v2.webp")}
          width={width}
          height={height}
          onLoad={() => setImageReady(true)}
          onError={() => setImageReady(false)}
          opacity={imageReady ? 1 : 0}
          data-instance-cutout=""
        />
        {children}
      </g>
    </g>
  );
}
/** The face marks follow the perspective of each photographic paper cutout. */
function ClientCard({
  x,
  y,
  width,
  kind,
  from,
  delay,
  children,
}: {
  x: number;
  y: number;
  width: number;
  kind: "conversation" | "command" | "document" | "tool";
  from: "left" | "right";
  delay: number;
  children?: ReactNode;
}) {
  const height = kind === "document" ? width * 1.28 : width * (2 / 3);
  const [imageReady, setImageReady] = useState(true);
  const image =
    kind === "conversation"
      ? "client-blue-v2.webp"
      : kind === "command"
        ? "client-tent-v2.webp"
        : kind === "tool"
          ? "client-sage-v2.webp"
          : "paper-ivory.webp";
  return (
    <g transform={`translate(${x} ${y})`}>
      <g
        data-paper-object=""
        data-client-kind={kind}
        data-enter-x={from === "left" ? -1050 : 1050}
        data-enter-y="0"
        data-enter-rotation="0"
        data-enter-delay={delay}
      >
        <g data-client-fallback={kind}>
          {kind === "document" ? (
            <path
              d={silhouette(width, height, "round")}
              fill="#eee5d3"
              stroke="#918773"
              strokeWidth="2"
            />
          ) : (
            <path
              d={CLIENT_UNDERLAY_OUTLINES[kind]}
              transform={`scale(${width / 1024} ${height / 683})`}
              fill={kind === "conversation" ? "#b5cbd7" : kind === "tool" ? "#9fac91" : "#eee5d3"}
            />
          )}
          {kind === "tool" && <Punch x={width * 0.15} y={height * 0.34} />}
          {kind === "command" && (
            <path d={`M12 ${height * 0.64} H${width - 12}`} className="paper-fold" />
          )}
        </g>
        <image
          href={staticAssetPath(`/brand/october/hybrid/${image}`)}
          width={width}
          height={height}
          onLoad={() => setImageReady(true)}
          onError={() => setImageReady(false)}
          opacity={imageReady ? 1 : 0}
          data-client-cutout={kind}
        />
        {kind === "conversation" && (
          <g transform={`translate(${width * 0.28} ${height * 0.34}) rotate(-9)`}>
            <path
              d={`M0 0 H${width * 0.43} V${height * 0.27} H${width * 0.12} L${width * 0.02} ${height * 0.35} V${height * 0.27} H0Z`}
              fill="none"
              stroke="var(--paper-navy)"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
            <path d={`M13 13 H${width * 0.32} M13 25 H${width * 0.24}`} className="paper-writing" />
          </g>
        )}
        {kind === "command" && (
          <g transform={`translate(${width * 0.32} ${height * 0.45}) rotate(-13)`}>
            <path
              d="M0 3 l12 11 -12 11 M28 25 H91"
              fill="none"
              stroke="var(--paper-navy)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}
        {kind === "document" && (
          <g transform={`translate(${width * 0.2} ${height * 0.24})`}>
            <path
              d={`M0 0 H${width * 0.45} M0 18 H${width * 0.53} M0 36 H${width * 0.36}`}
              className="paper-writing"
              strokeWidth="2.2"
            />
            <path d={`M0 54 H${width * 0.5}`} className="paper-fold" />
          </g>
        )}
        {kind === "tool" && (
          <g transform={`translate(${width * 0.38} ${height * 0.41}) rotate(15)`}>
            <path d="M0 4 H68 M0 19 H53 M0 34 H39" className="paper-writing" strokeWidth="2.2" />
            <path
              d="M78 4 v29 m-10 -19 10 -10 10 10"
              fill="none"
              stroke="var(--paper-navy)"
              strokeWidth="2.1"
            />
          </g>
        )}
        {children}
      </g>
    </g>
  );
}
function LocalService() {
  return (
    <>
      <Thread d="M317 285 C415 280 459 244 530 245" />
      <InstanceArchive x={380} y={95} width={480}>
        <Tack x={150} y={150} />
      </InstanceArchive>
      <ClientCard x={65} y={188} width={275} from="left" delay={140} kind="conversation">
        <Tack x={252} y={97} />
      </ClientCard>
    </>
  );
}

function VisionDomain() {
  return (
    <>
      <Thread d="M324 289 C375 274 389 245 450 243 M552 243 C590 243 585 221 625 221" />
      <Piece x={71} y={184} w={255} h={190} tone="blue" shape="notch" from="left">
        <circle cx="42" cy="51" r="17" fill="var(--paper-cream)" />
        <path d="M43 50 H207 M43 50 v72" className="paper-writing" />
        <Bars x={44} y={125} w={138} count={1} thick={10} />
      </Piece>
      <Piece x={441} y={211} w={112} h={68} tone="sage" shape="tag" from="bottom" delay={120}>
        <Punch x={25} y={34} />
        <circle cx="69" cy="34" r="13" fill="var(--paper-cream)" />
      </Piece>
      <Piece x={620} y={87} w={220} h={220} shape="folder" from="right" delay={230}>
        <path d="M18 43 H202 V202 H18Z" fill="#e6dbc6" stroke="#ac9d85" />
        <circle cx="52" cy="75" r="13" fill="var(--paper-sage)" />
        <Writing x={34} y={115} w={149} rows={3} />
      </Piece>
      <Piece x={620} y={349} w={220} h={170} tone="sage" shape="folder" from="right" delay={330}>
        <path d="M18 45 H202 V150 H18Z" fill="#d0d7c5" stroke="#8c987f" />
        <path d="M30 80 h150 M30 100 h120" className="paper-writing" />
      </Piece>
    </>
  );
}
function VisionPositions() {
  return (
    <>
      <Thread d="M347 218 C442 213 458 244 549 248 M347 414 C434 405 460 337 549 328" />
      <Piece x={76} y={108} w={271} h={181} tone="rust" shape="torn" from="left">
        <Bars x={29} y={43} w={161} thick={10} />
        <Writing x={29} y={84} w={192} rows={3} />
        <Punch x={242} y={110} />
        <Tack x={271} y={110} />
      </Piece>
      <Piece x={76} y={329} w={271} h={174} tone="sage" shape="notch" from="left" delay={120}>
        <Bars x={29} y={53} w={159} thick={10} />
        <Writing x={29} y={95} w={186} rows={3} />
        <Punch x={242} y={86} />
        <Tack x={271} y={85} />
      </Piece>
      <Piece x={549} y={120} w={266} h={382} shape="folder" from="right" delay={250}>
        <IdentityMark x={222} y={62} />
        <path d="M28 114 H238 M28 257 H238" className="paper-fold" />
        <path d="M44 149 H218 V219 H44Z" fill="#e4d5bf" stroke="#af987b" />
        <Writing x={58} y={165} w={125} rows={2} />
        <path
          d="M44 278 H218 V354 H44Z"
          fill="#d5dfd0"
          stroke="var(--paper-sage)"
          strokeWidth="2"
        />
        <path d="M43 278 H218 V354 H43Z" fill="none" stroke="var(--paper-rust)" strokeWidth="3" />
        <circle cx="62" cy="316" r="10" fill="var(--paper-rust)" />
        <Writing x={84} y={303} w={112} rows={2} />
        <Tack x={0} y={128} />
        <Tack x={0} y={208} />
      </Piece>
    </>
  );
}
function VisionExplanation() {
  return (
    <>
      <Thread d="M515 319 C597 321 606 261 679 261 M515 336 C599 360 608 407 679 407" />
      <Piece x={102} y={194} w={410} h={278} tone="blue" shape="round" from="left">
        <Writing x={38} y={75} w={288} rows={7} />
        <path d="M42 163 h275 v42 H42Z" fill="var(--paper-sage)" opacity=".65" />
      </Piece>
      <Piece x={167} y={141} w={188} h={90} tone="sage" shape="tag" from="top" delay={160}>
        <Punch x={25} y={42} />
        <Bars x={50} y={33} w={95} count={1} />
      </Piece>
      <Piece x={225} y={241} w={290} h={117} shape="torn" from="bottom" delay={240}>
        <Bars x={24} y={33} w={190} count={1} thick={14} />
        <path d="M31 73 H245" className="paper-writing" />
      </Piece>
      <Piece x={679} y={205} w={155} h={89} tone="cream" shape="tag" from="right" delay={330}>
        <Bars x={17} y={30} w={94} count={1} />
      </Piece>
      <Piece x={679} y={371} w={155} h={89} tone="blue" shape="tag" from="right" delay={390}>
        <Bars x={17} y={30} w={94} count={1} />
      </Piece>
    </>
  );
}

function SharedInstance() {
  return (
    <>
      <Thread d="M250 184 C335 198 389 222 455 240" />
      <Thread d="M260 409 C352 401 407 289 490 264" />
      <Thread d="M715 294 C658 274 624 244 565 231" />
      <InstanceArchive x={285} y={90} width={410}>
        <Tack x={170} y={150} />
        <Tack x={205} y={174} />
        <Tack x={280} y={141} />
      </InstanceArchive>
      <Piece x={65} y={84} w={185} h={140} shape="tag" tone="blue" from="left" delay={110}>
        <g data-collaborator-badge="" data-badge-mark="diamond">
          <circle cx="63" cy="66" r="35" fill="#e9e1d1" />
          <path d="M63 43 83 66 63 89 43 66Z" fill="var(--paper-navy)" />
          <Bars x={108} y={53} w={51} count={2} thick={6} gap={16} />
        </g>
        <Tack x={185} y={100} />
      </Piece>
      <Piece x={70} y={365} w={190} h={140} shape="round" tone="sage" from="left" delay={190}>
        <g data-collaborator-badge="" data-badge-mark="three-dots">
          <circle cx="65" cy="67" r="36" fill="#efe6d4" />
          <circle cx="50" cy="67" r="6" fill="var(--paper-navy)" />
          <circle cx="65" cy="67" r="6" fill="var(--paper-rust)" />
          <circle cx="80" cy="67" r="6" fill="var(--paper-navy)" />
          <Bars x={110} y={54} w={54} count={2} thick={6} gap={16} />
        </g>
        <Tack x={190} y={44} />
      </Piece>
      <Piece x={715} y={215} w={150} h={160} shape="notch" tone="cream" from="right" delay={270}>
        <g data-collaborator-badge="" data-badge-mark="triangle">
          <circle cx="75" cy="71" r="37" fill="var(--paper-blue)" />
          <path d="M75 47 99 89 H51Z" fill="var(--paper-navy)" />
          <Bars x={40} y={127} w={70} count={1} thick={7} />
        </g>
        <Tack x={0} y={79} />
      </Piece>
    </>
  );
}

function ScopedAccess() {
  return (
    <>
      <Thread d="M371 206 H447 M518 281 V331 M584 377 C619 377 619 359 649 359" />
      <Piece x={80} y={140} w={291} h={190} tone="blue" shape="tag" from="left">
        <circle cx="65" cy="72" r="33" fill="var(--paper-cream)" />
        <path d="M50 72 l12 12 23 -27" fill="none" stroke="var(--paper-navy)" strokeWidth="6" />
        <Bars x={124} y={64} w={122} count={2} />
      </Piece>
      <Piece x={446} y={135} w={143} h={146} tone="cream" shape="notch" from="top" delay={120}>
        <path d="M54 84 L47 127 L72 114 L97 127 L90 84Z" fill="var(--paper-rust)" />
        <circle cx="72" cy="65" r="34" fill="var(--paper-blue)" />
        <circle
          cx="72"
          cy="65"
          r="25"
          fill="none"
          stroke="var(--paper-navy)"
          strokeWidth="2"
          strokeDasharray="3 5"
        />
        <circle cx="72" cy="65" r="9" fill="var(--paper-cream)" />
      </Piece>
      <Piece x={444} y={331} w={140} h={92} tone="sage" shape="tag" from="bottom" delay={210}>
        <Punch x={33} y={45} />
        <Bars x={57} y={36} w={59} count={1} />
      </Piece>
      <Piece x={649} y={267} w={185} h={183} shape="folder" from="right" delay={290}>
        <path d="M24 72 H161 V156 H24Z" fill="var(--paper-sage)" />
        <Writing x={37} y={96} w={98} rows={2} />
      </Piece>
      <Piece x={649} y={467} w={185} h={85} tone="blue" shape="folder" from="right" delay={350}>
        <path d="M27 48 H158" className="paper-writing" />
      </Piece>
    </>
  );
}

function Peering() {
  return (
    <>
      <Thread d="M330 234 C435 216 466 216 570 234 M330 267 C433 286 465 286 570 267" />
      <Piece x={97} y={147} w={235} h={309} tone="sage" shape="folder" from="left">
        <Bars x={25} y={67} w={156} count={3} gap={67} thick={11} />
        <Writing x={25} y={295} w={148} rows={2} />
      </Piece>
      <Piece x={570} y={147} w={235} h={309} tone="blue" shape="folder" from="right" delay={80}>
        <Bars x={25} y={67} w={156} count={3} gap={67} thick={11} />
        <Writing x={25} y={295} w={148} rows={2} />
      </Piece>
      <Piece x={401} y={196} w={95} h={49} shape="torn" from="top" delay={200}>
        <Bars x={15} y={21} w={55} count={1} thick={7} />
      </Piece>
      <Piece x={401} y={255} w={95} h={49} tone="sage" shape="torn" from="bottom" delay={260}>
        <Bars x={15} y={21} w={55} count={1} thick={7} />
      </Piece>
    </>
  );
}

/** Each topic has its own topology; paper, writing, and thread primitives stay shared. */
function TopicDrawing({ spec }: { spec: TopicDrawingSpec }) {
  const anchor = (a: TopicNode, b: TopicNode) => {
    const dx = b[1] + b[3] / 2 - a[1] - a[3] / 2;
    const dy = b[2] + b[4] / 2 - a[2] - a[4] / 2;
    const scale = Math.min(
      dx ? a[3] / 2 / Math.abs(dx) : Infinity,
      dy ? a[4] / 2 / Math.abs(dy) : Infinity
    );
    return [a[1] + a[3] / 2 + dx * scale, a[2] + a[4] / 2 + dy * scale];
  };
  const node = ([kind, x, y, w, h, tone]: TopicNode, index: number) => {
    const client = ["client", "terminal", "editor", "code"].includes(kind);
    const paperTone =
      tone ?? (client ? "blue" : kind === "schema" || kind === "gate" ? "sage" : "cream");
    return (
      <Piece
        key={index}
        x={x}
        y={y}
        w={w}
        h={h}
        tone={paperTone}
        shape={
          kind === "archive" ? "folder" : kind === "entity" ? "tag" : client ? "round" : "sheet"
        }
        from={index % 2 ? "right" : "left"}
        delay={index * 65}
      >
        <g data-topic-node={kind}>
          {kind === "client" ? (
            <>
              <path
                d={`M18 20 H${w - 18} V${h - 25} H48 L31 ${h - 12} V${h - 25} H18 Z`}
                fill="var(--paper-navy)"
              />
              <Bars x={30} y={36} w={w - 75} thick={5} gap={16} tone="cream" />
            </>
          ) : kind === "terminal" || kind === "code" ? (
            <>
              <path d={`M13 17 H${w - 13} V${h - 15} H13 Z`} fill="var(--paper-navy)" />
              <path
                d="m28 34 12 12-12 12 M53 58 H82"
                stroke="var(--paper-cream)"
                strokeWidth="4"
                fill="none"
              />
              {kind === "code" && (
                <path
                  d={`m${w - 45} 34-12 12 12 12`}
                  stroke="var(--paper-cream)"
                  strokeWidth="4"
                  fill="none"
                />
              )}
            </>
          ) : kind === "editor" ? (
            <>
              <path
                d={`M17 25 H${w - 17} V${h - 20} H17 Z M17 54 H${w - 17} M${w * 0.3} 54 V${h - 20}`}
                className="paper-writing"
              />
              <Bars x={w * 0.4} y={75} w={w * 0.4} count={3} thick={5} gap={22} />
            </>
          ) : kind === "entity" ? (
            <>
              <path
                d={`M${w / 2} 29 l19 19-19 19-19-19Z`}
                fill="none"
                stroke="var(--paper-navy)"
                strokeWidth="4"
              />
              <Writing x={22} y={95} w={w - 44} rows={Math.max(2, Math.floor((h - 110) / 22))} />
            </>
          ) : kind === "fields" ? (
            <>
              <Bars x={19} y={28} w={w - 38} count={1} thick={9} />
              <Writing x={19} y={65} w={w - 38} rows={Math.max(2, Math.floor((h - 80) / 22))} />
              <path
                d={`M15 ${h - 44} H${w - 15} V${h - 23} H15 Z`}
                fill="var(--paper-blue)"
                opacity=".6"
              />
            </>
          ) : kind === "schema" ? (
            <>
              <path
                d={`M30 25H18V${h - 22}H30 M${w - 30} 25H${w - 18}V${h - 22}H${w - 30}`}
                fill="none"
                stroke="var(--paper-navy)"
                strokeWidth="3"
              />
              <Writing x={43} y={45} w={w - 85} rows={Math.max(2, Math.floor((h - 65) / 25))} />
            </>
          ) : kind === "key" ? (
            <>
              <circle
                cx={w * 0.34}
                cy={h * 0.48}
                r={Math.min(w, h) * 0.17}
                fill="none"
                stroke="var(--paper-navy)"
                strokeWidth="5"
              />
              <path
                d={`M${w * 0.48} ${h * 0.48} H${w * 0.8} V${h * 0.65} M${w * 0.68} ${h * 0.48} V${h * 0.61}`}
                fill="none"
                stroke="var(--paper-navy)"
                strokeWidth="5"
              />
            </>
          ) : kind === "search" ? (
            <>
              <circle
                cx={w * 0.42}
                cy={h * 0.4}
                r={Math.min(w, h) * 0.21}
                fill="none"
                stroke="var(--paper-navy)"
                strokeWidth="5"
              />
              <path
                d={`M${w * 0.58} ${h * 0.57} L${w * 0.8} ${h * 0.82}`}
                stroke="var(--paper-navy)"
                strokeWidth="7"
              />
            </>
          ) : kind === "clock" ? (
            <>
              <circle
                cx={w / 2}
                cy={h / 2}
                r={Math.min(w, h) * 0.32}
                fill="none"
                stroke="var(--paper-navy)"
                strokeWidth="3"
              />
              <path
                d={`M${w / 2} ${h * 0.26} V${h / 2} L${w * 0.7} ${h * 0.62}`}
                fill="none"
                stroke="var(--paper-navy)"
                strokeWidth="4"
              />
            </>
          ) : kind === "gate" ? (
            <>
              <path
                d={`M18 24H${w - 18}V${h - 22}H18Z`}
                fill="none"
                stroke="var(--paper-navy)"
                strokeWidth="2"
                strokeDasharray="8 6"
              />
              {w < 400 && (
                <path
                  d={`m${w * 0.25} ${h * 0.5} ${w * 0.16} ${h * 0.12} ${w * 0.34} ${-h * 0.27}`}
                  fill="none"
                  stroke="var(--paper-navy)"
                  strokeWidth="5"
                />
              )}
            </>
          ) : kind === "catalog" ? (
            <>
              {[0, 1, 2].map((i) => (
                <g key={i}>
                  <path
                    d={`M20 ${25 + (i * (h - 50)) / 3} H${w - 20} V${45 + (i * (h - 50)) / 3} H20Z`}
                    fill="var(--paper-blue)"
                    opacity=".65"
                  />
                  <Writing x={28} y={39 + (i * (h - 50)) / 3} w={w - 65} rows={1} />
                </g>
              ))}
            </>
          ) : kind === "package" ? (
            <>
              <path
                d={`M20 ${h * 0.32} L${w * 0.5} 20 L${w - 20} ${h * 0.32} V${h * 0.76} L${w * 0.5} ${h - 15} L20 ${h * 0.76} Z M20 ${h * 0.32} L${w * 0.5} ${h * 0.52} L${w - 20} ${h * 0.32} M${w * 0.5} ${h * 0.52} V${h - 15}`}
                className="paper-writing"
              />
            </>
          ) : kind === "copy" ? (
            <>
              <path
                d={`M27 18H${w - 17}V${h - 35}H27Z M15 33H${w - 30}V${h - 17}H15Z`}
                fill="var(--paper-cream)"
                stroke="var(--paper-navy)"
                strokeWidth="2"
              />
              <Writing x={27} y={59} w={w - 75} rows={3} />
            </>
          ) : (
            <>
              <Bars x={20} y={28} w={w - 45} thick={kind === "claim" ? 9 : 5} count={1} />
              <Writing x={20} y={60} w={w - 42} rows={Math.max(2, Math.floor((h - 75) / 22))} />
              {kind === "claim" && (
                <circle cx={w - 22} cy={h - 20} r="5" fill="var(--paper-rust)" />
              )}
              {kind === "archive" && <path d={`M15 17H${w - 15}`} className="paper-fold" />}
            </>
          )}
        </g>
      </Piece>
    );
  };
  return (
    <>
      {spec.nodes.map((n, i) => (n[0] === "gate" && n[3] > 400 ? node(n, i) : null))}
      {spec.edges.map(([from, to], i) => {
        const a = spec.nodes[from],
          b = spec.nodes[to];
        const [x1, y1] = anchor(a, b),
          [x2, y2] = anchor(b, a);
        const access = ["client", "terminal", "editor", "code"].includes(a[0]);
        return (
          <Thread
            key={i}
            d={`M${x1} ${y1} L${x2} ${y2}`}
            tone={access ? "rust" : "navy"}
            dashed={access}
          />
        );
      })}
      {spec.nodes.map((n, i) => (n[0] !== "gate" || n[3] <= 400 ? node(n, i) : null))}
    </>
  );
}

const scenes: Record<MainSceneKind, () => ReactNode> = {
  hero: Hero,
  before: Before,
  after: After,
  source: Source,
  observation: Observation,
  entity: Entity,
  reducer: Reducer,
  snapshot: Snapshot,
  invoiceExample: Invoice,
  localService: LocalService,
  visionDomain: VisionDomain,
  visionPositions: VisionPositions,
  visionExplanation: VisionExplanation,
  sharedInstance: SharedInstance,
  scopedAccess: ScopedAccess,
  peering: Peering,
};
/** Each paper object keeps its own geometry, material, and entrance motion. */
export function PaperScene({
  scene,
  idNamespace,
  locale,
}: {
  scene: PaperSceneKind;
  idNamespace?: string;
  locale?: "en" | "es";
}) {
  const contextLocale = useOptionalLocale()?.locale;
  const generatedId = useId();
  const id = `paper-${idNamespace ?? generatedId.replace(/:/g, "")}`;
  const Scene = scenes[scene as MainSceneKind];
  const alt =
    (locale ?? contextLocale) === "es"
      ? (PAPER_SCENE_ALTS_ES[scene] ?? PAPER_SCENE_ALTS[scene])
      : PAPER_SCENE_ALTS[scene];
  if (isOverheadScene(scene)) return <OverheadPaperScene scene={scene} alt={alt} />;
  return (
    <Materials.Provider value={id}>
      <EditorialComparison.Provider value={scene === "before" || scene === "after"}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="paper-scene"
          data-paper-scene={scene}
          viewBox="0 0 900 600"
          role="img"
          aria-labelledby={`${id}-title`}
        >
          <title id={`${id}-title`}>{alt}</title>

          <defs>
            <pattern id={`${id}-print-grain`} width="17" height="13" patternUnits="userSpaceOnUse">
              <rect width="17" height="13" fill="white" />
              <g fill="black">
                <circle cx="2.1" cy="3.5" r=".8" opacity=".65" />
                <circle cx="7.7" cy="1.9" r=".6" opacity=".9" />
                <circle cx="13.6" cy="5.2" r=".85" opacity=".55" />
                <circle cx="5.1" cy="10.6" r=".7" opacity=".8" />
                <circle cx="11.2" cy="10.4" r=".6" opacity=".7" />
                <path d="M1 8h1.2v.5H1zM9 6h.6v1.1H9z" opacity=".6" />
              </g>
            </pattern>
            <mask
              id={`${id}-screenprint`}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width="900"
              height="600"
              style={{ maskType: "luminance" }}
            >
              <rect width="900" height="600" fill={`url(#${id}-print-grain)`} />
            </mask>
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
            <pattern id={`${id}-fiber`} width="512" height="512" patternUnits="userSpaceOnUse">
              <image
                href={staticAssetPath("/brand/october/paper-fiber.webp")}
                width="512"
                height="512"
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>
          </defs>
          <rect width="900" height="600" fill="#f2eee5" data-paper-ground="" />
          <image
            href={staticAssetPath("/brand/october/essay/materials/9e9dfed440f8ff18.webp")}
            width="900"
            height="600"
            preserveAspectRatio="xMidYMid slice"
            opacity=".17"
            data-paper-ground=""
          />
          {Scene ? <Scene /> : <TopicDrawing spec={TOPIC_DRAWINGS[scene as TopicDrawingId]} />}
        </svg>
      </EditorialComparison.Provider>
    </Materials.Provider>
  );
}

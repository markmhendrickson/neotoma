import { createContext, useContext, useId, type ReactNode } from "react";
import { OCTOBER_RENDERS } from "./october_renders";
import "./paper_scene.css";

export const VISION_SCENE_ALTS = {
  visionDomain:
    "Planned domain authority: a matching holder reaches one of two bounded compartments",
  visionPositions:
    "Planned position tracking: two distinct claims remain visible beside a selected position",
  visionExplanation:
    "Planned explanation: lifted current field reveals its basis and a bounded set of effects",
  sharedInstance: "Supported sharing: three different readers connect to one configured instance",
  scopedAccess:
    "Supported access: verified identity and a separate scope grant reach one compartment",
  peering: "Supported peering: two separate instances exchange a selected subset of records",
} as const;
export type PaperSceneKind = keyof typeof OCTOBER_RENDERS | keyof typeof VISION_SCENE_ALTS;
export const PAPER_SCENE_ALTS: Record<PaperSceneKind, string> = {
  ...Object.fromEntries(Object.entries(OCTOBER_RENDERS).map(([key, render]) => [key, render.alt])),
  ...VISION_SCENE_ALTS,
} as Record<PaperSceneKind, string>;
const Materials = createContext("");
type Tone = "cream" | "sage" | "blue" | "navy" | "rust";
type Shape = "sheet" | "folder" | "notch" | "tag" | "torn" | "round";

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
      >
        <path
          d={silhouette(w, h, shape)}
          transform="translate(1.5 2.5)"
          fill="#403322"
          opacity=".18"
        />
        <path d={silhouette(w, h, shape)} transform="translate(4 7)" fill="#4e3d27" opacity=".10" />
        <path
          d={silhouette(w, h, shape)}
          transform="translate(6 9)"
          fill="#4e3d27"
          opacity=".055"
          stroke="#4e3d27"
          strokeWidth="10"
          strokeLinejoin="round"
          strokeOpacity=".025"
        />
        <path
          d={silhouette(w, h, shape)}
          transform="translate(0 1.5)"
          fill="#b9a991"
          opacity=".68"
        />
        <path d={silhouette(w, h, shape)} fill={`url(#${id}-${tone})`} className="paper-edge" />
        <path
          d={silhouette(w, h, shape)}
          fill={`url(#${id}-fiber)`}
          opacity=".38"
          style={{ mixBlendMode: "multiply" }}
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
      <Piece x={765} y={532} w={89} h={28} shape="torn" from="bottom" delay={490}>
        <circle cx="13" cy="13" r="4" fill="var(--paper-rust)" />
        <path d="M25 14 H71" className="paper-writing" />
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
    <Piece x={x} y={y} w={w} h={h} tone="blue" angle={angle} from="bottom" delay={delay}>
      <path
        d={`M0 0 L${w / 2} ${h * 0.59} L${w} 0`}
        fill="#c3d1d6"
        stroke="#849ba6"
        strokeWidth="1"
      />
      <path
        d={`M0 ${h} L${w * 0.39} ${h * 0.48} M${w} ${h} L${w * 0.61} ${h * 0.48}`}
        className="paper-fold"
      />
    </Piece>
  );
}
function Folder({
  x,
  y,
  w,
  h,
  tone = "cream",
  delay = 0,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  tone?: Tone;
  delay?: number;
}) {
  const id = useContext(Materials);
  return (
    <Piece x={x} y={y} w={w} h={h} shape="folder" tone={tone} from="right" delay={delay}>
      <path d={`M${w - 13} 22 L${w + 10} 39 V${h - 15} L${w - 13} ${h} Z`} fill="#b8aa8e" />
      <path
        d={`M10 48 L${w - 13} 76 V${h} H10 Z`}
        fill={`url(#${id}-${tone})`}
        stroke="#f6edda"
        strokeWidth="1"
      />
      <path d={`M10 48 V${h} M${w - 13} 76 V${h}`} className="paper-fold" />
    </Piece>
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
      <Thread d="M193 321 C244 315 244 329 280 340 M193 410 C253 421 252 398 286 401 M517 337 C551 310 562 289 582 278 M580 273 H706" />
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
function Entity() {
  return (
    <>
      {[96, 196, 296, 396].map((y, i) => (
        <Thread key={y} d={`M264 ${y} C400 ${y + 65} 421 ${90 + i * 3} 557 88`} />
      ))}
      <Thread d="M336 493 C456 498 491 443 589 438" />
      <Folder x={558} y={50} w={271} h={278} />
      <Folder x={590} y={407} w={218} h={153} tone="sage" delay={140} />
      {[
        { x: 123, y: 50, a: 15 },
        { x: 95, y: 153, a: 6 },
        { x: 62, y: 254, a: -4 },
        { x: 108, y: 353, a: -20 },
        { x: 183, y: 455, a: -20 },
      ].map(({ x, y, a }, i) => (
        <Piece key={y} x={x} y={y} w={174} h={91} angle={a} from="left" delay={140 + i * 70}>
          <path
            d="M81 0 87 -12 H129 L135 0Z"
            fill={i < 4 ? "var(--paper-rust)" : "var(--paper-sage)"}
          />
          <Writing x={18} y={23} w={114} rows={3} />
          <Bars x={18} y={68} w={107} count={1} thick={12} />
          <Punch x={156} y={42} />
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
      <Thread d="M336 232 H681" />
      <Piece x={48} y={68} w={328} h={456} from="left">
        <Bars x={29} y={31} w={105} count={1} thick={21} tone="blue" />
        <Writing x={29} y={88} w={268} rows={2} />
        <g className="paper-table">
          {[128, 151, 174, 197, 220, 243, 266].map((y) => (
            <path key={y} d={`M29 ${y} H291`} />
          ))}
          <path d="M29 128 V266 M209 128 V266 M291 128 V266" />
        </g>
        <rect x="216" y="153" width="72" height="19" fill="var(--paper-blue)" />
        <path d="M223 158 H279 M223 166 H269" className="paper-writing" />
        <Bars x={29} y={349} w={123} count={1} thick={13} tone="blue" />
        <Writing x={29} y={384} w={264} rows={3} />
      </Piece>
      <Piece x={510} y={70} w={291} h={454} tone="blue" from="right" delay={160}>
        <Writing x={46} y={45} w={152} rows={21} />
        <Writing x={223} y={45} w={29} rows={21} />
        <path d="M182 151 h-9 v34 h9 M260 151 h9 v34 h-9" className="paper-bracket" />
      </Piece>
      <Piece x={790} y={201} w={79} h={153} from="bottom" delay={310}>
        <Writing x={16} y={27} w={49} rows={6} />
      </Piece>
    </>
  );
}
function Invoice() {
  return (
    <>
      <Thread d="M261 134 C454 127 440 285 575 310 M355 377 C481 388 483 310 575 310 M716 312 C769 301 772 333 811 332" />
      <Piece x={79} y={43} w={318} h={222} from="left">
        <Bars x={20} y={20} w={275} count={1} thick={20} />
        <g className="paper-table">
          {[55, 80, 105, 130, 155, 180, 205].map((y) => (
            <path key={y} d={`M20 ${y} H296`} />
          ))}
          <path d="M109 55 V205 M213 55 V205" />
        </g>
        <rect x="130" y="83" width="57" height="15" fill="var(--paper-sage)" />
        <Punch x={182} y={91} />
      </Piece>
      <Envelope x={35} y={328} w={402} h={226} delay={80} />
      <Piece x={74} y={288} w={334} h={204} from="bottom" delay={210}>
        <Bars x={24} y={21} w={284} count={1} thick={17} />
        <Writing x={24} y={65} w={280} rows={5} />
        <rect x="114" y="80" width="174" height="18" fill="var(--paper-sage)" />
        <Punch x={281} y={89} />
      </Piece>
      <Piece x={35} y={425} w={402} h={129} tone="blue" from="bottom" delay={80}>
        <path d="M0 0 201 80 402 0 M0 129 150 50 M402 129 252 50" className="paper-fold" />
      </Piece>
      <Piece x={567} y={205} w={162} h={204} from="right" delay={310}>
        <Bars x={15} y={17} w={130} count={1} thick={17} />
        <Writing x={15} y={47} w={129} rows={7} />
        <rect x="66" y="97" width="65" height="16" fill="var(--paper-sage)" />
        <Punch x={8} y={105} />
      </Piece>
      <Piece x={696} y={301} w={37} h={23} tone="rust" from="top" delay={420}>
        <Punch x={20} y={11} />
      </Piece>
      <Piece x={811} y={317} w={64} h={40} angle={8} from="right" delay={490}>
        <Bars x={11} y={13} w={41} thick={8} count={1} />
      </Piece>
    </>
  );
}
function LocalService() {
  return (
    <>
      <Thread d="M245 137 361 258 M238 153 353 273 M645 123 560 247 M650 142 566 266 M236 467 354 379 M246 484 365 397 M669 466 562 380 M678 450 572 363" />
      <Piece x={325} y={353} w={270} h={102} tone="sage" from="bottom">
        <path d="M0 15 141 49 270 15 M141 49 V101" className="paper-fold" />
      </Piece>
      <Piece x={359} y={220} w={205} h={180} from="bottom" delay={90}>
        <path d="M0 28 106 -7 205 28 V176 H0 Z" fill="#cfc1a5" stroke="#a99a80" />
        <path d="M0 28 106 -7 205 28 103 57Z" fill="#f0e8d7" stroke="#fff6e7" />
        <path d="M0 94 H205 V137 H0Z" fill="var(--paper-navy)" />
        <path d="M91 115 h23" stroke="#eee6d6" strokeWidth="5" />
        <path d="M96 34 q8 14 17 0" stroke="#705e48" strokeWidth="2" fill="none" />
      </Piece>
      <Piece
        x={76}
        y={77}
        w={169}
        h={104}
        angle={-11}
        tone="blue"
        shape="round"
        from="left"
        delay={180}
      >
        <Bars x={25} y={27} w={100} thick={11} count={1} />
        <Writing x={25} y={52} w={104} rows={2} />
      </Piece>
      <Piece x={646} y={66} w={145} h={115} tone="navy" angle={7} from="right" delay={270}>
        <rect x="22" y="34" width="100" height="24" fill="var(--paper-cream)" />
      </Piece>
      <Piece x={69} y={435} w={155} h={119} angle={-13} from="left" delay={360}>
        <path d="M0 29 78 0 155 29 M78 0 v109" className="paper-fold" />
        <Bars x={24} y={48} w={107} count={1} />
        <Writing x={24} y={71} w={97} rows={2} />
      </Piece>
      <Piece
        x={670}
        y={425}
        w={179}
        h={111}
        tone="sage"
        angle={11}
        shape="tag"
        from="right"
        delay={450}
      >
        <Punch x={23} y={54} />
        <Bars x={49} y={30} w={97} count={1} />
        <Writing x={49} y={53} w={97} rows={2} />
      </Piece>
      {[
        [245, 137],
        [645, 123],
        [236, 467],
        [669, 466],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="6" fill="var(--paper-rust)" />
      ))}
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
      <Thread d="M347 226 C424 215 446 260 551 253 M347 402 C421 409 466 299 551 286" />
      <Piece x={76} y={103} w={271} h={181} tone="rust" shape="torn" from="left">
        <Bars x={29} y={44} w={165} thick={12} />
        <Writing x={29} y={84} w={190} rows={3} />
        <Punch x={241} y={125} />
      </Piece>
      <Piece x={76} y={332} w={271} h={171} tone="sage" shape="notch" from="left" delay={120}>
        <circle cx="54" cy="52" r="20" fill="var(--paper-cream)" />
        <Bars x={29} y={96} w={165} thick={12} />
        <Punch x={242} y={83} />
      </Piece>
      <Piece x={551} y={136} w={251} h={341} shape="folder" from="right" delay={260}>
        <path d="M28 86 H220 M28 251 H220" className="paper-fold" />
        <path d="M45 118 H215 V183 H45Z" fill="var(--paper-rust)" opacity=".72" />
        <path d="M45 276 H215 V325 H45Z" fill="var(--paper-sage)" opacity=".65" />
        <path d="M202 134 l23 17 -23 17" fill="var(--paper-cream)" />
      </Piece>
    </>
  );
}
function VisionExplanation() {
  return (
    <>
      <Thread d="M524 319 C597 321 606 261 680 261 M524 336 C599 360 608 407 679 407" />
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
      <Thread d="M300 151 C390 175 388 246 446 270 M634 152 C570 180 563 232 537 271 M292 447 C379 415 394 353 444 331" />
      <Piece x={415} y={248} w={166} h={120} tone="sage" shape="folder" from="bottom">
        <Bars x={23} y={55} w={110} count={2} thick={11} />
      </Piece>
      <Piece x={104} y={91} w={196} h={114} tone="blue" shape="round" from="left" delay={110}>
        <Bars x={25} y={34} w={130} count={1} />
        <Writing x={25} y={58} w={128} rows={2} />
      </Piece>
      <Piece x={634} y={94} w={153} h={115} tone="navy" shape="tag" from="right" delay={170}>
        <rect x="25" y="38" width="98" height="25" fill="var(--paper-cream)" />
      </Piece>
      <Piece x={105} y={389} w={188} h={129} shape="round" from="left" delay={230}>
        <path d="M20 31 H166 V112 H20Z" fill="var(--paper-blue)" />
        <Writing x={33} y={56} w={105} rows={2} />
      </Piece>
    </>
  );
}

function ScopedAccess() {
  return (
    <>
      <Thread d="M371 206 H447 M518 206 C593 206 570 359 649 359" />
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

const scenes: Record<PaperSceneKind, () => ReactNode> = {
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
/** Authored animated counterpart of the October paper composition; no raster underneath. */
export function PaperScene({ scene }: { scene: PaperSceneKind }) {
  const id = `paper-${useId().replace(/:/g, "")}`;
  const Scene = scenes[scene];
  return (
    <Materials.Provider value={id}>
      <svg
        className="paper-scene"
        data-paper-scene={scene}
        viewBox="0 0 900 600"
        role="img"
        aria-labelledby={`${id}-title`}
      >
        <title id={`${id}-title`}>{PAPER_SCENE_ALTS[scene]}</title>

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
            <stop offset="1" stopColor="#c9bda9" />
          </radialGradient>
          <pattern id={`${id}-fiber`} width="512" height="512" patternUnits="userSpaceOnUse">
            <image
              href="/brand/october/paper-fiber.webp"
              width="512"
              height="512"
              preserveAspectRatio="xMidYMid slice"
            />
          </pattern>
        </defs>
        <rect width="900" height="600" fill={`url(#${id}-ground)`} />
        <rect
          width="900"
          height="600"
          fill={`url(#${id}-fiber)`}
          opacity=".22"
          style={{ mixBlendMode: "multiply" }}
        />
        <Scene />
      </svg>
    </Materials.Provider>
  );
}

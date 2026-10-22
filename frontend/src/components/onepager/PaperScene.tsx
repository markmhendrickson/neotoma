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
        filter={`url(#${id}-grain)`}
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
      <Thread d="M160 507 C240 491 250 427 340 438 S510 493 590 520" dashed />
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
      <Thread d="M580 273 H706" />
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
      <Thread d="M220 150 376 275 M230 131 388 254 M631 135 534 255 M645 154 545 277 M235 466 365 385 M247 482 378 402 M671 463 549 389 M683 447 559 371" />
      <Piece x={325} y={365} w={270} h={91} tone="sage" from="bottom">
        <path d="M0 15 141 49 270 15 M141 49 V91" className="paper-fold" />
      </Piece>
      <Piece x={360} y={231} w={204} h={170} from="bottom" delay={90}>
        <rect y="67" width="204" height="55" fill="var(--paper-navy)" />
        <path
          d="M0 0 123 -60 236 -13 204 30 0 0 M204 30 V170 L236 132 V-13"
          fill="#d4c7ad"
          stroke="#b9aa90"
        />
        <path d="M77 6 q15 32 30 2" fill="#3a3529" />
      </Piece>
      <Piece x={76} y={77} w={169} h={104} angle={-11} tone="blue" from="left" delay={180}>
        <Bars x={21} y={21} w={125} count={1} thick={12} />
        <Writing x={21} y={49} w={124} rows={3} />
      </Piece>
      <Piece x={646} y={66} w={145} h={115} tone="navy" angle={7} from="right" delay={270}>
        <rect x="22" y="44" width="101" height="15" fill="var(--paper-cream)" />
      </Piece>
      <Piece x={69} y={435} w={155} h={119} angle={-13} from="left" delay={360}>
        <Bars x={23} y={24} w={107} count={1} thick={10} />
        <Writing x={23} y={51} w={107} rows={3} />
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
        <circle cx="27" cy="42" r="12" fill="var(--paper-cream)" />
        <circle cx="27" cy="42" r="6" fill="#8c846b" />
        <Bars x={51} y={29} w={106} count={1} thick={9} />
        <Writing x={51} y={57} w={106} rows={3} />
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
        <title id={`${id}-title`}>{OCTOBER_RENDERS[scene].alt}</title>

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

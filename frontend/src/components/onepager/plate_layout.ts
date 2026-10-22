/**
 * Shared layout of the sheet 01 plate (FIG. A-1): the single source for the desktop frame, the
 * phone frame and the drafting callouts drawn over both.
 *
 * The two plate images are generated illustrations made from a structure render of exactly these
 * object boxes and then registered back onto these frames (frontend/public/brand/PROVENANCE.json,
 * "plate", which also records a sha256 of each frame's size and `objects`), so the callouts below
 * land on the objects. Moving an object here without regenerating the images fails that check.
 * The phone frame is a separate layout of the same objects (sources, then the ledger with the rule
 * card on it, then the record card), not a crop of the desktop frame: no portrait crop of the
 * desktop frame holds both sources and the record card.
 *
 * Coordinates are in each frame's own pixel units. `displayWidth` is the CSS width each frame is
 * drawn at in the layout it is designed for; callout line weights and type are scaled by
 * `width / displayWidth` so they keep the same on-screen size in both frames.
 *
 * Objects (paper only, no text): `pdf` the invoice-like sheet with a folded-back corner (source 1),
 * `email` the lighter card with a short shallow crease (source 2), `obs1`/`obs2` the tabbed slips
 * (observations) filed on the sage strip, `rule` the punch card (last write per field), `snap` the
 * rounded record card (current snapshot).
 */

export type Pt = readonly [number, number];
export type Box = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};
export type ObjectName = "pdf" | "email" | "obs1" | "obs2" | "rule" | "snap";
/** What a callout end touches: an object's edge, the revision cloud, or open margin (null). */
export type Touch = ObjectName | "cloud" | null;

/** A printed connector between objects; `arrow` marks agent write or read direction at its end. */
export type Connector = {
  readonly points: readonly Pt[];
  readonly touches: readonly [Touch, Touch];
  readonly arrow?: boolean;
};

export type PlateFrame = {
  readonly width: number;
  readonly height: number;
  readonly displayWidth: number;
  readonly objects: Readonly<Record<ObjectName, Box>>;
  /** The punched slot the key 2 leader starts in (the first leader's first point). */
  readonly ruleTarget: Pt;
  /** Revision cloud around the changed line of the record card. */
  readonly cloud: Box;
  readonly connectors: readonly Connector[];
  /** Dashed extension lines (each a polyline). */
  readonly extensions: readonly (readonly Pt[])[];
  /** Dimension lines; `gaps` are x ranges left open where another leader crosses. */
  readonly dims: readonly { readonly from: Pt; readonly to: Pt; readonly gaps?: readonly Pt[] }[];
  /** Leaders: polyline, what each end touches, optional dot at the start and arrowhead up at the end. */
  readonly leaders: readonly {
    readonly points: readonly Pt[];
    readonly touches: readonly [Touch, Touch];
    readonly dot?: boolean;
    readonly arrowUp?: boolean;
  }[];
  /**
   * Numbered keys, matching FIGURE_LEGEND (key 5 appears twice: one write, one read). `on` names
   * the line each key sits on or ends: a leader, a dimension or a connector, by index.
   */
  readonly keys: readonly {
    readonly n: number;
    readonly at: Pt;
    readonly on: readonly ["leader" | "dim" | "connector", number];
  }[];
  readonly label: { readonly at: Pt; readonly full: boolean };
  readonly tagRight: number;
  readonly note: {
    readonly y: number;
    readonly h: number;
    readonly x0: number;
    readonly x1: number;
    readonly cell: number;
    /** Type size of the note text in CSS px at displayWidth. */
    readonly size: number;
  };
};

/** Desktop frame, 1536 x 1024, drawn at up to about 1028 CSS px. */
export const PLATE_WIDE_LAYOUT: PlateFrame = {
  width: 1536,
  height: 1024,
  displayWidth: 1028,
  objects: {
    pdf: { x: 110, y: 140, w: 240, h: 340 },
    email: { x: 110, y: 590, w: 270, h: 190 },
    obs1: { x: 450, y: 262, w: 210, h: 92 },
    obs2: { x: 450, y: 650, w: 210, h: 92 },
    rule: { x: 900, y: 150, w: 220, h: 250 },
    snap: { x: 780, y: 520, w: 680, h: 350 },
  },
  ruleTarget: [1041, 217],
  cloud: { x: 1066, y: 666, w: 262, h: 36 },
  connectors: [
    // agent writes the PDF in (key 5)
    {
      points: [
        [362, 308],
        [438, 308],
      ],
      touches: ["pdf", "obs1"],
      arrow: true,
    },
    // agent writes the email in
    {
      points: [
        [392, 696],
        [438, 696],
      ],
      touches: ["email", "obs2"],
      arrow: true,
    },
    {
      points: [
        [672, 308],
        [888, 308],
      ],
      touches: ["obs1", "rule"],
    },
    {
      points: [
        [672, 696],
        [730, 696],
        [730, 380],
        [888, 380],
      ],
      touches: ["obs2", "rule"],
    },
    {
      points: [
        [1010, 412],
        [1010, 508],
      ],
      touches: ["rule", "snap"],
    },
    // agent reads the current snapshot out (key 5)
    {
      points: [
        [1332, 512],
        [1332, 400],
      ],
      touches: ["snap", null],
      arrow: true,
    },
  ],
  extensions: [
    [
      [104, 140],
      [74, 140],
    ],
    [
      [104, 780],
      [74, 780],
    ],
  ],
  dims: [
    { from: [80, 140], to: [80, 780] },
    { from: [640, 360], to: [640, 644] },
  ],
  leaders: [
    {
      points: [
        [1041, 217],
        [1166, 208],
      ],
      touches: [null, null], // starts inside the rule card, at ruleTarget (tested)
      dot: true,
    },
    // from the cloud's left end, down through the blank band of the card, out and back to obs2
    {
      points: [
        [1066, 684],
        [1054, 684],
        [1054, 905],
        [604, 905],
        [604, 752],
      ],
      touches: ["cloud", "obs2"],
      arrowUp: true,
    },
    {
      points: [
        [640, 502],
        [660, 502],
      ],
      touches: [null, null],
    },
    {
      points: [
        [405, 279],
        [405, 300],
      ],
      touches: [null, null],
    },
    {
      points: [
        [1342, 388],
        [1366, 388],
      ],
      touches: [null, null],
    },
  ],
  keys: [
    { n: 1, at: [80, 530], on: ["dim", 0] },
    { n: 2, at: [1180, 204], on: ["leader", 0] },
    { n: 3, at: [880, 905], on: ["leader", 1] },
    { n: 4, at: [676, 502], on: ["leader", 2] },
    { n: 5, at: [405, 262], on: ["leader", 3] },
    { n: 5, at: [1382, 388], on: ["leader", 4] },
  ],
  label: { at: [80, 66], full: true },
  tagRight: 1456,
  note: { y: 944, h: 56, x0: 80, x1: 1456, cell: 62, size: 11.5 },
};

/** Phone frame, 800 x 1200: the same objects in three tiers, drawn at about 314 CSS px on a 390 px screen. */
export const PLATE_NARROW_LAYOUT: PlateFrame = {
  width: 800,
  height: 1200,
  displayWidth: 314,
  objects: {
    pdf: { x: 72, y: 120, w: 214, h: 300 },
    email: { x: 440, y: 160, w: 300, h: 210 },
    obs1: { x: 110, y: 488, w: 170, h: 96 },
    obs2: { x: 520, y: 488, w: 170, h: 96 },
    rule: { x: 300, y: 412, w: 200, h: 180 },
    snap: { x: 40, y: 726, w: 660, h: 330 },
  },
  ruleTarget: [430, 463],
  cloud: { x: 326, y: 868, w: 250, h: 36 },
  connectors: [
    // agent writes the PDF in (key 5)
    {
      points: [
        [180, 432],
        [180, 476],
      ],
      touches: ["pdf", "obs1"],
      arrow: true,
    },
    // agent writes the email in
    {
      points: [
        [610, 382],
        [610, 476],
      ],
      touches: ["email", "obs2"],
      arrow: true,
    },
    {
      points: [
        [400, 604],
        [400, 714],
      ],
      touches: ["rule", "snap"],
    },
    // agent reads the current snapshot out (key 5); tip kept well inside the frame edge
    {
      points: [
        [704, 891],
        [762, 891],
      ],
      touches: ["snap", null],
      arrow: true,
    },
  ],
  extensions: [
    [
      [72, 114],
      [72, 90],
    ],
    [
      [740, 154],
      [740, 90],
    ],
    [
      [110, 588],
      [110, 658],
    ],
    [
      [690, 588],
      [690, 658],
    ],
  ],
  dims: [
    { from: [72, 98], to: [740, 98] },
    {
      from: [110, 650],
      to: [690, 650],
      gaps: [
        [392, 408],
        [558, 574],
      ],
    },
  ],
  leaders: [
    {
      points: [
        [430, 463],
        [516, 410],
      ],
      touches: [null, null], // starts inside the rule card, at ruleTarget (tested)
      dot: true,
    },
    // straight up from the cloud's top, clear of the ruled lines, to the later observation
    {
      points: [
        [566, 868],
        [566, 596],
      ],
      touches: ["cloud", "obs2"],
      arrowUp: true,
    },
    {
      points: [
        [622, 425],
        [640, 425],
      ],
      touches: [null, null],
    },
    {
      points: [
        [734, 874],
        [734, 886],
      ],
      touches: [null, null],
    },
  ],
  keys: [
    { n: 1, at: [400, 98], on: ["dim", 0] },
    { n: 2, at: [530, 402], on: ["leader", 0] },
    { n: 3, at: [566, 690], on: ["leader", 1] },
    { n: 4, at: [200, 652], on: ["dim", 1] },
    { n: 5, at: [668, 425], on: ["leader", 2] },
    { n: 5, at: [734, 846], on: ["leader", 3] },
  ],
  label: { at: [20, 52], full: false },
  tagRight: 780,
  note: { y: 1096, h: 82, x0: 20, x1: 780, cell: 44, size: 11 },
};

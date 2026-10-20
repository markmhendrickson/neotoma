/**
 * Shared layout of the sheet 01 plate (FIG. A-1): the single source for the desktop frame, the
 * phone frame and the drafting callouts drawn over both.
 *
 * The two plate images were generated from a structure render of exactly these object boxes and then
 * registered back onto these frames (frontend/public/brand/PROVENANCE.json, "plate"), so the callouts
 * below land on the objects. The phone frame is a separate layout of the same objects (sources, then
 * the ledger with the rule card on it, then the record card), not a crop of the desktop frame: no
 * portrait crop of the desktop frame holds both sources and the record card.
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

/** A printed connector between objects; `arrow` marks agent write or read direction at `to`. */
export type Connector = {
  readonly points: readonly Pt[];
  readonly arrow?: boolean;
};

export type PlateFrame = {
  readonly width: number;
  readonly height: number;
  readonly displayWidth: number;
  readonly objects: {
    readonly pdf: Box;
    readonly email: Box;
    readonly obs1: Box;
    readonly obs2: Box;
    readonly rule: Box;
    readonly snap: Box;
  };
  /** The punched slot the key 2 leader points into. */
  readonly ruleTarget: Pt;
  /** Revision cloud around the changed line of the record card. */
  readonly cloud: Box;
  readonly connectors: readonly Connector[];
  /** Dashed extension lines (each a polyline). */
  readonly extensions: readonly (readonly Pt[])[];
  /** Dimension lines; `gaps` are x ranges left open where another leader crosses. */
  readonly dims: readonly { readonly from: Pt; readonly to: Pt; readonly gaps?: readonly Pt[] }[];
  /** Leaders: polyline, optional dot at the start and arrowhead pointing up at the end. */
  readonly leaders: readonly {
    readonly points: readonly Pt[];
    readonly dot?: boolean;
    readonly arrowUp?: boolean;
  }[];
  /** Numbered keys, matching FIGURE_LEGEND (key 5 appears twice: one write, one read). */
  readonly keys: readonly { readonly n: number; readonly at: Pt }[];
  readonly label: { readonly at: Pt; readonly full: boolean };
  readonly tagRight: number;
  readonly note: {
    readonly y: number;
    readonly h: number;
    readonly x0: number;
    readonly x1: number;
    readonly cell: number;
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
    {
      points: [
        [362, 308],
        [438, 308],
      ],
      arrow: true,
    }, // agent writes the PDF in (key 5)
    {
      points: [
        [392, 696],
        [438, 696],
      ],
      arrow: true,
    }, // agent writes the email in
    {
      points: [
        [672, 308],
        [888, 308],
      ],
    },
    {
      points: [
        [672, 696],
        [730, 696],
        [730, 380],
        [888, 380],
      ],
    },
    {
      points: [
        [1010, 412],
        [1010, 508],
      ],
    },
    {
      points: [
        [1332, 512],
        [1332, 400],
      ],
      arrow: true,
    }, // agent reads the current snapshot (key 5)
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
    { from: [632, 354], to: [632, 650] },
  ],
  leaders: [
    {
      points: [
        [1041, 217],
        [1166, 208],
      ],
      dot: true,
    },
    {
      points: [
        [1328, 684],
        [1380, 684],
        [1380, 905],
        [604, 905],
        [604, 752],
      ],
      arrowUp: true,
    },
    {
      points: [
        [632, 502],
        [660, 502],
      ],
    },
    {
      points: [
        [405, 282],
        [405, 300],
      ],
    },
    {
      points: [
        [1342, 388],
        [1366, 388],
      ],
    },
  ],
  keys: [
    { n: 1, at: [80, 530] },
    { n: 2, at: [1180, 204] },
    { n: 3, at: [980, 905] },
    { n: 4, at: [676, 502] },
    { n: 5, at: [405, 262] },
    { n: 5, at: [1382, 388] },
  ],
  label: { at: [80, 66], full: true },
  tagRight: 1456,
  note: { y: 944, h: 56, x0: 80, x1: 1456, cell: 62 },
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
    {
      points: [
        [180, 432],
        [180, 476],
      ],
      arrow: true,
    }, // agent writes the PDF in (key 5)
    {
      points: [
        [610, 382],
        [610, 476],
      ],
      arrow: true,
    }, // agent writes the email in
    {
      points: [
        [400, 622],
        [400, 714],
      ],
    },
    {
      points: [
        [704, 891],
        [782, 891],
      ],
      arrow: true,
    }, // agent reads the current snapshot (key 5)
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
      [110, 618],
    ],
    [
      [690, 588],
      [690, 618],
    ],
  ],
  dims: [
    { from: [72, 98], to: [740, 98] },
    { from: [110, 610], to: [690, 610], gaps: [[642, 658]] },
  ],
  leaders: [
    {
      points: [
        [430, 463],
        [516, 410],
      ],
      dot: true,
    },
    {
      points: [
        [576, 886],
        [650, 886],
        [650, 596],
      ],
      arrowUp: true,
    },
    {
      points: [
        [622, 425],
        [640, 425],
      ],
    },
  ],
  keys: [
    { n: 1, at: [400, 98] },
    { n: 2, at: [530, 402] },
    { n: 3, at: [650, 672] },
    { n: 4, at: [200, 614] },
    { n: 5, at: [668, 425] },
    { n: 5, at: [745, 844] },
  ],
  label: { at: [32, 52], full: false },
  tagRight: 768,
  note: { y: 1096, h: 82, x0: 32, x1: 768, cell: 52 },
};

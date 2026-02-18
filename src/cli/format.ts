/**
 * CLI formatting helpers (Claude Code-style): headings, bullets, paths, emphasis.
 * Uses ANSI when stdout is a TTY and NO_COLOR is not set; otherwise plain text.
 */

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  /** Warm brown/orange for borders and sub-headings (Claude Code-style panel). */
  accent: "\u001b[38;5;94m",
} as const;

function useColor(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") return false;
  return Boolean(process.stdout?.isTTY);
}

let _colorEnabled: boolean | null = null;
function colorEnabled(): boolean {
  if (_colorEnabled === null) _colorEnabled = useColor();
  return _colorEnabled;
}

/** Bold text (or plain if no color). */
export function bold(text: string): string {
  return colorEnabled() ? `${ANSI.bold}${text}${ANSI.reset}` : text;
}

/** Dimmed/secondary text. */
export function dim(text: string): string {
  return colorEnabled() ? `${ANSI.dim}${text}${ANSI.reset}` : text;
}

/** Section heading (bold, with optional underline-style spacing). */
export function heading(text: string, level: 1 | 2 = 1): string {
  if (level === 1) return bold(text);
  return bold(text);
}

/** Bullet line with optional indentation. */
export function bullet(text: string, indent = 0): string {
  const pad = indent > 0 ? "  ".repeat(indent) : "";
  return `${pad}• ${text}`;
}

/** Numbered list item. */
export function numbered(index: number, text: string, indent = 0): string {
  const pad = indent > 0 ? "  ".repeat(indent) : "";
  return `${pad}${index}. ${text}`;
}

/** File path or code (dimmed so it stands out from prose). */
export function pathStyle(text: string): string {
  return dim(text);
}

/** Success / positive (e.g. "up", "created"). */
export function success(text: string): string {
  return colorEnabled() ? `${ANSI.green}${text}${ANSI.reset}` : text;
}

/** Warning / highlight (e.g. "down", "skipped"). */
export function warn(text: string): string {
  return colorEnabled() ? `${ANSI.yellow}${text}${ANSI.reset}` : text;
}

/** Label for a command or tool (e.g. "Bash", "neotoma-prod"). */
export function label(text: string): string {
  return bold(text);
}

/** Empty line for spacing between sections. */
export function nl(): string {
  return "\n";
}

/** Write a section: title + optional bullet list. */
export function section(title: string, bullets?: string[]): string {
  const out: string[] = [heading(title), ""];
  if (bullets?.length) {
    for (const b of bullets) out.push(bullet(b));
    out.push("");
  }
  return out.join("\n");
}

/** Format key: value with optional path-style value. */
export function keyValue(key: string, value: string, valueAsPath = false): string {
  const v = valueAsPath ? pathStyle(value) : value;
  return `  ${dim(key + ":")} ${v}`;
}

/** Accent color for panel title, sub-headings, and illustration (warm brown). */
export function accent(text: string): string {
  return colorEnabled() ? `${ANSI.accent}${text}${ANSI.reset}` : text;
}

/** Sub-heading in accent color (e.g. "Tips for getting started"). */
export function subHeading(text: string): string {
  return accent(text);
}

/** Strip ANSI escape sequences for measuring visible length. */
export function visibleLength(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*m/g, "").length;
}

/** Terminal display width: most chars 1, fullwidth/CJK 2. Use for aligning columns. */
export function displayWidth(s: string): number {
  // eslint-disable-next-line no-control-regex -- strip ANSI escape sequences
  const plain = s.replace(/\u001b\[[0-9;]*m/g, "");
  let w = 0;
  for (let i = 0; i < plain.length; i++) {
    const code = plain.charCodeAt(i);
    if (code >= 0x3000 && code <= 0x303f) w += 2; // CJK punct, fullwidth space
    else if (code >= 0x3040 && code <= 0x309f) w += 2; // Hiragana
    else if (code >= 0x3130 && code <= 0x318f) w += 2; // Hangul Compatibility Jamo (e.g. ㅅ)
    else if (code >= 0x30a0 && code <= 0x30ff) w += 2; // Katakana
    else if (code >= 0x4e00 && code <= 0x9fff) w += 2; // CJK unified
    else if (code >= 0xff00 && code <= 0xffef) w += 2; // Fullwidth forms
    else w += 1;
  }
  return w;
}

/** Pad a line to target display width (for aligned columns in terminal). */
export function padToDisplayWidth(line: string, width: number): string {
  const need = Math.max(0, width - displayWidth(line));
  return line + " ".repeat(need);
}

/** Terminal width for box and layout sizing. Respects viewport; use for capping box width. */
export function getTerminalWidth(margin = 2): number {
  const cols = typeof process.stdout?.columns === "number" ? process.stdout.columns : 80;
  return Math.max(20, cols - margin);
}

/** Box-drawing: single-line panel around content. Content is an array of lines; width is max visible length + padding, capped to terminal. */
export function panel(lines: string[], options: { title?: string; padding?: number; width?: number } = {}): string {
  const pad = options.padding ?? 2;
  const title = options.title ?? "";
  const rawContentWidth = options.width ?? Math.max(visibleLength(title), ...lines.map((l) => visibleLength(l)), 44);
  const contentWidth = Math.min(rawContentWidth, getTerminalWidth(2 * pad));
  const w = contentWidth + pad * 2;
  const top = "┌" + "─".repeat(w - 2) + "┐";
  const bottom = "└" + "─".repeat(w - 2) + "┘";
  const border = (s: string) => (colorEnabled() ? accent(s) : s);
  const out: string[] = [border(top)];
  if (title) {
    const titleLen = visibleLength(title);
    const titleLine = "│" + " ".repeat(pad) + title + " ".repeat(w - pad * 2 - titleLen) + "│";
    out.push(border(titleLine));
    out.push(border("├" + "─".repeat(w - 2) + "┤"));
  }
  const maxContent = contentWidth;
  // eslint-disable-next-line no-control-regex
  const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");
  for (const line of lines) {
    let outLine = line;
    if (visibleLength(line) > maxContent) {
      const plain = stripAnsi(line);
      outLine = plain.slice(0, maxContent - 1) + "…";
    }
    const len = visibleLength(outLine);
    const padded = outLine + " ".repeat(Math.max(0, contentWidth - len));
    out.push("│" + " ".repeat(pad) + padded + " ".repeat(pad) + "│");
  }
  out.push(border(bottom));
  return out.join("\n");
}

/** Pad a line to width (for side-by-side columns). */
export function padLine(line: string, width: number): string {
  return line + " ".repeat(Math.max(0, width - line.length));
}

const ANSI_FG_BLACK = "\u001b[30m";
const ANSI_RESET = "\u001b[0m";

/** Black foreground (e.g. for borders and panel title). */
export function black(text: string): string {
  return colorEnabled() ? `${ANSI_FG_BLACK}${text}${ANSI_RESET}` : text;
}

/** Rounded box-drawing chars (Claude Code-style). */
const BOX_ROUND = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
} as const;

/** Border color for boxes; each box type can use a distinct color. */
export type BoxBorderColor = "black" | "accent" | "cyan" | "green" | "yellow";

function boxBorderStyle(color: BoxBorderColor): (s: string) => string {
  if (!colorEnabled()) return (s) => s;
  const codes: Record<BoxBorderColor, string> = {
    black: ANSI_FG_BLACK,
    accent: ANSI.accent,
    cyan: ANSI.cyan,
    green: ANSI.green,
    yellow: ANSI.yellow,
  };
  const code = codes[color];
  return (s: string) => (code ? `${code}${s}${ANSI.reset}` : s);
}

/**
 * Compute the inner width a box would have (for aligning multiple boxes to the same width).
 */
export function computeBoxInnerWidth(
  lines: string[],
  options: { title?: string; padding?: number; minWidth?: number } = {}
): number {
  const pad = Math.max(0, options.padding ?? 0);
  const minWidth = Math.max(0, options.minWidth ?? 0);
  const rawContentWidth = Math.max(0, ...lines.map((l) => displayWidth(l)));
  const contentWidth = rawContentWidth + 2 * pad;
  const title = options.title ?? "";
  const titleLen = title ? visibleLength(title) : 0;
  return Math.max(contentWidth, titleLen + 2, minWidth + 2 * pad);
}

/**
 * Draw a closed box with side lines and rounded corners. Optional title is
 * placed inside the top border (e.g. " Neotoma v0.2.15 ").
 * Use borderColor to give each box a distinct color; default is black when
 * borderBlack is true, otherwise accent.
 * Use minWidth (or sessionBoxWidth) so all session boxes share the same width.
 */
export function blackBox(
  lines: string[],
  options: {
    title?: string;
    borderBlack?: boolean;
    /** Distinct color for this box (intro, MCP status, watch, etc.). */
    borderColor?: BoxBorderColor;
    padding?: number;
    minWidth?: number;
    /** When set, box inner width is exactly this (overrides minWidth for alignment). */
    sessionBoxWidth?: number;
  } = {}
): string {
  const pad = Math.max(0, options.padding ?? 0);
  const title = options.title ?? "";
  const titleLen = title ? visibleLength(title) : 0;
  const rawContentWidth = Math.max(0, ...lines.map((l) => displayWidth(l)));
  const contentWidth = rawContentWidth + 2 * pad;
  const innerWidth =
    options.sessionBoxWidth != null
      ? options.sessionBoxWidth
      : Math.max(
          contentWidth,
          titleLen + 2,
          (options.minWidth ?? 0) + 2 * pad
        );
  const color: BoxBorderColor =
    options.borderColor ??
    (options.borderBlack ? "black" : "accent");
  const borderStyle = boxBorderStyle(color);

  const maxWidth = getTerminalWidth();
  const cappedInnerWidth = Math.min(innerWidth, maxWidth);

  const padLeft = " ".repeat(pad);
  const out: string[] = [];

  // Top border with title on the left
  if (title) {
    const rightDashes = Math.max(0, cappedInnerWidth - titleLen);
    const topLine =
      BOX_ROUND.topLeft +
      title +
      BOX_ROUND.horizontal.repeat(rightDashes) +
      BOX_ROUND.topRight;
    out.push(borderStyle(topLine));
  } else {
    const topLine =
      BOX_ROUND.topLeft +
      BOX_ROUND.horizontal.repeat(cappedInnerWidth) +
      BOX_ROUND.topRight;
    out.push(borderStyle(topLine));
  }

  // Content lines with side borders and padding (use displayWidth so right border aligns)
  const maxContentWidth = cappedInnerWidth - pad;
  // eslint-disable-next-line no-control-regex
  const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");
  for (const line of lines) {
    let outLine = line;
    if (displayWidth(line) > maxContentWidth) {
      const plain = stripAnsi(line);
      let len = plain.length;
      while (len > 0 && displayWidth(plain.slice(0, len) + "…") > maxContentWidth) len--;
      outLine = (plain.slice(0, len) || plain.slice(0, 1)) + "…";
    }
    const len = displayWidth(outLine);
    const padded = padLeft + outLine + " ".repeat(Math.max(0, cappedInnerWidth - pad - len));
    out.push(borderStyle(BOX_ROUND.vertical) + padded + borderStyle(BOX_ROUND.vertical));
  }

  // Bottom border
  const bottomLine =
    BOX_ROUND.bottomLeft +
    BOX_ROUND.horizontal.repeat(cappedInnerWidth) +
    BOX_ROUND.bottomRight;
  out.push(borderStyle(bottomLine));

  return out.join("\n");
}

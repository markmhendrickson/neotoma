/**
 * Animated pack rat for CLI: Unicode density art + 24-bit ANSI truecolor.
 * Entirely regenerated with a clearer silhouette (ears, eyes, nose, body, tail).
 */

const ESC = "\u001b";

const ANSI = {
  reset: `${ESC}[0m`,
  brown: `${ESC}[38;2;120;80;50m`,
  lightBrown: `${ESC}[38;2;160;110;70m`,
  white: `${ESC}[38;2;255;255;255m`,
  black: `${ESC}[38;2;0;0;0m`,
  hideCursor: `${ESC}[?25l`,
  showCursor: `${ESC}[?25h`,
  clearLine: `${ESC}[2K\r`,
  up: (n: number) => `${ESC}[${n}A`,
} as const;

function useColor(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") return false;
  return Boolean(process.stdout?.isTTY);
}

function c(raw: string, code: string, colorize: boolean): string {
  return colorize ? code + raw + ANSI.reset : raw;
}

/**
 * Side-profile variant #5 (20-line tall, photo-inspired):
 * - Larger ear and eye, pointed snout, round haunch.
 * - Pale underside and small feet, plus thin tail flick.
 * - Blink + breathing belly + tail motion.
 */
function buildFrame(frameIndex: number, colorize: boolean): string[] {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const B = (s: string) => c(s, ANSI.brown, colorize); // Brown color for pack rat
  const L = (s: string) => c(s, ANSI.lightBrown, colorize);
  const W = (s: string) => c(s, ANSI.white, colorize);
  const K = (s: string) => c(s, ANSI.black, colorize);

  const eye = frameIndex === 2 ? L("◔") : W("●");
  const tailRaw = frameIndex === 0 ? "╌╌╌" : frameIndex === 1 ? "╌╌╌╌" : "╌╌";
  const tail = L(tailRaw.padEnd(4, " "));
  const belly = frameIndex === 1 ? "▒▒▒▒▒▒" : "▒▒▒▒▒";
  const feet = frameIndex === 1 ? W("▁▁ ▁▁") : W("▁▁  ▁▁");

  const lines: string[] = [
    "",
    "",
    "            " + L("░▒▓▓▓▓▒░"),
    "          " + L("░▒▓████▓▒░"),
    "        " + L("░▒▓██") + W("◜◝") + L("███▓▒░"),
    "      " + L("░▒▓███") + eye + L("████▓▒░"),
    "    " + L("░▒▓████████████▓▒░") + K("•"),
    "   " + L("░▒▓██████████████▓▒░"),
    "   " + L("░▒▓██████████████▓▒░"),
    "   " + L("░▒▓██████████████▓▒░"),
    "    " + L("░▒▓████████████▓▒░"),
    "      " + L("░▒▓██") + W(belly) + L("██▓▒░") + " " + tail,
    "       " + L("░▒▓██████████▓▒░") + " " + tail,
    "         " + L("░▒▓██████▓▒░"),
    "           " + L("░▒▓██▓▒░"),
    "            " + feet,
    "",
    "",
  ];

  while (lines.length < 20) {
    lines.push("");
  }
  return lines.slice(0, 20);
}

function buildFrames(colorize: boolean): string[][] {
  return [buildFrame(0, colorize), buildFrame(1, colorize), buildFrame(2, colorize)];
}

const FRAME_LINES = 20;
let hasDrawnFrame = false;

function writeFrame(lines: string[]): void {
  if (hasDrawnFrame) {
    process.stdout.write(ANSI.up(FRAME_LINES));
  }
  for (const line of lines) {
    process.stdout.write(ANSI.clearLine);
    process.stdout.write(line);
    process.stdout.write("\n");
  }
  hasDrawnFrame = true;
}

export function runAnimated(options: { frameMs?: number; cycles?: number } = {}): void {
  const frameMs = options.frameMs ?? 350;
  const cycles = options.cycles ?? 0;
  const colorize = useColor();
  const frames = buildFrames(colorize);

  process.stdout.write(ANSI.hideCursor);

  const cleanup = (): void => {
    process.stdout.write(ANSI.showCursor);
    process.stdout.write("\n");
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  let count = 0;
  const tick = (): void => {
    const idx = count % frames.length;
    writeFrame(frames[idx] ?? frames[0]);
    count += 1;
    if (cycles > 0 && count >= cycles * frames.length) {
      cleanup();
      process.exit(0);
      return;
    }
    setTimeout(tick, frameMs);
  };

  tick();
}

export function printStatic(): void {
  const colorize = useColor();
  const frame = buildFrame(0, colorize);
  for (const line of frame) {
    process.stdout.write(line + "\n");
  }
}

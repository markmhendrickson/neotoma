import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Relative to Neotoma package root (npm package or source checkout). */
export const MCP_INSTRUCTIONS_DOC_SEGMENTS = [
  "docs",
  "developer",
  "mcp",
  "instructions.md",
] as const;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Directory containing `package.json` for the running `neotoma` build (dist/ or source),
 * not the consumer workspace cwd. Use this so bundled docs resolve when CLI runs from another repo.
 */
export function resolveNeotomaPackageRoot(): string {
  if (__dirname.endsWith("/dist") || __dirname.includes("/dist/")) {
    return join(__dirname, "..");
  }
  if (__dirname.endsWith("/src") || __dirname.includes("/src/")) {
    return join(__dirname, "..");
  }
  return join(__dirname, "..");
}

export function mcpInstructionsPath(packageRoot: string): string {
  return join(packageRoot, ...MCP_INSTRUCTIONS_DOC_SEGMENTS);
}

export function extractFirstFencedCodeBlock(markdown: string): string | null {
  const match = markdown.match(/```\s*\n?([\s\S]*?)```/);
  if (!match?.[1]) return null;
  const text = match[1].trim();
  return text || null;
}

export function readMcpInstructionsMarkdown(packageRoot: string): string | null {
  try {
    return readFileSync(mcpInstructionsPath(packageRoot), "utf-8");
  } catch {
    return null;
  }
}

/**
 * Compose the global client instructions with this instance's declared data
 * policy (#1974).
 *
 * Every surface that serves instructions — the MCP handshake, the
 * `/mcp-interaction-instructions` endpoint, and `neotoma instructions print` —
 * MUST call this one function rather than concatenating the two parts itself.
 * Parity between the surfaces is then structural: a surface either calls this
 * and gets the policy, or it does not appear in the served output at all.
 * Three of those surfaces already drifted on fence-extraction and compact-mode
 * handling before this feature existed, which is exactly why composition is
 * centralized here instead of being repeated per surface.
 *
 * Global instructions describe the protocol ("how to use this server");
 * the appended section describes this instance's data domain ("what this server
 * is for"), delimited so a cooperating agent can tell them apart.
 *
 * `policySection` empty or absent returns the global instructions byte-for-byte
 * unchanged, so an instance with no policy serves exactly what it served before
 * this feature shipped.
 */
export function composeClientInstructions(
  globalInstructions: string,
  policySection: string | null | undefined
): string {
  if (!policySection || policySection.trim().length === 0) return globalInstructions;
  return `${globalInstructions}\n\n${policySection.trim()}\n`;
}

/**
 * Place a must-follow section AHEAD of the composed instructions.
 *
 * {@link composeClientInstructions} appends, which suits descriptive sections.
 * It does not suit operator-set rules: the default global block is well over
 * 100KB, and MCP clients truncate long `instructions`, so anything appended
 * after it is the first thing a client cuts. A rule the client never shows the
 * model has not been delivered (#2187).
 *
 * Empty or absent `section` returns `instructions` byte-for-byte unchanged.
 */
export function prependClientInstructionsSection(
  instructions: string,
  section: string | null | undefined
): string {
  if (!section || section.trim().length === 0) return instructions;
  return `${section.trim()}\n\n${instructions}`;
}

/** The sections one instructions text is built from. Absent or empty parts are skipped. */
export interface InstructionsParts {
  /** The global instructions (the fenced block of the instruction doc). */
  base: string;
  /** Bounded `[SESSION INDEX]` of rule titles and skill names. */
  indexSection?: string | null;
  /** `[STANDING RULES]` block, its unavailable notice, or the after-authentication line. */
  standingRulesSection?: string | null;
  /** `[INSTANCE SKILLS]` catalog or its unavailable notice. */
  skillsSection?: string | null;
  /** This instance's declared data policy (#1974). */
  policySection?: string | null;
}

/**
 * The ONE composer every instructions entrance uses: session `initialize`,
 * stateless `server/discover`, GET /mcp-interaction-instructions and
 * `neotoma instructions print`. Order, most important first, because clients
 * truncate long instructions from the end:
 *
 *   index, standing rules, instance skills, base block, policy.
 *
 * The policy stays appended after the base block, where it was before the
 * index existed, so an instance with no rules and no skills serves byte-for-byte
 * the text it served before. Each empty part is a no-op.
 */
export function composeInstructions(parts: InstructionsParts): string {
  let out = composeClientInstructions(parts.base, parts.policySection);
  out = prependClientInstructionsSection(out, parts.skillsSection);
  out = prependClientInstructionsSection(out, parts.standingRulesSection);
  return prependClientInstructionsSection(out, parts.indexSection);
}

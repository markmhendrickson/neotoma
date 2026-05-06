import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Relative to Neotoma package root (npm package or source checkout). */
export const MCP_INSTRUCTIONS_DOC_SEGMENTS = ["docs", "developer", "mcp", "instructions.md"] as const;

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

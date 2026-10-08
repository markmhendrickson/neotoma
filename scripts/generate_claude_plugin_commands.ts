/**
 * Regenerate packages/claude-code-plugin/commands/*.md from the MCP prompts in
 * src/mcp_prompts.ts, so the plugin commands and the server prompts never
 * drift. `--check` exits 1 when a committed file differs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { NEOTOMA_MCP_PROMPTS, renderPluginCommandMarkdown } from "../src/mcp_prompts.js";

const dir = join(process.cwd(), "packages", "claude-code-plugin", "commands");
const check = process.argv.includes("--check");
let stale = 0;
for (const prompt of NEOTOMA_MCP_PROMPTS) {
  const path = join(dir, `${prompt.name}.md`);
  const next = renderPluginCommandMarkdown(prompt);
  let current = "";
  try {
    current = readFileSync(path, "utf-8");
  } catch {
    current = "";
  }
  if (current === next) continue;
  if (check) {
    stale += 1;
    process.stderr.write(`stale: ${path}\n`);
  } else {
    writeFileSync(path, next);
    process.stdout.write(`wrote ${path}\n`);
  }
}
if (check && stale > 0) {
  process.stderr.write("Run: npx tsx scripts/generate_claude_plugin_commands.ts\n");
  process.exit(1);
}

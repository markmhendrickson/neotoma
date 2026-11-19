import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { extractFirstFencedCodeBlock } from "../../src/mcp_instruction_doc.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("backup restore agent-instruction coherence", () => {
  it("delivers the canonical restore-safety section in the MCP instruction body", () => {
    const raw = readFileSync(join(repoRoot, "docs", "developer", "mcp", "instructions.md"), "utf8");
    const body = extractFirstFencedCodeBlock(raw);
    expect(body).toContain("[BACKUP RESTORE SAFETY]");
    expect(body).toContain("stop Neotoma and every SQLite client");
    expect(body).toContain("does not make online restore safe");
    expect(body).toContain("previous-target");
    expect(body).toContain("not crash-wide atomicity");
  });

  it("keeps the CLI harness as a pointer to the canonical section", () => {
    const cli = readFileSync(
      join(repoRoot, "docs", "developer", "cli_agent_instructions.md"),
      "utf8"
    );
    expect(cli).toContain("[BACKUP RESTORE SAFETY]");
    expect(cli).toContain("transport-layer pointer only");
    expect(cli).toContain("neotoma instructions print");
    expect(cli).not.toContain("previous-target");
  });
});

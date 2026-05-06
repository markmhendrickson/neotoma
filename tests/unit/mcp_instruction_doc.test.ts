import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  extractFirstFencedCodeBlock,
  mcpInstructionsPath,
  readMcpInstructionsMarkdown,
  resolveNeotomaPackageRoot,
} from "../../src/mcp_instruction_doc.js";

describe("mcp_instruction_doc", () => {
  it("extracts the first fenced block from instructions.md", () => {
    const root = resolveNeotomaPackageRoot();
    const raw = readMcpInstructionsMarkdown(root);
    expect(raw).toBeTruthy();
    const body = extractFirstFencedCodeBlock(raw!);
    expect(body).toBeTruthy();
    expect(body).toMatch(/\[TURN LIFECYCLE\]/);
    expect(body).toMatch(/store_structured/);
  });

  it("instructions path is under docs/developer/mcp", () => {
    const p = mcpInstructionsPath(resolveNeotomaPackageRoot());
    expect(p).toMatch(/instructions\.md$/);
    expect(readFileSync(p, "utf-8")).toContain("```");
  });

  it("joins package root with doc segments", () => {
    const p = mcpInstructionsPath(resolveNeotomaPackageRoot());
    expect(p.replace(/\\/g, "/")).toMatch(/docs\/developer\/mcp\/instructions\.md$/);
  });
});

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

  it("instructs agents to avoid heuristic conversation title merges", () => {
    const root = resolveNeotomaPackageRoot();
    const raw = readMcpInstructionsMarkdown(root);
    const body = extractFirstFencedCodeBlock(raw!);
    expect(body).toContain('conversation_id: "<stable conversation id>"');
    expect(body).toMatch(/target_id.*existing conversation/i);
    expect(body).toMatch(/heuristic title\/name matching/i);
  });

  it("requires provenance for agent-initiated file reads, not just user-attached files", () => {
    const root = resolveNeotomaPackageRoot();
    const raw = readMcpInstructionsMarkdown(root);
    const body = extractFirstFencedCodeBlock(raw!);
    expect(body).toMatch(/Agent-initiated file reads/);
    expect(body).toMatch(/the persistence obligation is identical to a user-attached file/);
    expect(body).toMatch(
      /FORBIDDEN: storing entities with a `source_file`\/`source_document`-style field when no corresponding file asset was stored/
    );
    expect(body).toMatch(/synthesizing, re-generating, or re-typing a replacement asset.*FORBIDDEN/);
  });

  it("includes the dangling source-file citation self-audit check", () => {
    const root = resolveNeotomaPackageRoot();
    const raw = readMcpInstructionsMarkdown(root);
    const body = extractFirstFencedCodeBlock(raw!);
    expect(body).toMatch(/Dangling source-file citation check/);
    expect(body).toMatch(/retrieve_field_provenance.*list_relationships.*EMBEDS/);
    expect(body).toMatch(/One shared file asset satisfies the check for multiple entities/);
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

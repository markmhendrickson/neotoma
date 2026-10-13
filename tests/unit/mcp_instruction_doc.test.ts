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
      /Otherwise FORBIDDEN: storing entities with a `source_file`\/`source_document`-style field when no corresponding file asset was stored/
    );
    expect(body).toMatch(
      /synthesizing, re-generating, or re-typing a replacement asset.*FORBIDDEN/
    );
  });

  it("never persists the bytes of secret-bearing files read by the agent", () => {
    const root = resolveNeotomaPackageRoot();
    const raw = readMcpInstructionsMarkdown(root);
    const body = extractFirstFencedCodeBlock(raw!);
    const clause = body!.split("\n").find((l) => l.startsWith("Agent-initiated file reads:"));
    expect(clause, "Agent-initiated file reads clause must exist").toBeTruthy();
    // The exemption must sit inside the clause and BEFORE its FORBIDDEN sentence,
    // so the sentence reads as excepting secret-bearing files rather than
    // requiring their upload.
    const exception = clause!.search(
      /secret-bearing files \(private keys, `\.env`-style config, token\/credential files\): NEVER persist their bytes/
    );
    const forbidden = clause!.search(/Otherwise FORBIDDEN: storing entities with a `source_file`/);
    expect(exception).toBeGreaterThan(-1);
    expect(forbidden).toBeGreaterThan(exception);
    expect(clause).toMatch(
      /redacted derived record \(names or shape, never values\) and flag the provenance gap/
    );
    // The pointer from user-attached retention is scoped to files the agent
    // extracts entities from, not every file it merely opens.
    expect(body).toMatch(
      /The same applies to files you open yourself and extract entities from — see "Agent-initiated file reads"/
    );
  });

  it("includes the dangling source-file citation self-audit check", () => {
    const root = resolveNeotomaPackageRoot();
    const raw = readMcpInstructionsMarkdown(root);
    const body = extractFirstFencedCodeBlock(raw!);
    expect(body).toMatch(/Dangling source-file citation check/);
    expect(body).toMatch(/retrieve_field_provenance.*list_relationships.*EMBEDS/);
    expect(body).toMatch(/One shared file asset satisfies the check for multiple entities/);
    // The self-audit must not push an agent to "repair" a secret-bearing source
    // by uploading it.
    const check = body!
      .split("\n")
      .find((l) => l.startsWith("Dangling source-file citation check"));
    expect(check).toMatch(
      /Exempt: secret-bearing files — their flagged gap is final; never repair it by uploading/
    );
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

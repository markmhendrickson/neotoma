/**
 * Relationship-write grant tightening contract (#2524 / PR #2525).
 *
 * Grants written before relationship_types existed remain parseable, but they
 * must not authorize edge writes. The fixture pins both the authorization seam
 * and its structured migration hint. The instruction assertions keep that
 * requirement reachable through both MCP-delivered and CLI-installed guidance.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  AgentCapabilityError,
  enforceAgentRelationshipCapability,
  type AgentCapabilityContext,
  type AgentCapabilityEntry,
} from "../../src/services/agent_capabilities.js";
import { extractFirstFencedCodeBlock } from "../../src/mcp_instruction_doc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");

interface FixtureCase {
  name: string;
  capability: AgentCapabilityEntry;
}

interface ContractFixture {
  attempt: {
    relationship_type: string;
    endpoint_entity_types: string[];
  };
  cases: FixtureCase[];
  expected_denial: {
    code: string;
    op: string;
    hint_matches: string[];
  };
}

const fixture = JSON.parse(
  readFileSync(
    join(
      REPO_ROOT,
      "tests",
      "contract",
      "fixtures",
      "legacy_relationship_grant_without_scope.json"
    ),
    "utf8"
  )
) as ContractFixture;

function admittedContext(capability: AgentCapabilityEntry): AgentCapabilityContext {
  return {
    sub: "contract-agent@example.invalid",
    tier: "software",
    capabilities: [capability],
    agentLabel: "legacy relationship grant",
    admitted: true,
    ceiling: { kind: "grant", capabilities: [capability] },
  };
}

describe("legacy relationship-write grant contract", () => {
  it.each(fixture.cases)("rejects $name with a structured migration hint", ({ capability }) => {
    let denial: AgentCapabilityError | undefined;
    try {
      enforceAgentRelationshipCapability(
        fixture.attempt.relationship_type,
        fixture.attempt.endpoint_entity_types,
        admittedContext(capability)
      );
    } catch (error) {
      denial = error as AgentCapabilityError;
    }

    expect(denial).toBeInstanceOf(AgentCapabilityError);
    const envelope = denial!.toErrorEnvelope();
    expect(envelope.code).toBe(fixture.expected_denial.code);
    expect(envelope.op).toBe(fixture.expected_denial.op);
    for (const text of fixture.expected_denial.hint_matches) {
      expect(envelope.hint).toContain(text);
    }
  });

  it("ships the full grant rule through MCP instructions", () => {
    const raw = readFileSync(
      join(REPO_ROOT, "docs", "developer", "mcp", "instructions.md"),
      "utf8"
    );
    const instructions = extractFirstFencedCodeBlock(raw);
    expect(instructions).not.toBeNull();
    expect(instructions).toContain("Absent or empty `relationship_types` denies edge writes");
    expect(instructions).toMatch(
      /same `create_relationship` capability entry[\s\S]{0,300}both endpoint entity types[\s\S]{0,200}relationship type/
    );
  });

  it("ships the same grant requirements through CLI-installed guidance", () => {
    const cli = readFileSync(
      join(REPO_ROOT, "docs", "developer", "cli_agent_instructions.md"),
      "utf8"
    );
    expect(cli).toContain("Missing or empty `relationship_types` denies edge writes");
    expect(cli).toMatch(
      /one `create_relationship` capability entry[\s\S]{0,300}both endpoint entity types[\s\S]{0,200}relationship type/
    );
  });
});

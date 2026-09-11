/**
 * Unit tests for the `NEOTOMA_MCP_INSTRUCTION_*` settings (#2054).
 *
 * These govern which instruction-bearing entity types reach an agent at MCP
 * session start. They are parsed at module load time in `src/config.ts`, so
 * — following `config_db_backend.test.ts` — these tests exercise them via
 * fresh dynamic imports under different env values rather than calling a
 * function directly.
 *
 * The case that matters most here is *unset vs explicitly empty*: unset must
 * take the default set, while an explicit empty string must disable injection
 * for that class. Collapsing the two would make the documented disable switch
 * unreachable.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

async function importFreshConfig() {
  vi.resetModules();
  return import("../../src/config.ts");
}

async function stubBaseEnv(prefix: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const homeDir = path.join(root, "home");
  const projectRoot = path.join(root, "project");
  await fs.mkdir(homeDir, { recursive: true });
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ name: "neotoma", version: "0.0.0-test" }, null, 2)
  );
  vi.stubEnv("HOME", homeDir);
  vi.stubEnv("USERPROFILE", homeDir);
  vi.stubEnv("NEOTOMA_ENV", "development");
  vi.stubEnv("NEOTOMA_PROJECT_ROOT", projectRoot);
  vi.stubEnv("NEOTOMA_DATA_DIR", path.join(projectRoot, "data"));
}

describe("NEOTOMA_MCP_INSTRUCTION_* config (#2054)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("NEOTOMA_MCP_INSTRUCTION_ENTITY_TYPES", () => {
    it("defaults to standing_rule,agent_policy when unset", async () => {
      await stubBaseEnv("neotoma-mcp-types-default-");
      const { config } = await importFreshConfig();
      expect(config.mcp.instructionEntityTypes).toEqual(["standing_rule", "agent_policy"]);
    });

    it("parses a comma-separated list, trimming whitespace", async () => {
      await stubBaseEnv("neotoma-mcp-types-csv-");
      vi.stubEnv(
        "NEOTOMA_MCP_INSTRUCTION_ENTITY_TYPES",
        " standing_rule , agent_policy , conformance_policy "
      );
      const { config } = await importFreshConfig();
      expect(config.mcp.instructionEntityTypes).toEqual([
        "standing_rule",
        "agent_policy",
        "conformance_policy",
      ]);
    });

    // The documented escape hatch: an operator can turn injection off without
    // a rollback. This only works if "" is distinguished from unset.
    it("treats an explicit empty string as disabled, not as the default", async () => {
      await stubBaseEnv("neotoma-mcp-types-empty-");
      vi.stubEnv("NEOTOMA_MCP_INSTRUCTION_ENTITY_TYPES", "");
      const { config } = await importFreshConfig();
      expect(config.mcp.instructionEntityTypes).toEqual([]);
    });

    it("drops empty segments and de-duplicates", async () => {
      await stubBaseEnv("neotoma-mcp-types-dedupe-");
      vi.stubEnv("NEOTOMA_MCP_INSTRUCTION_ENTITY_TYPES", "standing_rule,,standing_rule, ,");
      const { config } = await importFreshConfig();
      expect(config.mcp.instructionEntityTypes).toEqual(["standing_rule"]);
    });
  });

  describe("NEOTOMA_MCP_INSTRUCTION_SCOPES", () => {
    it("defaults to global,swarm when unset", async () => {
      await stubBaseEnv("neotoma-mcp-scopes-default-");
      const { config } = await importFreshConfig();
      expect(config.mcp.instructionScopes).toEqual(["global", "swarm"]);
    });

    it("treats an explicit empty string as disabled", async () => {
      await stubBaseEnv("neotoma-mcp-scopes-empty-");
      vi.stubEnv("NEOTOMA_MCP_INSTRUCTION_SCOPES", "");
      const { config } = await importFreshConfig();
      expect(config.mcp.instructionScopes).toEqual([]);
    });

    it("parses a custom scope list", async () => {
      await stubBaseEnv("neotoma-mcp-scopes-custom-");
      vi.stubEnv("NEOTOMA_MCP_INSTRUCTION_SCOPES", "global");
      const { config } = await importFreshConfig();
      expect(config.mcp.instructionScopes).toEqual(["global"]);
    });
  });

  describe("NEOTOMA_MCP_INSTRUCTION_MAX_ENTITIES", () => {
    it("defaults to 50 when unset", async () => {
      await stubBaseEnv("neotoma-mcp-max-default-");
      const { config } = await importFreshConfig();
      expect(config.mcp.instructionMaxEntities).toBe(50);
    });

    it("parses a valid integer", async () => {
      await stubBaseEnv("neotoma-mcp-max-valid-");
      vi.stubEnv("NEOTOMA_MCP_INSTRUCTION_MAX_ENTITIES", "10");
      const { config } = await importFreshConfig();
      expect(config.mcp.instructionMaxEntities).toBe(10);
    });

    it("accepts 0, disabling injection by cap", async () => {
      await stubBaseEnv("neotoma-mcp-max-zero-");
      vi.stubEnv("NEOTOMA_MCP_INSTRUCTION_MAX_ENTITIES", "0");
      const { config } = await importFreshConfig();
      expect(config.mcp.instructionMaxEntities).toBe(0);
    });

    // Fails soft rather than throwing: this value governs the MCP session
    // start path, and an operator typo must not break every `initialize`.
    it("falls back to 50 on a non-numeric value", async () => {
      await stubBaseEnv("neotoma-mcp-max-nan-");
      vi.stubEnv("NEOTOMA_MCP_INSTRUCTION_MAX_ENTITIES", "not-a-number");
      const { config } = await importFreshConfig();
      expect(config.mcp.instructionMaxEntities).toBe(50);
    });

    it("falls back to 50 on a negative value", async () => {
      await stubBaseEnv("neotoma-mcp-max-negative-");
      vi.stubEnv("NEOTOMA_MCP_INSTRUCTION_MAX_ENTITIES", "-1");
      const { config } = await importFreshConfig();
      expect(config.mcp.instructionMaxEntities).toBe(50);
    });

    it("falls back to 50 on an empty value", async () => {
      await stubBaseEnv("neotoma-mcp-max-empty-");
      vi.stubEnv("NEOTOMA_MCP_INSTRUCTION_MAX_ENTITIES", "");
      const { config } = await importFreshConfig();
      expect(config.mcp.instructionMaxEntities).toBe(50);
    });

    it("floors a fractional value", async () => {
      await stubBaseEnv("neotoma-mcp-max-fraction-");
      vi.stubEnv("NEOTOMA_MCP_INSTRUCTION_MAX_ENTITIES", "7.9");
      const { config } = await importFreshConfig();
      expect(config.mcp.instructionMaxEntities).toBe(7);
    });
  });
});

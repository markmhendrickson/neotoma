import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const schemaRegistryMockState = vi.hoisted(() => ({
  schemas: new Map<string, {
    entity_type: string;
    metadata?: { guest_access_policy?: string };
  }>(),
}));

vi.mock("../../src/services/schema_registry.js", () => ({
  SchemaRegistryService: class {
    async listActiveSchemas() {
      return Array.from(schemaRegistryMockState.schemas.values());
    }

    async loadGlobalSchema(entityType: string) {
      return schemaRegistryMockState.schemas.get(entityType) ?? null;
    }

    async updateMetadata(
      entityType: string,
      patch: { guest_access_policy?: string },
    ) {
      const existing = schemaRegistryMockState.schemas.get(entityType);
      if (!existing) {
        throw new Error(`No active schema found for entity type "${entityType}"`);
      }
      schemaRegistryMockState.schemas.set(entityType, {
        ...existing,
        metadata: {
          ...(existing.metadata ?? {}),
          ...patch,
        },
      });
    }
  },
}));

describe("neotoma access CLI helpers", () => {
  const originalEnv = process.env;
  const testHome = path.join(os.tmpdir(), "neotoma-cli-access-test-" + Date.now());
  const configPath = path.join(testHome, ".config", "neotoma", "config.json");
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    process.env = { ...originalEnv, HOME: testHome };
    delete process.env.NEOTOMA_ACCESS_POLICY_ISSUE;
    schemaRegistryMockState.schemas.clear();
    schemaRegistryMockState.schemas.set("issue", {
      entity_type: "issue",
      metadata: { guest_access_policy: "submitter_scoped" },
    });
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify({}), "utf8");
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
  });

  afterEach(async () => {
    stdoutSpy.mockRestore();
    process.env = originalEnv;
    await fs.rm(testHome, { recursive: true, force: true });
  });

  it("reset clears deprecated config fallback and makes schema-backed issue policy closed", async () => {
    const { accessReset } = await import("../../src/cli/access.js");
    const { loadAccessPolicies, setAccessPolicy } = await import(
      "../../src/services/access_policy.js"
    );
    await setAccessPolicy("issue", "submitter_scoped");

    await accessReset("issue", { json: true });

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({
      entity_type: "issue",
      mode: "closed",
      status: "reset",
      effective_mode: "closed",
      effective_source: "schema_metadata",
    });
    await expect(loadAccessPolicies()).resolves.toEqual({});
  });

  it("reset reports a remaining env override instead of claiming effective closure", async () => {
    const { accessReset } = await import("../../src/cli/access.js");
    const { loadAccessPolicies, setAccessPolicy } = await import(
      "../../src/services/access_policy.js"
    );
    await setAccessPolicy("issue", "submitter_scoped");
    process.env.NEOTOMA_ACCESS_POLICY_ISSUE = "open";

    await accessReset("issue", { json: true });

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({
      entity_type: "issue",
      mode: "closed",
      status: "reset",
      effective_mode: "open",
      effective_source: "env",
    });
    await expect(loadAccessPolicies()).resolves.toEqual({ issue: "open" });
  });
});

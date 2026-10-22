/**
 * #2033 effect regression through the built CLI, not direct service calls.
 * The API mode uses the harness's synthetic SQLite database and loopback server;
 * offline mode owns a separate database. Children get a separate HOME, explicit
 * transport selection, and an allowlisted environment.
 * Only newly correction-sourced observations are covered. Historical unmarked
 * rows are deliberately outside this forward-only guarantee.
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
type Json = Record<string, any>;

describe.each([
  { transport: "offline", parentEnvironment: undefined },
  { transport: "http", parentEnvironment: undefined },
  { transport: "offline", parentEnvironment: "production" },
  { transport: "http", parentEnvironment: "production" },
])(
  "CLI correction durability (#2033), $transport / parent environment $parentEnvironment",
  ({ transport, parentEnvironment }) => {
    const entityType = `cli_durability_${randomUUID().replaceAll("-", "")}`;
    let home: string;
    let childEnv: NodeJS.ProcessEnv;
    let baseUrl: string;

    async function cli(...args: string[]): Promise<Json> {
      const { stdout } = await execFileAsync(
        process.execPath,
        [
          resolve("dist/cli/index.js"),
          "--env",
          "dev",
          ...(transport === "offline" ? ["--offline"] : ["--api-only", "--base-url", baseUrl]),
          ...args,
          "--json",
        ],
        { env: childEnv, timeout: 20_000, maxBuffer: 2 * 1024 * 1024 }
      );
      return JSON.parse(stdout);
    }

    async function store(fields: Json, targetId?: string, priority = 100): Promise<string> {
      const result = await cli(
        "store",
        "--entities",
        JSON.stringify([
          { entity_type: entityType, ...fields, ...(targetId ? { target_id: targetId } : {}) },
        ]),
        "--source-priority",
        String(priority),
        "--observation-source",
        "import",
        "--idempotency-key",
        randomUUID()
      );
      const id = result.entities?.[0]?.entity_id;
      expect(id).toMatch(/^ent_/);
      if (targetId) expect(id).toBe(targetId);
      return id;
    }

    async function correct(id: string, field: string, value: unknown): Promise<Json> {
      // Positional ID and inferred entity type are the natural CLI shape.
      return cli(
        "corrections",
        "create",
        id,
        "--field-name",
        field,
        "--corrected-value",
        JSON.stringify(value),
        "--idempotency-key",
        randomUUID()
      );
    }

    async function history(id: string): Promise<Json[]> {
      const result = await cli("observations", "list", "--entity-id", id);
      expect(Array.isArray(result.observations)).toBe(true);
      return result.observations;
    }

    beforeAll(async () => {
      expect(process.env.NODE_ENV).toBe("test");
      expect(process.env.NEOTOMA_DATA_DIR).toBeTruthy();
      expect(process.env.NEOTOMA_SESSION_DEV_PORT).toMatch(/^\d+$/);
      baseUrl = `http://127.0.0.1:${process.env.NEOTOMA_SESSION_DEV_PORT}`;
      home = await mkdtemp(join(tmpdir(), "cli-durability-"));
      childEnv = {
        HOME: home,
        USERPROFILE: home,
        NODE_ENV: "test",
        NEOTOMA_ENV: "development",
        OPENAI_API_KEY: "test-openai-key",
      };
      // Exercise absent and conflicting upstream selection without changing
      // the shared API server's environment. The fixture owns its child choice.
      const parentEnv: NodeJS.ProcessEnv = { ...process.env, NEOTOMA_ENV: parentEnvironment };
      // No inherited bearer/API credentials or operator CLI configuration. Keep
      // an externally installed network guard active in every child, when set.
      for (const key of [
        "PATH",
        "TMPDIR",
        "LANG",
        "NODE_OPTIONS",
        "NEOTOMA_DATA_DIR",
        "NEOTOMA_SQLITE_PATH",
        "NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR",
        "ICON_GENERATION_ENABLED",
        "TUNNEL_AUTO_DISCOVER",
        "SCHEMA_GATE_NETWORK_JOURNAL",
        "SCHEMA_GATE_IPC_ROOT",
      ]) {
        if (parentEnv[key] !== undefined) childEnv[key] = parentEnv[key];
      }
      expect(childEnv.NEOTOMA_ENV).toBe("development");
      if (transport === "offline") {
        childEnv.NEOTOMA_DATA_DIR = join(home, "data");
        childEnv.NEOTOMA_SQLITE_PATH = join(home, "data", "neotoma.db");
        childEnv.NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR = "1";
      }
      await cli(
        "schemas",
        "register",
        entityType,
        "--fields",
        JSON.stringify({
          name: { type: "string" },
          value: { type: "string" },
          revision: { type: "number" },
          priority_value: { type: "string", reducer_config: { strategy: "highest_priority" } },
          tags: { type: "array", reducer_config: { strategy: "merge_array" } },
        }),
        "--activate"
      );
    });

    afterAll(async () => {
      if (home) await rm(home, { recursive: true, force: true });
    });

    it("keeps correction B after a genuinely later ordinary A and preserves history/provenance", async () => {
      const id = await store({ name: `Synthetic record ${randomUUID()}`, value: "A", revision: 0 });
      expect((await cli("entities", "get", id)).snapshot.value).toBe("A");
      const correction = await correct(id, "value", "B");
      expect(correction.observation_id).toBeTruthy();
      expect((await cli("entities", "get", id)).snapshot.value).toBe("B");

      // Changed sibling prevents source/payload deduplication from giving false
      // durability evidence. The timestamp assertion proves real server order.
      await store({ value: "A", revision: 1 }, id, 999);
      const rows = await history(id);
      expect(rows).toHaveLength(3);
      const marked = rows.find((row) => row.id === correction.observation_id)!;
      const ordinary = rows.find((row) => row.fields.revision === 1)!;
      expect(marked).toMatchObject({
        observation_source: "correction",
        source_priority: 1000,
        source_id: null,
        fields: { value: "B" },
      });
      expect(ordinary).toMatchObject({
        observation_source: "import",
        source_priority: 999,
        fields: { value: "A", revision: 1 },
      });
      expect(Date.parse(ordinary.observed_at)).toBeGreaterThan(Date.parse(marked.observed_at));
      const after = await cli("entities", "get", id);
      expect(after.snapshot).toMatchObject({ value: "B", revision: 1 });
      expect(after.provenance.value).toBe(marked.id);
      expect(after.provenance.revision).toBe(ordinary.id);
      const evidence = await cli(
        "request",
        "--operation",
        "getFieldProvenance",
        "--body",
        JSON.stringify({ entity_id: id, field: "value" })
      );
      expect(evidence.observation_ids).toEqual([marked.id]);
      expect(evidence.observations).toEqual([
        expect.objectContaining({ id: marked.id, source_id: null, fields: { value: "B" } }),
      ]);

      const newerCorrection = await correct(id, "value", "C");
      expect((await cli("entities", "get", id)).snapshot.value).toBe("C");
      expect((await cli("entities", "get", id)).provenance.value).toBe(
        newerCorrection.observation_id
      );
    });

    it("keeps ordinary last_write numeric-priority semantics", async () => {
      const id = await store(
        { name: `Synthetic ordinary ${randomUUID()}`, value: "A", revision: 0 },
        undefined,
        900
      );
      await store({ value: "B", revision: 1 }, id, 1);
      const after = await cli("entities", "get", id);
      expect(after.snapshot).toMatchObject({ value: "B", revision: 1 });
      expect((await history(id)).every((row) => row.observation_source === "import")).toBe(true);
    });

    it("preserves configured highest_priority and merge_array correction behavior", async () => {
      const id = await store(
        {
          name: `Synthetic policy ${randomUUID()}`,
          priority_value: "high",
          tags: ["old"],
          revision: 0,
        },
        undefined,
        900
      );
      await store({ priority_value: "low", tags: ["lower"], revision: 1 }, id, 1);
      expect((await cli("entities", "get", id)).snapshot).toMatchObject({
        priority_value: "high",
        tags: ["old"],
        revision: 1,
      });
      await correct(id, "priority_value", "corrected");
      await correct(id, "tags", ["corrected"]);
      await store({ priority_value: "ordinary", tags: ["ordinary"], revision: 2 }, id, 999);
      expect((await cli("entities", "get", id)).snapshot).toMatchObject({
        priority_value: "corrected",
        tags: ["corrected"],
        revision: 2,
      });
    });

    it.each([
      ["--observation-source", "correction"],
      ["--source-priority", "1000"],
    ])("rejects reserved CLI store authority %s=%s without writing", async (flag, value) => {
      const id = await store({ name: `Synthetic guard ${randomUUID()}`, value: "A", revision: 0 });
      const before = await cli("entities", "get", id);
      const beforeRows = await history(id);
      let failure: { code?: unknown; stdout?: string; stderr?: string } | undefined;
      try {
        await cli(
          "store",
          "--entities",
          JSON.stringify([
            { entity_type: entityType, target_id: id, value: "spoof", revision: 99 },
          ]),
          flag,
          value,
          "--idempotency-key",
          randomUUID()
        );
      } catch (error) {
        failure = error as typeof failure;
      }
      expect(failure).toBeDefined();
      expect(failure?.code).not.toBe(0);
      const output = `${failure?.stdout ?? ""}${failure?.stderr ?? ""}`;
      expect(output).toContain("RESERVED_OBSERVATION_SOURCE");
      expect(output).toMatch(/correct\(/);
      expect(output).toContain("#2033");
      expect(await history(id)).toEqual(beforeRows);
      const after = await cli("entities", "get", id);
      expect(after.entity_version).toBe(before.entity_version);
      expect(after.snapshot).toEqual(before.snapshot);
    });
  }
);

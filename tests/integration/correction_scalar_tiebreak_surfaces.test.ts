import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { resolveOwnedObservations } from "../../src/services/attachment_resolution.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";

vi.mock("../../src/embeddings.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/embeddings.js")>();
  return {
    ...original,
    generateEmbedding: vi.fn().mockResolvedValue(null),
  };
});

const USER_ID = LOCAL_DEV_USER_ID;
const TYPE = "test_scalar_tiebreak_2394";
const execFileAsync = promisify(execFile);
const CLI_PATH = resolve("dist/cli/index.js");
let apiBase: string;

type McpTextResult = { content: Array<{ type?: string; text: string }> };

type TestServer = NeotomaServer & {
  authenticatedUserId?: string | null;
  store: (args: Record<string, unknown>) => Promise<McpTextResult>;
  correct: (args: Record<string, unknown>) => Promise<McpTextResult>;
  retrieveEntitySnapshot: (args: Record<string, unknown>) => Promise<McpTextResult>;
};

function parse(result: McpTextResult): Record<string, any> {
  return JSON.parse(result.content.find((c) => c.text)?.text ?? "{}");
}

async function snapshot(server: TestServer, entityId: string): Promise<Record<string, any>> {
  return parse(await server.retrieveEntitySnapshot({ entity_id: entityId, format: "json" }));
}

async function runCliJson(args: string[]): Promise<Record<string, any>> {
  const { stdout } = await execFileAsync(process.execPath, [
    CLI_PATH,
    "--json",
    "--api-only",
    "--base-url",
    apiBase,
    ...args,
  ]);
  return JSON.parse(stdout.trim());
}

async function createEntity(server: TestServer, label: string): Promise<string> {
  const stored = parse(
    await server.store({
      user_id: USER_ID,
      idempotency_key: `seed-2394-${label}-${randomUUID()}`,
      commit: true,
      entities: [
        {
          entity_type: TYPE,
          label,
          notes: "initial notes",
          description: "initial description",
        },
      ],
    })
  );
  const entityId = stored.entities?.[0]?.entity_id;
  expect(typeof entityId).toBe("string");
  return entityId;
}

async function cleanupType(): Promise<void> {
  const { data: entities } = await db
    .from("entities")
    .select("id")
    .eq("entity_type", TYPE)
    .eq("user_id", USER_ID);
  const entityIds = (entities ?? []).map((e: { id: string }) => e.id);
  if (entityIds.length > 0) {
    const { data: observations } = await db
      .from("observations")
      .select("source_id")
      .in("entity_id", entityIds);
    const sourceIds = Array.from(
      new Set(
        (observations ?? [])
          .map((r: { source_id?: string | null }) => r.source_id)
          .filter((v: unknown): v is string => typeof v === "string")
      )
    );
    await db.from("timeline_events").delete().in("entity_id", entityIds);
    await db.from("entity_snapshots").delete().in("entity_id", entityIds);
    await db.from("raw_fragments").delete().in("entity_id", entityIds);
    await db.from("observations").delete().in("entity_id", entityIds);
    await db.from("entities").delete().in("id", entityIds);
    if (sourceIds.length > 0) await db.from("sources").delete().in("id", sourceIds);
  }
  await db.from("schema_registry").delete().eq("entity_type", TYPE);
}

describe("same-tier scalar corrections update readable snapshots (#2394)", () => {
  let server: TestServer;
  let httpServer: ReturnType<typeof createServer>;

  beforeAll(async () => {
    await cleanupType();
    server = new NeotomaServer() as TestServer;
    server.authenticatedUserId = USER_ID;

    await schemaRegistry.register({
      entity_type: TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          label: { type: "string", required: true },
          notes: { type: "string", required: false, preserveCase: true },
          description: { type: "string", required: false, preserveCase: true },
        },
        canonical_name_fields: ["label"],
      },
      reducer_config: {
        merge_policies: {
          label: { strategy: "last_write" },
          notes: { strategy: "highest_priority", tie_breaker: "source_priority" },
          description: { strategy: "highest_priority", tie_breaker: "source_priority" },
        },
      },
      user_id: USER_ID,
      user_specific: true,
      activate: true,
      force: true,
    });

    httpServer = createServer(app);
    await new Promise<void>((resolveListen, reject) => {
      httpServer.listen(0, "127.0.0.1", () => resolveListen());
      httpServer.once("error", reject);
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("expected TCP listen address");
    apiBase = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await cleanupType();
  });

  it("MCP correct readback returns the second same-priority scalar correction", async () => {
    const entityId = await createEntity(server, `mcp-${randomUUID()}`);

    await server.correct({
      user_id: USER_ID,
      entity_id: entityId,
      entity_type: TYPE,
      field: "notes",
      value: "checkpoint one",
      idempotency_key: `mcp-one-${randomUUID()}`,
    });
    await server.correct({
      user_id: USER_ID,
      entity_id: entityId,
      entity_type: TYPE,
      field: "notes",
      value: "checkpoint two",
      idempotency_key: `mcp-two-${randomUUID()}`,
    });

    const snap = await snapshot(server, entityId);
    expect(snap.snapshot.notes).toBe("checkpoint two");
    expect(typeof snap.provenance.notes).toBe("string");
    expect(snap.provenance.notes).not.toHaveLength(0);
  });

  it("REST /correct readback returns the second same-priority scalar correction", async () => {
    const entityId = await createEntity(server, `http-correct-${randomUUID()}`);

    for (const value of ["description one", "description two"]) {
      const response = await fetch(`${apiBase}/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: USER_ID,
          entity_id: entityId,
          entity_type: TYPE,
          field: "description",
          value,
          idempotency_key: `http-correct-${value}-${randomUUID()}`,
        }),
      });
      expect(response.status).toBe(200);
    }

    const snap = await snapshot(server, entityId);
    expect(snap.snapshot.description).toBe("description two");
    expect(typeof snap.provenance.description).toBe("string");
    expect(snap.provenance.description).not.toHaveLength(0);
  });

  it("REST batch_correct readback returns the second same-priority scalar correction", async () => {
    const entityId = await createEntity(server, `batch-${randomUUID()}`);

    for (const value of ["batch one", "batch two"]) {
      const before = await snapshot(server, entityId);
      const response = await fetch(
        `${apiBase}/entities/${encodeURIComponent(entityId)}/batch_correct`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: USER_ID,
            expected_last_observation_at: before.last_observation_at,
            changes: [{ field: "notes", value }],
            idempotency_prefix: `batch-${value}-${randomUUID()}`,
          }),
        }
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        status?: string;
        snapshot?: Record<string, unknown>;
      };
      expect(body.status).toBe("applied");
      expect(body.snapshot?.notes).toBe(value);
    }

    const snap = await snapshot(server, entityId);
    expect(snap.snapshot.notes).toBe("batch two");
  });

  it("explicit type recomputation updates a pre-existing custom-schema snapshot", async () => {
    const entityId = await createEntity(server, `recompute-${randomUUID()}`);
    const candidateA = parse(
      await server.correct({
        user_id: USER_ID,
        entity_id: entityId,
        entity_type: TYPE,
        field: "notes",
        value: "recompute candidate a",
        idempotency_key: `recompute-a-${randomUUID()}`,
      })
    );
    const candidateB = parse(
      await server.correct({
        user_id: USER_ID,
        entity_id: entityId,
        entity_type: TYPE,
        field: "notes",
        value: "recompute candidate b",
        idempotency_key: `recompute-b-${randomUUID()}`,
      })
    );

    const current = await snapshot(server, entityId);
    const sharedObservedAt = "2026-01-01T00:00:00.000Z";
    const correctionIds = [candidateA.observation_id, candidateB.observation_id];
    const { error: observedAtError } = await db
      .from("observations")
      .update({ observed_at: sharedObservedAt })
      .in("id", correctionIds)
      .eq("user_id", USER_ID);
    expect(observedAtError).toBeNull();

    const reducerInput = await resolveOwnedObservations(entityId, USER_ID);
    expect(reducerInput).not.toBeNull();
    const reducerOrderedCorrections = (reducerInput ?? []).filter((observation) =>
      correctionIds.includes(observation.id)
    );
    expect(reducerOrderedCorrections).toHaveLength(2);
    const [staleObservation, desiredObservation] = reducerOrderedCorrections;
    const staleValue = staleObservation.fields.notes;
    const desiredValue = desiredObservation.fields.notes;

    for (const [observationId, createdAt] of [
      [staleObservation.id, "2026-01-01T00:00:01.000Z"],
      [desiredObservation.id, "2026-01-01T00:00:02.000Z"],
    ] as const) {
      const { error } = await db
        .from("observations")
        .update({ created_at: createdAt })
        .eq("id", observationId)
        .eq("user_id", USER_ID);
      expect(error).toBeNull();
    }

    const { error: staleSnapshotError } = await db
      .from("entity_snapshots")
      .update({
        snapshot: { ...current.snapshot, notes: staleValue },
        provenance: { ...current.provenance, notes: staleObservation.id },
      })
      .eq("entity_id", entityId)
      .eq("user_id", USER_ID);
    expect(staleSnapshotError).toBeNull();

    const staleSnapshot = await snapshot(server, entityId);
    expect(staleSnapshot.snapshot.notes).toBe(staleValue);
    expect(staleSnapshot.provenance.notes).toBe(staleObservation.id);

    const dryRunResponse = await fetch(`${apiBase}/recompute_snapshots_by_type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: TYPE, dry_run: true }),
    });
    expect(dryRunResponse.status).toBe(200);
    const dryRun = (await dryRunResponse.json()) as {
      dry_run?: boolean;
      entity_ids?: string[];
    };
    expect(dryRun.dry_run).toBe(true);
    expect(dryRun.entity_ids).toContain(entityId);

    const recomputeResponse = await fetch(`${apiBase}/recompute_snapshots_by_type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: TYPE }),
    });
    expect(recomputeResponse.status).toBe(200);
    const recompute = (await recomputeResponse.json()) as {
      recomputed?: number;
      errors?: number;
    };
    expect(recompute.errors).toBe(0);
    expect(recompute.recomputed).toBeGreaterThanOrEqual(1);

    const refreshed = await snapshot(server, entityId);
    expect(refreshed.snapshot.notes).toBe(desiredValue);
    expect(refreshed.provenance.notes).toBe(desiredObservation.id);
  });

  it("store still respects a legitimately higher-priority scalar source over a later normal correction", async () => {
    const label = `store-priority-${randomUUID()}`;
    const entityId = await createEntity(server, label);

    const stored = parse(
      await server.store({
        user_id: USER_ID,
        idempotency_key: `store-priority-${randomUUID()}`,
        commit: true,
        source_priority: 1500,
        entities: [
          {
            entity_type: TYPE,
            label,
            notes: "trusted store value",
          },
        ],
      })
    );
    expect(stored.entities?.[0]?.entity_id).toBe(entityId);

    await server.correct({
      user_id: USER_ID,
      entity_id: entityId,
      entity_type: TYPE,
      field: "notes",
      value: "later normal correction",
      idempotency_key: `normal-correction-${randomUUID()}`,
    });

    const snap = await snapshot(server, entityId);
    expect(snap.snapshot.notes).toBe("trusted store value");
  });

  it("CLI corrections create materializes the second same-priority scalar correction", async () => {
    const entityId = await createEntity(server, `cli-correct-${randomUUID()}`);

    for (const [index, value] of ["cli checkpoint one", "cli checkpoint two"].entries()) {
      const result = await runCliJson([
        "corrections",
        "create",
        entityId,
        "--entity-type",
        TYPE,
        "--field-name",
        "notes",
        "--corrected-value",
        value,
        "--user-id",
        USER_ID,
        "--idempotency-key",
        `cli-correct-${index}-${randomUUID()}`,
      ]);
      expect(result.entity_id).toBe(entityId);
      expect(typeof result.correction_id).toBe("string");
    }

    const snap = await snapshot(server, entityId);
    expect(snap.snapshot.notes).toBe("cli checkpoint two");
    expect(typeof snap.provenance.notes).toBe("string");
  });

  it("CLI edit materializes successive same-priority scalar corrections", async () => {
    const entityId = await createEntity(server, `cli-edit-${randomUUID()}`);
    const editorDir = await mkdtemp(join(tmpdir(), "neotoma-2394-editor-"));

    try {
      for (const [index, value] of ["edit checkpoint one", "edit checkpoint two"].entries()) {
        const editorPath = join(editorDir, `editor-${index}.mjs`);
        await writeFile(
          editorPath,
          [
            'import { readFileSync, writeFileSync } from "node:fs";',
            "const file = process.argv.at(-1);",
            'const input = readFileSync(file, "utf8");',
            `const output = input.replace(/^notes:.*$/m, ${JSON.stringify(`notes: ${value}`)});`,
            'if (output === input) throw new Error("notes field not found");',
            "writeFileSync(file, output);",
          ].join("\n")
        );

        const result = await runCliJson([
          "edit",
          entityId,
          "--user-id",
          USER_ID,
          "--editor",
          `${process.execPath} ${editorPath}`,
        ]);
        expect(result).toMatchObject({
          success: true,
          status: "applied",
          entity_id: entityId,
          fields_changed: ["notes"],
        });
      }

      const snap = await snapshot(server, entityId);
      expect(snap.snapshot.notes).toBe("edit checkpoint two");
      expect(typeof snap.provenance.notes).toBe("string");
    } finally {
      await rm(editorDir, { recursive: true, force: true });
    }
  });
});

/**
 * Data origin on store (#2242) — effect-verified, cross-surface.
 *
 * A caller can declare where stored data came from (`data_origin`) at request
 * level, with a per-entity override. Every assertion here reads the persisted
 * effect back through a read surface rather than trusting the store response
 * (task_policy fixed_means_behavior_verified_not_contract_accepted,
 * ent_db0b7855d47012084477fb00), and the same scenario is driven through the
 * REST `POST /store` route and the MCP `store` tool dispatch with the persisted
 * shapes compared to each other (cross_surface_contract_parity_tested_all_surfaces,
 * ent_2ad0677fe23c0c1878ae43e8). The CLI leg lives in
 * tests/cli/cli_store_data_origin.test.ts.
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { collectSnapshotDataOrigins } from "../../src/services/provenance_data_origin.js";

const API_PORT = 18242;
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const USER_ID = LOCAL_DEV_USER_ID;
// A dedicated type keeps the assertions independent of whatever shared
// built-in schemas (e.g. `note`) other suites have re-registered in the test DB.
const ENTITY_TYPE = "store_data_origin_probe";

const SHEET_ORIGIN = {
  kind: "file",
  locator: "Atencion al cliente.xlsx",
  part: "sheet=Tickets;row=97",
  system: "local_fs",
  producer: "tools/derive_all.py@4a5409c",
  retrieved_at: "2026-08-27T09:00:00Z",
  notes: "identity columns aliased; other columns verbatim",
} as const;

const EMAIL_ORIGIN = {
  kind: "email",
  system: "gmail",
  locator: "msg-18c2f0a9d1",
  url: "https://mail.google.com/mail/u/0/#all/18c2f0a9d1",
} as const;

type ToolResult = { content: Array<{ type: string; text: string }> };

describe("store data_origin (#2242)", () => {
  let httpServer: ReturnType<typeof createServer>;
  let mcp: NeotomaServer;
  const entityIds = new Set<string>();

  async function rest(path: string, body: unknown) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as Record<string, any>;
    return { status: res.status, json };
  }

  async function tool(name: string, args: unknown): Promise<any> {
    const dispatch = mcp as unknown as {
      executeTool: (name: string, args: unknown) => Promise<ToolResult>;
    };
    const result = await dispatch.executeTool(name, args);
    const text = result.content[0]!.text;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  function entityIdsFrom(payload: Record<string, any>): string[] {
    const list = (payload.structured?.entities ?? payload.entities ?? []) as Array<{
      entity_id: string;
    }>;
    const ids = list.map((e) => e.entity_id);
    ids.forEach((id) => entityIds.add(id));
    return ids;
  }

  function provenanceOf(row: { provenance?: unknown }): Record<string, any> {
    const raw = row.provenance;
    if (typeof raw === "string") return JSON.parse(raw);
    return (raw ?? {}) as Record<string, any>;
  }

  async function restObservations(entityId: string) {
    const { status, json } = await rest("/list_observations", { entity_id: entityId });
    expect(status).toBe(200);
    return json.observations as Array<Record<string, any>>;
  }

  function batch(marker: string) {
    return [
      // index 0: inherits the request-level origin
      { entity_type: ENTITY_TYPE, title: `origin default ${marker}`, content: "row 97" },
      // index 1: overrides it with its own
      {
        entity_type: ENTITY_TYPE,
        title: `origin override ${marker}`,
        content: "from mail",
        data_origin: EMAIL_ORIGIN,
      },
    ];
  }

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    mcp = new NeotomaServer();
    (mcp as unknown as { authenticatedUserId: string }).authenticatedUserId = USER_ID;
  });

  afterAll(async () => {
    const ids = [...entityIds];
    if (ids.length > 0) {
      await db.from("observations").delete().in("entity_id", ids);
      await db.from("entity_snapshots").delete().in("entity_id", ids);
      await db.from("entities").delete().in("id", ids);
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("REST: request default + per-entity override land on each observation and nowhere else", async () => {
    const marker = randomUUID();
    const { status, json } = await rest("/store", {
      user_id: USER_ID,
      idempotency_key: `origin-rest-${marker}`,
      data_origin: SHEET_ORIGIN,
      entities: batch(marker),
    });
    expect(status).toBe(200);
    const [defaultId, overrideId] = entityIdsFrom(json);

    const [defaultObs] = await restObservations(defaultId!);
    const [overrideObs] = await restObservations(overrideId!);
    expect(provenanceOf(defaultObs!).data_origin).toEqual(SHEET_ORIGIN);
    expect(provenanceOf(overrideObs!).data_origin).toEqual(EMAIL_ORIGIN);

    // Store metadata, never entity data: not an observation field, not a snapshot field.
    expect(overrideObs!.fields?.data_origin).toBeUndefined();
    const snap = await rest("/get_entity_snapshot", { entity_id: overrideId });
    expect(snap.status).toBe(200);
    const snapshotFields =
      typeof snap.json.snapshot === "string" ? JSON.parse(snap.json.snapshot) : snap.json.snapshot;
    expect(snapshotFields.data_origin).toBeUndefined();
    expect(snapshotFields.title).toBe(`origin override ${marker}`);

    // Snapshot read surfaces the origin of the observation that won `title`.
    const fieldProv =
      typeof snap.json.provenance === "string"
        ? JSON.parse(snap.json.provenance)
        : snap.json.provenance;
    expect(snap.json.data_origins).toEqual({ [fieldProv.title]: EMAIL_ORIGIN });

    // REST field provenance returns the winning observation row with its origin.
    const fp = await rest("/get_field_provenance", { entity_id: defaultId, field: "title" });
    expect(fp.status).toBe(200);
    expect(provenanceOf(fp.json.observations[0]).data_origin).toEqual(SHEET_ORIGIN);
  });

  it("MCP: same scenario, and every MCP read surface returns the origin", async () => {
    const marker = randomUUID();
    const stored = await tool("store", {
      idempotency_key: `origin-mcp-${marker}`,
      data_origin: SHEET_ORIGIN,
      entities: batch(marker),
    });
    const [defaultId, overrideId] = entityIdsFrom(stored);

    const listed = await tool("list_observations", { entity_id: overrideId });
    expect(provenanceOf(listed.observations[0]).data_origin).toEqual(EMAIL_ORIGIN);
    expect(listed.observations[0].fields?.data_origin).toBeUndefined();

    const fp = await tool("retrieve_field_provenance", { entity_id: defaultId, field: "title" });
    expect(fp.source_observation.data_origin).toEqual(SHEET_ORIGIN);

    const snapJson = await tool("retrieve_entity_snapshot", {
      entity_id: overrideId,
      format: "json",
    });
    expect(snapJson.snapshot.data_origin).toBeUndefined();
    expect(snapJson.data_origins).toEqual({ [snapJson.provenance.title]: EMAIL_ORIGIN });

    const snapText = (await tool("retrieve_entity_snapshot", { entity_id: overrideId })) as string;
    expect(snapText).toContain("data_origins:");
    expect(snapText).toContain('locator="msg-18c2f0a9d1"');
  });

  it("omitted observation_source + data_origin: ONE OBSERVATION_SOURCE_OMITTED warning, unspecified stored, origin kept on read-back (#2241 x #2242, REST and MCP)", async () => {
    const omitted = (body: Record<string, any>) =>
      ((body.store_warnings ?? []) as Array<Record<string, any>>).filter(
        (w) => w.code === "OBSERVATION_SOURCE_OMITTED"
      );

    // REST: no observation_source, a request-level origin and a per-entity override.
    const restMarker = randomUUID();
    const restResp = await rest("/store", {
      user_id: USER_ID,
      idempotency_key: `origin-omitted-source-rest-${restMarker}`,
      data_origin: SHEET_ORIGIN,
      entities: batch(restMarker),
    });
    expect(restResp.status).toBe(200);
    const [restDefault, restOverride] = entityIdsFrom(restResp.json);
    const restWarnings = omitted(restResp.json);
    expect(restWarnings).toHaveLength(1);
    expect(restWarnings[0]).toMatchObject({ observation_index: 0, entity_id: restDefault });
    const [restDefaultObs] = await restObservations(restDefault!);
    const [restOverrideObs] = await restObservations(restOverride!);
    expect(restDefaultObs!.observation_source).toBe("unspecified");
    expect(restOverrideObs!.observation_source).toBe("unspecified");
    expect(provenanceOf(restDefaultObs!).data_origin).toEqual(SHEET_ORIGIN);
    expect(provenanceOf(restOverrideObs!).data_origin).toEqual(EMAIL_ORIGIN);
    const restFp = await rest("/get_field_provenance", { entity_id: restDefault, field: "title" });
    expect(restFp.status).toBe(200);
    expect(provenanceOf(restFp.json.observations[0]).data_origin).toEqual(SHEET_ORIGIN);

    // MCP: same request through the store tool, read back through MCP tools.
    const mcpMarker = randomUUID();
    const mcpResp = await tool("store", {
      idempotency_key: `origin-omitted-source-mcp-${mcpMarker}`,
      data_origin: SHEET_ORIGIN,
      entities: batch(mcpMarker),
    });
    const [mcpDefault, mcpOverride] = entityIdsFrom(mcpResp);
    const mcpWarnings = omitted(mcpResp);
    expect(mcpWarnings).toHaveLength(1);
    expect(mcpWarnings[0]).toMatchObject({ observation_index: 0, entity_id: mcpDefault });
    const mcpListed = await tool("list_observations", { entity_id: mcpOverride });
    expect(mcpListed.observations[0].observation_source).toBe("unspecified");
    expect(provenanceOf(mcpListed.observations[0]).data_origin).toEqual(EMAIL_ORIGIN);
    const mcpFp = await tool("retrieve_field_provenance", { entity_id: mcpDefault, field: "title" });
    expect(mcpFp.source_observation.data_origin).toEqual(SHEET_ORIGIN);
  });

  it("REST and MCP persist a byte-identical data_origin for the same logical input", async () => {
    const restMarker = randomUUID();
    const mcpMarker = randomUUID();
    const restResp = await rest("/store", {
      user_id: USER_ID,
      idempotency_key: `origin-parity-rest-${restMarker}`,
      data_origin: SHEET_ORIGIN,
      entities: batch(restMarker),
    });
    const mcpResp = await tool("store", {
      idempotency_key: `origin-parity-mcp-${mcpMarker}`,
      data_origin: SHEET_ORIGIN,
      entities: batch(mcpMarker),
    });
    const restIds = entityIdsFrom(restResp.json);
    const mcpIds = entityIdsFrom(mcpResp);
    for (let i = 0; i < 2; i++) {
      const [restObs] = await restObservations(restIds[i]!);
      const [mcpObs] = await restObservations(mcpIds[i]!);
      const restOrigin = provenanceOf(restObs!).data_origin;
      const mcpOrigin = provenanceOf(mcpObs!).data_origin;
      expect(restOrigin).toBeDefined();
      expect(JSON.stringify(mcpOrigin)).toBe(JSON.stringify(restOrigin));
    }
  });

  it("omitted origin stays absent on every surface (not null, not {}, not inferred)", async () => {
    const marker = randomUUID();
    const { status, json } = await rest("/store", {
      user_id: USER_ID,
      idempotency_key: `origin-absent-${marker}`,
      original_filename: "looks-like-an-origin.csv",
      entities: [{ entity_type: ENTITY_TYPE, title: `no origin ${marker}`, content: "x" }],
    });
    expect(status).toBe(200);
    const [entityId] = entityIdsFrom(json);

    const [obs] = await restObservations(entityId!);
    expect("data_origin" in provenanceOf(obs!)).toBe(false);

    const snap = await rest("/get_entity_snapshot", { entity_id: entityId });
    expect("data_origins" in snap.json).toBe(false);

    const fp = await tool("retrieve_field_provenance", { entity_id: entityId, field: "title" });
    expect("data_origin" in fp.source_observation).toBe(false);

    const snapJson = await tool("retrieve_entity_snapshot", {
      entity_id: entityId,
      format: "json",
    });
    expect("data_origins" in snapJson).toBe(false);
    const snapText = (await tool("retrieve_entity_snapshot", { entity_id: entityId })) as string;
    expect(snapText).not.toContain("data_origins:");
  });

  it("keeps external_actor and attribution keys intact alongside data_origin", async () => {
    const marker = randomUUID();
    const { status, json } = await rest("/store", {
      user_id: USER_ID,
      idempotency_key: `origin-actor-${marker}`,
      data_origin: SHEET_ORIGIN,
      external_actor: { provider: "github", login: "octocat", id: 583231 },
      entities: [{ entity_type: ENTITY_TYPE, title: `actor ${marker}`, content: "x" }],
    });
    expect(status).toBe(200);
    const [entityId] = entityIdsFrom(json);
    const [obs] = await restObservations(entityId!);
    const provenance = provenanceOf(obs!);
    expect(provenance.data_origin).toEqual(SHEET_ORIGIN);
    expect(provenance.external_actor?.login).toBe("octocat");
    expect(provenance.external_actor?.verified_via).toBe("claim");
    // Caller input never lands at the provenance root.
    expect(provenance.locator).toBeUndefined();
    expect(provenance.kind).toBeUndefined();
  });

  it("replay with the same origin replays; a changed origin under the same key is a mismatch and the first claim is kept", async () => {
    const marker = randomUUID();
    const key = `origin-replay-${marker}`;
    const entities = [{ entity_type: ENTITY_TYPE, title: `replay ${marker}`, content: "x" }];
    const first = await rest("/store", {
      user_id: USER_ID,
      idempotency_key: key,
      data_origin: SHEET_ORIGIN,
      entities,
    });
    expect(first.status).toBe(200);
    const [entityId] = entityIdsFrom(first.json);

    const same = await rest("/store", {
      user_id: USER_ID,
      idempotency_key: key,
      data_origin: SHEET_ORIGIN,
      entities,
    });
    expect(same.status).toBe(200);
    expect(same.json.replayed ?? same.json.structured?.replayed).toBe(true);

    const changed = await rest("/store", {
      user_id: USER_ID,
      idempotency_key: key,
      data_origin: EMAIL_ORIGIN,
      entities,
    });
    expect(changed.status).not.toBe(200);
    expect(JSON.stringify(changed.json)).toContain("ERR_IDEMPOTENCY_MISMATCH");

    const observations = await restObservations(entityId!);
    expect(observations).toHaveLength(1);
    expect(provenanceOf(observations[0]!).data_origin).toEqual(SHEET_ORIGIN);

    // MCP: a changed origin under a reused key is refused too.
    const mcpKey = `origin-replay-mcp-${marker}`;
    const mcpEntities = [{ entity_type: ENTITY_TYPE, title: `replay mcp ${marker}`, content: "x" }];
    entityIdsFrom(
      await tool("store", {
        idempotency_key: mcpKey,
        data_origin: SHEET_ORIGIN,
        entities: mcpEntities,
      })
    );
    await expect(
      tool("store", { idempotency_key: mcpKey, data_origin: EMAIL_ORIGIN, entities: mcpEntities })
    ).rejects.toThrow(/idempotency/i);
  });

  it("rejects malformed origins on both surfaces without writing", async () => {
    const marker = randomUUID();
    const cases: Array<{ label: string; body: Record<string, unknown>; path: string }> = [
      {
        label: "kind outside the enum",
        body: { data_origin: { kind: "spreadsheet", locator: "x.xlsx" } },
        path: "data_origin",
      },
      {
        label: "locator missing for a non-manual kind",
        body: { data_origin: { kind: "url" } },
        path: "data_origin",
      },
      {
        label: "unknown key (no smuggling attribution keys)",
        body: { data_origin: { kind: "manual", client_name: "spoofed" } },
        path: "data_origin",
      },
      {
        label: "non-ISO retrieved_at",
        body: { data_origin: { kind: "manual", retrieved_at: "yesterday" } },
        path: "data_origin",
      },
      {
        label: "non-http url",
        body: { data_origin: { kind: "url", locator: "x", url: "javascript:alert(1)" } },
        path: "data_origin",
      },
      {
        label: "newline in a single-line field",
        body: { data_origin: { kind: "file", locator: "a.xlsx", part: "row=1\nkind=url" } },
        path: "data_origin",
      },
      {
        label: "credentials embedded in url",
        body: {
          data_origin: { kind: "url", locator: "x", url: "https://user:pass@example.com/x" },
        },
        path: "data_origin",
      },
    ];
    for (const c of cases) {
      const res = await rest("/store", {
        user_id: USER_ID,
        idempotency_key: `origin-invalid-${marker}-${c.label}`,
        entities: [{ entity_type: ENTITY_TYPE, title: `invalid ${marker}`, content: "x" }],
        ...c.body,
      });
      expect(res.status, c.label).toBe(400);
      expect(JSON.stringify(res.json), c.label).toContain(c.path);
      await expect(
        tool("store", {
          idempotency_key: `origin-invalid-mcp-${marker}-${c.label}`,
          entities: [{ entity_type: ENTITY_TYPE, title: `invalid ${marker}`, content: "x" }],
          ...c.body,
        }),
        c.label
      ).rejects.toThrow();
    }

    // Per-entity: a reserved-key value that is not an origin object is refused
    // with a path naming the entity and a hint about the reserved key.
    const perEntity = await rest("/store", {
      user_id: USER_ID,
      idempotency_key: `origin-invalid-entity-${marker}`,
      entities: [
        { entity_type: ENTITY_TYPE, title: `ok ${marker}`, content: "x" },
        { entity_type: ENTITY_TYPE, title: `bad ${marker}`, content: "x", data_origin: "gmail" },
      ],
    });
    expect(perEntity.status).toBe(400);
    const perEntityText = JSON.stringify(perEntity.json);
    expect(perEntityText).toContain("data_origin");
    expect(perEntityText).toContain("reserved");

    // Nothing from the rejected requests was written.
    const { data: written } = await db
      .from("entities")
      .select("id")
      .eq("user_id", USER_ID)
      .ilike("canonical_name", `%${marker}%`);
    expect(written ?? []).toHaveLength(0);
  });

  it("a failed store never writes data_origin content to the WARN log (#2242 security review)", async () => {
    const marker = randomUUID();
    const locator = `/private/finance/${marker}/ledger.xlsx`;
    const url = `https://files.example.com/${marker}?sig=tok${marker}`;
    const notes = `exported by hand ${marker}`;
    const entityLocator = `msg-${marker}`;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // (a) the origin itself is malformed (missing locator is fine to carry
      // url/notes); (b) a valid origin rides along with an unrelated failure
      // (no entities, no file); (c) a per-entity origin in a failing request.
      const bodies: Array<Record<string, unknown>> = [
        {
          idempotency_key: `origin-log-a-${marker}`,
          entities: [{ entity_type: ENTITY_TYPE, title: `log ${marker}` }],
          data_origin: { kind: "spreadsheet", locator, url, notes },
        },
        {
          idempotency_key: `origin-log-b-${marker}`,
          data_origin: { kind: "file", locator, url, notes },
        },
        {
          idempotency_key: `origin-log-c-${marker}`,
          entities: [
            {
              entity_type: ENTITY_TYPE,
              title: `log ${marker}`,
              data_origin: { kind: "email", locator: entityLocator, notes: 7 },
            },
          ],
        },
      ];
      for (const body of bodies) {
        const res = await rest("/store", { user_id: USER_ID, ...body });
        expect(res.status).toBe(400);
      }
      const lines = warn.mock.calls.map((args) => args.map(String).join(" "));
      const storeLines = lines.filter((line) => line.includes("ValidationError:store"));
      expect(storeLines.length).toBeGreaterThanOrEqual(3);
      for (const line of storeLines) {
        for (const secret of [
          locator,
          url,
          `sig=tok${marker}`,
          notes,
          entityLocator,
          "spreadsheet",
        ]) {
          expect(line).not.toContain(secret);
        }
      }
      // The shape stays visible for debugging: kind (when valid) and lengths.
      expect(storeLines.join("\n")).toContain(`locator_len: ${locator.length}`);
    } finally {
      warn.mockRestore();
    }
  });

  it("create_interpretation refuses a per-entity data_origin key on REST and MCP", async () => {
    const marker = randomUUID();
    const entities = [
      {
        entity_type: ENTITY_TYPE,
        title: `interp refuse ${marker}`,
        data_origin: { kind: "file", locator: "a.xlsx" },
      },
    ];
    const res = await rest("/interpretations/create", {
      user_id: USER_ID,
      source_id: `src_missing_${marker}`,
      entities,
    });
    expect(res.status).toBe(400);
    expect(res.json.error_code).toBe("VALIDATION_INVALID_FORMAT");
    expect(res.json.details?.hint).toMatch(/does not accept a per-entity data_origin/);
    await expect(
      tool("create_interpretation", { source_id: `src_missing_${marker}`, entities })
    ).rejects.toThrow(/data_origin/);
  });

  it("refuses data_origin on a file-only store instead of silently dropping it", async () => {
    const marker = randomUUID();
    const res = await rest("/store", {
      user_id: USER_ID,
      idempotency_key: `origin-file-only-${marker}`,
      file_content: Buffer.from(`file ${marker}`).toString("base64"),
      mime_type: "text/plain",
      data_origin: { kind: "url", locator: "https://example.com/a.txt" },
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("data_origin");
    await expect(
      tool("store", {
        idempotency_key: `origin-file-only-mcp-${marker}`,
        file_content: Buffer.from(`file mcp ${marker}`).toString("base64"),
        mime_type: "text/plain",
        data_origin: { kind: "url", locator: "https://example.com/a.txt" },
      })
    ).rejects.toThrow(/data_origin/);
  });

  it("interpretation-linked stores stamp the origin on REST and MCP alike", async () => {
    const marker = randomUUID();
    const restResp = await rest("/store", {
      user_id: USER_ID,
      idempotency_key: `origin-interp-rest-${marker}`,
      data_origin: SHEET_ORIGIN,
      interpretation: {
        source_ref: "structured",
        interpretation_config: { extractor_type: "test" },
      },
      entities: [{ entity_type: ENTITY_TYPE, title: `interp rest ${marker}`, content: "x" }],
    });
    expect(restResp.status).toBe(200);
    const mcpResp = await tool("store", {
      idempotency_key: `origin-interp-mcp-${marker}`,
      data_origin: SHEET_ORIGIN,
      interpretation: {
        source_ref: "structured",
        interpretation_config: { extractor_type: "test" },
      },
      entities: [{ entity_type: ENTITY_TYPE, title: `interp mcp ${marker}`, content: "x" }],
    });
    const [restId] = entityIdsFrom(restResp.json);
    const [mcpId] = entityIdsFrom(mcpResp);
    for (const id of [restId!, mcpId!]) {
      const observations = await restObservations(id);
      expect(observations[0]!.interpretation_id).toBeTruthy();
      expect(provenanceOf(observations[0]!).data_origin).toEqual(SHEET_ORIGIN);
    }
  });

  it("snapshot origin lookup is scoped to the requesting user", async () => {
    const marker = randomUUID();
    const { json } = await rest("/store", {
      user_id: USER_ID,
      idempotency_key: `origin-tenant-${marker}`,
      data_origin: SHEET_ORIGIN,
      entities: [{ entity_type: ENTITY_TYPE, title: `tenant ${marker}`, content: "x" }],
    });
    const [entityId] = entityIdsFrom(json);
    const { data: snapRow } = await db
      .from("entity_snapshots")
      .select("provenance")
      .eq("entity_id", entityId!)
      .single();
    const provenance = (snapRow as { provenance: unknown }).provenance;
    expect(Object.values(await collectSnapshotDataOrigins(provenance, USER_ID))).toEqual([
      SHEET_ORIGIN,
    ]);
    expect(
      await collectSnapshotDataOrigins(provenance, "00000000-0000-0000-0000-0000000000ff")
    ).toEqual({});
  });
});

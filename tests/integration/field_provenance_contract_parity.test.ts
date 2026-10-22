/** One declared, complete and field-scoped provenance chain on HTTP and MCP. */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Ajv } from "ajv";
import addFormats from "ajv-formats";
import yaml from "js-yaml";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { routeAcceptsGuestPrincipal } from "../../src/actions.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { redactMemberAttribution } from "../../src/services/attribution_redaction.js";
import {
  generateGuestAccessToken,
  hashGuestAccessToken,
} from "../../src/services/guest_access_token.js";
import {
  PARITY_USER_ID as USER,
  makeMcpServer,
  startOfflineServer,
  stopServer,
} from "../helpers/transport_parity_matrix.js";

vi.mock("../../src/embeddings.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/embeddings.js")>()),
  generateEmbedding: vi.fn().mockResolvedValue(null),
}));

const TYPE = "test_field_provenance_contract_2649";
const FOREIGN = "00000000-0000-4000-8000-000000000099";
const spec = yaml.load(readFileSync("openapi.yaml", "utf8")) as any;
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const validate = ajv.compile({
  $ref: "#/components/schemas/FieldProvenanceResponse",
  components: spec.components,
});
const cleanError = (error: Record<string, unknown>) => {
  const { timestamp: _timestamp, ...rest } = error;
  return rest;
};

describe("complete field provenance contract (#2649)", () => {
  let server: NeotomaServer;
  let offline: Awaited<ReturnType<typeof startOfflineServer>>;
  const entities = new Set<string>();
  const sources = new Set<string>();
  const extraObservations = new Set<string>();

  async function tool(name: string, args: unknown) {
    const handler = (server as any).mcpServer.server._requestHandlers.get("tools/call");
    const response = await handler({ method: "tools/call", params: { name, arguments: args } }, {});
    return JSON.parse(response.content[0].text);
  }
  async function http(entityId: string, field: string) {
    const response = await fetch(offline.base + "/get_field_provenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_id: entityId, field, user_id: FOREIGN }),
    });
    return { status: response.status, body: await response.json() };
  }
  async function both(entityId: string, field: string) {
    const rest = await http(entityId, field);
    expect(rest.status).toBe(200);
    const mcp = await tool("retrieve_field_provenance", {
      entity_id: entityId,
      field,
      user_id: FOREIGN,
    });
    expect(mcp).toEqual(rest.body);
    expect(validate(mcp), JSON.stringify(validate.errors)).toBe(true);
    return mcp;
  }
  async function fault(entityId: string, field: string, status: number, code: string) {
    const rest = await http(entityId, field);
    expect(rest.status).toBe(status);
    expect(rest.body.error_code).toBe(code);
    let caught: McpError | undefined;
    try {
      await tool("retrieve_field_provenance", { entity_id: entityId, field });
    } catch (error) {
      caught = error as McpError;
    }
    expect(caught).toBeInstanceOf(McpError);
    expect(caught!.code).toBe(status === 404 ? ErrorCode.InvalidParams : ErrorCode.InternalError);
    expect(cleanError(caught!.data as Record<string, unknown>)).toEqual(cleanError(rest.body));
    expect(rest.body.message).toContain(entityId);
    expect(rest.body.message).toContain(field);
    expect(rest.body.details.hint).toBeTruthy();
    expect(rest.body.observations).toBeUndefined();
    return rest.body;
  }
  async function store(label: string, fields: Record<string, unknown>, extra = {}) {
    const key = `provenance-${randomUUID()}`;
    const body = await tool("store", {
      entities: [{ entity_type: TYPE, label, secret: "UNRELATED-SENSITIVE-FIXTURE", ...fields }],
      idempotency_key: key,
      ...extra,
    });
    const id = body.entities[0].entity_id;
    entities.add(id);
    if (body.source_id) sources.add(body.source_id);
    return { id, key, body };
  }
  async function fixture() {
    const label = `fixture-${randomUUID()}`;
    const a = await store(
      label,
      { tags: ["alpha"] },
      {
        data_origin: { kind: "file", locator: "synthetic.csv", part: "row=1" },
      }
    );
    const b = await store(label, { tags: ["beta"] }, { observation_source: "sensor" });
    const chain = await both(a.id, "tags");
    expect(chain.observations).toHaveLength(2);
    expect(validate({ ...chain, unexpected: true })).toBe(false);
    expect(
      validate({
        ...chain,
        observations: [{ ...chain.observations[0], idempotency_key: undefined }],
      })
    ).toBe(false);
    expect(
      validate({
        ...chain,
        observations: [{ ...chain.observations[0], fields: { tags: [], secret: "blocked" } }],
      })
    ).toBe(false);
    return { a, b, chain };
  }

  beforeAll(async () => {
    server = makeMcpServer();
    offline = await startOfflineServer();
    await schemaRegistry.register({
      entity_type: TYPE,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          label: { type: "string", required: true },
          tags: { type: "array", required: false },
          secret: { type: "string", required: false, preserveCase: true },
        },
        canonical_name_fields: ["label"],
      },
      reducer_config: {
        merge_policies: {
          label: { strategy: "last_write" },
          secret: { strategy: "last_write" },
          tags: { strategy: "merge_array" },
        },
      },
      user_id: USER,
      user_specific: true,
      activate: true,
      force: true,
    });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    if (extraObservations.size)
      await db
        .from("observations")
        .delete()
        .in("id", [...extraObservations]);
    if (entities.size) {
      await db
        .from("timeline_events")
        .delete()
        .in("entity_id", [...entities]);
      await db
        .from("observations")
        .delete()
        .in("entity_id", [...entities]);
      await db
        .from("entity_snapshots")
        .delete()
        .in("entity_id", [...entities]);
      await db
        .from("entities")
        .delete()
        .in("id", [...entities]);
    }
    if (sources.size)
      await db
        .from("sources")
        .delete()
        .in("id", [...sources]);
    await db.from("schema_registry").delete().eq("entity_type", TYPE);
    await stopServer(offline.server);
  });

  it("has an effective schema validator: missing contributors/metadata and extra fields fail", () => {
    expect(validate({})).toBe(false);
    expect(validate({ field: "tags", observations: [] })).toBe(false);
    expect(spec.components.schemas.FieldProvenanceObservation.additionalProperties).toBe(false);
    expect(
      spec.paths["/get_field_provenance"].post.responses["200"].content["application/json"].schema
        .$ref
    ).toBe("#/components/schemas/FieldProvenanceResponse");
  });

  it("declares the same response projection on the Actions and MCP/HTTP specifications", () => {
    const actions = yaml.load(readFileSync("openapi_actions.yaml", "utf8")) as any;
    for (const name of [
      "FieldProvenanceResponse",
      "FieldProvenanceObservation",
      "FieldProvenanceSource",
    ]) {
      expect(actions.components.schemas[name]).toEqual(spec.components.schemas[name]);
    }
  });

  it("does not manufacture keyed-write metadata for legacy rows", async () => {
    const { id } = await store(`legacy-${randomUUID()}`, { tags: ["legacy"] });
    await db
      .from("observations")
      .update({ observation_source: null, idempotency_key: null })
      .eq("entity_id", id);
    const body = await both(id, "tags");
    expect(body.observations[0].observation_source).toBeNull();
    expect(body.observations[0].idempotency_key).toBeNull();
    expect(body.source_observation.data_origin).toBeUndefined();
  });

  it("returns every merged contributor/source with exact stored metadata and no unrelated fields/paths", async () => {
    const { a, b, chain } = await fixture();
    expect(chain.value).toEqual(expect.arrayContaining(["alpha", "beta"]));
    expect(chain.observation_ids).toEqual(chain.observations.map((o: any) => o.id));
    expect(new Set(chain.observation_ids).size).toBe(2);
    expect(chain.sources).toHaveLength(2);
    expect(chain.observations.map((o: any) => o.idempotency_key).sort()).toEqual(
      [a.key, b.key].sort()
    );
    expect(chain.observations.map((o: any) => o.observation_source).sort()).toEqual([
      "sensor",
      "unspecified",
    ]);
    expect(chain.source_observation).toEqual(chain.observations[0]);
    expect(chain.source.id).toBe(chain.source_observation.source_id);
    expect(
      chain.observations.find((o: any) => o.idempotency_key === a.key).provenance.data_origin
    ).toEqual({ kind: "file", locator: "synthetic.csv", part: "row=1" });
    for (const row of chain.observations) expect(Object.keys(row.fields)).toEqual(["tags"]);
    const serial = JSON.stringify(chain);
    expect(serial).not.toContain("UNRELATED-SENSITIVE-FIXTURE");
    expect(serial).not.toContain("file_urls");
    expect(serial).not.toContain("storage_url");
    expect(serial).not.toContain("filesystem_absolute_path");
    expect(serial).not.toContain("original_filename");
    const withoutObservation = { ...chain, observations: chain.observations.slice(1) };
    // Schema validates shape; completeness is independently pinned above against actual writes.
    expect(validate(withoutObservation)).toBe(true);
  });

  it("keeps a real correction source-less and exposes its write key/kind on both surfaces", async () => {
    const initial = await store(`corrected-${randomUUID()}`, { tags: ["old"] });
    const key = `correction-${randomUUID()}`;
    const corrected = await tool("correct", {
      entity_id: initial.id,
      entity_type: TYPE,
      field: "tags",
      value: ["new"],
      idempotency_key: key,
    });
    const chain = await both(initial.id, "tags");
    expect(chain.observation_ids).toEqual([corrected.observation_id]);
    expect(chain.observations[0]).toMatchObject({
      source_id: null,
      observation_source: "correction",
      idempotency_key: key,
      fields: { tags: ["new"] },
    });
    expect(chain.source).toBeNull();
    expect(chain.sources).toEqual([]);
  });

  it("retains mixed NULL sources, deduplicates shared sources, and normalizes contributor order", async () => {
    const { a, chain } = await fixture();
    const [first, second] = chain.observations;
    await db.from("observations").update({ source_id: first.source_id }).eq("id", second.id);
    expect((await both(a.id, "tags")).sources).toHaveLength(1);
    await db.from("observations").update({ source_id: null }).eq("id", first.id);
    const mixed = await both(a.id, "tags");
    expect(mixed.observations).toHaveLength(2);
    expect(mixed.sources).toHaveLength(1);
    expect(mixed.source).toBeNull();
    await db
      .from("entity_snapshots")
      .update({ provenance: { tags: ` ${second.id}, ${first.id},${second.id} ` } })
      .eq("entity_id", a.id);
    expect((await both(a.id, "tags")).observation_ids).toEqual(mixed.observation_ids);
  });

  it("never returns internal receipts or fields hidden from the current snapshot", async () => {
    const { a, chain } = await fixture();
    const row = chain.observations[0];
    await db
      .from("observations")
      .update({
        provenance: {
          authenticated_actor_id: "synthetic-member",
          data_origin: { kind: "manual" },
          store_operation_receipt: { secret: "RECEIPT-SENSITIVE-FIXTURE" },
          arbitrary_payload: { secret: "RECEIPT-SENSITIVE-FIXTURE" },
        },
      })
      .eq("id", row.id);
    const body = await both(a.id, "tags");
    expect(JSON.stringify(body)).not.toContain("RECEIPT-SENSITIVE-FIXTURE");
    expect(body.observations[0].provenance.authenticated_actor_id).toBe("synthetic-member");
    const guestProjection = redactMemberAttribution(body);
    expect(JSON.stringify(guestProjection)).not.toContain("synthetic-member");
    expect(JSON.stringify(guestProjection)).not.toContain("data_origin");
    await db
      .from("entity_snapshots")
      .update({ snapshot: { label: "only-visible-field" } })
      .eq("entity_id", a.id);
    await fault(a.id, "tags", 404, "RESOURCE_NOT_FOUND");
  });

  it("uses identical not-found errors for unknown, foreign and missing-field requests", async () => {
    const { id } = await store(`missing-field-${randomUUID()}`, { tags: ["owned"] });
    await fault(id, "missing", 404, "RESOURCE_NOT_FOUND");
    const absent = await fault("ent_absent_fixture_2649", "tags", 404, "RESOURCE_NOT_FOUND");
    const foreignId = `ent_foreign_${randomUUID()}`;
    entities.add(foreignId);
    await db.from("entity_snapshots").insert({
      entity_id: foreignId,
      entity_type: TYPE,
      schema_version: "1.0",
      user_id: FOREIGN,
      snapshot: { tags: ["FOREIGN-SECRET"] },
      provenance: { tags: "foreign-observation" },
    });
    const foreign = await fault(foreignId, "tags", 404, "RESOURCE_NOT_FOUND");
    expect(foreign.message).toBe(absent.message.replace("ent_absent_fixture_2649", foreignId));
    expect(JSON.stringify(foreign)).not.toContain("FOREIGN-SECRET");
  });

  it.each(["partial", "all", "different-entity", "foreign"])(
    "refuses %s observation references instead of returning a partial chain",
    async (kind) => {
      const { a, chain } = await fixture();
      const id = randomUUID();
      if (kind === "different-entity" || kind === "foreign") {
        extraObservations.add(id);
        await db.from("observations").insert({
          id,
          entity_id: kind === "foreign" ? a.id : "ent_other_fixture",
          entity_type: TYPE,
          schema_version: "1.0",
          user_id: kind === "foreign" ? FOREIGN : USER,
          observed_at: "2026-01-01T00:00:00Z",
          created_at: "2026-01-01T00:00:00Z",
          source_id: null,
          source_priority: 100,
          fields: { tags: ["FOREIGN-SECRET"] },
        });
      }
      const ids = kind === "all" ? id : `${chain.observation_ids.join(",")},${id}`;
      await db
        .from("entity_snapshots")
        .update({ provenance: { tags: ids } })
        .eq("entity_id", a.id);
      const error = await fault(a.id, "tags", 500, "PROVENANCE_INTEGRITY_ERROR");
      expect(error.details.reference_id).toBe(id);
      expect(JSON.stringify(error)).not.toContain("FOREIGN-SECRET");
    }
  );

  it.each(["missing", "foreign"])(
    "refuses a %s source on a non-representative contributor",
    async (kind) => {
      const { a, chain } = await fixture();
      const id = randomUUID();
      if (kind === "foreign") {
        sources.add(id);
        await db.from("sources").insert({
          id,
          user_id: FOREIGN,
          mime_type: "text/secret",
          storage_url: "PRIVATE-PATH-FIXTURE",
        });
      }
      await db.from("observations").update({ source_id: id }).eq("id", chain.observations[1].id);
      const error = await fault(a.id, "tags", 500, "PROVENANCE_INTEGRITY_ERROR");
      expect(error.details).toMatchObject({ reference_kind: "source", reference_id: id });
      expect(JSON.stringify(error)).not.toContain("PRIVATE-PATH-FIXTURE");
    }
  );

  it.each(["entity_snapshots", "observations", "sources"])(
    "distinguishes actual %s query failures",
    async (table) => {
      const { a } = await fixture();
      const original = db.from.bind(db);
      const spy = vi.spyOn(db, "from").mockImplementation((name: string) => {
        if (name === table) throw new Error("synthetic SQL details must not leak");
        return original(name);
      });
      try {
        const error = await fault(a.id, "tags", 500, "DB_QUERY_FAILED");
        expect(JSON.stringify(error)).not.toContain("synthetic SQL");
      } finally {
        spy.mockRestore();
      }
    }
  );

  it("does not admit a remote guest token to this existing member-only operation", async () => {
    const { id } = await store(`guest-${randomUUID()}`, { tags: ["owned"] });
    const token = await generateGuestAccessToken({ entityIds: [id], userId: USER });
    entities.add(`guest_token_${hashGuestAccessToken(token).slice(0, 16)}`);
    expect(routeAcceptsGuestPrincipal({ method: "GET", path: `/entities/${id}` })).toBe(true);
    expect(routeAcceptsGuestPrincipal({ method: "POST", path: "/get_field_provenance" })).toBe(
      false
    );
    const response = await fetch(offline.base + "/get_field_provenance?access_token=" + token, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.50" },
      body: JSON.stringify({ entity_id: id, field: "tags" }),
    });
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain("owned");
  });
});

import { describe, expect, it, vi } from "vitest";
import { NeotomaClient } from "../../packages/client/src/client.js";
import { HttpTransport } from "../../packages/client/src/http.js";
import { LocalTransport, type LocalOperations } from "../../packages/client/src/local.js";
import type {
  CorrectInput,
  DeprecatedCorrectInput,
  NeotomaTransport,
} from "../../packages/client/src/types.js";

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeLocalOperations(correct: LocalOperations["correct"]): LocalOperations {
  const notUsed = vi.fn(async () => ({}));
  return {
    store: notUsed,
    storeStructured: notUsed,
    storeUnstructured: notUsed,
    retrieveEntities: notUsed,
    retrieveEntityByIdentifier: notUsed,
    retrieveEntitySnapshot: notUsed,
    listObservations: notUsed,
    listTimelineEvents: notUsed,
    retrieveRelatedEntities: notUsed,
    createRelationship: notUsed,
    createRelationships: notUsed,
    correct,
    listEntityTypes: notUsed,
    getEntityTypeCounts: notUsed,
    executeTool: notUsed,
    dispose: vi.fn(async () => undefined),
  };
}

describe("@neotoma/client correct()", () => {
  it("forwards the canonical single-field request unchanged over HTTP", async () => {
    const fetchImpl = vi.fn(async () => okJson({ success: true }));
    const transport = new HttpTransport({
      baseUrl: "http://127.0.0.1:3999",
      fetch: fetchImpl as typeof fetch,
    });
    const input: CorrectInput = {
      entity_id: "ent_sdk_fixture",
      entity_type: "sdk_fixture",
      field: "status",
      value: "updated",
      idempotency_key: "sdk-canonical-status",
      user_id: "user-sdk-fixture",
      expected_version: "version-1",
      overwrite: true,
    };

    await transport.correct(input);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:3999/correct");
    expect(JSON.parse(String(init?.body))).toEqual(input);
  });

  it("adapts a deprecated map request into sorted per-field HTTP calls", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) =>
      okJson({ field: JSON.parse(String(init?.body)).field })
    );
    const transport = new HttpTransport({ fetch: fetchImpl as typeof fetch });
    const input: DeprecatedCorrectInput = {
      entity_id: "ent_sdk_fixture",
      entity_type: "sdk_fixture",
      corrections: { status: "done", priority: "high" },
      idempotency_key: "sdk-map",
      user_id: "user-sdk-fixture",
      expected_version: "version-2",
      overwrite: false,
    };

    const result = await transport.correct(input);

    expect(result).toEqual([{ field: "priority" }, { field: "status" }]);
    expect(
      fetchImpl.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))
    ).toEqual([
      {
        entity_id: "ent_sdk_fixture",
        entity_type: "sdk_fixture",
        field: "priority",
        value: "high",
        idempotency_key: "sdk-map:priority",
        user_id: "user-sdk-fixture",
        expected_version: "version-2",
        overwrite: false,
      },
      {
        entity_id: "ent_sdk_fixture",
        entity_type: "sdk_fixture",
        field: "status",
        value: "done",
        idempotency_key: "sdk-map:status",
        user_id: "user-sdk-fixture",
        expected_version: "version-2",
        overwrite: false,
      },
    ]);
  });

  it("rejects an empty deprecated corrections map before making a request", async () => {
    const fetchImpl = vi.fn(async () => okJson({ success: true }));
    const transport = new HttpTransport({ fetch: fetchImpl as typeof fetch });

    await expect(
      transport.correct({
        entity_id: "ent_sdk_fixture",
        entity_type: "sdk_fixture",
        corrections: {},
        idempotency_key: "sdk-empty-map",
      })
    ).rejects.toThrow("at least one field");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses the same canonical and deprecated request behavior for local operations", async () => {
    const correct = vi.fn(async (input: CorrectInput) => ({ field: input.field }));
    const transport = new LocalTransport({
      userId: "user-sdk-fixture",
      operations: makeLocalOperations(correct),
    });

    await transport.correct({
      entity_id: "ent_sdk_fixture",
      entity_type: "sdk_fixture",
      field: "status",
      value: "canonical",
      idempotency_key: "sdk-local-canonical",
      expected_version: "version-3",
    });
    const legacyResult = await transport.correct({
      entity_id: "ent_sdk_fixture",
      entity_type: "sdk_fixture",
      corrections: { zeta: 2, alpha: 1 },
      idempotency_key: "sdk-local-map",
      overwrite: true,
    });

    expect(correct.mock.calls.map(([input]) => input)).toEqual([
      {
        entity_id: "ent_sdk_fixture",
        entity_type: "sdk_fixture",
        field: "status",
        value: "canonical",
        idempotency_key: "sdk-local-canonical",
        expected_version: "version-3",
      },
      {
        entity_id: "ent_sdk_fixture",
        entity_type: "sdk_fixture",
        field: "alpha",
        value: 1,
        idempotency_key: "sdk-local-map:alpha",
        overwrite: true,
      },
      {
        entity_id: "ent_sdk_fixture",
        entity_type: "sdk_fixture",
        field: "zeta",
        value: 2,
        idempotency_key: "sdk-local-map:zeta",
        overwrite: true,
      },
    ]);
    expect(legacyResult).toEqual([{ field: "alpha" }, { field: "zeta" }]);
  });

  it("exposes both overloads through the NeotomaClient facade", async () => {
    const correct = vi.fn(async () => ({ success: true }));
    const transport = { correct } as unknown as NeotomaTransport;
    const client = new NeotomaClient({ transport });

    await client.correct({
      entity_id: "ent_sdk_fixture",
      entity_type: "sdk_fixture",
      field: "status",
      value: "canonical",
      idempotency_key: "sdk-facade-canonical",
    });
    await client.correct({
      entity_id: "ent_sdk_fixture",
      entity_type: "sdk_fixture",
      corrections: { status: "legacy" },
      idempotency_key: "sdk-facade-map",
    });

    expect(correct).toHaveBeenCalledTimes(2);
  });
});

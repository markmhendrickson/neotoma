import { describe, expect, it, vi } from "vitest";
import { NeotomaClient } from "../../packages/client/src/client.js";
import { MultiFieldCorrectionError } from "../../packages/client/src/correction.js";
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

  it("converts a single-entry deprecated map into the canonical request with the caller's key unchanged", async () => {
    const fetchImpl = vi.fn(async () => okJson({ success: true, entity_version: "version-3" }));
    const transport = new HttpTransport({ fetch: fetchImpl as typeof fetch });
    const input: DeprecatedCorrectInput = {
      entity_id: "ent_sdk_fixture",
      entity_type: "sdk_fixture",
      corrections: { status: "done" },
      idempotency_key: "sdk-map",
      user_id: "user-sdk-fixture",
      expected_version: "version-2",
      overwrite: false,
    };

    const result = await transport.correct(input);

    expect(result).toEqual({ success: true, entity_version: "version-3" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({
      entity_id: "ent_sdk_fixture",
      entity_type: "sdk_fixture",
      field: "status",
      value: "done",
      idempotency_key: "sdk-map",
      user_id: "user-sdk-fixture",
      expected_version: "version-2",
      overwrite: false,
    });
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

  it("refuses a multi-field deprecated map over HTTP before any request, naming correct_transaction", async () => {
    const fetchImpl = vi.fn(async () => okJson({ success: true }));
    const transport = new HttpTransport({ fetch: fetchImpl as typeof fetch });

    let failure: unknown;
    try {
      await transport.correct({
        entity_id: "ent_sdk_fixture",
        entity_type: "sdk_fixture",
        corrections: { status: "done", priority: "high" },
        idempotency_key: "sdk-multi",
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(MultiFieldCorrectionError);
    expect((failure as MultiFieldCorrectionError).fields).toEqual(["priority", "status"]);
    expect((failure as Error).message).toContain("correct_transaction");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a multi-field deprecated map over local operations before any call", async () => {
    const correct = vi.fn(async () => ({ success: true }));
    const transport = new LocalTransport({
      userId: "user-sdk-fixture",
      operations: makeLocalOperations(correct),
    });

    await expect(
      transport.correct({
        entity_id: "ent_sdk_fixture",
        entity_type: "sdk_fixture",
        corrections: { status: "done", priority: "high" },
        idempotency_key: "sdk-multi-local",
      })
    ).rejects.toBeInstanceOf(MultiFieldCorrectionError);
    expect(correct).not.toHaveBeenCalled();
  });

  it("rejects input carrying both corrections and field before any request", async () => {
    const fetchImpl = vi.fn(async () => okJson({ success: true }));
    const transport = new HttpTransport({ fetch: fetchImpl as typeof fetch });

    await expect(
      transport.correct({
        entity_id: "ent_sdk_fixture",
        entity_type: "sdk_fixture",
        field: "status",
        value: "done",
        corrections: { priority: "high" },
        idempotency_key: "sdk-mixed",
      } as unknown as CorrectInput)
    ).rejects.toThrow("not both");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["whitespace-only", " \t "],
    ["non-string", 42],
  ])("rejects a %s deprecated idempotency key before any correction call", async (_label, key) => {
    const fetchImpl = vi.fn(async () => okJson({ success: true }));
    const correct = vi.fn(async () => ({ success: true }));
    const http = new HttpTransport({ fetch: fetchImpl as typeof fetch });
    const local = new LocalTransport({
      userId: "user-sdk-fixture",
      operations: makeLocalOperations(correct),
    });
    const request = {
      entity_id: "ent_sdk_fixture",
      entity_type: "sdk_fixture",
      corrections: { status: "done" },
      idempotency_key: key,
    } as unknown as DeprecatedCorrectInput;

    await expect(http.correct(request)).rejects.toThrow("caller-supplied idempotency key");
    await expect(local.correct(request)).rejects.toThrow("caller-supplied idempotency key");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(correct).not.toHaveBeenCalled();
  });

  it("uses the same canonical and single-entry deprecated behavior for local operations", async () => {
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
      corrections: { alpha: 1 },
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
        idempotency_key: "sdk-local-map",
        overwrite: true,
      },
    ]);
    expect(legacyResult).toEqual({ field: "alpha" });
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

  it("maps only correct_transaction; other tools post to /<name>", async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => okJson({ ok: true }));
    const transport = new HttpTransport({
      baseUrl: "http://127.0.0.1:1",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await transport.executeTool("correct_transaction", { entities: [] });
    await transport.executeTool("some_other_tool", {});
    await transport.executeTool("constructor", {});

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toEqual([
      "http://127.0.0.1:1/corrections/transaction",
      "http://127.0.0.1:1/some_other_tool",
      "http://127.0.0.1:1/constructor",
    ]);
  });
});

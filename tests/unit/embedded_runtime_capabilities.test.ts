import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { EmbeddedRuntimeContext } from "../../src/core/runtime_context.js";
import { createEmbeddedRuntimeConfiguration } from "../../src/core/runtime_configuration.js";
import { createOperations, type NeotomaServer } from "../../src/core/operations.js";
import type { DbDatabase } from "../../src/repositories/db/driver.js";

function context() {
  return new EmbeddedRuntimeContext({
    database: {} as DbDatabase,
    configuration: createEmbeddedRuntimeConfiguration({
      dataDirectory: join(process.cwd(), ".vitest", "capabilities"),
      packageRoot: process.cwd(),
    }),
    adapters: { untrustedFeature: {} },
  });
}
function client() {
  const dispatch = vi.fn(async (..._args: [string, unknown, string]) => ({
    content: [{ type: "text", text: '{"success":true}' }],
  }));
  return {
    dispatch,
    operations: createOperations({
      userId: "synthetic-user",
      server: { executeToolForCli: dispatch } as unknown as NeotomaServer,
    }),
  };
}

describe("explicit operation feature admission", () => {
  it("routes admitted typed and raw calls through the same guarded dispatcher", async () => {
    const runtime = context();
    const { dispatch, operations } = client();
    try {
      await runtime.run(() =>
        operations.store({
          entities: [{ entity_type: "note", title: "fixture" }],
          idempotency_key: "one",
        })
      );
      await runtime.run(() =>
        operations.executeTool("store", {
          entities: [{ entity_type: "note", title: "fixture" }],
          idempotency_key: "two",
        })
      );
      expect(dispatch.mock.calls.map((call) => call[0])).toEqual(["store", "store"]);
    } finally {
      await runtime.dispose();
    }
  });
  it("refuses unknown, network and mixed-file calls before dispatch, including raw aliases", async () => {
    const runtime = context();
    const { dispatch, operations } = client();
    try {
      await expect(
        runtime.run(() => operations.executeTool("unrecognized_future_operation", {}))
      ).rejects.toMatchObject({ data: { error_code: "FEATURE_UNAVAILABLE" } });
      await expect(
        runtime.run(() => operations.executeTool("retrieve_file_url", { file_id: "private" }))
      ).rejects.toMatchObject({ data: { error_code: "NETWORK_DISABLED" } });
      await expect(
        runtime.run(() =>
          operations.store({
            entities: [{ entity_type: "note", title: "would-be-partial" }],
            file_content: "bytes",
            idempotency_key: "three",
          })
        )
      ).rejects.toMatchObject({ data: { error_code: "FEATURE_UNAVAILABLE" } });
      await expect(
        runtime.run(() =>
          operations.executeTool("store", {
            entities: [{ entity_type: "note", title: "would-be-partial" }],
            file_path: "unused",
            idempotency_key: "four",
          })
        )
      ).rejects.toMatchObject({ data: { error_code: "FEATURE_UNAVAILABLE" } });
      await expect(
        runtime.run(() => operations.executeTool("store", { intake: { mode: "overflow" } }))
      ).rejects.toMatchObject({ data: { error_code: "FEATURE_UNAVAILABLE" } });
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      await runtime.dispose();
    }
    await operations.executeTool("unrecognized_future_operation", {});
    expect(dispatch).toHaveBeenCalledOnce();
  });
});

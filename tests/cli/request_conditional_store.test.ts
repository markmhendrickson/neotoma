import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  startIsolatedNeotomaServer,
  type IsolatedServer,
} from "../../packages/eval-harness/src/isolated_server.js";
const run = promisify(execFile);
import { modernPost, toolResultJson } from "../helpers/mcp_http_modern.js";
let server: IsolatedServer;
const type = "conditional_cli_test";
beforeAll(async () => {
  server = await startIsolatedNeotomaServer({ useTsx: false });
  const registered = await fetch(`${server.baseUrl}/register_schema`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${server.token}` },
    body: JSON.stringify({
      entity_type: type,
      schema_version: "1.0",
      activate: true,
      schema_definition: {
        fields: { code: { type: "string", required: true }, status: { type: "string" } },
        canonical_name_fields: ["code"],
      },
      reducer_config: {
        merge_policies: {
          code: { strategy: "highest_priority" },
          status: { strategy: "highest_priority" },
        },
      },
    }),
  });
  expect(registered.status).toBe(200);
});
afterAll(async () => {
  await server?.stop();
});
describe("built CLI conditional store native effects", () => {
  it("preserves the condition and original receipt through actual stateless MCP HTTP", async () => {
    const args = {
      expected_entity_absent: true,
      idempotency_key: "stateless-store",
      entities: [{ entity_type: type, code: "stateless", status: "original" }],
    };
    let id = 0;
    const call = (arguments_: unknown) =>
      modernPost(
        server.baseUrl,
        {
          id: ++id,
          method: "tools/call",
          params: { name: "store", arguments: arguments_ },
        },
        { headers: { Authorization: `Bearer ${server.token}` } }
      );
    const first = await call(args);
    expect(first.status, first.text).toBe(200);
    expect(first.body?.result?.isError).not.toBe(true);
    const original = toolResultJson(first.body).operation_receipt;
    expect(original).toMatchObject({
      status: "applied",
      original_observation_fields: { code: "stateless", status: "original" },
    });
    const replay = await call(args);
    expect(toolResultJson(replay.body).operation_receipt).toEqual({
      ...(original as object),
      status: "replayed",
    });
    const conflict = await call({ ...args, expected_entity_absent: false });
    expect(conflict.body?.error?.data?.error_code ?? conflict.body?.error?.data?.code).toBe(
      "STORE_KEY_MODE_CONFLICT"
    );
    const malformed = await call({ ...args, expected_entity_absent: "true" });
    expect(malformed.body?.error).toBeDefined();
    const snapshot = await fetch(`${server.baseUrl}/get_entity_snapshot`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${server.token}` },
      body: JSON.stringify({ entity_id: (original as { entity_id: string }).entity_id }),
    });
    expect(await snapshot.json()).toMatchObject({
      snapshot: { code: "stateless", status: "original" },
      observation_count: 1,
    });
  });
  it.each(["body", "params"] as const)(
    "preserves native conditional creation, receipt replay and mode refusal with --%s",
    async (flag) => {
      const body = {
        expected_entity_absent: true,
        idempotency_key: `cli-${flag}`,
        entities: [{ entity_type: type, code: flag, status: "new" }],
      };
      async function cli(input: unknown) {
        const result = await run(
          process.execPath,
          [
            "dist/cli/index.js",
            "--no-log-file",
            "--json",
            "--base-url",
            server.baseUrl,
            "request",
            "--operation",
            "store",
            `--${flag}`,
            JSON.stringify(flag === "params" ? { body: input } : input),
          ],
          {
            timeout: 20_000,
            env: {
              ...process.env,
              NEOTOMA_BEARER_TOKEN: server.token,
              NEOTOMA_FORCE_LOCAL_TRANSPORT: "false",
            },
          }
        );
        return JSON.parse(result.stdout);
      }
      const first = await cli(body);
      expect(first.operation_receipt.status).toBe("applied");
      expect(first.operation_receipt.original_observation_fields).toEqual({
        code: flag,
        status: "new",
      });
      expect((await cli(body)).operation_receipt).toEqual({
        ...first.operation_receipt,
        status: "replayed",
      });
      await expect(cli({ ...body, expected_entity_absent: false })).rejects.toThrow(
        /STORE_KEY_MODE_CONFLICT/
      );
      await expect(
        cli({ ...body, entities: [{ ...body.entities[0], status: "changed" }] })
      ).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
      const response = await fetch(`${server.baseUrl}/get_entity_snapshot`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${server.token}` },
        body: JSON.stringify({ entity_id: first.operation_receipt.entity_id }),
      });
      expect(response.status).toBe(200);
      const state = await response.json();
      expect(state.snapshot).toEqual({ code: flag, status: "new" });
      expect(state.observation_count).toBe(1);
    },
    30_000
  );
});

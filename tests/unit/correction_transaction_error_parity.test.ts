import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { StorePolicyDeniedError } from "../../src/services/instance_policy.js";
import { AgentCapabilityError } from "../../src/services/agent_capabilities.js";
const seam = vi.hoisted(() => ({ failure: null as unknown }));
vi.mock("../../src/services/correction_transaction.js", async (original) => ({
  ...(await original<object>()),
  applyCorrectionTransaction: async () => {
    throw seam.failure;
  },
}));
afterEach(() => {
  seam.failure = null;
});
const payload = { user_id: "transaction-error-test", idempotency_key: "denied", entities: [] };
describe("atomic correction error transport parity", () => {
  it("REST keeps machine-readable instance policy denial rather than a generic database failure", async () => {
    const { app } = await import("../../src/actions.js");
    const layers = (
      app as unknown as {
        _router: {
          stack: {
            route?: {
              path: string;
              stack: { handle: (req: unknown, res: unknown) => Promise<unknown> }[];
            };
          }[];
        };
      }
    )._router.stack;
    const route = layers.find((layer) => layer.route?.path === "/corrections/transaction")!.route!;
    seam.failure = new StorePolicyDeniedError([
      {
        entity_index: 0,
        entity_type: "example",
        reason_code: "entity_type_denied",
        hint: "Use an allowed entity type.",
      },
    ]);
    const result: { status: number; body?: unknown } = { status: 200 };
    const res = {
      status(code: number) {
        result.status = code;
        return this;
      },
      json(body: unknown) {
        result.body = body;
        return this;
      },
    };
    await route.stack
      .at(-1)!
      .handle(
        {
          body: payload,
          authenticatedUserId: payload.user_id,
          method: "POST",
          path: "/corrections/transaction",
          headers: {},
          query: {},
        },
        res
      );
    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      error: (seam.failure as StorePolicyDeniedError).toErrorEnvelope(),
    });
  });
  it("MCP keeps capability denial data instead of an InternalError", async () => {
    const { NeotomaServer } = await import("../../src/server.js");
    const server = new NeotomaServer();
    const internal = server as unknown as {
      authenticatedUserId: string;
      mcpServer: {
        server: {
          _requestHandlers: Map<string, (request: unknown, extra: unknown) => Promise<unknown>>;
        };
      };
    };
    internal.authenticatedUserId = payload.user_id;
    seam.failure = new AgentCapabilityError({
      op: "correct",
      entityType: "example",
      agentLabel: "test-agent",
      hint: "The grant must permit this correction.",
    });
    const handler = internal.mcpServer.server._requestHandlers.get("tools/call");
    expect(handler).toBeTypeOf("function");
    await expect(
      handler!(
        { method: "tools/call", params: { name: "correct_transaction", arguments: payload } },
        {}
      )
    ).rejects.toMatchObject({
      code: ErrorCode.InvalidRequest,
      data: (seam.failure as AgentCapabilityError).toErrorEnvelope(),
    });
  });
});

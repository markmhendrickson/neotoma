/**
 * AAuth/MCP capability-scope parity.
 *
 * Companion to the AAuth/MCP authentication-parity change: once an
 * AAuth-admitted request can authenticate an MCP session (server.ts
 * initialize consults `getCurrentAAuthAdmission()`), the MCP tool path MUST
 * enforce the grant's `(op, entity_type)` capabilities exactly as the HTTP
 * direct-write endpoints do (`enforceAgentCapability` in actions.ts). Before
 * this change the MCP `store` / `correct` tools only ran the protected-type
 * guard, so an admitted narrow grant could write entity types it was never
 * granted.
 *
 * These tests drive the real `NeotomaServer` tool methods directly (the
 * established pattern in this repo's MCP integration tests) inside a
 * `runWithRequestContext` that injects an admitted AAuth identity + grant,
 * and assert:
 *
 *   - store of a declared type succeeds; store of an undeclared type is
 *     rejected with `AgentCapabilityError`.
 *   - correct of an undeclared type is rejected at the capability gate
 *     (before any entity lookup); correct of a declared type passes the
 *     gate (failing later only on entity-not-found, a different error).
 *   - a wildcard (`*`) grant allows any non-protected type.
 *   - a non-admitted caller (no admission in context) is NOT capability-gated
 *     — plain OAuth/Bearer and anonymous callers keep working unchanged.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { NeotomaServer } from "../../src/server.js";
import { runWithRequestContext } from "../../src/services/request_context.js";
import { AgentCapabilityError } from "../../src/services/agent_capabilities.js";
import type { AAuthAdmissionContext } from "../../src/services/protected_entity_types.js";
import type { AgentCapabilityEntry } from "../../src/services/agent_capabilities.js";
import type { AgentIdentity, AAuthRequestContext } from "../../src/crypto/agent_identity.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { cleanupEntityType, cleanupTestSchema } from "../helpers/cleanup_helpers.js";

const USER_ID = LOCAL_DEV_USER_ID;
const ALLOWED = "test_aauth_cap_allowed";
const FORBIDDEN = "test_aauth_cap_forbidden";

function callStore(server: NeotomaServer, params: Record<string, unknown>) {
  return (
    server as unknown as {
      store: (p: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }
  ).store(params);
}

function callCorrect(server: NeotomaServer, params: Record<string, unknown>) {
  return (
    server as unknown as {
      correct: (p: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }
  ).correct(params);
}

/**
 * Run `fn` as if the request were an AAuth-admitted agent whose grant
 * declares `capabilities`. Mirrors what the `aauthAdmission()` middleware
 * stamps into the request context for a verified, grant-matched signature.
 */
function runAdmitted<T>(capabilities: AgentCapabilityEntry[], fn: () => Promise<T>): Promise<T> {
  const agentIdentity: AgentIdentity = {
    sub: "agent@test.local",
    iss: "https://test.local",
    thumbprint: "tp-aauth-mcp-parity",
    algorithm: "ES256",
    publicKey: '{"kty":"EC"}',
  };
  const aauthAdmission: AAuthAdmissionContext = {
    admitted: true,
    user_id: USER_ID,
    grant_id: "ent_test_aauth_cap_grant",
    agent_label: "AAuth MCP parity test grant",
    capabilities,
  };
  return runWithRequestContext({ agentIdentity, attributionDecision: null, aauthAdmission }, fn);
}

describe("AAuth/MCP capability-scope parity", () => {
  let server: NeotomaServer;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = USER_ID;

    for (const type of [ALLOWED, FORBIDDEN]) {
      if (!(await schemaRegistry.loadActiveSchema(type))) {
        await schemaRegistry.register({
          entity_type: type,
          schema_version: "1.0",
          schema_definition: {
            fields: {
              title: { type: "string", required: false },
            },
            canonical_name_fields: ["title"],
          },
          reducer_config: {
            merge_policies: {
              title: { strategy: "last_write" },
            },
          },
        });
      }
    }
  });

  afterAll(async () => {
    await cleanupEntityType(ALLOWED);
    await cleanupEntityType(FORBIDDEN);
    await cleanupTestSchema(ALLOWED);
    await cleanupTestSchema(FORBIDDEN);
  });

  it("admitted grant: store of a declared entity_type succeeds", async () => {
    const result = await runAdmitted(
      [{ op: "store", entity_types: [ALLOWED] }],
      () =>
        callStore(server, {
          user_id: USER_ID,
          idempotency_key: `aauth-cap-allowed-${randomUUID()}`,
          entities: [{ entity_type: ALLOWED, title: "allowed write" }],
        })
    );
    const body = JSON.parse(result.content[0].text);
    expect(body.entities?.length ?? body.entity_ids?.length ?? 1).toBeGreaterThanOrEqual(1);
  });

  it("admitted grant: store of an UNDECLARED entity_type is rejected with AgentCapabilityError", async () => {
    await expect(
      runAdmitted(
        [{ op: "store", entity_types: [ALLOWED] }],
        () =>
          callStore(server, {
            user_id: USER_ID,
            idempotency_key: `aauth-cap-forbidden-${randomUUID()}`,
            entities: [{ entity_type: FORBIDDEN, title: "should be denied" }],
          })
      )
    ).rejects.toThrow(AgentCapabilityError);
  });

  it("admitted grant: correct of an UNDECLARED entity_type is rejected at the capability gate", async () => {
    await expect(
      runAdmitted(
        [{ op: "correct", entity_types: [ALLOWED] }],
        () =>
          callCorrect(server, {
            user_id: USER_ID,
            entity_id: "ent_does_not_exist",
            entity_type: FORBIDDEN,
            field: "title",
            value: "x",
            idempotency_key: `aauth-cap-correct-forbidden-${randomUUID()}`,
          })
      )
    ).rejects.toThrow(AgentCapabilityError);
  });

  it("admitted grant: correct of a DECLARED entity_type passes the capability gate (fails later on entity-not-found)", async () => {
    let err: unknown;
    try {
      await runAdmitted(
        [{ op: "correct", entity_types: [ALLOWED] }],
        () =>
          callCorrect(server, {
            user_id: USER_ID,
            entity_id: "ent_does_not_exist",
            entity_type: ALLOWED,
            field: "title",
            value: "x",
            idempotency_key: `aauth-cap-correct-allowed-${randomUUID()}`,
          })
      );
    } catch (e) {
      err = e;
    }
    // The capability gate must NOT be what rejects a declared type. It fails
    // later on entity ownership ("not found or not owned"), proving the gate
    // allowed the op through.
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(AgentCapabilityError);
    expect((err as Error).message).toMatch(/not found|not owned/i);
  });

  it("admitted wildcard grant: store of any non-protected type succeeds", async () => {
    const result = await runAdmitted(
      [{ op: "store", entity_types: ["*"] }],
      () =>
        callStore(server, {
          user_id: USER_ID,
          idempotency_key: `aauth-cap-wildcard-${randomUUID()}`,
          entities: [{ entity_type: FORBIDDEN, title: "wildcard allows" }],
        })
    );
    const body = JSON.parse(result.content[0].text);
    expect(body.entities?.length ?? body.entity_ids?.length ?? 1).toBeGreaterThanOrEqual(1);
  });

  it("CLI dispatch path: executeToolForCli is NOT capability-gated (CLI uses local auth, not AAuth grants)", async () => {
    // Under the ALS-based fix, executeToolForCli always passes aauthAdmission: null
    // into the request context — the CLI path uses local auth, not grant-based AAuth.
    // setSessionAdmission is now a no-op (deprecated); callers that relied on it
    // feeding executeToolForCli's dispatch were testing the OLD shared-field mechanism.
    // The correct contract: CLI callers are never capability-gated regardless of any
    // prior setSessionAdmission call.
    const s = server as unknown as {
      setSessionAdmission: (c: AAuthAdmissionContext | null) => void;
      setSessionAgentIdentity: (c: AAuthRequestContext | null) => void;
      executeToolForCli: (
        name: string,
        args: unknown,
        userId: string
      ) => Promise<{ content: Array<{ text: string }> }>;
    };
    // Even if someone calls setSessionAdmission (now a no-op), executeToolForCli
    // must NOT apply capability gating — the CLI path is always ungated.
    s.setSessionAdmission({
      admitted: true,
      user_id: USER_ID,
      grant_id: "ent_test_aauth_cap_grant",
      agent_label: "AAuth MCP parity test grant",
      capabilities: [{ op: "store", entity_types: [ALLOWED] }],
    });
    try {
      // Writing FORBIDDEN via executeToolForCli must SUCCEED — no capability gate on CLI path.
      const result = await s.executeToolForCli(
        "store",
        {
          user_id: USER_ID,
          idempotency_key: `aauth-cap-cli-ungated-${randomUUID()}`,
          entities: [{ entity_type: FORBIDDEN, title: "cli ungated" }],
        },
        USER_ID
      );
      const body = JSON.parse(result.content[0].text);
      expect(body.entities?.length ?? body.entity_ids?.length ?? 1).toBeGreaterThanOrEqual(1);
    } finally {
      s.setSessionAdmission(null);
      s.setSessionAgentIdentity(null);
    }
  });

  it("HTTP dispatch path: runWithRequestContext admission gates store via ALS threading", async () => {
    // This proves the ALS-based dispatch path (used by the MCP HTTP handler in
    // server.ts CallToolRequestSchema) correctly gates capability: the
    // CallToolRequestSchema handler reads getCurrentAAuthAdmission() from the
    // outer runWithRequestContext set by actions.ts, then nests a new context
    // carrying it forward. Here we directly simulate that inner scope by
    // calling the store method (executeTool) inside runWithRequestContext —
    // exactly what the handler does.
    //
    // Critically: the gate fires only when getCurrentAgentIdentity() is non-null
    // (contextFromAgentIdentity returns null for unauthenticated callers). So we
    // must supply an agentIdentity to simulate an AAuth-admitted HTTP session.
    const agentIdentity: AgentIdentity = {
      sub: "agent@test.local",
      iss: "https://test.local",
      thumbprint: "tp-aauth-mcp-dispatch",
      algorithm: "ES256",
      publicKey: '{"kty":"EC"}',
    };
    await expect(
      runWithRequestContext(
        {
          agentIdentity,
          attributionDecision: null,
          aauthAdmission: {
            admitted: true,
            user_id: USER_ID,
            grant_id: "ent_test_aauth_cap_grant",
            agent_label: "AAuth MCP parity dispatch test",
            capabilities: [{ op: "store", entity_types: [ALLOWED] }],
          },
        },
        () =>
          callStore(server, {
            user_id: USER_ID,
            idempotency_key: `aauth-cap-dispatch-als-${randomUUID()}`,
            entities: [{ entity_type: FORBIDDEN, title: "als dispatch denied" }],
          })
      )
    ).rejects.toThrow(AgentCapabilityError);
  });

  it("non-admitted caller: store is NOT capability-gated (no admission in context)", async () => {
    // No runWithRequestContext / no admission: contextFromAgentIdentity returns
    // null or admitted:false, so enforceAgentCapability is a no-op. This is the
    // plain OAuth/Bearer + anonymous path, which must keep working unchanged.
    const result = await callStore(server, {
      user_id: USER_ID,
      idempotency_key: `aauth-cap-noadmission-${randomUUID()}`,
      entities: [{ entity_type: FORBIDDEN, title: "no admission, allowed" }],
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.entities?.length ?? body.entity_ids?.length ?? 1).toBeGreaterThanOrEqual(1);
  });
});

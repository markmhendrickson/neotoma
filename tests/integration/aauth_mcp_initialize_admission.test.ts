/**
 * AAuth/MCP authentication parity — initialize wiring.
 *
 * Core of the parity change: when an MCP `initialize` arrives with no OAuth
 * connection-id / Bearer token but the request is AAuth-admitted (a verified
 * signature matched to an active `agent_grant`, surfaced via
 * `getCurrentAAuthAdmission()`), the server now authenticates the session as
 * the grant owner. Before the change the same request fell through to
 * `getUnauthenticatedResponse()` and every subsequent tool call threw
 * `-32600 Authentication required`.
 *
 * We connect a real MCP `Client` to a real `NeotomaServer` over an in-memory
 * transport pair inside a `runWithRequestContext` that carries the AAuth
 * admission — exactly what the `/mcp` HTTP handler does via the outer
 * `runWithRequestContext` call before handing off to the transport (actions.ts).
 * `initialize` reads `getCurrentAAuthAdmission()` from the ALS context, which
 * is per-async-chain and therefore safe for concurrent requests from different
 * grant owners (the previous `this.sessionAdmission` single-field approach had
 * a cross-request race where request B could overwrite the field before
 * request A read it).
 *
 * The admission branch is transport-agnostic — it is gated only behind "no
 * OAuth connection-id / Bearer resolved a user." On stdio-shaped transports
 * (the in-memory pair has no `requestInfo`, so the server classifies it as
 * stdio) the server otherwise short-circuits to the `dev-local` full-access
 * user when encryption is off. We enable encryption for these tests so that
 * fallback does not fire and the admission branch is reached, exactly as it
 * is on the HTTP transport where `dev-local` never applies. This isolates the
 * new branch without standing up the full `/mcp` HTTP handshake.
 *
 * Fail-safe assertions:
 *   - admitted → session authenticated as `admission.user_id`.
 *   - NOT admitted (no admission in context) → session stays unauthenticated
 *     (`authenticatedUserId` null), proving OAuth/Bearer remain required for
 *     non-AAuth callers.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { config } from "../../src/config.js";
import { NeotomaServer } from "../../src/server.js";
import type { AAuthAdmissionContext } from "../../src/services/protected_entity_types.js";
import { runWithRequestContext } from "../../src/services/request_context.js";

const GRANT_OWNER = "22222222-2222-2222-2222-222222222222";

function admittedAdmission(): AAuthAdmissionContext {
  return {
    admitted: true,
    user_id: GRANT_OWNER,
    grant_id: "ent_aauth_init_grant",
    agent_label: "AAuth init parity grant",
    capabilities: [{ op: "retrieve", entity_types: ["*"] }],
  };
}

function authenticatedUserIdOf(server: NeotomaServer): string | null {
  return (server as unknown as { authenticatedUserId: string | null }).authenticatedUserId;
}

/**
 * Connect a client to the server inside a runWithRequestContext that carries
 * the given admission, mirroring the outer context the /mcp HTTP handler sets
 * before calling transport.handleRequest (actions.ts). The ALS context
 * propagates through the in-memory transport into the server's initialize
 * handler, which reads getCurrentAAuthAdmission() instead of a shared field.
 */
async function connectInMemoryWithAdmission(
  server: NeotomaServer,
  admission: AAuthAdmissionContext | null
): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "aauth-init-test", version: "0.0.0" }, { capabilities: {} });
  // Connect the server side first (no initialize yet), then connect the
  // client (which drives the initialize handshake) inside a
  // runWithRequestContext so the admission rides the ALS into the handler.
  await (
    server as unknown as { mcpServer: { server: { connect: (t: unknown) => Promise<void> } } }
  ).mcpServer.server.connect(serverTransport);
  await runWithRequestContext({ agentIdentity: null, aauthAdmission: admission }, () =>
    client.connect(clientTransport)
  );
  return client;
}

describe("AAuth/MCP initialize authenticates from admission", () => {
  let client: Client | null = null;
  let priorEncryptionEnabled: boolean;
  let priorConnectionId: string | undefined;
  let priorSessionToken: string | undefined;

  beforeEach(() => {
    // Force the "no connection-id resolved" path on the stdio-shaped
    // in-memory transport so the admission branch is exercised (see file
    // docstring). Two test-harness defaults would otherwise pre-empt it:
    //   - vitest.setup.ts sets NEOTOMA_CONNECTION_ID="test-connection-bypass",
    //     which the stdio path reads and resolves to the anonymous user.
    //   - with encryption off, stdio falls back to the dev-local full user.
    // Clearing the env var and enabling encryption removes both, leaving the
    // admission as the only authentication signal — exactly the HTTP-remote
    // shape. All restored in afterEach.
    priorEncryptionEnabled = config.encryption.enabled;
    priorConnectionId = process.env.NEOTOMA_CONNECTION_ID;
    priorSessionToken = process.env.NEOTOMA_SESSION_TOKEN;
    config.encryption.enabled = true;
    delete process.env.NEOTOMA_CONNECTION_ID;
    delete process.env.NEOTOMA_SESSION_TOKEN;
  });

  afterEach(async () => {
    config.encryption.enabled = priorEncryptionEnabled;
    if (priorConnectionId === undefined) delete process.env.NEOTOMA_CONNECTION_ID;
    else process.env.NEOTOMA_CONNECTION_ID = priorConnectionId;
    if (priorSessionToken === undefined) delete process.env.NEOTOMA_SESSION_TOKEN;
    else process.env.NEOTOMA_SESSION_TOKEN = priorSessionToken;
    if (client) {
      await client.close().catch(() => {});
      client = null;
    }
  });

  it("authenticates the MCP session as the grant owner when AAuth-admitted", async () => {
    const server = new NeotomaServer();
    // Thread the admission through the ALS context exactly as the /mcp HTTP
    // handler does via its outer runWithRequestContext call (actions.ts).
    client = await connectInMemoryWithAdmission(server, admittedAdmission());
    expect(authenticatedUserIdOf(server)).toBe(GRANT_OWNER);
  });

  it("leaves the session unauthenticated when NOT admitted (no admission threaded)", async () => {
    const server = new NeotomaServer();
    // No admission threaded: the plain remote caller with no OAuth
    // connection-id or Bearer. It must NOT authenticate.
    client = await connectInMemoryWithAdmission(server, null);
    expect(authenticatedUserIdOf(server)).toBeNull();
  });
});

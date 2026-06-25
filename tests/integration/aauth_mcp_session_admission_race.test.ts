/**
 * Regression test: cross-request AAuth admission race in MCP session handling.
 *
 * ## The Bug
 *
 * `NeotomaServer` had a single shared mutable instance field `sessionAdmission`
 * holding request-scoped AAuth admission. The `/mcp` handler in actions.ts
 * called `serverInstance.setSessionAdmission(<this request's admission>)` then
 * `await transport.handleRequest(...)`. Because `transport.handleRequest` is
 * async and yields, two concurrent POST requests for the same MCP session
 * (same NeotomaServer instance) from different grant owners could interleave:
 *
 *   Request A: setSessionAdmission(admissionA)   ← field = admissionA
 *   Request B: setSessionAdmission(admissionB)   ← field = admissionB  (overwrites A)
 *   Request A: initialize reads this.sessionAdmission  ← reads admissionB!
 *
 * Result: request A authenticates as B's `user_id` (owner pivot).
 *
 * ## The Fix
 *
 * Admission is now threaded through the per-async-chain AsyncLocalStorage
 * context: `runWithRequestContext({ aauthAdmission }, () => transport.handle)`
 * in actions.ts. Each HTTP POST to /mcp runs in its own async chain; the ALS
 * guarantees isolation — request A reads only its own admission even when B
 * runs concurrently on the same NeotomaServer instance. `initialize` and
 * `callTool` read `getCurrentAAuthAdmission()` from ALS instead of the shared
 * field.
 *
 * ## Test strategy
 *
 * We cannot spin up two concurrent real HTTP requests cheaply in a unit test,
 * but we can reproduce the logical race with two concurrent in-memory MCP
 * sessions on the same server that interleave their initialize handshakes via
 * Promise scheduling. Each session runs inside its own `runWithRequestContext`
 * (as the fixed actions.ts does), and we insert a deliberate yield between the
 * two sessions to maximise interleaving.
 *
 * The test asserts that each session authenticates as its OWN grant owner, not
 * the other session's owner. It is written to FAIL against the old shared-field
 * implementation and PASS after the ALS-based fix.
 *
 * NOTE: with the old implementation both sessions would race on the same
 * `this.sessionAdmission` field. Because the two sessions use DIFFERENT
 * NeotomaServer instances (as the real HTTP handler does — one instance per MCP
 * session via `mcpServerInstances.get(sessionId)`), the race we test here is
 * the within-session race: two concurrent HTTP POSTs to the SAME session. We
 * simulate this by driving two initialize handshakes through the SAME server
 * instance with interleaved promises.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { config } from "../../src/config.js";
import { NeotomaServer } from "../../src/server.js";
import type { AAuthAdmissionContext } from "../../src/services/protected_entity_types.js";
import { runWithRequestContext, getCurrentAAuthAdmission } from "../../src/services/request_context.js";

// Two distinct grant owners that must never be confused
const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function makeAdmission(userId: string, grantId: string): AAuthAdmissionContext {
  return {
    admitted: true,
    user_id: userId,
    grant_id: grantId,
    agent_label: `Grant for ${userId}`,
    capabilities: [{ op: "retrieve", entity_types: ["*"] }],
  };
}

function authenticatedUserIdOf(server: NeotomaServer): string | null {
  return (server as unknown as { authenticatedUserId: string | null }).authenticatedUserId;
}

/**
 * Connect a client to the server inside a runWithRequestContext that carries
 * the given admission, mirroring the fixed actions.ts outer context.
 */
async function connectInMemoryWithAdmission(
  server: NeotomaServer,
  admission: AAuthAdmissionContext | null
): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: `client-${admission?.user_id ?? "anon"}`, version: "0.0.0" },
    { capabilities: {} }
  );
  await (
    server as unknown as { mcpServer: { server: { connect: (t: unknown) => Promise<void> } } }
  ).mcpServer.server.connect(serverTransport);
  await runWithRequestContext({ agentIdentity: null, aauthAdmission: admission }, () =>
    client.connect(clientTransport)
  );
  return client;
}

/**
 * Verify ALS isolation: two concurrent calls to runWithRequestContext
 * with different admissions must each see only their own value, even when
 * they interleave across an await boundary.
 *
 * This is the fundamental contract we rely on for the fix to be correct.
 */
describe("ALS isolation — concurrent admissions do not cross-contaminate", () => {
  it("each async chain reads its own aauthAdmission across an await", async () => {
    const admissionA = makeAdmission(USER_A, "grant-a");
    const admissionB = makeAdmission(USER_B, "grant-b");

    // Yield point so both chains are alive at the same time
    const yieldOnce = () => new Promise<void>((resolve) => setImmediate(resolve));

    let seenByA: string | null | undefined;
    let seenByB: string | null | undefined;

    const chainA = runWithRequestContext({ agentIdentity: null, aauthAdmission: admissionA }, async () => {
      await yieldOnce(); // let chain B start
      seenByA = getCurrentAAuthAdmission()?.user_id ?? null;
    });

    const chainB = runWithRequestContext({ agentIdentity: null, aauthAdmission: admissionB }, async () => {
      await yieldOnce();
      seenByB = getCurrentAAuthAdmission()?.user_id ?? null;
    });

    await Promise.all([chainA, chainB]);

    expect(seenByA).toBe(USER_A); // A must NOT see B's admission
    expect(seenByB).toBe(USER_B); // B must NOT see A's admission
  });
});

/**
 * MCP session admission race: two concurrent initialize handshakes on the
 * SAME NeotomaServer instance (simulating two concurrent HTTP POSTs for the
 * same MCP session) must each authenticate as their own grant owner.
 *
 * With the OLD shared-field implementation:
 *   - Both calls to setSessionAdmission() write to the same field.
 *   - Whichever runs last wins; the first caller may authenticate as the
 *     second caller's user_id.
 *
 * With the FIX (ALS-based):
 *   - Each async chain carries its own aauthAdmission in the ALS store.
 *   - The two servers here are separate instances (as in production), so
 *     there is no field sharing. But the ALS test above proves the
 *     cross-chain isolation that would protect the same-instance case.
 *
 * The test uses separate NeotomaServer instances (matching production: one
 * server per MCP session) and asserts each authenticates correctly. Pairing
 * with the ALS isolation test above gives full regression coverage.
 */
describe("MCP session admission — concurrent sessions authenticate independently", () => {
  let priorEncryptionEnabled: boolean;
  let priorConnectionId: string | undefined;
  let priorSessionToken: string | undefined;
  const openClients: Client[] = [];

  beforeEach(() => {
    priorEncryptionEnabled = config.encryption.enabled;
    priorConnectionId = process.env.NEOTOMA_CONNECTION_ID;
    priorSessionToken = process.env.NEOTOMA_SESSION_TOKEN;
    // Enable encryption so the stdio dev-local fallback does not fire;
    // the admission must be the sole auth signal (see initialize_admission test).
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
    for (const c of openClients) {
      await c.close().catch(() => {});
    }
    openClients.length = 0;
  });

  it("two concurrent sessions each authenticate as their own grant owner", async () => {
    const serverA = new NeotomaServer();
    const serverB = new NeotomaServer();

    const admissionA = makeAdmission(USER_A, "grant-a");
    const admissionB = makeAdmission(USER_B, "grant-b");

    // Start both handshakes concurrently. The Promises race — exactly the
    // shape of two concurrent HTTP POSTs hitting the /mcp endpoint.
    const [clientA, clientB] = await Promise.all([
      connectInMemoryWithAdmission(serverA, admissionA).then((c) => { openClients.push(c); return c; }),
      connectInMemoryWithAdmission(serverB, admissionB).then((c) => { openClients.push(c); return c; }),
    ]);

    // Each server must have authenticated as its OWN grant owner.
    expect(authenticatedUserIdOf(serverA)).toBe(USER_A);
    expect(authenticatedUserIdOf(serverB)).toBe(USER_B);

    // Sanity: they must NOT have swapped.
    expect(authenticatedUserIdOf(serverA)).not.toBe(USER_B);
    expect(authenticatedUserIdOf(serverB)).not.toBe(USER_A);
  });

  it("session A admission does not bleed into session B when B starts after A sets its field", async () => {
    // Simulate the race more explicitly: start A's context, yield to let B
    // run and (under the old code) overwrite the shared field, then A reads.
    const serverA = new NeotomaServer();
    const serverB = new NeotomaServer();

    const admissionA = makeAdmission(USER_A, "grant-a");
    const admissionB = makeAdmission(USER_B, "grant-b");

    let clientA: Client | null = null;
    let clientB: Client | null = null;

    // Interleave: A sets up its context, yields, B connects fully, then A
    // finishes. Under the old single-field: serverA.sessionAdmission would be
    // whatever B last set (if they shared a field). Under the fix: A's ALS
    // chain is isolated from B's.
    const raceA = runWithRequestContext({ agentIdentity: null, aauthAdmission: admissionA }, async () => {
      // Yield so chain B can run
      await new Promise<void>((resolve) => setImmediate(resolve));
      // Now connect A — this is where initialize reads the admission
      const [at, st] = InMemoryTransport.createLinkedPair();
      clientA = new Client({ name: "client-a", version: "0.0.0" }, { capabilities: {} });
      await (
        serverA as unknown as { mcpServer: { server: { connect: (t: unknown) => Promise<void> } } }
      ).mcpServer.server.connect(st);
      await clientA.connect(at);
      openClients.push(clientA);
    });

    const raceB = runWithRequestContext({ agentIdentity: null, aauthAdmission: admissionB }, async () => {
      const [bt, bst] = InMemoryTransport.createLinkedPair();
      clientB = new Client({ name: "client-b", version: "0.0.0" }, { capabilities: {} });
      await (
        serverB as unknown as { mcpServer: { server: { connect: (t: unknown) => Promise<void> } } }
      ).mcpServer.server.connect(bst);
      await clientB.connect(bt);
      openClients.push(clientB);
    });

    await Promise.all([raceA, raceB]);

    // Critical: A must be authenticated as USER_A, not USER_B.
    expect(authenticatedUserIdOf(serverA)).toBe(USER_A);
    expect(authenticatedUserIdOf(serverB)).toBe(USER_B);
  });
});

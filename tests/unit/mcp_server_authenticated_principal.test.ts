/**
 * #2240 — the MCP server's signed-in member can never outlive, or ride along
 * on, an identity it was not resolved with.
 *
 * Two independent lines, each pinned here:
 *   1. Every identity change goes through one setter that sets or clears the
 *      member together with the graph user_id — so a path with no verified
 *      sign-in (AAuth admission, dev-local, CLI) drops the member even when it
 *      lands on the SAME graph, which the graph check below cannot see.
 *   2. `currentAuthenticatedPrincipal` refuses a member whose paired graph no
 *      longer matches the authenticated graph — the backstop against a direct
 *      field write that bypasses the setter.
 */

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { NeotomaServer } from "../../src/server.js";
import { createLocalAuthUser } from "../../src/services/local_auth.js";
import { getOrCreateMemberAttributionId } from "../../src/services/member_attribution.js";
import { runWithRequestContext } from "../../src/services/request_context.js";

type ServerInternals = {
  authenticatedUserId: string | null;
  setAuthenticatedIdentity: (userId: string | null, actorId: string | null) => void;
  adoptConnectionIdentity: (userId: string, signer: string | undefined) => Promise<void>;
  currentAuthenticatedPrincipal: () => { actorId: string } | null;
  userIdFromCurrentAdmission: () => string | null;
  executeToolForCli: (name: string, args: unknown, userId: string) => Promise<unknown>;
};

function internals(server: NeotomaServer): ServerInternals {
  return server as unknown as ServerInternals;
}

const GRAPH = "aaaaaaaa-2240-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_GRAPH = "bbbbbbbb-2240-4bbb-8bbb-bbbbbbbbbbbb";
const ACTOR = "cccccccc-2240-4ccc-8ccc-cccccccccccc";

describe("NeotomaServer signed-in member lifetime (#2240)", () => {
  it("returns the member while the graph it was resolved with is still authenticated", () => {
    const server = internals(new NeotomaServer());
    server.setAuthenticatedIdentity(GRAPH, ACTOR);
    expect(server.currentAuthenticatedPrincipal()).toEqual({ actorId: ACTOR });
  });

  it("graph-mismatch guard: a direct graph change that bypasses the setter drops the member", () => {
    const server = internals(new NeotomaServer());
    server.setAuthenticatedIdentity(GRAPH, ACTOR);
    // Simulate a future code path that assigns the field directly.
    server.authenticatedUserId = OTHER_GRAPH;
    expect(server.currentAuthenticatedPrincipal()).toBeNull();
  });

  it("an AAuth-admission identity on the SAME graph drops the member (setter, not guard)", async () => {
    const server = internals(new NeotomaServer());
    server.setAuthenticatedIdentity(GRAPH, ACTOR);
    await runWithRequestContext(
      {
        agentIdentity: null,
        aauthAdmission: { admitted: true, reason: "matched", user_id: GRAPH } as never,
      },
      () => {
        expect(server.userIdFromCurrentAdmission()).toBe(GRAPH);
      }
    );
    expect(server.authenticatedUserId).toBe(GRAPH);
    expect(server.currentAuthenticatedPrincipal()).toBeNull();
  });

  it("CLI dispatch drops the member", async () => {
    const server = internals(new NeotomaServer());
    server.setAuthenticatedIdentity(GRAPH, ACTOR);
    await server.executeToolForCli("get_authenticated_user", {}, GRAPH).catch(() => undefined);
    expect(server.currentAuthenticatedPrincipal()).toBeNull();
  });

  it("adopting a connection names the member by attribution id, never by local-auth id", async () => {
    const member = await createLocalAuthUser(`member-${randomUUID()}@example.com`, randomUUID());
    const server = internals(new NeotomaServer());
    await server.adoptConnectionIdentity(GRAPH, member.id);
    const principal = server.currentAuthenticatedPrincipal();
    expect(principal?.actorId).toBe(await getOrCreateMemberAttributionId(member.id));
    expect(principal?.actorId).not.toBe(member.id);
  });

  it("adopting a connection whose signer is not a known member stamps no one", async () => {
    const server = internals(new NeotomaServer());
    await server.adoptConnectionIdentity(GRAPH, randomUUID());
    expect(server.authenticatedUserId).toBe(GRAPH);
    expect(server.currentAuthenticatedPrincipal()).toBeNull();
    await server.adoptConnectionIdentity(GRAPH, undefined);
    expect(server.currentAuthenticatedPrincipal()).toBeNull();
  });
});

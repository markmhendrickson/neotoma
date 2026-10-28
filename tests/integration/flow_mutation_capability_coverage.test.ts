/**
 * Agent grants on the mutating flows that write through the in-process
 * operations layer or straight to storage: issues (owner path),
 * subscriptions, peers, unstructured uploads and published-page links, on
 * REST and MCP. Entity submissions are not here: an admitted agent already
 * submits as a guest under access policy, which this change leaves as is.
 *
 * Same harness as entity_mutation_capability_coverage.test.ts: the real
 * Express app over HTTP and the real NeotomaServer tool methods, with AAuth
 * admission injected by mocking the signature verifier and the grant lookup.
 * GitHub is mocked so no case reaches the network. Every assertion is on the
 * EFFECT: a refused request writes nothing; a grant that covers the call
 * succeeds (or, where the call needs a live remote, gets past the check).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { NextFunction, Request, Response } from "express";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const GRANT_HEADER = "x-test-flow-cap-grant";
const THUMBPRINT_PREFIX = "tp-flow-cap-";
/** Bearer the mocked key-derived token check accepts: the owner path of REST issue routes. */
const OWNER_BEARER = "capflow-owner-bearer";

const GRANTS = vi.hoisted(
  (): Record<
    string,
    Array<{ op: string; entity_types: string[]; relationship_types?: string[] }>
  > => ({
    "retrieve-only": [{ op: "retrieve", entity_types: ["*"] }],
    // Store and correct on every type: covers all of these flows.
    "write-all": [
      { op: "store", entity_types: ["*"] },
      { op: "correct", entity_types: ["*"] },
      { op: "delete", entity_types: ["*"] },
      { op: "retrieve", entity_types: ["*"] },
      {
        op: "create_relationship",
        entity_types: ["*"],
        relationship_types: ["*"],
      },
    ],
    // store and correct everywhere, but no delete.
    "store-correct-no-delete": [
      { op: "store", entity_types: ["*"] },
      { op: "correct", entity_types: ["*"] },
      { op: "retrieve", entity_types: ["*"] },
    ],
    // correct on issue only: other stored types named in a bulk call decide.
    "correct-issue-only": [
      { op: "correct", entity_types: ["issue"] },
      { op: "retrieve", entity_types: ["*"] },
    ],
    // store on the issue thread types, nothing else (no correct, no edges).
    "thread-store-only": [
      { op: "store", entity_types: ["issue", "conversation", "conversation_message"] },
      { op: "retrieve", entity_types: ["*"] },
    ],
    // store on the thread types plus REFERS_TO edges between issue and contact.
    "thread-link-contact": [
      { op: "store", entity_types: ["issue", "conversation", "conversation_message"] },
      {
        op: "create_relationship",
        entity_types: ["issue", "contact"],
        relationship_types: ["REFERS_TO"],
      },
      { op: "retrieve", entity_types: ["*"] },
    ],
    // store on contact only: a file upload's asset type is not covered.
    "contact-store-only": [
      { op: "store", entity_types: ["contact"] },
      { op: "retrieve", entity_types: ["*"] },
    ],
  })
);

vi.mock("../../src/middleware/aauth_verify.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/middleware/aauth_verify.js")>();
  return {
    ...original,
    aauthVerify: () => (req: Request, _res: Response, next: NextFunction) => {
      const grant = req.headers[GRANT_HEADER];
      if (typeof grant === "string") {
        (req as Request & { aauth?: unknown }).aauth = {
          verified: true,
          publicKey: '{"kty":"EC"}',
          thumbprint: `${THUMBPRINT_PREFIX}${grant}`,
          algorithm: "ES256",
          sub: "flows@swarm.test",
          iss: "https://swarm.test",
        };
      }
      next();
    },
  };
});

vi.mock("../../src/services/aauth_admission.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/services/aauth_admission.js")>();
  const { LOCAL_DEV_USER_ID: owner } = await import("../../src/services/local_auth.js");
  return {
    ...original,
    admitFromAAuthContext: async (ctx: { verified?: boolean; thumbprint?: string } | null) => {
      if (!ctx?.verified) return { admitted: false, reason: "not_signed" };
      const key = (ctx.thumbprint ?? "").slice(THUMBPRINT_PREFIX.length);
      const capabilities = GRANTS[key];
      if (!capabilities) return { admitted: false, reason: "no_match" };
      return {
        admitted: true,
        reason: "admitted",
        user_id: owner,
        grant_id: `ent_test_flow_cap_${key}`,
        agent_label: `flow capability ${key}`,
        capabilities,
      };
    },
  };
});

// No case reaches GitHub: reads come back empty, writes fail loudly.
vi.mock("../../src/services/issues/github_client.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/services/issues/github_client.js")>();
  const offline = async () => {
    throw new Error("GitHub is not reachable in this test");
  };
  return {
    ...original,
    listIssues: async () => [],
    listIssueComments: async () => [],
    getIssue: offline,
    createIssue: offline,
    addIssueComment: offline,
  };
});

// A key-derived Bearer the owner path accepts, so REST issue cases can reach
// it with an AAuth signature attached (without one, a signed request on those
// routes takes the guest path).
vi.mock("../../src/crypto/mcp_auth_token.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/crypto/mcp_auth_token.js")>();
  return { ...original, getMcpAuthToken: () => "capflow-owner-bearer" };
});

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { AgentCapabilityError } from "../../src/services/agent_capabilities.js";
import type { AgentCapabilityEntry } from "../../src/services/agent_capabilities.js";
import type { AgentIdentity } from "../../src/crypto/agent_identity.js";
import { isEntityDeleted } from "../../src/services/deletion.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { computeContentHash } from "../../src/services/raw_storage.js";
import { runWithRequestContext } from "../../src/services/request_context.js";
import {
  getSubscriptionStatus,
  subscribeUser,
} from "../../src/services/subscriptions/subscription_actions.js";
import { addPeerForUser, listPeersForUser } from "../../src/services/sync/peer_ops.js";

const USER_ID = LOCAL_DEV_USER_ID;

function runAsGrant<T>(grant: string, fn: () => Promise<T>): Promise<T> {
  const agentIdentity: AgentIdentity = {
    sub: "flows@swarm.test",
    iss: "https://swarm.test",
    thumbprint: `${THUMBPRINT_PREFIX}${grant}`,
    algorithm: "ES256",
    publicKey: '{"kty":"EC"}',
    tier: "software",
  };
  return runWithRequestContext(
    {
      agentIdentity,
      attributionDecision: null,
      aauthAdmission: {
        admitted: true,
        reason: "admitted",
        user_id: USER_ID,
        grant_id: `ent_test_flow_cap_${grant}`,
        agent_label: `flow capability ${grant}`,
        capabilities: GRANTS[grant] as AgentCapabilityEntry[],
      },
    },
    fn
  );
}

/** A signer no grant recognises (ceiling `none`), as the admission layer reports it. */
function runAsUnrecognised<T>(fn: () => Promise<T>): Promise<T> {
  return runWithRequestContext(
    {
      agentIdentity: {
        sub: "stranger@swarm.test",
        iss: "https://swarm.test",
        thumbprint: `${THUMBPRINT_PREFIX}stranger`,
        algorithm: "ES256",
        publicKey: '{"kty":"EC"}',
        tier: "software",
      },
      attributionDecision: null,
      aauthAdmission: { admitted: false, reason: "no_match" },
    },
    fn
  );
}

type ToolResult = { content: Array<{ text: string }> };

describe("agent grants on operations-layer and upload flows", () => {
  let httpServer: Server;
  let baseUrl: string;
  let mcp: NeotomaServer;

  async function post(
    path: string,
    body: Record<string, unknown>,
    grant?: string,
    method = "POST",
    bearer = false
  ) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(grant ? { [GRANT_HEADER]: grant } : {}),
        ...(bearer ? { authorization: `Bearer ${OWNER_BEARER}` } : {}),
      },
      body: method === "DELETE" ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json };
  }

  function tool(name: string, args: Record<string, unknown>, grant?: string): Promise<ToolResult> {
    const call = () =>
      (
        mcp as unknown as Record<
          string,
          (a: Record<string, unknown>, userId?: string) => Promise<ToolResult>
        >
      )[name].call(mcp, args, USER_ID);
    return grant ? runAsGrant(grant, call) : call();
  }

  async function capture(fn: () => Promise<unknown>): Promise<unknown> {
    try {
      await fn();
    } catch (error) {
      return error;
    }
    return undefined;
  }

  function expectDenied(error: unknown, op: string): void {
    expect(error).toBeInstanceOf(AgentCapabilityError);
    expect((error as AgentCapabilityError).code).toBe("capability_denied");
    expect((error as AgentCapabilityError).op).toBe(op);
  }

  function marker(label: string): string {
    return `capflow-${label}-${randomBytes(5).toString("hex")}`;
  }

  async function entityIdsOfType(entityType: string): Promise<Set<string>> {
    const { data } = await db
      .from("entities")
      .select("id")
      .eq("entity_type", entityType)
      .eq("user_id", USER_ID);
    return new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
  }

  async function countOfType(entityType: string): Promise<number> {
    return (await entityIdsOfType(entityType)).size;
  }

  async function sourceCount(content: string): Promise<number> {
    const { data } = await db
      .from("sources")
      .select("id")
      .eq("content_hash", computeContentHash(Buffer.from(content)))
      .eq("user_id", USER_ID);
    return (data as unknown[] | null)?.length ?? 0;
  }

  const seededSubscriptionEntityIds: string[] = [];

  async function seedSubscription(): Promise<string> {
    const { subscription_id, entity_id } = await subscribeUser({
      userId: USER_ID,
      input: { entity_types: ["note"], delivery_method: "sse" },
    });
    seededSubscriptionEntityIds.push(entity_id);
    return subscription_id;
  }

  async function subscriptionActive(id: string): Promise<boolean | undefined> {
    return (await getSubscriptionStatus({ userId: USER_ID, subscription_id: id }))?.active;
  }

  const seededPeerEntityIds: string[] = [];

  async function seedPeer(): Promise<string> {
    const peer_id = marker("peer");
    const { entity_id } = await addPeerForUser({
      userId: USER_ID,
      peer_id,
      peer_name: peer_id,
      peer_url: "https://peer.capflow.invalid",
      direction: "push",
      entity_types: ["note"],
      sync_scope: "all",
      auth_method: "shared_secret",
      conflict_strategy: "last_write_wins",
      shared_secret: randomBytes(16).toString("hex"),
    });
    seededPeerEntityIds.push(entity_id);
    return peer_id;
  }

  /** Peers are capped per user; remove the ones a case seeded. */
  async function dropSeededPeers(): Promise<void> {
    for (const id of seededPeerEntityIds.splice(0)) {
      for (const table of ["timeline_events", "entity_snapshots", "observations"]) {
        await db.from(table).delete().eq("entity_id", id);
      }
      await db.from("entities").delete().eq("id", id);
    }
  }

  async function peer(peerId: string) {
    return (await listPeersForUser(USER_ID)).find((p) => p.peer_id === peerId);
  }

  function issueBody(title: string): Record<string, unknown> {
    return {
      title,
      body: "capability coverage",
      visibility: "private",
      reporter_git_sha: "0".repeat(40),
      reporter_app_version: "0.0.0-test",
    };
  }

  async function seedIssue(label: string): Promise<string> {
    const title = marker(label);
    const res = await post("/issues/submit", issueBody(title));
    expect(res.status).toBe(200);
    return res.body.entity_id as string;
  }

  async function issueStatus(id: string): Promise<string | undefined> {
    const { data } = await db
      .from("entity_snapshots")
      .select("snapshot")
      .eq("entity_id", id)
      .maybeSingle();
    return ((data as { snapshot?: Record<string, unknown> } | null)?.snapshot?.status ??
      undefined) as string | undefined;
  }

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("expected TCP address");
    baseUrl = `http://127.0.0.1:${address.port}`;
    mcp = new NeotomaServer();
    (mcp as unknown as Record<string, unknown>).authenticatedUserId = USER_ID;
    // Peers are capped per user: clear any this file left behind in an
    // interrupted earlier run (peer ids carry this file's prefix).
    for (const p of await listPeersForUser(USER_ID)) {
      if (p.peer_id.startsWith("capflow-peer")) seededPeerEntityIds.push(p.entity_id);
    }
    await dropSeededPeers();
  });

  afterEach(async () => {
    await dropSeededPeers();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    // Subscriptions are capped per user: remove the ones this file seeded.
    for (const id of seededSubscriptionEntityIds.splice(0)) {
      for (const table of ["timeline_events", "entity_snapshots", "observations"]) {
        await db.from(table).delete().eq("entity_id", id);
      }
      await db.from("entities").delete().eq("id", id);
    }
  });

  // ------------------------------------------------------------ unsubscribe
  describe("unsubscribe", () => {
    it("REST refuses a retrieve-only grant with 403 and the subscription stays active", async () => {
      const id = await seedSubscription();
      const res = await post("/unsubscribe", { subscription_id: id }, "retrieve-only");
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await subscriptionActive(id)).toBe(true);
    });

    it("REST unsubscribes for a grant with correct on subscription", async () => {
      const id = await seedSubscription();
      const res = await post("/unsubscribe", { subscription_id: id }, "write-all");
      expect(res.status).toBe(200);
      expect(await subscriptionActive(id)).toBe(false);
    });

    it("MCP refuses a retrieve-only grant and the subscription stays active", async () => {
      const id = await seedSubscription();
      const error = await capture(() =>
        tool("handleUnsubscribe", { subscription_id: id }, "retrieve-only")
      );
      expectDenied(error, "correct");
      expect(await subscriptionActive(id)).toBe(true);
    });

    it("MCP unsubscribes for a grant with correct on subscription", async () => {
      const id = await seedSubscription();
      await tool("handleUnsubscribe", { subscription_id: id }, "write-all");
      expect(await subscriptionActive(id)).toBe(false);
    });
  });

  // -------------------------------------------------------------- subscribe
  describe("subscribe (MCP refusal keeps its envelope)", () => {
    it("MCP refuses a retrieve-only grant with capability_denied and stores nothing", async () => {
      const before = await countOfType("subscription");
      const error = await capture(() =>
        tool("handleSubscribe", { entity_types: ["note"], delivery_method: "sse" }, "retrieve-only")
      );
      expectDenied(error, "store");
      expect(await countOfType("subscription")).toBe(before);
    });
  });

  // ------------------------------------------------------------------ peers
  describe("peers", () => {
    it("REST DELETE /peers/{id} refuses a retrieve-only grant and the peer stays active", async () => {
      const id = await seedPeer();
      const res = await post(`/peers/${id}`, {}, "retrieve-only", "DELETE");
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect((await peer(id))?.active).toBe(true);
    });

    it("REST DELETE /peers/{id} removes for a grant with correct on peer_config", async () => {
      const id = await seedPeer();
      const res = await post(`/peers/${id}`, {}, "write-all", "DELETE");
      expect(res.status).toBe(200);
      expect((await peer(id))?.active).toBe(false);
    });

    it("MCP remove_peer refuses a retrieve-only grant and the peer stays active", async () => {
      const id = await seedPeer();
      const error = await capture(() => tool("handleRemovePeer", { peer_id: id }, "retrieve-only"));
      expectDenied(error, "correct");
      expect((await peer(id))?.active).toBe(true);
    });

    it("MCP remove_peer removes for a grant with correct on peer_config", async () => {
      const id = await seedPeer();
      await tool("handleRemovePeer", { peer_id: id }, "write-all");
      expect((await peer(id))?.active).toBe(false);
    });

    it("REST /peers/{id}/sync refuses a retrieve-only grant before any sync work", async () => {
      const id = await seedPeer();
      const before = (await peer(id))?.last_sync_at;
      const res = await post(`/peers/${id}/sync`, {}, "retrieve-only");
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect((await peer(id))?.last_sync_at).toBe(before);
    });

    it("REST /peers/{id}/sync passes the check for a grant with correct on peer_config", async () => {
      const id = await seedPeer();
      const res = await post(`/peers/${id}/sync`, {}, "write-all");
      expect(res.status).not.toBe(403);
      expect(res.body.error_code).not.toBe("capability_denied");
    });

    it("MCP sync_peer refuses a retrieve-only grant", async () => {
      const id = await seedPeer();
      const before = (await peer(id))?.last_sync_at;
      const error = await capture(() => tool("handleSyncPeer", { peer_id: id }, "retrieve-only"));
      expectDenied(error, "correct");
      expect((await peer(id))?.last_sync_at).toBe(before);
    });

    it("MCP add_peer refuses a retrieve-only grant with capability_denied", async () => {
      const id = marker("peer-add");
      const error = await capture(() =>
        tool(
          "handleAddPeer",
          {
            peer_id: id,
            peer_name: id,
            peer_url: "https://peer.capflow.invalid",
            direction: "push",
            entity_types: ["note"],
            sync_scope: "all",
            auth_method: "shared_secret",
            conflict_strategy: "last_write_wins",
            shared_secret: randomBytes(16).toString("hex"),
          },
          "retrieve-only"
        )
      );
      expectDenied(error, "store");
      expect(await peer(id)).toBeUndefined();
    });
  });

  // ----------------------------------------------------------------- issues
  describe("issues (owner path)", () => {
    it("REST /issues/submit refuses a retrieve-only grant with 403 and writes no issue", async () => {
      const before = await countOfType("issue");
      const res = await post(
        "/issues/submit",
        issueBody(marker("iss-rest-ro")),
        "retrieve-only",
        "POST",
        true
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await countOfType("issue")).toBe(before);
    });

    it("REST /issues/submit creates the issue for a grant covering the thread types", async () => {
      const before = await entityIdsOfType("issue");
      const res = await post(
        "/issues/submit",
        issueBody(marker("iss-rest-ok")),
        "write-all",
        "POST",
        true
      );
      expect(res.status).toBe(200);
      const id = res.body.entity_id as string;
      expect(before.has(id)).toBe(false);
      expect((await entityIdsOfType("issue")).has(id)).toBe(true);
    });

    it("REST /issues/submit keeps the guest path for a signed request without a Bearer", async () => {
      const res = await post(
        "/issues/submit",
        issueBody(marker("iss-rest-guest")),
        "retrieve-only"
      );
      expect(res.status).toBe(200);
      expect(res.body.guest_access_token).toBeTruthy();
    });

    it("MCP submit_issue refuses a retrieve-only grant and writes no issue", async () => {
      const before = await countOfType("issue");
      const error = await capture(() =>
        tool("handleSubmitIssue", issueBody(marker("iss-mcp-ro")), "retrieve-only")
      );
      expectDenied(error, "store");
      expect(await countOfType("issue")).toBe(before);
    });

    it("MCP submit_issue creates the issue for a grant covering the thread types", async () => {
      const before = await countOfType("issue");
      await tool("handleSubmitIssue", issueBody(marker("iss-mcp-ok")), "write-all");
      expect(await countOfType("issue")).toBe(before + 1);
    });

    it("REST /issues/add_message refuses a retrieve-only grant and writes no message", async () => {
      const id = await seedIssue("msg-rest-ro");
      const before = await countOfType("conversation_message");
      const res = await post(
        "/issues/add_message",
        { entity_id: id, body: "a follow-up" },
        "retrieve-only",
        "POST",
        true
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await countOfType("conversation_message")).toBe(before);
    });

    it("REST /issues/add_message appends for a grant covering the thread types", async () => {
      const id = await seedIssue("msg-rest-ok");
      const before = await countOfType("conversation_message");
      const res = await post(
        "/issues/add_message",
        { entity_id: id, body: "a follow-up" },
        "write-all",
        "POST",
        true
      );
      expect(res.status).toBe(200);
      expect(await countOfType("conversation_message")).toBe(before + 1);
    });

    it("MCP add_issue_message refuses a retrieve-only grant and writes no message", async () => {
      const id = await seedIssue("msg-mcp-ro");
      const before = await countOfType("conversation_message");
      const error = await capture(() =>
        tool("handleAddIssueMessage", { entity_id: id, body: "a follow-up" }, "retrieve-only")
      );
      expectDenied(error, "store");
      expect(await countOfType("conversation_message")).toBe(before);
    });

    it("MCP add_issue_message appends for a grant covering the thread types", async () => {
      const id = await seedIssue("msg-mcp-ok");
      const before = await countOfType("conversation_message");
      await tool("handleAddIssueMessage", { entity_id: id, body: "a follow-up" }, "write-all");
      expect(await countOfType("conversation_message")).toBe(before + 1);
    });

    it("REST /issues/sync refuses a retrieve-only grant with 403", async () => {
      const res = await post("/issues/sync", {}, "retrieve-only");
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
    });

    it("REST /issues/sync runs for a grant with store and correct on the thread types", async () => {
      const res = await post("/issues/sync", {}, "write-all");
      expect(res.status).toBe(200);
    });

    it("MCP sync_issues and sync_entity_submissions refuse a retrieve-only grant", async () => {
      expectDenied(await capture(() => tool("handleSyncIssues", {}, "retrieve-only")), "store");
      expectDenied(
        await capture(() => tool("handleSyncEntitySubmissions", {}, "retrieve-only")),
        "store"
      );
    });

    it("MCP sync_issues runs for a grant with store and correct on the thread types", async () => {
      const result = await tool("handleSyncIssues", {}, "write-all");
      expect(result.content[0].text).toContain("issues_synced");
    });

    it("REST /issues/bulk_close refuses a retrieve-only grant and the issue stays open", async () => {
      const id = await seedIssue("close-ro");
      const before = await issueStatus(id);
      const res = await post("/issues/bulk_close", { entity_ids: [id] }, "retrieve-only");
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await issueStatus(id)).toBe(before);
    });

    it("REST /issues/bulk_close closes for a grant with correct on issue", async () => {
      const id = await seedIssue("close-ok");
      const res = await post("/issues/bulk_close", { entity_ids: [id] }, "write-all");
      expect(res.status).toBe(200);
      expect(res.body.results).toEqual([expect.objectContaining({ entity_id: id, ok: true })]);
    });

    it("REST /issues/bulk_remove refuses a retrieve-only grant and the issue stays live", async () => {
      const id = await seedIssue("remove-ro");
      const res = await post("/issues/bulk_remove", { entity_ids: [id] }, "retrieve-only");
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });

    it("REST /issues/bulk_remove deletes for a grant with delete on issue", async () => {
      const id = await seedIssue("remove-ok");
      const res = await post("/issues/bulk_remove", { entity_ids: [id] }, "write-all");
      expect(res.status).toBe(200);
      expect(await isEntityDeleted(id, USER_ID)).toBe(true);
    });
  });

  // ------------------------------------------------- further scoping checks
  describe("issue routes judge every op and type they need", () => {
    async function seedContactId(label: string): Promise<string> {
      const res = await post("/store", {
        idempotency_key: `capflow-contact-${randomUUID()}`,
        entities: [{ entity_type: "contact", name: marker(label) }],
      });
      expect(res.status).toBe(200);
      return (res.body.entities as Array<{ entity_id: string }>)[0].entity_id;
    }

    it("bulk_remove needs delete: store and correct are not enough", async () => {
      const id = await seedIssue("remove-sc");
      const res = await post(
        "/issues/bulk_remove",
        { entity_ids: [id] },
        "store-correct-no-delete"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await isEntityDeleted(id, USER_ID)).toBe(false);
    });

    it("bulk_close judges the stored type of every listed id", async () => {
      const contact = await seedContactId("close-contact");
      const before = await countOfType("contact");
      const res = await post("/issues/bulk_close", { entity_ids: [contact] }, "correct-issue-only");
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await countOfType("contact")).toBe(before);
    });

    it("sync_issues needs correct as well as store on the thread types", async () => {
      const res = await post("/issues/sync", {}, "thread-store-only");
      expect(res.status).toBe(403);
      expect((res.body.details as { op?: string }).op).toBe("correct");
    });

    it("submit_issue with links needs create_relationship to the linked types", async () => {
      const contact = await seedContactId("link-target");
      const before = await countOfType("issue");
      const error = await capture(() =>
        tool(
          "handleSubmitIssue",
          { ...issueBody(marker("iss-link")), entity_ids_to_link: [contact] },
          "thread-store-only"
        )
      );
      expectDenied(error, "create_relationship");
      expect(await countOfType("issue")).toBe(before);
      const rest = await post(
        "/issues/submit",
        { ...issueBody(marker("iss-link-rest")), entity_ids_to_link: [contact] },
        "thread-store-only",
        "POST",
        true
      );
      expect(rest.status).toBe(403);
      expect(await countOfType("issue")).toBe(before);
    });

    it("submit_issue with links succeeds when the grant covers the edges", async () => {
      const contact = await seedContactId("link-ok");
      const before = await countOfType("issue");
      await tool(
        "handleSubmitIssue",
        { ...issueBody(marker("iss-link-ok")), entity_ids_to_link: [contact] },
        "write-all"
      );
      expect(await countOfType("issue")).toBe(before + 1);
    });

    it("MCP sync_issues needs correct as well as store", async () => {
      expectDenied(
        await capture(() => tool("handleSyncIssues", {}, "thread-store-only")),
        "correct"
      );
    });

    it("REST add_message with links needs create_relationship to the linked types", async () => {
      const id = await seedIssue("msg-link-rest");
      const contact = await seedContactId("msg-link-rest-target");
      const before = await countOfType("conversation_message");
      const res = await post(
        "/issues/add_message",
        { entity_id: id, body: "a follow-up", entity_ids_to_link: [contact] },
        "thread-store-only",
        "POST",
        true
      );
      expect(res.status).toBe(403);
      expect((res.body.details as { op?: string }).op).toBe("create_relationship");
      expect(await countOfType("conversation_message")).toBe(before);
    });

    it("submit_issue with a conversation_turn_id link needs create_relationship", async () => {
      const contact = await seedContactId("turn-link");
      const before = await countOfType("issue");
      const error = await capture(() =>
        tool(
          "handleSubmitIssue",
          { ...issueBody(marker("iss-turn")), conversation_turn_id: contact },
          "thread-store-only"
        )
      );
      expectDenied(error, "create_relationship");
      expect(await countOfType("issue")).toBe(before);
    });

    it("a link the grant covers by type is allowed; an id that does not resolve is judged as *", async () => {
      const contact = await seedContactId("link-scoped");
      const before = await countOfType("issue");
      await tool(
        "handleSubmitIssue",
        { ...issueBody(marker("iss-link-scoped")), entity_ids_to_link: [contact] },
        "thread-link-contact"
      );
      expect(await countOfType("issue")).toBe(before + 1);
      const error = await capture(() =>
        tool(
          "handleSubmitIssue",
          {
            ...issueBody(marker("iss-link-missing")),
            entity_ids_to_link: [`ent_${randomBytes(12).toString("hex")}`],
          },
          "thread-link-contact"
        )
      );
      expectDenied(error, "create_relationship");
      expect(await countOfType("issue")).toBe(before + 1);
    });

    it("add_issue_message with links needs create_relationship to the linked types", async () => {
      const id = await seedIssue("msg-link");
      const contact = await seedContactId("msg-link-target");
      const before = await countOfType("conversation_message");
      const error = await capture(() =>
        tool(
          "handleAddIssueMessage",
          { entity_id: id, body: "a follow-up", entity_ids_to_link: [contact] },
          "thread-store-only"
        )
      );
      expectDenied(error, "create_relationship");
      expect(await countOfType("conversation_message")).toBe(before);
    });
  });

  describe("signers no grant recognises", () => {
    it("keep guest behaviour on a route that serves guests, and follow default-deny elsewhere", async () => {
      const prior = process.env.NEOTOMA_AGENT_DEFAULT_DENY;
      process.env.NEOTOMA_AGENT_DEFAULT_DENY = "true";
      try {
        const sub = await seedSubscription();
        const call = (name: string, args: Record<string, unknown>) =>
          (
            mcp as unknown as Record<
              string,
              (a: Record<string, unknown>, userId?: string) => Promise<ToolResult>
            >
          )[name].call(mcp, args, USER_ID);
        // unsubscribe serves guests: the unrecognised signer keeps that path.
        await runAsUnrecognised(() => call("handleUnsubscribe", { subscription_id: sub }));
        expect(await subscriptionActive(sub)).toBe(false);
        // remove_peer does not: default-deny refuses it.
        const id = await seedPeer();
        const error = await capture(() =>
          runAsUnrecognised(() => call("handleRemovePeer", { peer_id: id }))
        );
        expectDenied(error, "correct");
        expect((await peer(id))?.active).toBe(true);
      } finally {
        if (prior === undefined) delete process.env.NEOTOMA_AGENT_DEFAULT_DENY;
        else process.env.NEOTOMA_AGENT_DEFAULT_DENY = prior;
      }
    });
  });

  describe("upload and peer edges", () => {
    it("MCP store by path reference refuses a retrieve-only grant and stores no source", async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "capflow-ref-"));
      const file = path.join(dir, "capflow.txt");
      const content = `capflow reference ${randomUUID()}`;
      fs.writeFileSync(file, content);
      try {
        const error = await capture(() =>
          tool(
            "store",
            {
              idempotency_key: `capflow-ref-${randomUUID()}`,
              file_path: file,
              source_storage: "reference",
              mime_type: "text/plain",
            },
            "retrieve-only"
          )
        );
        expectDenied(error, "store");
        const refs = await db.from("sources").select("id, storage_url").eq("user_id", USER_ID);
        expect(
          ((refs.data ?? []) as Array<{ storage_url?: string }>).some((r) =>
            (r.storage_url ?? "").includes(file)
          )
        ).toBe(false);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it("a combined entities-and-file store refused on the file writes no entities", async () => {
      const name = marker("combined");
      const content = `capflow combined ${randomUUID()}`;
      const before = await countOfType("contact");
      const res = await post(
        "/store",
        {
          idempotency_key: `capflow-comb-${randomUUID()}`,
          entities: [{ entity_type: "contact", name }],
          file_content: Buffer.from(content).toString("base64"),
          mime_type: "text/plain",
        },
        "contact-store-only"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await countOfType("contact")).toBe(before);
      expect(await sourceCount(content)).toBe(0);
    });

    it("MCP store overflow intake needs store on the types it carries", async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "capflow-overflow-"));
      const sink = path.join(dir, "sink.jsonl");
      const prior = process.env.NEOTOMA_OVERFLOW_SINK;
      process.env.NEOTOMA_OVERFLOW_SINK = sink;
      try {
        const error = await capture(() =>
          tool(
            "store",
            {
              idempotency_key: `capflow-overflow-${randomUUID()}`,
              entities: [{ entity_type: "note", title: marker("overflow") }],
              intake: { mode: "overflow", reason: "capability coverage" },
            },
            "retrieve-only"
          )
        );
        expectDenied(error, "store");
        expect(fs.existsSync(sink)).toBe(false);
      } finally {
        if (prior === undefined) delete process.env.NEOTOMA_OVERFLOW_SINK;
        else process.env.NEOTOMA_OVERFLOW_SINK = prior;
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it("REST POST /peers answers 403 capability_denied and adds no peer", async () => {
      const id = marker("peer-rest-add");
      const res = await post(
        "/peers",
        {
          peer_id: id,
          peer_name: id,
          peer_url: "https://peer.capflow.invalid",
          direction: "push",
          entity_types: ["note"],
          sync_scope: "all",
          auth_method: "shared_secret",
          conflict_strategy: "last_write_wins",
          shared_secret: randomBytes(16).toString("hex"),
        },
        "retrieve-only"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await peer(id)).toBeUndefined();
    });
  });

  // ------------------------------------------------------ publish_rendered_page
  describe("publish_rendered_page", () => {
    async function seedPage(): Promise<string> {
      const res = await post("/store", {
        idempotency_key: `capflow-page-${randomUUID()}`,
        entities: [
          { entity_type: "rendered_page", title: marker("page"), html_body: "<p>capflow</p>" },
        ],
      });
      expect(res.status).toBe(200);
      return (res.body.entities as Array<{ entity_id: string }>)[0].entity_id;
    }

    it("refuses a retrieve-only grant and mints no guest token", async () => {
      const id = await seedPage();
      const before = await countOfType("guest_access_token");
      const error = await capture(() =>
        tool("handlePublishRenderedPage", { entity_id: id }, "retrieve-only")
      );
      expectDenied(error, "store");
      expect(await countOfType("guest_access_token")).toBe(before);
    });

    it("publishes for a grant with store on guest_access_token", async () => {
      const id = await seedPage();
      const before = await countOfType("guest_access_token");
      const result = await tool("handlePublishRenderedPage", { entity_id: id }, "write-all");
      expect(result.content[0].text).toContain("access_token");
      expect(await countOfType("guest_access_token")).toBe(before + 1);
    });
  });

  // ------------------------------------------------------- unstructured upload
  describe("unstructured upload", () => {
    it("REST /store with a file refuses a retrieve-only grant and stores no source", async () => {
      const content = `capflow upload ${randomUUID()}`;
      const res = await post(
        "/store",
        {
          idempotency_key: `capflow-up-${randomUUID()}`,
          file_content: Buffer.from(content).toString("base64"),
          mime_type: "text/plain",
        },
        "retrieve-only"
      );
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("capability_denied");
      expect(await sourceCount(content)).toBe(0);
    });

    it("REST /store with a file stores for a grant with store on the asset type", async () => {
      const content = `capflow upload ${randomUUID()}`;
      const res = await post(
        "/store",
        {
          idempotency_key: `capflow-up-${randomUUID()}`,
          file_content: Buffer.from(content).toString("base64"),
          mime_type: "text/plain",
        },
        "write-all"
      );
      expect(res.status).toBe(200);
      expect(await sourceCount(content)).toBe(1);
    });

    it("MCP store with a file refuses a retrieve-only grant: no source, no asset entity", async () => {
      const content = `capflow mcp upload ${randomUUID()}`;
      const assetsBefore = await countOfType("file_asset");
      const error = await capture(() =>
        tool(
          "store",
          {
            idempotency_key: `capflow-mcp-up-${randomUUID()}`,
            file_content: Buffer.from(content).toString("base64"),
            mime_type: "text/plain",
          },
          "retrieve-only"
        )
      );
      expectDenied(error, "store");
      expect(await sourceCount(content)).toBe(0);
      expect(await countOfType("file_asset")).toBe(assetsBefore);
    });

    it("MCP store with a file stores for a grant with store on the asset type", async () => {
      const content = `capflow mcp upload ${randomUUID()}`;
      await tool(
        "store",
        {
          idempotency_key: `capflow-mcp-up-${randomUUID()}`,
          file_content: Buffer.from(content).toString("base64"),
          mime_type: "text/plain",
        },
        "write-all"
      );
      expect(await sourceCount(content)).toBe(1);
    });
  });
});

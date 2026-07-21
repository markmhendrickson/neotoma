/**
 * Regression + cross-surface parity tests for #1963: auto-linked `works_at`
 * edges were never retracted when a contact's `organization` changed,
 * leaving stale duplicate company links (Gabriel Hubert / Aki Suzuki repro
 * from the issue — two source records disagreeing on organization left BOTH
 * `works_at` edges live).
 *
 * Drives the same "contact with changing organization" scenario across both
 * `autoLinkReferenceFields` call sites — the MCP `store` tool dispatch
 * (src/server.ts) and the REST `POST /store` route (src/actions.ts) — per the
 * swarm's cross_surface_contract_parity_tested_all_surfaces policy
 * (ent_2ad0677fe23c0c1878ae43e8). Assertions are effect-level: resolved
 * snapshot `organization` and live `works_at` edge count/target, not just
 * that a function was invoked (fixed_means_behavior_verified_not_contract_accepted,
 * ent_db0b7855d47012084477fb00).
 */

import { createServer } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { cleanupEntityType } from "../helpers/cleanup_helpers.js";
import { schemaRegistry } from "../../src/services/schema_registry.js";
import { ENTITY_SCHEMAS } from "../../src/services/schema_definitions.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000001963";
const API_PORT = 18124;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

interface StoreResponse {
  content: Array<{ type: string; text: string }>;
}

async function getLiveWorksAtEdges(contactEntityId: string) {
  const { data, error } = await db
    .from("relationship_snapshots")
    .select("relationship_key, target_entity_id, is_live, snapshot")
    .eq("relationship_type", "works_at")
    .eq("source_entity_id", contactEntityId)
    .eq("is_live", 1);
  expect(error).toBeNull();
  return data ?? [];
}

async function getContactSnapshot(contactEntityId: string) {
  const { data, error } = await db
    .from("entity_snapshots")
    .select("snapshot")
    .eq("entity_id", contactEntityId)
    .single();
  expect(error).toBeNull();
  return data?.snapshot as Record<string, unknown> | undefined;
}

describe("auto-link retraction on organization change (#1963)", () => {
  let httpServer: ReturnType<typeof createServer>;
  let mcpServer: NeotomaServer;

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    mcpServer = new NeotomaServer();
    (mcpServer as unknown as { authenticatedUserId: string }).authenticatedUserId = TEST_USER_ID;

    // The reference_fields-driven auto-link hook reads the schema via
    // schemaRegistry.loadActiveSchema, which is DB-backed only — a dev DB may
    // carry a stale pre-reference_fields global `contact` schema row. Register
    // the current code-defined schema as user-scoped so this test exercises
    // the real `organization` -> `company` `resolve_target` reference field,
    // matching the pattern in company_entity_resolution_leads.test.ts.
    if (!(await schemaRegistry.loadActiveSchema("contact", TEST_USER_ID))) {
      const contactSchema = ENTITY_SCHEMAS.contact;
      await schemaRegistry.register({
        entity_type: "contact",
        schema_version: contactSchema.schema_version,
        schema_definition: contactSchema.schema_definition,
        reducer_config: contactSchema.reducer_config,
        user_id: TEST_USER_ID,
        user_specific: true,
        activate: true,
        metadata: contactSchema.metadata,
      });
    }
  });

  afterAll(async () => {
    await cleanupEntityType("contact", TEST_USER_ID);
    await cleanupEntityType("company", TEST_USER_ID);
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("MCP store: retracts the prior auto-linked works_at edge when organization changes", async () => {
    const idempotencyKeyBase = `issue-1963-mcp-${Date.now()}`;

    const first = (await (
      mcpServer as unknown as {
        store: (params: Record<string, unknown>) => Promise<StoreResponse>;
      }
    ).store({
      user_id: TEST_USER_ID,
      idempotency_key: `${idempotencyKeyBase}-1`,
      commit: true,
      entities: [
        {
          entity_type: "contact",
          name: "Gabriel Hubert MCP",
          email: `gabriel.hubert.mcp.${idempotencyKeyBase}@example.com`,
          organization: "Dust",
        },
      ],
    })) as StoreResponse;
    const firstBody = JSON.parse(first.content[0].text) as {
      entities?: Array<{ entity_id: string }>;
    };
    const contactEntityId = firstBody.entities?.[0]?.entity_id;
    expect(typeof contactEntityId).toBe("string");
    if (!contactEntityId) throw new Error("contact entity id missing from store response");

    const afterFirst = await getLiveWorksAtEdges(contactEntityId);
    expect(afterFirst).toHaveLength(1);
    const dustEdge = afterFirst[0];

    // Second observation: organization changes to Stripe (simulates a merged
    // Gmail/LinkedIn source disagreeing with the first).
    await (
      mcpServer as unknown as {
        store: (params: Record<string, unknown>) => Promise<StoreResponse>;
      }
    ).store({
      user_id: TEST_USER_ID,
      idempotency_key: `${idempotencyKeyBase}-2`,
      commit: true,
      entities: [
        {
          entity_type: "contact",
          name: "Gabriel Hubert MCP",
          email: `gabriel.hubert.mcp.${idempotencyKeyBase}@example.com`,
          organization: "Stripe",
        },
      ],
    });

    // Effect: exactly one live works_at edge, pointing at Stripe, and the
    // resolved snapshot's organization agrees with it (the bug's core
    // assertion — snapshot and live edge must never disagree).
    const afterSecond = await getLiveWorksAtEdges(contactEntityId);
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0].target_entity_id).not.toBe(dustEdge.target_entity_id);

    const snapshot = await getContactSnapshot(contactEntityId);
    expect(snapshot?.organization).toBe("Stripe");

    // The stale Dust edge is soft-deleted, not merely absent from the live set.
    const { data: dustSnapshotRow } = await db
      .from("relationship_snapshots")
      .select("is_live")
      .eq("relationship_key", dustEdge.relationship_key)
      .single();
    expect(dustSnapshotRow?.is_live).toBe(0);
  });

  it("REST POST /store: retracts the prior auto-linked works_at edge when organization changes", async () => {
    const idempotencyKeyBase = `issue-1963-rest-${Date.now()}`;

    const firstResp = await fetch(`${API_BASE}/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `${idempotencyKeyBase}-1`,
        commit: true,
        entities: [
          {
            entity_type: "contact",
            name: "Aki Suzuki REST",
            email: `aki.suzuki.rest.${idempotencyKeyBase}@example.com`,
            organization: "Stripe",
          },
        ],
      }),
    });
    expect(firstResp.status).toBe(200);
    const firstBody = (await firstResp.json()) as { entities?: Array<{ entity_id: string }> };
    const contactEntityId = firstBody.entities?.[0]?.entity_id;
    expect(typeof contactEntityId).toBe("string");
    if (!contactEntityId) throw new Error("contact entity id missing from store response");

    const afterFirst = await getLiveWorksAtEdges(contactEntityId);
    expect(afterFirst).toHaveLength(1);
    const stripeEdge = afterFirst[0];

    const secondResp = await fetch(`${API_BASE}/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        idempotency_key: `${idempotencyKeyBase}-2`,
        commit: true,
        entities: [
          {
            entity_type: "contact",
            name: "Aki Suzuki REST",
            email: `aki.suzuki.rest.${idempotencyKeyBase}@example.com`,
            organization: "Zuqca",
          },
        ],
      }),
    });
    expect(secondResp.status).toBe(200);

    // #1963: the retraction must not be silent — the store response surfaces it
    // via store_warnings so a caller can observe that a stale edge was cleaned
    // up (and, in the failure case, that one may still be live).
    const secondBody = (await secondResp.json()) as {
      store_warnings?: Array<{ code: string; entity_id: string }>;
    };
    const retractionWarning = (secondBody.store_warnings ?? []).find(
      (w) => w.code === "AUTO_LINK_EDGE_RETRACTED" && w.entity_id === contactEntityId
    );
    expect(retractionWarning).toBeDefined();

    const afterSecond = await getLiveWorksAtEdges(contactEntityId);
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0].target_entity_id).not.toBe(stripeEdge.target_entity_id);

    const snapshot = await getContactSnapshot(contactEntityId);
    expect(snapshot?.organization).toBe("Zuqca");

    const { data: stripeSnapshotRow } = await db
      .from("relationship_snapshots")
      .select("is_live")
      .eq("relationship_key", stripeEdge.relationship_key)
      .single();
    expect(stripeSnapshotRow?.is_live).toBe(0);
  });

  it("preserves a manually-created works_at edge when organization auto-link changes (edge case)", async () => {
    const idempotencyKeyBase = `issue-1963-manual-preserve-${Date.now()}`;

    const first = (await (
      mcpServer as unknown as {
        store: (params: Record<string, unknown>) => Promise<StoreResponse>;
      }
    ).store({
      user_id: TEST_USER_ID,
      idempotency_key: `${idempotencyKeyBase}-1`,
      commit: true,
      entities: [
        {
          entity_type: "contact",
          name: "Manual Edge Contact",
          email: `manual.edge.${idempotencyKeyBase}@example.com`,
          organization: "Dust",
        },
        {
          entity_type: "company",
          name: `Manual Advisory Co ${idempotencyKeyBase}`,
        },
      ],
    })) as StoreResponse;
    const firstBody = JSON.parse(first.content[0].text) as {
      entities?: Array<{ entity_id: string; entity_type: string }>;
    };
    const contactEntityId = firstBody.entities?.find((e) => e.entity_type === "contact")?.entity_id;
    const manualCompanyId = firstBody.entities?.find((e) => e.entity_type === "company")?.entity_id;
    if (!contactEntityId || !manualCompanyId) {
      throw new Error("expected contact and company entity ids from store response");
    }

    // Manually create an unrelated works_at edge (no auto_linked metadata).
    const { relationshipsService } = await import("../../src/services/relationships.js");
    await relationshipsService.createRelationship({
      relationship_type: "works_at",
      source_entity_id: contactEntityId,
      target_entity_id: manualCompanyId,
      metadata: { role: "advisor" },
      user_id: TEST_USER_ID,
    });

    const beforeChange = await getLiveWorksAtEdges(contactEntityId);
    expect(beforeChange).toHaveLength(2); // auto-linked Dust + manual advisory edge

    // Change organization: only the auto-linked Dust edge should retract.
    await (
      mcpServer as unknown as {
        store: (params: Record<string, unknown>) => Promise<StoreResponse>;
      }
    ).store({
      user_id: TEST_USER_ID,
      idempotency_key: `${idempotencyKeyBase}-2`,
      commit: true,
      entities: [
        {
          entity_type: "contact",
          name: "Manual Edge Contact",
          email: `manual.edge.${idempotencyKeyBase}@example.com`,
          organization: "Stripe",
        },
      ],
    });

    const afterChange = await getLiveWorksAtEdges(contactEntityId);
    const afterChangeTargets = afterChange.map((r) => r.target_entity_id).sort();
    expect(afterChange).toHaveLength(2); // new auto-linked Stripe edge + preserved manual edge
    expect(afterChangeTargets).toContain(manualCompanyId);
    expect(afterChangeTargets).not.toContain(
      beforeChange.find((r) => r.target_entity_id !== manualCompanyId)?.target_entity_id
    );
  });
});

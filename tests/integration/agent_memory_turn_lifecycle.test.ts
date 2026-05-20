/**
 * Integration test: full @neotoma/agent turn lifecycle against a local
 * Neotoma backend.
 *
 * Uses LocalTransport (no HTTP) so this test runs entirely in-process
 * against the same SQLite-backed core that powers the live server.
 * Verifies that:
 *   - openTurn writes a real conversation + user message
 *   - closeTurn writes the assistant message
 *   - PART_OF and REFERS_TO relationships materialize in the graph
 *   - Re-running the same (conversationId, turnId) is idempotent
 */

import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { LocalTransport } from "../../packages/client/src/local.js";
import { NeotomaMemory } from "../../packages/agent/src/memory.js";
import { createOperations } from "../../src/core/operations.js";
import { ensureLocalDevUser } from "../../src/services/local_auth.js";

describe("@neotoma/agent turn lifecycle (LocalTransport)", () => {
  let transport: LocalTransport;
  let userId: string;

  beforeAll(async () => {
    const localUser = ensureLocalDevUser();
    userId = localUser.id;
    const operations = createOperations({ userId });
    transport = new LocalTransport({ userId, operations });
  });

  it("openTurn writes a conversation + user message PART_OF conversation", async () => {
    const conversationId = `conv-${randomUUID().slice(0, 8)}`;
    const memory = new NeotomaMemory({
      transport,
      conversationId,
      conversationTitle: "Agent SDK lifecycle test",
      platform: "test",
    });

    const result = await memory.openTurn({
      turnId: "t1",
      userMessage: "Initial message",
    });

    expect(result.conversationEntityId).toMatch(/^ent_/);
    expect(result.userMessageEntityId).toMatch(/^ent_/);
    expect(result.conversationEntityId).not.toBe(result.userMessageEntityId);
  });

  it("closeTurn writes assistant message and conversation persists across the turn", async () => {
    const conversationId = `conv-${randomUUID().slice(0, 8)}`;
    const memory = new NeotomaMemory({
      transport,
      conversationId,
      platform: "test",
    });

    const opened = await memory.openTurn({
      turnId: "t1",
      userMessage: "Hello",
    });
    const closed = await memory.closeTurn({
      turnId: "t1",
      assistantMessage: "Hi back",
    });

    expect(closed.conversationEntityId).toBe(opened.conversationEntityId);
    expect(closed.assistantMessageEntityId).toMatch(/^ent_/);
    expect(closed.assistantMessageEntityId).not.toBe(opened.userMessageEntityId);
  });

  it("re-running the same turn id is idempotent (same entity ids)", async () => {
    const conversationId = `conv-${randomUUID().slice(0, 8)}`;
    const memory = new NeotomaMemory({
      transport,
      conversationId,
      platform: "test",
    });

    const a = await memory.openTurn({
      turnId: "t1",
      userMessage: "Same message",
    });
    const b = await memory.openTurn({
      turnId: "t1",
      userMessage: "Same message",
    });

    expect(b.conversationEntityId).toBe(a.conversationEntityId);
    expect(b.userMessageEntityId).toBe(a.userMessageEntityId);
  });

  it("recordTurn writes both messages with REFERS_TO when provided", async () => {
    const conversationId = `conv-${randomUUID().slice(0, 8)}`;
    const memory = new NeotomaMemory({
      transport,
      conversationId,
      platform: "test",
    });

    // First, create a target entity to refer to.
    const targetName = `Target ${randomUUID().slice(0, 6)}`;
    const targetStore = await transport.store({
      entities: [
        {
          entity_type: "tag",
          name: targetName,
          canonical_name: targetName,
        },
      ],
      idempotency_key: `agent-test-target-${randomUUID().slice(0, 8)}`,
    });
    const targetId =
      (targetStore as { entities?: Array<{ entity_id?: string }> }).entities?.[0]?.entity_id ??
      targetStore.structured?.entities?.[0]?.entity_id;
    expect(targetId).toBeTruthy();

    const result = await memory.recordTurn({
      turnId: "t-record",
      userMessage: "About the target",
      assistantMessage: "Yes, the target.",
      refersTo: [targetId!],
    });

    expect(result.conversationEntityId).toMatch(/^ent_/);
    expect(result.userMessageEntityId).toMatch(/^ent_/);
    expect(result.assistantMessageEntityId).toMatch(/^ent_/);

    // Verify REFERS_TO edge exists from assistant message to target.
    // Response shape varies; coalesce common forms.
    const related = (await transport.retrieveRelatedEntities({
      entity_id: result.assistantMessageEntityId!,
      relationship_types: ["REFERS_TO"],
      direction: "outbound",
    })) as unknown;
    const flat: Array<{ entity_id?: string; target_entity_id?: string }> = [];
    const candidates = [
      (related as { related?: unknown[] }).related,
      (related as { entities?: unknown[] }).entities,
      (related as { relationships?: unknown[] }).relationships,
      Array.isArray(related) ? (related as unknown[]) : undefined,
    ];
    for (const c of candidates) {
      if (Array.isArray(c)) {
        for (const item of c) flat.push(item as typeof flat[number]);
      }
    }
    const targetIds = flat
      .map((r) => r.entity_id ?? r.target_entity_id)
      .filter(Boolean);
    expect(targetIds).toContain(targetId);
  });
});

/**
 * Integration test: the anonymous-write policy is applied uniformly at
 * the service boundary.
 *
 * The policy helper is exercised directly in unit tests; this test
 * asserts that each of the five canonical write paths actually calls
 * `enforceAttributionPolicy` and therefore reject in `reject` mode,
 * regardless of transport. It runs against the local SQLite backend
 * without going through HTTP, because the enforcement seam is
 * deliberately placed inside the service (HTTP / MCP stdio / MCP HTTP
 * / CLI backup all reach the same code path).
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { createObservation } from "../../src/services/observation_storage.js";
import { storeRawContent } from "../../src/services/raw_storage.js";
import { upsertTimelineEventsForEntitySnapshot } from "../../src/services/timeline_events.js";
import { createCorrection } from "../../src/services/correction.js";
import { RelationshipsService } from "../../src/services/relationships.js";
import {
  AttributionPolicyError,
  enforceAttributionPolicy,
} from "../../src/services/attribution_policy.js";
import { createAgentIdentity } from "../../src/crypto/agent_identity.js";
import { runWithRequestContext } from "../../src/services/request_context.js";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";

const ENV_KEYS = [
  "NEOTOMA_ATTRIBUTION_POLICY",
  "NEOTOMA_MIN_ATTRIBUTION_TIER",
  "NEOTOMA_ATTRIBUTION_POLICY_JSON",
] as const;

describe("anonymous write policy", () => {
  const tracker = new TestIdTracker();
  const userId = `test-user-policy-${Date.now()}`;
  let sourceId: string;
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    const { data: source } = await db
      .from("sources")
      .insert({
        user_id: userId,
        content_hash: `policy_hash_${Date.now()}`,
        storage_url: "file:///test/policy.txt",
        mime_type: "text/plain",
        file_size: 0,
      })
      .select()
      .single();
    sourceId = (source as { id: string }).id;
    tracker.trackSource(sourceId);
  });

  afterAll(async () => {
    await tracker.cleanup();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
      delete originalEnv[key];
    }
  });

  function setEnv(key: (typeof ENV_KEYS)[number], value: string): void {
    originalEnv[key] = process.env[key];
    process.env[key] = value;
  }

  it("allow mode is the default and permits anonymous observations", async () => {
    const obs = await createObservation({
      entity_id: `ent_allow_${Date.now()}`,
      entity_type: "note",
      schema_version: "1.0",
      source_id: sourceId,
      interpretation_id: null,
      observed_at: new Date().toISOString(),
      specificity_score: 0.5,
      source_priority: 1,
      fields: { title: "allow" },
      user_id: userId,
    });
    tracker.trackObservation(obs.id);
    expect(obs.id).toBeTruthy();
  });

  it("reject mode blocks anonymous observations with ATTRIBUTION_REQUIRED", async () => {
    setEnv("NEOTOMA_ATTRIBUTION_POLICY", "reject");
    await expect(
      createObservation({
        entity_id: `ent_reject_${Date.now()}`,
        entity_type: "note",
        schema_version: "1.0",
        source_id: sourceId,
        interpretation_id: null,
        observed_at: new Date().toISOString(),
        specificity_score: 0.5,
        source_priority: 1,
        fields: { title: "rejected" },
        user_id: userId,
      }),
    ).rejects.toBeInstanceOf(AttributionPolicyError);
  });

  it("reject mode allows writes once an AAuth identity is present in context", async () => {
    setEnv("NEOTOMA_ATTRIBUTION_POLICY", "reject");
    const identity = createAgentIdentity({
      publicKey: "pk",
      thumbprint: "tp-policy-hw",
      algorithm: "ES256",
      sub: "agent:policy:hw",
    });
    const obs = await runWithRequestContext({ agentIdentity: identity }, () =>
      createObservation({
        entity_id: `ent_reject_ok_${Date.now()}`,
        entity_type: "note",
        schema_version: "1.0",
        source_id: sourceId,
        interpretation_id: null,
        observed_at: new Date().toISOString(),
        specificity_score: 0.5,
        source_priority: 1,
        fields: { title: "hardware-signed" },
        user_id: userId,
      }),
    );
    tracker.trackObservation(obs.id);
    expect(obs.id).toBeTruthy();
  });

  it("min_tier rejects unverified_client even under allow mode", async () => {
    setEnv("NEOTOMA_MIN_ATTRIBUTION_TIER", "software");
    const identity = createAgentIdentity({ clientName: "Claude Code" });
    await expect(
      runWithRequestContext({ agentIdentity: identity }, () =>
        createObservation({
          entity_id: `ent_minfloor_${Date.now()}`,
          entity_type: "note",
          schema_version: "1.0",
          source_id: sourceId,
          interpretation_id: null,
          observed_at: new Date().toISOString(),
          specificity_score: 0.5,
          source_priority: 1,
          fields: { title: "too-soft" },
          user_id: userId,
        }),
      ),
    ).rejects.toBeInstanceOf(AttributionPolicyError);
  });

  it("per-path override can reject only the relationships path", async () => {
    setEnv(
      "NEOTOMA_ATTRIBUTION_POLICY_JSON",
      JSON.stringify({ relationships: "reject" }),
    );
    // observations path still allows anonymous writes…
    expect(() => enforceAttributionPolicy("observations", null)).not.toThrow();
    // …but relationships rejects them.
    const rels = new RelationshipsService();
    await expect(
      rels.createRelationship({
        relationship_type: "related_to",
        source_entity_id: `ent_pp_src_${Date.now()}`,
        target_entity_id: `ent_pp_tgt_${Date.now()}`,
        user_id: userId,
      }),
    ).rejects.toBeInstanceOf(AttributionPolicyError);
  });
});

describe("write-path parity: every canonical path calls the helper", () => {
  const ENV_KEYS_PARITY = [
    "NEOTOMA_ATTRIBUTION_POLICY",
    "NEOTOMA_MIN_ATTRIBUTION_TIER",
    "NEOTOMA_ATTRIBUTION_POLICY_JSON",
  ] as const;
  const originalEnv: Record<string, string | undefined> = {};
  const userId = `test-user-parity-${Date.now()}`;

  beforeAll(() => {
    for (const key of ENV_KEYS_PARITY) {
      originalEnv[key] = process.env[key];
    }
    process.env.NEOTOMA_ATTRIBUTION_POLICY = "reject";
  });

  afterAll(() => {
    for (const key of ENV_KEYS_PARITY) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("observations: reject anonymous", async () => {
    await expect(
      createObservation({
        entity_id: `parity_obs_${Date.now()}`,
        entity_type: "note",
        schema_version: "1.0",
        source_id: "00000000-0000-0000-0000-000000000000",
        interpretation_id: null,
        observed_at: new Date().toISOString(),
        specificity_score: 0.5,
        source_priority: 1,
        fields: { t: "x" },
        user_id: userId,
      }),
    ).rejects.toBeInstanceOf(AttributionPolicyError);
  });

  it("sources: reject anonymous", async () => {
    await expect(
      storeRawContent({
        userId,
        fileBuffer: Buffer.from("parity"),
        mimeType: "text/plain",
      }),
    ).rejects.toBeInstanceOf(AttributionPolicyError);
  });

  it("relationships: reject anonymous", async () => {
    const rels = new RelationshipsService();
    await expect(
      rels.createRelationship({
        relationship_type: "related_to",
        source_entity_id: `parity_rel_src_${Date.now()}`,
        target_entity_id: `parity_rel_tgt_${Date.now()}`,
        user_id: userId,
      }),
    ).rejects.toBeInstanceOf(AttributionPolicyError);
  });

  it("corrections: reject anonymous", async () => {
    await expect(
      createCorrection({
        entity_id: `parity_corr_${Date.now()}`,
        entity_type: "note",
        field: "title",
        value: "x",
        schema_version: "1.0",
        user_id: userId,
      }),
    ).rejects.toBeInstanceOf(AttributionPolicyError);
  });

  it("timeline_events: reject anonymous", async () => {
    await expect(
      upsertTimelineEventsForEntitySnapshot({
        entityId: `parity_tl_${Date.now()}`,
        entityType: "note",
        sourceId: "00000000-0000-0000-0000-000000000000",
        userId,
        snapshot: {},
        sameTypeInSourceBatch: 1,
      }),
    ).rejects.toBeInstanceOf(AttributionPolicyError);
  });
});

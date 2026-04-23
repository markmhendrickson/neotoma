/**
 * Integration test: AAuth attribution is stamped into write-path provenance.
 *
 * Scope (Phase 1.7):
 * - Verified-AAuth identity flows from `runWithRequestContext` → through
 *   `observation_storage.createObservation` → into the `provenance` column.
 * - Unverified-client identity (clientInfo fallback, no AAuth) writes the
 *   `unverified_client` tier.
 * - No request context → no provenance block is written (existing behaviour
 *   preserved).
 *
 * These tests use the local SQLite repo directly rather than hitting the
 * HTTP transport, because:
 * 1. Signing real HTTP requests requires provisioning a full key pair and
 *    JWKS server, which belongs in end-to-end suite not integration tests.
 * 2. The unit tests in `tests/unit/aauth_verify_middleware.test.ts` already
 *    cover the HTTP verification path with mocks.
 * 3. The important invariant — that a resolved identity ends up in the row
 *    — is exactly what this test exercises.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/db.js";
import { createObservation } from "../../src/services/observation_storage.js";
import {
  createAgentIdentity,
  type AttributionDecisionDiagnostics,
} from "../../src/crypto/agent_identity.js";
import { runWithRequestContext } from "../../src/services/request_context.js";
import { buildSessionInfo } from "../../src/services/session_info.js";
import { ATTRIBUTION_DECISION_EVENT } from "../../src/middleware/aauth_verify.js";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";

describe("AAuth attribution stamping", () => {
  const tracker = new TestIdTracker();
  const userId = "test-user-aauth-attribution";
  let sourceId: string;

  beforeAll(async () => {
    const { data: source, error } = await db
      .from("sources")
      .insert({
        user_id: userId,
        content_hash: `aauth_hash_${Date.now()}`,
        storage_url: "file:///test/aauth.txt",
        mime_type: "text/plain",
        file_size: 0,
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(source).toBeDefined();
    sourceId = (source as { id: string }).id;
    tracker.trackSource(sourceId);
  });

  afterAll(async () => {
    await tracker.cleanup();
  });

  it("stamps hardware-tier attribution when AAuth context is active", async () => {
    const identity = createAgentIdentity({
      publicKey: '{"kty":"EC","crv":"P-256","alg":"ES256"}',
      thumbprint: "tp-aauth-hw",
      algorithm: "ES256",
      sub: "agent:test:hw",
      iss: "https://agent.example",
    });

    const observation = await runWithRequestContext(
      { agentIdentity: identity },
      () =>
        createObservation({
          entity_id: `ent_aauth_hw_${Date.now()}`,
          entity_type: "note",
          schema_version: "1.0",
          source_id: sourceId,
          interpretation_id: null,
          observed_at: new Date().toISOString(),
          specificity_score: 0.5,
          source_priority: 1,
          fields: { title: "Hardware attributed" },
          user_id: userId,
        })
    );

    tracker.trackObservation(observation.id);

    const { data: row, error } = await db
      .from("observations")
      .select("*")
      .eq("id", observation.id)
      .single();
    expect(error).toBeNull();
    const prov = (row as { provenance?: Record<string, unknown> }).provenance;
    expect(prov).toBeDefined();
    expect(prov!.attribution_tier).toBe("hardware");
    expect(prov!.agent_thumbprint).toBe("tp-aauth-hw");
    expect(prov!.agent_sub).toBe("agent:test:hw");
    expect(prov!.agent_algorithm).toBe("ES256");
  });

  it("stamps unverified_client tier from clientInfo fallback alone", async () => {
    const identity = createAgentIdentity({
      clientName: "Claude Code",
      clientVersion: "0.5.0",
    });

    const observation = await runWithRequestContext(
      { agentIdentity: identity },
      () =>
        createObservation({
          entity_id: `ent_aauth_uv_${Date.now()}`,
          entity_type: "note",
          schema_version: "1.0",
          source_id: sourceId,
          interpretation_id: null,
          observed_at: new Date().toISOString(),
          specificity_score: 0.5,
          source_priority: 1,
          fields: { title: "Client-info attributed" },
          user_id: userId,
        })
    );

    tracker.trackObservation(observation.id);

    const { data: row } = await db
      .from("observations")
      .select("*")
      .eq("id", observation.id)
      .single();
    const prov = (row as { provenance?: Record<string, unknown> }).provenance;
    expect(prov).toBeDefined();
    expect(prov!.attribution_tier).toBe("unverified_client");
    expect(prov!.client_name).toBe("Claude Code");
    expect(prov!.client_version).toBe("0.5.0");
    expect(prov!.agent_thumbprint).toBeUndefined();
  });

  it("attribution_decision log shape matches the integration doc contract", () => {
    // Shape promised to integrators in
    // docs/subsystems/agent_attribution_integration.md: every request the
    // AAuth middleware sees produces exactly this set of fields, with the
    // stable event name below. If this ever breaks, bump the doc first.
    const decision: AttributionDecisionDiagnostics = {
      signature_present: true,
      signature_verified: true,
      resolved_tier: "hardware",
    };
    const logLine = JSON.stringify({
      event: ATTRIBUTION_DECISION_EVENT,
      ...decision,
    });
    const parsed = JSON.parse(logLine);
    expect(parsed.event).toBe("attribution_decision");
    expect(parsed).toHaveProperty("signature_present");
    expect(parsed).toHaveProperty("signature_verified");
    expect(parsed).toHaveProperty("resolved_tier");

    const session = buildSessionInfo({
      userId: "u",
      identity: null,
      middlewareDecision: {
        signature_present: true,
        signature_verified: false,
        signature_error_code: "clock_skew",
        resolved_tier: "anonymous",
      },
      rawClientInfoName: "mcp",
    });
    expect(session.attribution.decision).toMatchObject({
      signature_present: true,
      signature_verified: false,
      signature_error_code: "clock_skew",
      client_info_raw_name: "mcp",
      client_info_normalised_to_null_reason: "too_generic",
      resolved_tier: "anonymous",
    });
  });

  it("omits provenance when no request context is active", async () => {
    const observation = await createObservation({
      entity_id: `ent_aauth_none_${Date.now()}`,
      entity_type: "note",
      schema_version: "1.0",
      source_id: sourceId,
      interpretation_id: null,
      observed_at: new Date().toISOString(),
      specificity_score: 0.5,
      source_priority: 1,
      fields: { title: "No attribution" },
      user_id: userId,
    });

    tracker.trackObservation(observation.id);

    const { data: row } = await db
      .from("observations")
      .select("*")
      .eq("id", observation.id)
      .single();
    const prov = (row as { provenance?: Record<string, unknown> | null })
      .provenance;
    // Either undefined or null — both mean "unattributed".
    expect(prov == null || Object.keys(prov).length === 0).toBe(true);
  });
});

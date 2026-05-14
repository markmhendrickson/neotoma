/**
 * Regression test for issue #77: transaction (and other typed schemas) reject
 * store calls even when `canonical_name` is explicitly supplied.
 *
 * Root cause: `storeStructuredInternal` in server.ts was passing only
 * `validFields` (schema-declared fields) to `resolveEntityWithTrace`.
 * When the caller supplies `canonical_name` (or other identity keys like
 * `name`, `external_id`) that are not declared schema fields, they land in
 * `unknownFields` and the resolver sees an empty map — triggering
 * ERR_CANONICAL_NAME_UNRESOLVED.
 *
 * Fix: pass `fieldsToValidate` (all user-supplied non-metadata fields) to the
 * resolver so heuristic identity keys survive field validation. Observation
 * storage still uses `fieldsForObservation` (schema-valid + date-like extras).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { cleanupEntityType } from "../helpers/cleanup_helpers.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

describe("MCP store: canonical_name accepted even for undeclared schema fields (issue #77)", () => {
  let server: NeotomaServer;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;
  });

  afterAll(async () => {
    await cleanupEntityType("transaction", TEST_USER_ID);
  });

  it("stores a transaction with explicit canonical_name when schema fields (posting_date etc.) are absent", async () => {
    const result = await (server as unknown as {
      store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }).store({
      user_id: TEST_USER_ID,
      idempotency_key: `issue-77-regression-${Date.now()}`,
      commit: true,
      entities: [
        {
          entity_type: "transaction",
          transaction_id: "WISE-TRANSFER-001",
          service_provider: "Wise",
          status: "completed",
          amount_sent: "100.00",
          currency_sent: "EUR",
          recipient: "Jane Doe",
          canonical_name: "Wise Transfer 100.00 EUR to Jane Doe",
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as {
      entities?: Array<{
        entity_id: string;
        entity_type: string;
        canonical_name: string;
        identity_basis: string;
      }>;
      error?: { code?: string; issues?: unknown[] };
    };

    expect(body.error).toBeUndefined();
    expect(Array.isArray(body.entities)).toBe(true);
    expect(body.entities).toHaveLength(1);

    const entity = body.entities![0]!;
    expect(entity.entity_type).toBe("transaction");
    expect(entity.entity_id).toMatch(/^ent_/);
    expect(entity.canonical_name).toContain("Wise Transfer");
    expect(entity.identity_basis).toBe("heuristic_name");
  });

  it("stores a typed entity with explicit name field when schema-declared id fields are absent", async () => {
    const result = await (server as unknown as {
      store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    }).store({
      user_id: TEST_USER_ID,
      idempotency_key: `issue-77-name-fallback-${Date.now()}`,
      commit: true,
      entities: [
        {
          entity_type: "transaction",
          service_provider: "PayPal",
          amount_sent: "50.00",
          currency_sent: "USD",
          name: "PayPal Payment 50.00 USD",
        },
      ],
    });

    const body = JSON.parse(result.content[0].text) as {
      entities?: Array<{ entity_id: string; entity_type: string; identity_basis: string }>;
      error?: { code?: string };
    };

    expect(body.error).toBeUndefined();
    expect(Array.isArray(body.entities)).toBe(true);
    expect(body.entities).toHaveLength(1);
    expect(body.entities![0]!.entity_id).toMatch(/^ent_/);
  });
});

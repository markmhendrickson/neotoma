import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { db } from "../../src/db.js";
import {
  cleanupTestEntities,
  cleanupTestObservations,
  cleanupTestRawFragments,
  cleanupTestSchema,
  cleanupTestSources,
  seedTestSchema,
} from "../helpers/test_schema_helpers.js";
import { NeotomaServer } from "../../src/server.js";

function resolveApiBase(): string {
  const port = process.env.NEOTOMA_SESSION_DEV_PORT ?? "18099";
  return `http://127.0.0.1:${port}`;
}

describe("POST /store registered schema alias precedence", () => {
  const userId = randomUUID();
  const entityType = "organization";
  const createdEntityIds: string[] = [];
  const createdObservationIds: string[] = [];
  const createdSourceIds: string[] = [];
  let apiBase: string;

  beforeAll(async () => {
    apiBase = resolveApiBase();
    await seedTestSchema(
      new NeotomaServer(),
      entityType,
      {
        schema_version: { type: "string", required: true },
        name: { type: "string", required: true },
        slug: { type: "string", required: false },
        sector: { type: "string", required: false },
        location: { type: "string", required: false },
        relationship_opschudding: { type: "string", required: false },
        notes: { type: "string", required: false },
      },
      { user_specific: true, user_id: userId },
    );
  });

  afterAll(async () => {
    await cleanupTestEntities(createdEntityIds);
    await cleanupTestObservations(createdObservationIds);
    await cleanupTestSources(createdSourceIds);
    await cleanupTestRawFragments(entityType, userId);
    await cleanupTestRawFragments("company", userId);
    await cleanupTestSchema(entityType, userId);
  });

  it("uses the active organization schema before the built-in company alias", async () => {
    const res = await fetch(`${apiBase}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        idempotency_key: `organization-alias-precedence-${randomUUID()}`,
        commit: true,
        entities: [
          {
            entity_type: entityType,
            schema_version: "1.0",
            name: "TESY Ltd.",
            slug: "tesy",
            sector: "heating",
            location: "Bulgaria",
            relationship_opschudding: "prospect",
            notes: "Regression fixture",
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entities?: Array<{
        entity_id: string;
        entity_type: string;
        observation_id?: string;
        entity_snapshot_after?: Record<string, unknown>;
      }>;
      source_id?: string;
      unknown_fields_count?: number;
    };

    const stored = body.entities?.[0];
    expect(stored?.entity_type).toBe(entityType);
    expect(stored?.entity_snapshot_after).toMatchObject({
      name: "TESY Ltd.",
      slug: "tesy",
      sector: "heating",
      location: "Bulgaria",
      relationship_opschudding: "prospect",
    });
    expect(body.unknown_fields_count ?? 0).toBe(0);

    if (stored?.entity_id) createdEntityIds.push(stored.entity_id);
    if (stored?.observation_id) createdObservationIds.push(stored.observation_id);
    if (body.source_id) createdSourceIds.push(body.source_id);

    const { data: companyFragments } = await db
      .from("raw_fragments")
      .select("fragment_key")
      .eq("user_id", userId)
      .eq("entity_type", "company");

    expect(companyFragments ?? []).toEqual([]);
  });
});

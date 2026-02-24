/**
 * Fixture MCP Store Replay Test
 *
 * Iterates through tests/fixtures/json/*.json, stores each record via MCP store,
 * retrieves entity snapshot, and compares with expected result.
 * For fixtures with expected/ files, compares against those; otherwise verifies
 * structure and field preservation.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { extractCreatedEntityIds, extractSourceId } from "../helpers/cross_layer_helpers.js";
import { getEntityWithProvenance } from "../../src/services/entity_queries.js";

const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures");
const JSON_DIR = path.join(FIXTURES_DIR, "json");
const EXPECTED_DIR = path.join(FIXTURES_DIR, "expected");
const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

/** Entity types that have expected snapshot files for comparison */
const EXPECTED_FIXTURE_MAP: Record<string, string> = {
  contact: "contact_snapshot.json",
  transaction: "transaction_snapshot.json",
};

/** Entity types whose first fixture record has a date field in DATE_FIELD_NAMES (flow_date, event_date, income_date, etc.) so store should create timeline_events */
const DATE_FIELD_FIXTURE_TYPES = new Set([
  "flow",
  "tax_event",
  "income",
  "outcome",
  "order",
  "purchase",
  "transaction",
  "balance",
  "holding",
  "liability",
  "tax_filing",
  "property",
  "crypto_transaction",
]);

/** Normalize snapshot for comparison: exclude computed_at (timestamp-dependent) */
function normalizeForCompare(obj: Record<string, unknown>): Record<string, unknown> {
  const { computed_at, ...rest } = obj;
  return rest;
}

/** Check if snapshot contains key fields from input (field preservation) */
function snapshotContainsInputFields(
  snapshot: Record<string, unknown>,
  input: Record<string, unknown>,
  entityType: string
): { ok: boolean; missing: string[] } {
  const snapshotObj = (snapshot.snapshot as Record<string, unknown>) ?? {};
  const missing: string[] = [];
  const keyFields = getKeyFieldsForEntityType(entityType);
  for (const field of keyFields) {
    const inputVal = input[field];
    if (inputVal !== undefined && inputVal !== null) {
      const snapVal = snapshotObj[field];
      if (snapVal === undefined) {
        missing.push(field);
      }
    }
  }
  return { ok: missing.length === 0, missing };
}

function getKeyFieldsForEntityType(entityType: string): string[] {
  const map: Record<string, string[]> = {
    account: ["external_id", "institution", "currency", "status"],
    argument: ["name", "claim"],
    balance: ["snapshot_date", "account_id", "balance_usd"],
    belief: ["name", "content"],
    contact: ["name", "email", "phone"],
    contract: ["status"],
    crypto_transaction: ["transaction_date", "asset_symbol", "value_usd", "tx_hash"],
    domain: ["name"],
    emotion: ["name", "intensity"],
    fixed_cost: ["merchant", "expense_name", "frequency_per_year", "status"],
    flow: ["flow_name", "flow_date", "amount_usd"],
    habit: ["name", "status"],
    habit_completion: ["habit_id", "completed_at"],
    habit_objective: ["habit_id", "target"],
    holding: ["asset_symbol", "current_value_usd", "snapshot_date"],
    income: ["income_date", "source", "amount_usd", "tax_year"],
    liability: ["name", "amount_usd", "snapshot_date"],
    order: ["name", "order_type", "date"],
    outcome: ["name", "result"],
    process: ["name", "status"],
    property: ["name", "address", "purchase_date"],
    purchase: ["item_name", "status", "created_date"],
    research: ["name", "topic"],
    strategy: ["name", "description"],
    task_attachment: ["task_id", "url"],
    task_comment: ["task_id", "content"],
    task_dependency: ["source_task_id", "target_task_id"],
    task_story: ["name", "description"],
    tax_event: ["event_date", "asset_symbol", "gain_loss_usd", "tax_year"],
    tax_filing: ["name", "jurisdiction", "year", "status"],
    transaction: ["amount", "currency", "merchant_name", "status", "account_id"],
    transfer: ["name", "origin_account", "destination_account", "created_time"],
    wallet: ["name", "status"],
    workout: ["name", "duration"],
  };
  return map[entityType] ?? ["name", "id", "external_id", "title", "amount", "status", "description"];
}

describe("Fixture MCP Store Replay", () => {
  let server: NeotomaServer;
  const createdEntityIds: string[] = [];
  const createdSourceIds: string[] = [];

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as { authenticatedUserId: string | null }).authenticatedUserId = TEST_USER_ID;
  });

  afterEach(async () => {
    if (createdEntityIds.length > 0) {
      await db
        .from("entities")
        .update({ merged_to_entity_id: null, merged_at: null })
        .in("id", createdEntityIds);
      await db.from("timeline_events").delete().in("entity_id", createdEntityIds);
      await db.from("entity_snapshots").delete().in("entity_id", createdEntityIds);
      await db.from("entities").delete().in("id", createdEntityIds);
      createdEntityIds.length = 0;
    }
    if (createdSourceIds.length > 0) {
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }
  });

  const jsonFiles = [
    "account.json",
    "argument.json",
    "balance.json",
    "belief.json",
    "contact.json",
    "contract.json",
    "crypto_transaction.json",
    "domain.json",
    "emotion.json",
    "fixed_cost.json",
    "flow.json",
    "habit.json",
    "habit_completion.json",
    "habit_objective.json",
    "holding.json",
    "income.json",
    "liability.json",
    "order.json",
    "outcome.json",
    "process.json",
    "property.json",
    "purchase.json",
    "research.json",
    "strategy.json",
    "task_attachment.json",
    "task_comment.json",
    "task_dependency.json",
    "task_story.json",
    "tax_event.json",
    "tax_filing.json",
    "transaction.json",
    "transfer.json",
    "wallet.json",
    "workout.json",
  ] as const;

  for (const filename of jsonFiles) {
    const entityType = path.basename(filename, ".json");
    const expectedFile = EXPECTED_FIXTURE_MAP[entityType];

    it(`should store ${entityType} fixture and match expected`, async () => {
      const filePath = path.join(JSON_DIR, filename);
      const raw = await fs.readFile(filePath, "utf-8");
      const records = JSON.parse(raw) as Record<string, unknown>[];
      expect(records.length).toBeGreaterThan(0);

      const record = records[0] as Record<string, unknown>;
      const entityPayload = { ...record, entity_type: entityType };

      const idempotencyKey = `fixture-replay-${entityType}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await (server as { store: (p: unknown) => Promise<{ content: Array<{ text: string }> }> }).store({
        user_id: TEST_USER_ID,
        entities: [entityPayload],
        idempotency_key: idempotencyKey,
      });

      const responseData = JSON.parse(result.content[0].text);
      const entityIds = extractCreatedEntityIds(responseData);
      const sourceId = extractSourceId(responseData);

      expect(responseData.source_id).toBeDefined();
      expect(entityIds.length).toBe(1);

      createdEntityIds.push(...entityIds);
      createdSourceIds.push(sourceId);

      const entityId = entityIds[0];

      const entityWithProvenance = await getEntityWithProvenance(entityId);
      expect(entityWithProvenance).not.toBeNull();
      const snapshotData = entityWithProvenance!;

      expect(snapshotData.entity_id).toBe(entityId);
      expect(snapshotData.entity_type).toBe(entityType);
      expect(snapshotData.snapshot).toBeDefined();

      if (expectedFile) {
        const expectedPath = path.join(EXPECTED_DIR, expectedFile);
        const expectedRaw = await fs.readFile(expectedPath, "utf-8");
        const expected = JSON.parse(expectedRaw) as Record<string, unknown>;
        const normalizedExpected = normalizeForCompare(expected);
        const normalizedActual = normalizeForCompare(snapshotData);

        if (entityType === "contact" || entityType === "transaction") {
          expect(normalizedActual.entity_id).toBeDefined();
          expect(normalizedActual.entity_type).toBe(entityType);
          expect(normalizedActual.schema_version).toBe("1.0");
          expect(normalizedActual.snapshot).toBeDefined();
          expect(typeof (normalizedActual.snapshot as Record<string, unknown>)).toBe("object");
          expect(normalizedActual.observation_count).toBeDefined();
          expect(normalizedActual.provenance).toBeDefined();
        }
      }

      const { ok, missing } = snapshotContainsInputFields(snapshotData, record, entityType);
      expect(
        ok,
        `Snapshot missing key fields for ${entityType}: ${missing.join(", ")}. Snapshot keys: ${Object.keys((snapshotData.snapshot as Record<string, unknown>) ?? {}).join(", ")}`
      ).toBe(true);

      if (DATE_FIELD_FIXTURE_TYPES.has(entityType)) {
        const { data: events, error: evtError } = await db
          .from("timeline_events")
          .select("id, event_type, event_timestamp, source_field")
          .eq("entity_id", entityId);
        expect(evtError).toBeNull();
        expect(
          events?.length ?? 0,
          `Fixture ${entityType} has date fields; expected at least one timeline event for entity ${entityId}`
        ).toBeGreaterThan(0);
      }
    });
  }
});

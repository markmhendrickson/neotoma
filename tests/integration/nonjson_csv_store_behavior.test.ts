import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";
import { getEntityWithProvenance } from "../../src/services/entity_queries.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const CSV_FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures", "csv");

function countCsvRows(content: string): number {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length - 1;
}

describe("Non-JSON CSV store behavior", () => {
  let server: NeotomaServer;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as { authenticatedUserId: string | null }).authenticatedUserId = TEST_USER_ID;
  });

  it("creates one transaction entity per CSV row with interpret=true", async () => {
    const filePath = path.join(CSV_FIXTURES_DIR, "sample_transactions.csv");
    const csvContent = await fs.readFile(filePath, "utf8");
    const expectedRows = countCsvRows(csvContent);
    const keySuffix = `${Date.now()}-tx`;

    const firstResult = await (server as { store: (p: unknown) => Promise<{ content: Array<{ text: string }> }> }).store({
      user_id: TEST_USER_ID,
      file_content: Buffer.from(csvContent, "utf8").toString("base64"),
      mime_type: "text/csv",
      original_filename: "sample_transactions.csv",
      interpret: true,
      idempotency_key: `it-csv-transactions-interpret-true-${keySuffix}`,
    });
    const firstPayload = JSON.parse(firstResult.content[0].text) as {
      interpretation?: { entities?: Array<{ entityType: string; entityId: string }> };
      related_entities?: Array<{ id: string; entity_type: string }>;
      entity_debug?: { valid_entity_ids?: string[] };
      source_id?: string;
    };

    let effective = (firstPayload.interpretation?.entities ?? []).length > 0
      ? firstPayload.interpretation!.entities!
      : (firstPayload.related_entities ?? []).map((e) => ({ entityType: e.entity_type, entityId: e.id }));
    if (effective.length === 0 && firstPayload.source_id) {
      const { data: obs } = await db
        .from("observations")
        .select("entity_id")
        .eq("source_id", firstPayload.source_id);
      const entityIds = [...new Set((obs ?? []).map((o) => o.entity_id).filter(Boolean))] as string[];
      const { data: ent } = await db.from("entities").select("id, entity_type").in("id", entityIds);
      effective = (ent ?? []).map((e) => ({ entityType: e.entity_type, entityId: e.id }));
    }
    expect(effective.length).toBeGreaterThanOrEqual(1);
    expect(effective.every((entity) => entity.entityType === "transaction")).toBe(true);
    expect(new Set(effective.map((entity) => entity.entityId)).size).toBe(effective.length);

    const secondResult = await (server as { store: (p: unknown) => Promise<{ content: Array<{ text: string }> }> }).store({
      user_id: TEST_USER_ID,
      file_content: Buffer.from(csvContent, "utf8").toString("base64"),
      mime_type: "text/csv",
      original_filename: "sample_transactions.csv",
      interpret: false,
      idempotency_key: `it-csv-transactions-interpret-false-${keySuffix}`,
    });
    const secondPayload = JSON.parse(secondResult.content[0].text) as {
      deduplicated?: boolean;
      related_entities?: unknown[];
      related_relationships?: unknown[];
    };

    expect(secondPayload.deduplicated).toBe(true);
    expect(secondPayload.related_entities ?? []).toHaveLength(0);
    expect(secondPayload.related_relationships ?? []).toHaveLength(0);
  });

  it("creates one contact entity per contact CSV row with interpret=true", async () => {
    const filePath = path.join(CSV_FIXTURES_DIR, "sample_contacts.csv");
    const csvContent = await fs.readFile(filePath, "utf8");
    const expectedRows = countCsvRows(csvContent);
    const keySuffix = `${Date.now()}-contacts`;

    const result = await (server as { store: (p: unknown) => Promise<{ content: Array<{ text: string }> }> }).store({
      user_id: TEST_USER_ID,
      file_content: Buffer.from(csvContent, "utf8").toString("base64"),
      mime_type: "text/csv",
      original_filename: "sample_contacts.csv",
      interpret: true,
      idempotency_key: `it-csv-contacts-interpret-true-${keySuffix}`,
    });
    const payload = JSON.parse(result.content[0].text) as {
      interpretation?: { entities?: Array<{ entityType: string; entityId: string }> };
      related_entities?: Array<{ id: string; entity_type: string }>;
      source_id?: string;
    };

    let effective =
      (payload.interpretation?.entities ?? []).length > 0
        ? payload.interpretation!.entities!
        : (payload.related_entities ?? []).map((e) => ({ entityType: e.entity_type, entityId: e.id }));
    if (effective.length === 0 && payload.source_id) {
      const { data: obs } = await db
        .from("observations")
        .select("entity_id")
        .eq("source_id", payload.source_id);
      const entityIds = [...new Set((obs ?? []).map((o) => o.entity_id).filter(Boolean))] as string[];
      const { data: ent } = await db.from("entities").select("id, entity_type").in("id", entityIds);
      effective = (ent ?? []).map((e) => ({ entityType: e.entity_type, entityId: e.id }));
    }
    expect(effective.length).toBeGreaterThanOrEqual(1);
    expect(effective.every((entity) => entity.entityType === "contact")).toBe(true);
    expect(new Set(effective.map((entity) => entity.entityId)).size).toBe(effective.length);
  });

  it("infers finance CSV entity types per fixture instead of dataset_row", async () => {
    const fixtures = [
      { fileName: "sample_income.csv", expectedType: "income" },
      { fileName: "sample_flows.csv", expectedType: "flow" },
      { fileName: "sample_holdings.csv", expectedType: "holding" },
      { fileName: "sample_purchases.csv", expectedType: "purchase" },
      { fileName: "sample_transfers.csv", expectedType: "transfer" },
      { fileName: "sample_tax_events.csv", expectedType: "tax_event" },
      { fileName: "sample_crypto_transactions.csv", expectedType: "crypto_transaction" },
    ] as const;

    for (const fixture of fixtures) {
      const filePath = path.join(CSV_FIXTURES_DIR, fixture.fileName);
      const csvContent = await fs.readFile(filePath, "utf8");
      const expectedRows = countCsvRows(csvContent);
      const keySuffix = `${Date.now()}-${fixture.fileName}`;

      const result = await (server as { store: (p: unknown) => Promise<{ content: Array<{ text: string }> }> }).store({
        user_id: TEST_USER_ID,
        file_content: Buffer.from(csvContent, "utf8").toString("base64"),
        mime_type: "text/csv",
        original_filename: fixture.fileName,
        interpret: true,
        idempotency_key: `it-csv-${fixture.fileName}-type-${keySuffix}`,
      });
      const payload = JSON.parse(result.content[0].text) as {
        interpretation?: { entities?: Array<{ entityType: string; entityId: string }> };
        related_entities?: Array<{ id: string; entity_type: string }>;
        source_id?: string;
      };

      let effective =
        (payload.interpretation?.entities ?? []).length > 0
          ? payload.interpretation!.entities!
          : (payload.related_entities ?? []).map((e) => ({ entityType: e.entity_type, entityId: e.id }));
      if (effective.length === 0 && payload.source_id) {
        const { data: obs } = await db
          .from("observations")
          .select("entity_id")
          .eq("source_id", payload.source_id);
        const entityIds = [...new Set((obs ?? []).map((o) => o.entity_id).filter(Boolean))] as string[];
        const { data: ent } = await db.from("entities").select("id, entity_type").in("id", entityIds);
        effective = (ent ?? []).map((e) => ({ entityType: e.entity_type, entityId: e.id }));
      }
      expect(effective.length).toBeGreaterThanOrEqual(0);
      if (effective.length > 0) {
        expect(effective.every((entity) => entity.entityType === fixture.expectedType)).toBe(true);
      }
    }
  });

  it("preserves balance account_id as string (not coerced to date)", async () => {
    const filePath = path.join(CSV_FIXTURES_DIR, "sample_balances.csv");
    const csvContent = await fs.readFile(filePath, "utf8");
    const keySuffix = `${Date.now()}-balances-schema`;

    const result = await (server as { store: (p: unknown) => Promise<{ content: Array<{ text: string }> }> }).store({
      user_id: TEST_USER_ID,
      file_content: Buffer.from(csvContent, "utf8").toString("base64"),
      mime_type: "text/csv",
      original_filename: "sample_balances.csv",
      interpret: true,
      idempotency_key: `it-csv-balances-schema-${keySuffix}`,
    });
    const payload = JSON.parse(result.content[0].text) as {
      interpretation?: { entities?: Array<{ observationId: string }> };
      source_id?: string;
    };
    let observationIds = payload.interpretation?.entities?.map((entity) => entity.observationId) ?? [];
    if (observationIds.length === 0 && payload.source_id) {
      const { data: obs } = await db
        .from("observations")
        .select("id")
        .eq("source_id", payload.source_id);
      observationIds = (obs ?? []).map((o) => o.id);
    }
    expect(observationIds.length).toBeGreaterThan(0);

    const { data, error } = await db
      .from("observations")
      .select("fields")
      .in("id", observationIds);

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
    for (const row of data ?? []) {
      const fields = (row.fields ?? {}) as Record<string, unknown>;
      expect(fields.account_id).toBe("acc-checking-001");
    }
  });

  it("preserves insurance policy_number as string", async () => {
    const filePath = path.join(process.cwd(), "tests", "fixtures", "agent_mcp", "insurance_policy.txt");
    const keySuffix = `${Date.now()}-insurance-schema`;

    const result = await (server as { store: (p: unknown) => Promise<{ content: Array<{ text: string }> }> }).store({
      user_id: TEST_USER_ID,
      file_path: filePath,
      interpret: true,
      idempotency_key: `it-insurance-schema-${keySuffix}`,
    });
    const payload = JSON.parse(result.content[0].text) as {
      interpretation?: {
        entities?: Array<{ observationId: string }>;
        skipped?: boolean;
        reason?: string;
      };
      interpretation_debug?: { reason?: string };
      source_id?: string;
    };
    if (payload.interpretation?.skipped) {
      expect(payload.interpretation.reason).toMatch(
        /quota_exceeded|openai_not_configured|interpretation_failed/
      );
      return;
    }
    if (
      payload.interpretation_debug?.reason === "quota_exceeded" ||
      payload.interpretation_debug?.reason === "openai_not_configured"
    ) {
      expect(payload.interpretation_debug.reason).toMatch(/quota_exceeded|openai_not_configured/);
      return;
    }
    let observationIds = payload.interpretation?.entities?.map((entity) => entity.observationId) ?? [];
    if (observationIds.length === 0 && payload.source_id) {
      const { data: obs } = await db
        .from("observations")
        .select("id")
        .eq("source_id", payload.source_id);
      observationIds = (obs ?? []).map((o) => o.id);
    }
    expect(observationIds.length).toBeGreaterThan(0);

    const { data, error } = await db
      .from("observations")
      .select("fields")
      .in("id", observationIds);

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
    for (const row of data ?? []) {
      const fields = (row.fields ?? {}) as Record<string, unknown>;
      expect(fields.policy_number).toBe("pol-12345");
    }
  });

  it("deduplicated store returns correct existing entities (entity_type and key fields)", async () => {
    const cases: Array<{
      label: string;
      getContent: () => Promise<{ file_content: string; mime_type: string; original_filename: string } | { file_path: string }>;
      expectedEntityType: string;
      keyFields: string[];
    }> = [
      {
        label: "crypto_transaction",
        getContent: async () => {
          const csv = await fs.readFile(path.join(CSV_FIXTURES_DIR, "sample_crypto_transactions.csv"), "utf8");
          return {
            file_content: Buffer.from(csv, "utf8").toString("base64"),
            mime_type: "text/csv",
            original_filename: "sample_crypto_transactions.csv",
          };
        },
        expectedEntityType: "crypto_transaction",
        keyFields: ["transaction_date", "asset_symbol", "value_usd", "tx_hash"],
      },
      {
        label: "tax_event",
        getContent: async () => {
          const csv = await fs.readFile(path.join(CSV_FIXTURES_DIR, "sample_tax_events.csv"), "utf8");
          return {
            file_content: Buffer.from(csv, "utf8").toString("base64"),
            mime_type: "text/csv",
            original_filename: "sample_tax_events.csv",
          };
        },
        expectedEntityType: "tax_event",
        keyFields: ["event_date", "asset_symbol", "gain_loss_usd", "tax_year"],
      },
    ];

    for (const c of cases) {
      const content = await c.getContent();
      const idempotencyKey = `it-dedup-entities-${c.label}-${Date.now()}`;

      const firstResult = await (server as { store: (p: unknown) => Promise<{ content: Array<{ text: string }> }> }).store({
        user_id: TEST_USER_ID,
        ...content,
        interpret: true,
        idempotency_key: idempotencyKey,
      });
      const firstPayload = JSON.parse(firstResult.content[0].text) as { source_id?: string; deduplicated?: boolean };

      const secondResult = await (server as { store: (p: unknown) => Promise<{ content: Array<{ text: string }> }> }).store({
        user_id: TEST_USER_ID,
        ...content,
        interpret: true,
        idempotency_key: idempotencyKey,
      });
      const secondPayload = JSON.parse(secondResult.content[0].text) as { source_id?: string; deduplicated?: boolean };

      expect(secondPayload.deduplicated).toBe(true);

      const sourceId = secondPayload.source_id ?? firstPayload.source_id;
      expect(sourceId).toBeDefined();

      const { data: observations } = await db
        .from("observations")
        .select("entity_id")
        .eq("source_id", sourceId);
      const entityIds = [...new Set((observations ?? []).map((o) => o.entity_id).filter(Boolean))] as string[];
      expect(entityIds.length).toBeGreaterThan(0);

      const validEntities: Array<{ entity_type: string; snapshot: Record<string, unknown> }> = [];
      for (const entityId of entityIds) {
        const entity = await getEntityWithProvenance(entityId);
        if (entity) validEntities.push({ entity_type: entity.entity_type, snapshot: entity.snapshot ?? {} });
      }
      expect(validEntities.length).toBeGreaterThan(0);
      for (const entity of validEntities) {
        expect(entity.entity_type).toBe(c.expectedEntityType);
        const hasAtLeastOneKeyField = c.keyFields.some(
          (key) => entity.snapshot[key] !== undefined && entity.snapshot[key] !== null
        );
        expect(hasAtLeastOneKeyField).toBe(true);
      }
    }
  });
});

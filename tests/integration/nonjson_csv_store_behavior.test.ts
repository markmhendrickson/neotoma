import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const CSV_FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures", "csv");

async function deleteExistingSourcesByContentHash(contentHash: string): Promise<void> {
  const { data: existingSources } = await db
    .from("sources")
    .select("id")
    .eq("content_hash", contentHash);
  const sourceIds = (existingSources ?? []).map((s) => s.id).filter(Boolean) as string[];
  if (sourceIds.length === 0) return;
  await db.from("observations").delete().in("source_id", sourceIds);
  await db.from("raw_fragments").delete().in("source_id", sourceIds);
  await db.from("sources").delete().in("id", sourceIds);
}

describe("Non-JSON CSV raw store behavior", () => {
  let server: NeotomaServer;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as { authenticatedUserId: string | null }).authenticatedUserId = TEST_USER_ID;
  });

  it("stores CSV fixtures as raw sources without creating observations", async () => {
    const filePath = path.join(CSV_FIXTURES_DIR, "sample_transactions.csv");
    const csvContent = await fs.readFile(filePath, "utf8");
    const contentHash = createHash("sha256").update(csvContent).digest("hex");
    await deleteExistingSourcesByContentHash(contentHash);
    const idempotencyKey = `it-csv-raw-${randomUUID()}`;

    const result = await (server as { store: (p: unknown) => Promise<{ content: Array<{ text: string }> }> }).store({
      user_id: TEST_USER_ID,
      file_content: Buffer.from(csvContent, "utf8").toString("base64"),
      mime_type: "text/csv",
      original_filename: "sample_transactions.csv",
      idempotency_key: idempotencyKey,
    });
    const payload = JSON.parse(result.content[0].text) as {
      source_id: string;
      content_hash: string;
      asset_entity_id?: string;
      asset_entity_type?: string;
      related_entities?: unknown[];
      related_relationships?: unknown[];
    };

    expect(payload.source_id).toBeDefined();
    expect(payload.content_hash).toBeDefined();
    expect(payload.asset_entity_id).toBeDefined();
    expect(payload.asset_entity_type).toBe("file_asset");
    expect(payload.related_entities ?? []).toHaveLength(1);
    expect(payload.related_relationships ?? []).toHaveLength(0);

    const { data: observations } = await db
      .from("observations")
      .select("id")
      .eq("source_id", payload.source_id);
    expect(observations ?? []).toHaveLength(1);
  });

  it("still allows agent-supplied entities alongside a CSV file", async () => {
    const filePath = path.join(CSV_FIXTURES_DIR, "sample_contacts.csv");
    const csvContent = await fs.readFile(filePath, "utf8");
    const idempotencyKey = `it-csv-combined-${randomUUID()}`;

    const result = await (server as { store: (p: unknown) => Promise<{ content: Array<{ text: string }> }> }).store({
      user_id: TEST_USER_ID,
      idempotency_key: idempotencyKey,
      file_idempotency_key: `${idempotencyKey}-file`,
      file_content: Buffer.from(csvContent, "utf8").toString("base64"),
      mime_type: "text/csv",
      original_filename: "sample_contacts.csv",
      entities: [
        {
          entity_type: "contact",
          full_name: "Sample Contact",
          email: "sample@example.com",
        },
      ],
    });
    const payload = JSON.parse(result.content[0].text) as {
      structured?: { entities?: Array<{ entity_id?: string }> };
      unstructured?: { source_id?: string };
    };

    expect(payload.structured?.entities?.length).toBe(1);
    expect(payload.unstructured?.source_id).toBeDefined();
  });
});

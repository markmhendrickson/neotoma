/**
 * Non-JSON fixtures MCP raw store replay
 */

import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";

const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures");
const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

const NONJSON_FIXTURES: string[] = [
  "csv/sample_transactions.csv",
  "csv/sample_contacts.csv",
  "agent_mcp/insurance_policy.txt",
  "pdf/sample-upload.txt",
  "pdf/sample_receipt.md",
  "pdf/sample_invoice.md",
  "pdf/sample_invoice.pdf",
  "pdf/sample_receipt.pdf",
  "pdf/sample_contract.pdf",
  "sample_invoice.pdf",
];

type StorePayload =
  | { file_path: string; user_id: string; idempotency_key: string }
  | {
      file_content: string;
      mime_type: string;
      original_filename: string;
      user_id: string;
      idempotency_key: string;
    };

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

describe("Non-JSON fixtures MCP raw store replay", () => {
  let server: NeotomaServer;

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as { authenticatedUserId: string | null }).authenticatedUserId = TEST_USER_ID;
  });

  it("stores supported fixtures as raw sources without server-side extraction", async () => {
    const rows: Array<{ fixture: string; pass: boolean; note?: string }> = [];

    for (const relPath of NONJSON_FIXTURES) {
      const fullPath = path.join(FIXTURES_DIR, relPath);
      let payload: StorePayload;
      const idempotencyKey = `nonjson-raw-${relPath.replace(/[/.]/g, "_")}-${randomUUID()}`;

      try {
        const ext = path.extname(relPath).toLowerCase();
        const fileBuffer = await fs.readFile(fullPath);
        const contentHash = createHash("sha256").update(fileBuffer).digest("hex");
        await deleteExistingSourcesByContentHash(contentHash);
        if (ext === ".csv") {
          payload = {
            file_content: fileBuffer.toString("base64"),
            mime_type: "text/csv",
            original_filename: path.basename(relPath),
            user_id: TEST_USER_ID,
            idempotency_key: idempotencyKey,
          };
        } else {
          payload = {
            file_path: fullPath,
            user_id: TEST_USER_ID,
            idempotency_key: idempotencyKey,
          };
        }
      } catch (error) {
        rows.push({ fixture: relPath, pass: false, note: (error as Error).message });
        continue;
      }

      const result = await (server as { store: (p: unknown) => Promise<{ content: Array<{ text: string }> }> }).store(payload);
      const parsed = JSON.parse(result.content[0]?.text ?? "{}") as {
        source_id?: string;
        asset_entity_id?: string;
        asset_entity_type?: string;
        related_entities?: unknown[];
      };

      if (!parsed.source_id) {
        rows.push({ fixture: relPath, pass: false, note: "missing source_id" });
        continue;
      }

      const { data: observations } = await db
        .from("observations")
        .select("id")
        .eq("source_id", parsed.source_id);

      rows.push({
        fixture: relPath,
        pass:
          (observations ?? []).length === 1 &&
          (parsed.related_entities ?? []).length === 1 &&
          Boolean(parsed.asset_entity_id) &&
          parsed.asset_entity_type === "file_asset",
        note:
          (observations ?? []).length !== 1
            ? `unexpected observations: ${(observations ?? []).length}`
            : (parsed.related_entities ?? []).length !== 1
              ? `unexpected related_entities: ${(parsed.related_entities ?? []).length}`
              : parsed.asset_entity_type !== "file_asset"
                ? `unexpected asset_entity_type: ${String(parsed.asset_entity_type)}`
                : undefined,
      });
    }

    const failures = rows.filter((row) => !row.pass);
    expect(failures, JSON.stringify(rows, null, 2)).toHaveLength(0);
  });
});

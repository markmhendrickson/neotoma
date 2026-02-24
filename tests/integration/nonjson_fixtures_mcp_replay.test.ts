/**
 * Non-JSON fixtures MCP store replay
 *
 * Stores all non-JSON fixtures (CSV, txt, md, pdf) via MCP store with interpret=true,
 * then checks entity count and types against expectations. Outputs a compact pass/fail table.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";

const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures");
const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

/** CSV filename -> expected entity type (from inferEntityType / fixture naming) */
const CSV_EXPECTED_TYPE: Record<string, string> = {
  sample_transactions: "transaction",
  sample_contacts: "contact",
  sample_income: "income",
  sample_flows: "flow",
  sample_holdings: "holding",
  sample_purchases: "purchase",
  sample_transfers: "transfer",
  sample_tax_events: "tax_event",
  sample_crypto_transactions: "crypto_transaction",
  sample_balances: "balance",
};

/** Non-JSON fixture entries: path relative to FIXTURES_DIR, expected entity type */
const NONJSON_FIXTURES: Array<{ relPath: string; expectedType: string }> = [
  ...Object.keys(CSV_EXPECTED_TYPE).map((name) => ({
    relPath: `csv/${name}.csv`,
    expectedType: CSV_EXPECTED_TYPE[name],
  })),
  // Non-CSV unstructured fixtures use deterministic mock extraction in this test run.
  { relPath: "agent_mcp/insurance_policy.txt", expectedType: "note" },
  { relPath: "pdf/sample-upload.txt", expectedType: "note" },
  { relPath: "pdf/sample_receipt.md", expectedType: "note" },
  { relPath: "pdf/sample_invoice.md", expectedType: "note" },
  { relPath: "pdf/sample_invoice.pdf", expectedType: "note" },
  { relPath: "pdf/sample_receipt.pdf", expectedType: "note" },
  { relPath: "pdf/sample_contract.pdf", expectedType: "note" },
  { relPath: "pdf/sample_contract.md", expectedType: "note" },
  { relPath: "pdf/sample_bank_statement.pdf", expectedType: "note" },
  { relPath: "pdf/sample_bank_statement.md", expectedType: "note" },
  { relPath: "pdf/sample_note.pdf", expectedType: "note" },
  { relPath: "pdf/sample_note.md", expectedType: "note" },
  { relPath: "pdf/sample_meal.pdf", expectedType: "note" },
  { relPath: "pdf/sample_meal.md", expectedType: "note" },
  { relPath: "pdf/sample_research.pdf", expectedType: "note" },
  { relPath: "pdf/sample_research.md", expectedType: "note" },
  { relPath: "pdf/sample_exercise.pdf", expectedType: "note" },
  { relPath: "pdf/sample_exercise.md", expectedType: "note" },
  { relPath: "pdf/sample_holding_statement.pdf", expectedType: "note" },
  { relPath: "pdf/sample_holding_statement.md", expectedType: "note" },
  { relPath: "pdf/sample_transaction_receipt.pdf", expectedType: "note" },
  { relPath: "pdf/sample_transaction_receipt.md", expectedType: "note" },
  { relPath: "pdf/sample_tax_form.pdf", expectedType: "note" },
  { relPath: "pdf/sample_tax_form.md", expectedType: "note" },
  { relPath: "sample_invoice.pdf", expectedType: "note" },
];

type StorePayload =
  | { file_path: string; user_id: string; interpret: boolean; idempotency_key: string }
  | {
      file_content: string;
      mime_type: string;
      original_filename: string;
      user_id: string;
      interpret: boolean;
      idempotency_key: string;
    };

async function getEntityCountAndTypesFromSource(sourceId: string): Promise<{ count: number; types: string[] }> {
  const { data: obs } = await db
    .from("observations")
    .select("entity_id, entity_type")
    .eq("source_id", sourceId);
  const entityIds = [...new Set((obs ?? []).map((o) => o.entity_id).filter(Boolean))] as string[];
  if (entityIds.length === 0) return { count: 0, types: [] };
  const typesFromObs = (obs ?? []).map((o) => (o as { entity_type?: string }).entity_type).filter(Boolean) as string[];
  if (typesFromObs.length > 0) {
    return { count: entityIds.length, types: [...new Set(typesFromObs)] };
  }
  const { data: ent } = await db.from("entities").select("entity_type").in("id", entityIds);
  const types = (ent ?? []).map((e) => (e as { entity_type: string }).entity_type);
  return { count: entityIds.length, types: [...new Set(types)] };
}

async function deleteExistingSourcesByContentHash(contentHash: string): Promise<void> {
  const { data: existingSources } = await db
    .from("sources")
    .select("id")
    .eq("user_id", TEST_USER_ID)
    .eq("content_hash", contentHash);
  const sourceIds = (existingSources ?? []).map((s) => s.id).filter(Boolean) as string[];
  if (sourceIds.length === 0) {
    return;
  }
  await db.from("observations").delete().in("source_id", sourceIds);
  await db.from("raw_fragments").delete().in("source_id", sourceIds);
  await db.from("sources").delete().in("id", sourceIds);
}

describe("Non-JSON fixtures MCP store replay", () => {
  let server: NeotomaServer;
  let previousMockFlag: string | undefined;

  beforeAll(async () => {
    previousMockFlag = process.env.NEOTOMA_MOCK_LLM_EXTRACTION;
    process.env.NEOTOMA_MOCK_LLM_EXTRACTION = "1";
    server = new NeotomaServer();
    (server as { authenticatedUserId: string | null }).authenticatedUserId = TEST_USER_ID;
  });

  afterAll(() => {
    if (previousMockFlag === undefined) {
      delete process.env.NEOTOMA_MOCK_LLM_EXTRACTION;
      return;
    }
    process.env.NEOTOMA_MOCK_LLM_EXTRACTION = previousMockFlag;
  });

  it("stores all non-JSON fixtures via MCP and expectations match", async () => {
    (server as { authenticatedUserId: string | null }).authenticatedUserId = TEST_USER_ID;
    const rows: Array<{ fixture: string; expectedType: string; count: number; types: string[]; dedup: boolean; pass: boolean; note?: string }> = [];

    for (const { relPath, expectedType } of NONJSON_FIXTURES) {
      const fullPath = path.join(FIXTURES_DIR, relPath);
      let payload: StorePayload;
      const idempotencyKey = `nonjson-replay-${relPath.replace(/[/.]/g, "_")}-${Date.now()}`;

      try {
        const ext = path.extname(relPath).toLowerCase();
        const fileBuffer = await fs.readFile(fullPath);
        const contentHash = createHash("sha256").update(fileBuffer).digest("hex");
        await deleteExistingSourcesByContentHash(contentHash);
        if (ext === ".csv") {
          const content = fileBuffer.toString("utf8");
          payload = {
            file_content: Buffer.from(content, "utf8").toString("base64"),
            mime_type: "text/csv",
            original_filename: path.basename(relPath),
            user_id: TEST_USER_ID,
            interpret: true,
            idempotency_key: idempotencyKey,
          };
        } else {
          payload = {
            file_path: fullPath,
            user_id: TEST_USER_ID,
            interpret: true,
            idempotency_key: idempotencyKey,
          };
        }
      } catch (e) {
        rows.push({
          fixture: relPath,
          expectedType,
          count: 0,
          types: [],
          dedup: false,
          pass: false,
          note: (e as Error).message,
        });
        continue;
      }

      const result = await (server as { store: (p: unknown) => Promise<{ content: Array<{ text: string }> }> }).store(payload);
      const text = result.content[0]?.text ?? "{}";
      let parsed: {
        source_id?: string;
        deduplicated?: boolean;
        interpretation?: {
          entities?: Array<{ entityType: string; entityId: string }>;
          skipped?: boolean;
          reason?: string;
        };
        related_entities?: Array<{ entity_type: string }>;
      };
      try {
        parsed = JSON.parse(text);
      } catch {
        rows.push({
          fixture: relPath,
          expectedType,
          count: 0,
          types: [],
          dedup: false,
          pass: false,
          note: "Invalid JSON response",
        });
        continue;
      }

      const sourceId = parsed.source_id;
      let count = 0;
      let types: string[] = [];

      const fromInterp = parsed.interpretation?.entities ?? [];
      const fromRelated = parsed.related_entities ?? [];
      if (fromInterp.length > 0) {
        count = fromInterp.length;
        types = [...new Set(fromInterp.map((e) => e.entityType))];
      } else if (fromRelated.length > 0) {
        count = fromRelated.length;
        types = [...new Set(fromRelated.map((e) => e.entity_type))];
      } else if (sourceId) {
        const resolved = await getEntityCountAndTypesFromSource(sourceId);
        count = resolved.count;
        types = resolved.types;
      }

      const dedup = Boolean(parsed.deduplicated);
      const interpretationSkipped =
        parsed.interpretation?.skipped === true &&
        /quota_exceeded|openai_not_configured/.test(String(parsed.interpretation?.reason ?? ""));
      const pass = interpretationSkipped || (types.length > 0 && types.every((t) => t === expectedType));

      rows.push({
        fixture: relPath,
        expectedType,
        count,
        types,
        dedup,
        pass,
        note:
          pass || parsed.interpretation == null
            ? undefined
            : JSON.stringify(parsed.interpretation).slice(0, 200),
      });
    }

    const tableLines = [
      "Fixture | Expected | Count | Types | Dedup | Pass",
      "--------|----------|-------|-------|-------|-----",
      ...rows.map((r) => {
        const typesStr = r.types.length ? r.types.join(", ") : "-";
        const exp = r.expectedType;
        const passStr = r.pass ? "yes" : "no";
        const note = r.note ? ` (${r.note})` : "";
        return `${r.fixture} | ${exp} | ${r.count} | ${typesStr} | ${r.dedup ? "yes" : "no"} | ${passStr}${note}`;
      }),
    ];
    const table = tableLines.join("\n");
    const failed = rows.filter((r) => !r.pass);
    console.log("Non-JSON MCP replay table:\n" + table);
    expect(failed, `Non-JSON replay failures:\n${table}`).toHaveLength(0);
  });
});

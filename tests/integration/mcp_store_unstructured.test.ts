import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import fs from "fs";
import path from "path";
import os from "os";
import { validateStoreUnstructuredResponse } from "../helpers/mcp_spec_validators.js";

describe("MCP store raw files and parse_file", () => {
  let server: NeotomaServer;
  const testUserId = "00000000-0000-0000-0000-000000000000";
  const createdSourceIds: string[] = [];
  const tempPaths: string[] = [];

  beforeAll(async () => {
    server = new NeotomaServer();
  });

  beforeEach(async () => {
    if (createdSourceIds.length > 0) {
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("raw_fragments").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }

    for (const p of tempPaths.splice(0)) {
      try {
        if (fs.existsSync(p)) {
          const stat = fs.statSync(p);
          if (stat.isDirectory()) {
            fs.rmSync(p, { recursive: true, force: true });
          } else {
            fs.unlinkSync(p);
          }
        }
      } catch {
        // ignore cleanup errors
      }
    }
  });

  afterAll(async () => {
    if (createdSourceIds.length > 0) {
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("raw_fragments").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
    }
  });

  it("stores file_path input as a raw source", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
    const testFile = path.join(tempDir, "test_note.txt");
    tempPaths.push(testFile, tempDir);
    fs.writeFileSync(testFile, `This is a raw store test ${Date.now()}.`);

    const result = await (server as any).store({
      user_id: testUserId,
      file_path: testFile,
      idempotency_key: `raw-file-path-${Date.now()}`,
    });

    const responseData = JSON.parse(result.content[0].text);
    validateStoreUnstructuredResponse(responseData);
    expect(responseData.asset_entity_id).toBeDefined();
    expect(responseData.asset_entity_type).toBe("file_asset");
    expect(responseData.interpretation).toBeUndefined();

    createdSourceIds.push(responseData.source_id);
  });

  it("stores base64 file_content as a raw source", async () => {
    const fileContent = `Base64 test content ${Date.now()}`;
    const base64Content = Buffer.from(fileContent).toString("base64");

    const result = await (server as any).store({
      user_id: testUserId,
      file_content: base64Content,
      mime_type: "text/plain",
      original_filename: "test_base64.txt",
      idempotency_key: `raw-file-content-${Date.now()}`,
    });

    const responseData = JSON.parse(result.content[0].text);
    validateStoreUnstructuredResponse(responseData);
    expect(responseData.asset_entity_id).toBeDefined();
    expect(responseData.interpretation).toBeUndefined();

    createdSourceIds.push(responseData.source_id);
  });

  it("deduplicates files with the same content", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-test-"));
    const testFile = path.join(tempDir, "test_dedup.txt");
    tempPaths.push(testFile, tempDir);
    fs.writeFileSync(testFile, "Duplicate test content.");

    const result1 = await (server as any).store({
      user_id: testUserId,
      file_path: testFile,
      idempotency_key: `dedup-1-${Date.now()}`,
    });
    const response1 = JSON.parse(result1.content[0].text);
    createdSourceIds.push(response1.source_id);

    const result2 = await (server as any).store({
      user_id: testUserId,
      file_path: testFile,
      idempotency_key: `dedup-2-${Date.now()}`,
    });
    const response2 = JSON.parse(result2.content[0].text);

    expect(response1.deduplicated).toBe(false);
    expect(response2.deduplicated).toBe(true);
    expect(response2.source_id).toBe(response1.source_id);
    expect(response2.content_hash).toBe(response1.content_hash);
  });

  it("parses text files without storing them", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-parse-"));
    const testFile = path.join(tempDir, "parse_me.txt");
    const content = `Parse me ${Date.now()}`;
    tempPaths.push(testFile, tempDir);
    fs.writeFileSync(testFile, content);

    const result = await (server as any).parseFile({
      file_path: testFile,
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.text).toBe(content);
    expect(payload.pages).toBeUndefined();
    expect(payload.mime_type).toBe("text/plain");
    expect(payload.file_size).toBe(Buffer.byteLength(content));
    expect(typeof payload.content_hash).toBe("string");
    expect(payload.content_hash.length).toBe(64);

    const { data: sources } = await db
      .from("sources")
      .select("id")
      .eq("original_filename", "parse_me.txt")
      .eq("user_id", testUserId);
    expect(sources ?? []).toHaveLength(0);
  });
});

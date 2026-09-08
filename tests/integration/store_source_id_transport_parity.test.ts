/**
 * Integration: HTTP and MCP must agree on what `store(source_id)` does (#2352).
 *
 * The same uploaded bytes, handed to `store()` by opaque handle, must produce
 * the same graph regardless of which transport carried the call. Before #2352
 * they did not: the MCP path (`src/server.ts`) called
 * `ensureUnstructuredAssetEntity` and returned `asset_entity_id`, while the
 * HTTP path (`src/actions.ts`) resolved the `sources` row, returned early with
 * `storage_mode: "uploaded"`, and attached nothing at all. So a file ingested
 * over HTTP had no asset entity while the identical bytes over MCP did.
 *
 * That is the environment-dependent split #2325 exists to close, and it was
 * not hypothetical: `src/cli/plans.ts` POSTs to HTTP `/store`, reads
 * `asset_entity_id` off the reply, and creates the plan→file EMBEDS edge only
 * when that field is present — so over HTTP it silently never created one.
 * Convergence therefore had to run toward MCP's shape (attach the entity), not
 * away from it, and both transports now call the shared
 * `services/asset_entity.ts`.
 *
 * The assertions are written as a comparison between the two transports rather
 * than as two independent expectations, so that a future change which drops
 * the asset entity from BOTH paths still fails here.
 */

import crypto from "node:crypto";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const API_PORT = 18137;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

const sha256 = (buf: Buffer) => crypto.createHash("sha256").update(buf).digest("hex");

function buildMultipart(
  fileBuffer: Buffer,
  filename: string
): { body: Buffer; contentType: string } {
  const boundary = `----neotoma${crypto.randomBytes(12).toString("hex")}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([head, fileBuffer, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe("store(source_id) — HTTP/MCP transport parity (#2352)", () => {
  let httpServer: ReturnType<typeof createServer>;
  let mcpServer: NeotomaServer;
  const createdSourceIds: string[] = [];

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    mcpServer = new NeotomaServer();
    (mcpServer as unknown as { authenticatedUserId: string }).authenticatedUserId = TEST_USER_ID;
  });

  afterAll(async () => {
    if (createdSourceIds.length > 0) {
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("raw_fragments").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  /** Upload bytes and return the opaque handle both transports will be given. */
  async function uploadBytes(fileBuffer: Buffer, filename: string): Promise<string> {
    const { body, contentType } = buildMultipart(fileBuffer, filename);
    const response = await fetch(`${API_BASE}/sources/upload?user_id=${TEST_USER_ID}`, {
      method: "POST",
      headers: { "content-type": contentType },
      body: new Uint8Array(body),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { source_id: string };
    createdSourceIds.push(payload.source_id);
    return payload.source_id;
  }

  async function storeOverHttp(sourceId: string, key: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${API_BASE}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: TEST_USER_ID,
        source_id: sourceId,
        idempotency_key: key,
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      unstructured?: Record<string, unknown>;
    } & Record<string, unknown>;
    return (body.unstructured ?? body) as Record<string, unknown>;
  }

  async function storeOverMcp(sourceId: string, key: string): Promise<Record<string, unknown>> {
    const result = await (
      mcpServer as unknown as {
        store: (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
      }
    ).store({
      user_id: TEST_USER_ID,
      source_id: sourceId,
      idempotency_key: key,
    });
    return JSON.parse(result.content[0].text) as Record<string, unknown>;
  }

  /** The asset entity + observation each transport actually left in the graph. */
  async function graphEffect(sourceId: string) {
    const { data: observations } = await db
      .from("observations")
      .select("id, entity_id, entity_type, source_id")
      .eq("user_id", TEST_USER_ID)
      .eq("source_id", sourceId);

    const rows = observations ?? [];
    const entityIds = [...new Set(rows.map((o: { entity_id: string }) => o.entity_id))].sort();

    const { data: entities } = entityIds.length
      ? await db.from("entities").select("id, entity_type").in("id", entityIds)
      : { data: [] as Array<{ id: string; entity_type: string }> };

    return {
      observationCount: rows.length,
      entityTypes: (entities ?? []).map((e: { entity_type: string }) => e.entity_type).sort(),
    };
  }

  it("returns the same response shape over both transports", async () => {
    const httpBytes = Buffer.from(`parity-shape-http-${Date.now()}-${crypto.randomUUID()}`);
    const mcpBytes = Buffer.from(`parity-shape-mcp-${Date.now()}-${crypto.randomUUID()}`);

    const httpSourceId = await uploadBytes(httpBytes, "parity-http.txt");
    const mcpSourceId = await uploadBytes(mcpBytes, "parity-mcp.txt");

    const httpResult = await storeOverHttp(httpSourceId, `parity-http-${httpSourceId}`);
    const mcpResult = await storeOverMcp(mcpSourceId, `parity-mcp-${mcpSourceId}`);

    // The fields that describe the handle resolution itself.
    expect(httpResult.storage_mode).toBe(mcpResult.storage_mode);
    expect(httpResult.storage_mode).toBe("uploaded");
    expect(httpResult.deduplicated).toBe(mcpResult.deduplicated);

    // The field the HTTP path used to omit entirely. Compared across
    // transports, so removing it from both would still fail this.
    expect(typeof httpResult.asset_entity_id).toBe(typeof mcpResult.asset_entity_id);
    expect(typeof httpResult.asset_entity_id).toBe("string");
    expect(httpResult.asset_entity_type).toBe(mcpResult.asset_entity_type);
    expect(httpResult.asset_entity_type).toBe("file_asset");

    // Each transport reports the handle it was actually given.
    expect(httpResult.source_id).toBe(httpSourceId);
    expect(mcpResult.source_id).toBe(mcpSourceId);
    expect(httpResult.content_hash).toBe(sha256(httpBytes));
    expect(mcpResult.content_hash).toBe(sha256(mcpBytes));
  });

  it("leaves an equivalent graph behind over both transports", async () => {
    // The response shape could agree while the writes diverged, so this
    // compares what is actually in the graph rather than what was reported.
    const httpBytes = Buffer.from(`parity-graph-http-${Date.now()}-${crypto.randomUUID()}`);
    const mcpBytes = Buffer.from(`parity-graph-mcp-${Date.now()}-${crypto.randomUUID()}`);

    const httpSourceId = await uploadBytes(httpBytes, "graph-http.txt");
    const mcpSourceId = await uploadBytes(mcpBytes, "graph-mcp.txt");

    await storeOverHttp(httpSourceId, `graph-http-${httpSourceId}`);
    await storeOverMcp(mcpSourceId, `graph-mcp-${mcpSourceId}`);

    const httpEffect = await graphEffect(httpSourceId);
    const mcpEffect = await graphEffect(mcpSourceId);

    expect(httpEffect).toEqual(mcpEffect);
    // Pin the shared value too: an equal-but-empty pair would satisfy the
    // comparison above while meaning neither transport attached anything.
    expect(httpEffect.entityTypes).toEqual(["file_asset"]);
    expect(httpEffect.observationCount).toBeGreaterThan(0);
  });

  it("resolves the same handle to the same asset entity across transports", async () => {
    // The strongest form: one upload, stored over each transport in turn.
    // Content-addressed resolution means both must land on the SAME asset
    // entity, and the second store must not duplicate the observation.
    const fileBuffer = Buffer.from(`parity-same-handle-${Date.now()}-${crypto.randomUUID()}`);
    const sourceId = await uploadBytes(fileBuffer, "same-handle.txt");

    const httpResult = await storeOverHttp(sourceId, `same-http-${sourceId}`);
    const afterHttp = await graphEffect(sourceId);

    const mcpResult = await storeOverMcp(sourceId, `same-mcp-${sourceId}`);
    const afterMcp = await graphEffect(sourceId);

    expect(httpResult.asset_entity_id).toBe(mcpResult.asset_entity_id);
    expect(httpResult.asset_entity_type).toBe(mcpResult.asset_entity_type);
    // Idempotent: the second transport recognised the existing observation
    // rather than writing a second one for the same (source, entity).
    expect(afterMcp).toEqual(afterHttp);
  });
});

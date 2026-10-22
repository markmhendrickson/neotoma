import { createHash, randomUUID } from "crypto";
import { createServer } from "node:http";
import { app } from "../../src/actions.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";
import { getSchemaDefinition } from "../../src/services/schema_definitions.js";
import {
  cleanupTestEntities,
  cleanupTestSchema,
  cleanupTestSources,
  seedTestSchema,
} from "../helpers/test_schema_helpers.js";

vi.mock("../../src/embeddings.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  generateEmbedding: vi.fn().mockResolvedValue(null),
}));
const userId = randomUUID();
const server = new NeotomaServer() as any;
server.authenticatedUserId = userId;
const audioBytes = Buffer.from(`Synthetic recording ${userId}`);
const entities: string[] = [];
const sources: string[] = [];
const httpServer = createServer(app);
let baseUrl: string;
beforeAll(async () => {
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as { port: number }).port}`;
});
const historicalFields = {
  title: { type: "string" as const },
  transcription_text: { type: "string" as const },
  file_size_bytes: { type: "date" as const },
};
async function store(fields: Record<string, unknown>, combined = false, transport = "mcp") {
  const bytes = audioBytes;
  const args = {
    user_id: userId,
    idempotency_key: randomUUID(),
    entities: [{ entity_type: "transcription", ...fields }],
    ...(combined
      ? {
          file_content: bytes.toString("base64"),
          mime_type: "audio/wav",
          original_filename: `synthetic-${userId}.wav`,
          interpretation: { source_ref: "unstructured" },
        }
      : {}),
  };
  let body: any;
  if (transport === "http") {
    const response = await fetch(`${baseUrl}/store`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    expect(response.status).toBe(200);
    body = await response.json();
  } else {
    const result = await server.store(args);
    body = JSON.parse(result.content[0].text);
  }
  const row = body.structured?.entities?.[0] ?? body.entities?.[0];
  if (row?.entity_id) entities.push(row.entity_id);
  if (body.unstructured?.asset_entity_id) entities.push(body.unstructured.asset_entity_id);
  for (const id of [body.source_id, body.structured?.source_id, body.unstructured?.source_id])
    if (id) sources.push(id);
  return { body, row };
}
afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await cleanupTestEntities(entities);
  await cleanupTestSources(sources);
  await cleanupTestSchema("transcription", userId);
});
describe("transcription schema and source contract", () => {
  it("discriminates the legacy date declaration without rewriting its observations", async () => {
    await seedTestSchema(server, "transcription", historicalFields, {
      user_specific: true,
      user_id: userId,
    });
    const { row } = await store({
      title: `Historical ${randomUUID()}`,
      transcription_text: "Earlier text",
      file_size_bytes: 4096,
    });
    expect(row?.entity_id).toBeTruthy();
    const oldSnapshot = await db
      .from("entity_snapshots")
      .select("snapshot")
      .eq("entity_id", row.entity_id)
      .single();
    expect(oldSnapshot.data?.snapshot).not.toHaveProperty("file_size_bytes");
    const before = await db.from("observations").select("*").eq("entity_id", row.entity_id);
    const schema = getSchemaDefinition("transcription");
    expect(schema).not.toBeNull();
    await seedTestSchema(server, "transcription", schema!.schema_definition.fields, {
      user_specific: true,
      user_id: userId,
    });
    const after = await db.from("observations").select("*").eq("entity_id", row.entity_id);
    expect(after.data).toEqual(before.data);
    expect(schema!.schema_definition.fields.file_size_bytes.type).toBe("number");
    console.info(
      "legacy file_size_bytes snapshot:",
      row.entity_snapshot_after?.file_size_bytes ?? "absent"
    );
  });
  it.each(["mcp", "http"])(
    "%s combined store preserves metadata, exact transcript and source linkage",
    async (transport) => {
      const schema = getSchemaDefinition("transcription");
      expect(schema).not.toBeNull();
      await seedTestSchema(server, "transcription", schema!.schema_definition.fields, {
        user_specific: true,
        user_id: userId,
      });
      const expected = {
        title: `Synthetic ${randomUUID()}`,
        transcription_text: "  Exact Synthetic transcript.\r\nSecond  line.\n",
        audio_content_sha256: createHash("sha256").update(audioBytes).digest("hex"),
        original_source_file: "synthetic.wav",
        capture_method: "voice_memo",
        transcription_engine: "local_whisper_cpp",
        consent_basis: "unknown",
        file_size_bytes: audioBytes.length,
      };
      const { body, row } = await store(expected, true, transport);
      expect(body.structured?.unknown_fields_count ?? body.unknown_fields_count ?? 0).toBe(0);
      expect(row?.entity_id).toBeTruthy();
      const snapshot = await db
        .from("entity_snapshots")
        .select("snapshot")
        .eq("entity_id", row.entity_id)
        .single();
      expect(snapshot.data?.snapshot).toMatchObject(expected);
      const sourceId = body.unstructured?.source_id;
      expect(sourceId).toBeTruthy();
      const observations = await db
        .from("observations")
        .select("source_id")
        .eq("entity_id", row.entity_id);
      expect(observations.data).toContainEqual({ source_id: sourceId });
      const source = await db.from("sources").select("content_hash").eq("id", sourceId).single();
      expect(source.data?.content_hash).toBe(expected.audio_content_sha256);
    }
  );

  it("exact combined replay with unstructured interpretation returns the stored entity", async () => {
    const schema = getSchemaDefinition("transcription");
    expect(schema).not.toBeNull();
    await seedTestSchema(server, "transcription", schema!.schema_definition.fields, {
      user_specific: true,
      user_id: userId,
    });
    const replayAudio = Buffer.from(`Synthetic replay recording ${randomUUID()}`);
    const expected = {
      title: `Replay ${randomUUID()}`,
      transcription_text: "Exact replay transcript.\n",
      audio_content_sha256: createHash("sha256").update(replayAudio).digest("hex"),
      original_source_file: "synthetic-replay.wav",
      capture_method: "voice_memo",
      transcription_engine: "local_whisper_cpp",
      consent_basis: "unknown",
      file_size_bytes: replayAudio.length,
    };
    const idempotencyKey = `transcription-replay-${randomUUID()}`;
    const args = {
      user_id: userId,
      idempotency_key: idempotencyKey,
      file_idempotency_key: `${idempotencyKey}-file`,
      entities: [{ entity_type: "transcription", ...expected }],
      file_content: replayAudio.toString("base64"),
      mime_type: "audio/wav",
      original_filename: `synthetic-replay-${userId}.wav`,
      interpretation: { source_ref: "unstructured" as const },
    };
    const firstRaw = await server.store(args);
    const first = JSON.parse(firstRaw.content[0].text);
    const firstRow = first.structured?.entities?.[0];
    expect(firstRow?.entity_id).toBeTruthy();
    if (firstRow?.entity_id) entities.push(firstRow.entity_id);
    if (first.unstructured?.source_id) sources.push(first.unstructured.source_id);

    const replayRaw = await server.store(args);
    const replay = JSON.parse(replayRaw.content[0].text);
    const replayRow = replay.structured?.entities?.[0];
    expect(replay.structured?.entities ?? []).not.toEqual([]);
    expect(replayRow?.entity_id).toBe(firstRow.entity_id);
    expect(replayRow?.entity_type).toBe("transcription");
    expect(replayRow?.deduplicated).toBe(true);
    expect(replay.unstructured?.source_id).toBe(first.unstructured?.source_id);
  });

  it("exact combined replay after correct does not return sibling transcription on shared unstructured source", async () => {
    const schema = getSchemaDefinition("transcription");
    expect(schema).not.toBeNull();
    await seedTestSchema(server, "transcription", schema!.schema_definition.fields, {
      user_specific: true,
      user_id: userId,
    });

    const sharedAudio = Buffer.from(`Shared sibling audio ${randomUUID()}`);
    const sharedSha = createHash("sha256").update(sharedAudio).digest("hex");
    const baseFields = {
      transcription_text: "Shared audio transcript body.\n",
      audio_content_sha256: sharedSha,
      original_source_file: "shared-sibling.wav",
      capture_method: "voice_memo",
      transcription_engine: "local_whisper_cpp",
      consent_basis: "unknown",
      file_size_bytes: sharedAudio.length,
    };
    const titleA = `Sibling A ${randomUUID()}`;
    const titleB = `Sibling B ${randomUUID()}`;
    const keyA = `transcription-sibling-a-${randomUUID()}`;
    const keyB = `transcription-sibling-b-${randomUUID()}`;

    const storeArgs = (title: string, idempotencyKey: string) => ({
      user_id: userId,
      idempotency_key: idempotencyKey,
      file_idempotency_key: `${idempotencyKey}-file`,
      entities: [{ entity_type: "transcription", title, ...baseFields }],
      file_content: sharedAudio.toString("base64"),
      mime_type: "audio/wav",
      original_filename: `shared-sibling-${userId}.wav`,
      interpretation: { source_ref: "unstructured" as const },
    });

    const firstA = JSON.parse((await server.store(storeArgs(titleA, keyA))).content[0].text);
    const firstB = JSON.parse((await server.store(storeArgs(titleB, keyB))).content[0].text);
    const idA = firstA.structured?.entities?.[0]?.entity_id as string | undefined;
    const idB = firstB.structured?.entities?.[0]?.entity_id as string | undefined;
    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idA).not.toBe(idB);
    if (idA) entities.push(idA);
    if (idB) entities.push(idB);
    for (const id of [
      firstA.unstructured?.source_id,
      firstB.unstructured?.source_id,
      firstA.structured?.source_id,
      firstB.structured?.source_id,
    ]) {
      if (id) sources.push(id);
    }
    expect(firstA.unstructured?.source_id).toBe(firstB.unstructured?.source_id);

    await server.correct({
      user_id: userId,
      entity_id: idA,
      entity_type: "transcription",
      field: "title",
      value: `Corrected ${titleA}`,
      idempotency_key: `correct-title-a-${randomUUID()}`,
    });

    const replay = JSON.parse((await server.store(storeArgs(titleA, keyA))).content[0].text);
    const replayIds = (replay.structured?.entities ?? []).map(
      (row: { entity_id: string }) => row.entity_id
    );
    expect(replayIds).toEqual([idA]);
  });
});

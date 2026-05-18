import path from "path";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { describe, it, expect } from "vitest";
import { isRecoverableSqliteConnectionError } from "../local_db_adapter.ts";

let dbImportSeq = 0;
let rowSeq = 0;

async function loadDb(tempDir: string) {
  process.env.NEOTOMA_DATA_DIR = tempDir;
  process.env.NEOTOMA_EVENT_LOG_PATH = path.join(tempDir, "events.log");
  process.env.NEOTOMA_EVENT_LOG_MIRROR = "false";

  const moduleUrl = new URL("../../../db.js", import.meta.url).href;
  const cacheBustUrl = `${moduleUrl}?cacheBust=${Date.now()}-${++dbImportSeq}`;
  const module = await import(cacheBustUrl);
  return module.db;
}

function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), `${prefix}-`));
}

function nextId(prefix: string): string {
  rowSeq += 1;
  return `${prefix}_${process.pid}_${Date.now()}_${rowSeq}`;
}

describe("local db adapter", () => {
  it("writes and reads sources in local sqlite", async () => {
    const tempDir = makeTempDir("neotoma-local");
    const db = await loadDb(tempDir);
    const sourceId = nextId("src_local_test");
    const userId = nextId("user_local_test");
    const contentHash = nextId("hash_local_test");

    const { data: inserted, error: insertError } = await db
      .from("sources")
      .insert({
        id: sourceId,
        user_id: userId,
        content_hash: contentHash,
        mime_type: "text/plain",
        storage_url: "file:///tmp/source.txt",
        provenance: { origin: "local_test" },
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    expect(insertError).toBeNull();
    expect(inserted?.id).toBe(sourceId);

    const { data: fetched, error: fetchError } = await db
      .from("sources")
      .select("*")
      .eq("id", sourceId)
      .single();

    expect(fetchError).toBeNull();
    expect(fetched?.provenance).toEqual({ origin: "local_test" });

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates and validates local auth sessions", async () => {
    const tempDir = makeTempDir("neotoma-auth");
    const db = await loadDb(tempDir);
    const userId = nextId("user_local_test");
    const email = `${userId}@test.neotoma`;

    const { data: userResult } = await db.auth.admin.createUser({
      id: userId,
      email,
      email_confirm: true,
    });

    expect(userResult?.user?.id).toBe(userId);

    const { data: linkData } = await db.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: "http://localhost:5173" },
    });

    const actionLink = linkData?.properties?.action_link || "";
    const accessToken = actionLink.split("access_token=")[1]?.split("&")[0];
    expect(accessToken).toBeTruthy();

    const { data: authData, error: authError } = await db.auth.getUser(accessToken);
    expect(authError).toBeNull();
    expect(authData?.user?.id).toBe(userId);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("stores raw fragments without explicitly setting created_at", async () => {
    const tempDir = makeTempDir("neotoma-fragments");
    const db = await loadDb(tempDir);
    const fragmentId = nextId("frag_local_test");
    const sourceId = nextId("src_local_test");
    const userId = nextId("user_local_test");

    const { error: insertError } = await db.from("raw_fragments").insert({
      id: fragmentId,
      source_id: sourceId,
      interpretation_id: null,
      entity_type: "person",
      fragment_key: "nickname",
      fragment_value: { value: "Bobby" },
      fragment_envelope: { reason: "unknown_field" },
      frequency_count: 1,
      first_seen: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      user_id: userId,
    });

    expect(insertError).toBeNull();

    const { data: fragment, error: fetchError } = await db
      .from("raw_fragments")
      .select("id, created_at")
      .eq("id", fragmentId)
      .single();

    expect(fetchError).toBeNull();
    expect(fragment?.created_at).toBeTruthy();

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes timeline events in local sqlite", async () => {
    const tempDir = makeTempDir("neotoma-events");
    const db = await loadDb(tempDir);
    const eventId = nextId("evt_test");
    const sourceId = nextId("src_local_test");
    const userId = nextId("user_local_test");

    const { error } = await db.from("timeline_events").insert({
      id: eventId,
      event_type: "SourceIngested",
      event_timestamp: new Date().toISOString(),
      source_id: sourceId,
      source_field: "created_at",
      created_at: new Date().toISOString(),
      user_id: userId,
    });

    expect(error).toBeNull();

    const { data: events } = await db.from("timeline_events").select("*").eq("id", eventId);

    expect(events?.length).toBe(1);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("supports PostgREST-style JSON path filters for snapshots", async () => {
    const tempDir = makeTempDir("neotoma-json-path");
    const db = await loadDb(tempDir);

    const now = new Date().toISOString();
    const entityId = nextId("ent_json_path_post");
    const userId = nextId("user_json_path_test");
    const { error: entityError } = await db.from("entities").insert({
      id: entityId,
      entity_type: "post",
      canonical_name: "json path post",
      user_id: userId,
      created_at: now,
      updated_at: now,
    });
    expect(entityError).toBeNull();

    const { error: snapshotError } = await db.from("entity_snapshots").insert({
      entity_id: entityId,
      entity_type: "post",
      user_id: userId,
      schema_version: "1.0",
      snapshot: {
        published: true,
        published_date: "2026-03-16",
      },
      observation_count: 1,
      last_observation_at: now,
      computed_at: now,
    });
    expect(snapshotError).toBeNull();

    const { data: filtered, error: filterError } = await db
      .from("entity_snapshots")
      .select("entity_id")
      .eq("entity_type", "post")
      .eq("snapshot->>published", "true")
      .gte("snapshot->>published_date", "2026-01-01")
      .lte("snapshot->>published_date", "2026-12-31");

    expect(filterError).toBeNull();
    expect(filtered?.some((row) => row.entity_id === entityId)).toBe(true);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("recovers from sqlite disk I/O errors by reopening connection", async () => {
    const tempDir = makeTempDir("neotoma-ioerr");
    const db = await loadDb(tempDir);
    const sourceId = nextId("src_ioerr_test");
    const userId = nextId("user_ioerr_test");
    const contentHash = nextId("hash_ioerr");

    const { error: insertError } = await db.from("sources").insert({
      id: sourceId,
      user_id: userId,
      content_hash: contentHash,
      mime_type: "text/plain",
      storage_url: "file:///tmp/ioerr.txt",
      created_at: new Date().toISOString(),
    });
    expect(insertError).toBeNull();

    // Force stale handle state: delete SQLite files while adapter still has a cached connection.
    const dbPath = path.join(tempDir, "neotoma.db");
    rmSync(dbPath, { force: true });
    rmSync(`${dbPath}-wal`, { force: true });
    rmSync(`${dbPath}-shm`, { force: true });

    // Query should not bubble disk I/O error; adapter retries once after cache reset.
    const { error: fetchError } = await db.from("sources").select("*").eq("id", sourceId);
    expect(fetchError).toBeNull();

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("treats sqlite corruption errors as connection-invalidating", () => {
    expect(
      isRecoverableSqliteConnectionError(
        Object.assign(new Error("database disk image is malformed"), { code: "SQLITE_CORRUPT" })
      )
    ).toBe(true);
    expect(
      isRecoverableSqliteConnectionError(
        new Error("Tree 42 page 33089: btreeInitPage() returns error code 11")
      )
    ).toBe(true);
  });
});

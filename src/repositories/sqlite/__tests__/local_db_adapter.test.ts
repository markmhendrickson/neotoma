import path from "path";
import { rmSync } from "fs";
import { describe, it, expect } from "vitest";

async function loadDb(tempDir: string) {
  process.env.NEOTOMA_DATA_DIR = tempDir;
  process.env.NEOTOMA_EVENT_LOG_PATH = path.join(tempDir, "events.log");
  process.env.NEOTOMA_EVENT_LOG_MIRROR = "false";

  const moduleUrl = new URL("../../../db.js", import.meta.url).href;
  const cacheBustUrl = `${moduleUrl}?cacheBust=${Date.now()}`;
  const module = await import(cacheBustUrl);
  return module.db;
}

describe("local db adapter", () => {
  it("writes and reads sources in local sqlite", async () => {
    const tempDir = path.join(process.cwd(), "tmp", `neotoma-local-${Date.now()}`);
    const db = await loadDb(tempDir);

    const { data: inserted, error: insertError } = await db
      .from("sources")
      .insert({
        id: "src_local_test",
        user_id: "user_local_test",
        content_hash: "hash_123",
        mime_type: "text/plain",
        storage_url: "file:///tmp/source.txt",
        provenance: { origin: "local_test" },
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    expect(insertError).toBeNull();
    expect(inserted?.id).toBe("src_local_test");

    const { data: fetched, error: fetchError } = await db
      .from("sources")
      .select("*")
      .eq("id", "src_local_test")
      .single();

    expect(fetchError).toBeNull();
    expect(fetched?.provenance).toEqual({ origin: "local_test" });

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates and validates local auth sessions", async () => {
    const tempDir = path.join(process.cwd(), "tmp", `neotoma-auth-${Date.now()}`);
    const db = await loadDb(tempDir);

    const { data: userResult } = await db.auth.admin.createUser({
      id: "user_local_test",
      email: "local@test.neotoma",
      email_confirm: true,
    });

    expect(userResult?.user?.id).toBe("user_local_test");

    const { data: linkData } = await db.auth.admin.generateLink({
      type: "magiclink",
      email: "local@test.neotoma",
      options: { redirectTo: "http://localhost:5173" },
    });

    const actionLink = linkData?.properties?.action_link || "";
    const accessToken = actionLink.split("access_token=")[1]?.split("&")[0];
    expect(accessToken).toBeTruthy();

    const { data: authData, error: authError } = await db.auth.getUser(accessToken);
    expect(authError).toBeNull();
    expect(authData?.user?.id).toBe("user_local_test");

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("stores raw fragments without explicitly setting created_at", async () => {
    const tempDir = path.join(process.cwd(), "tmp", `neotoma-fragments-${Date.now()}`);
    const db = await loadDb(tempDir);

    const { error: insertError } = await db.from("raw_fragments").insert({
      id: "frag_local_test",
      source_id: "src_local_test",
      interpretation_id: null,
      entity_type: "person",
      fragment_key: "nickname",
      fragment_value: { value: "Bobby" },
      fragment_envelope: { reason: "unknown_field" },
      frequency_count: 1,
      first_seen: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      user_id: "user_local_test",
    });

    expect(insertError).toBeNull();

    const { data: fragment, error: fetchError } = await db
      .from("raw_fragments")
      .select("id, created_at")
      .eq("id", "frag_local_test")
      .single();

    expect(fetchError).toBeNull();
    expect(fragment?.created_at).toBeTruthy();

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes timeline events in local sqlite", async () => {
    const tempDir = path.join(process.cwd(), "tmp", `neotoma-events-${Date.now()}`);
    const db = await loadDb(tempDir);

    const { error } = await db
      .from("timeline_events")
      .insert({
        id: "evt_test_1",
        event_type: "SourceIngested",
        event_timestamp: new Date().toISOString(),
        source_id: "src_local_test",
        source_field: "created_at",
        created_at: new Date().toISOString(),
        user_id: "user_local_test",
      });

    expect(error).toBeNull();

    const { data: events } = await db
      .from("timeline_events")
      .select("*")
      .eq("id", "evt_test_1");

    expect(events?.length).toBe(1);

    rmSync(tempDir, { recursive: true, force: true });
  });
});

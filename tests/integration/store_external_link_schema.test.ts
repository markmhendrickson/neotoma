/**
 * Regression test for issue #53: external_link schema drops gist metadata.
 *
 * Verifies that storing an external_link with description, data_source,
 * link_kind, and visibility produces unknown_fields_count: 0 and projects
 * all fields into the snapshot.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

describe("store external_link — gist metadata fields (issue #53)", () => {
  let server: NeotomaServer;
  const createdSourceIds: string[] = [];
  const createdEntityIds: string[] = [];

  beforeAll(() => {
    server = new NeotomaServer();
    (server as any).authenticatedUserId = TEST_USER_ID;
  });

  afterAll(async () => {
    for (const sourceId of createdSourceIds) {
      await db.from("observations").delete().eq("source_id", sourceId);
      await db.from("raw_fragments").delete().eq("source_id", sourceId);
      await db.from("sources").delete().eq("id", sourceId);
    }
    for (const entityId of createdEntityIds) {
      await db.from("entity_snapshots").delete().eq("entity_id", entityId);
    }
  });

  it("stores all external_link fields without unknown_fields_count > 0", async () => {
    const rawResult = await (server as any).store({
      user_id: TEST_USER_ID,
      idempotency_key: `issue-53-regression-1-${Date.now()}`,
      entities: [
        {
          entity_type: "external_link",
          title: "GitHub Gist — Neotoma architectural brief v0.3",
          url: "https://gist.github.com/test-gist-id",
          description: "Secret GitHub Gist containing a sanitized version of a brief.",
          data_source: "gh gist create brief.md",
          link_kind: "github_gist",
          visibility: "secret",
        },
      ],
    });

    const result = JSON.parse(rawResult.content[0].text);

    expect(result.source_id).toBeDefined();
    createdSourceIds.push(result.source_id);

    expect(result.entities).toHaveLength(1);
    const entity = result.entities[0];
    expect(entity.entity_type).toBe("external_link");
    createdEntityIds.push(entity.entity_id);

    // The core regression: all four previously-unknown fields should now be recognized.
    expect(result.unknown_fields_count ?? 0).toBe(0);
  });

  it("projects description, data_source, link_kind, visibility into the snapshot", async () => {
    const storeRaw = await (server as any).store({
      user_id: TEST_USER_ID,
      idempotency_key: `issue-53-regression-2-${Date.now()}`,
      entities: [
        {
          entity_type: "external_link",
          title: "Snapshot projection test link",
          url: "https://gist.github.com/snapshot-test",
          description: "A test link for snapshot projection.",
          data_source: "gh gist create test.md",
          link_kind: "github_gist",
          visibility: "public",
        },
      ],
    });

    const storeResult = JSON.parse(storeRaw.content[0].text);
    const entityId = storeResult.entities[0].entity_id;
    createdSourceIds.push(storeResult.source_id);
    createdEntityIds.push(entityId);

    const snapshotRaw = await (server as any).retrieveEntitySnapshot({
      entity_id: entityId,
      format: "json",
    });
    const snapshot = JSON.parse(snapshotRaw.content[0].text);

    expect(snapshot.snapshot?.description).toBe("A test link for snapshot projection.");
    expect(snapshot.snapshot?.data_source).toBe("gh gist create test.md");
    expect(snapshot.snapshot?.link_kind).toBe("github_gist");
    expect(snapshot.snapshot?.visibility).toBe("public");
  });
});

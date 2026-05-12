import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { seedIssueSchema } from "../../src/services/issues/seed_schema.js";

type StoreResponse = { content: Array<{ text: string }> };
type StoreCallable = { store: (params: Record<string, unknown>) => Promise<StoreResponse> };

describe("MCP store target_id identity conflicts", () => {
  const userId = "00000000-0000-0000-0000-000000000000";
  let server: NeotomaServer;
  let testRun = "";
  const createdEntityIds: string[] = [];
  const createdSourceIds: string[] = [];

  beforeAll(async () => {
    server = new NeotomaServer();
    (server as { authenticatedUserId: string | null }).authenticatedUserId = userId;
    await seedIssueSchema();
  });

  afterEach(async () => {
    if (createdSourceIds.length > 0) {
      await db.from("raw_fragments").delete().in("source_id", createdSourceIds);
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }

    if (createdEntityIds.length > 0) {
      await db.from("entity_snapshots").delete().in("entity_id", createdEntityIds);
      await db.from("entities").delete().in("id", createdEntityIds);
      createdEntityIds.length = 0;
    }
  });

  it("rejects target_id updates that would add another issue's github identity", async () => {
    testRun = `target-identity-conflict-${Date.now()}`;
    const githubNumber = 9_900_000 + Math.floor(Date.now() % 100_000);
    const repo = "markmhendrickson/neotoma-test";
    const store = (params: Record<string, unknown>) =>
      (server as unknown as StoreCallable).store(params);

    const canonicalResult = await store({
      user_id: userId,
      entities: [
        {
          entity_type: "issue",
          title: "Canonical GitHub issue",
          body: "Canonical issue body",
          status: "open",
          labels: ["test"],
          github_number: githubNumber,
          github_url: `https://github.com/${repo}/issues/${githubNumber}`,
          repo,
          visibility: "public",
          author: "test",
          data_source: testRun,
        },
      ],
      idempotency_key: `${testRun}-canonical`,
    });
    const canonicalPayload = JSON.parse(canonicalResult.content[0].text);
    const canonicalIssueId = canonicalPayload.entities[0].entity_id as string;
    createdEntityIds.push(canonicalIssueId);
    createdSourceIds.push(canonicalPayload.source_id as string);

    const titleResult = await store({
      user_id: userId,
      entities: [
        {
          entity_type: "issue",
          title: `Title-keyed issue ${testRun}`,
          status: "open",
          data_source: testRun,
        },
      ],
      idempotency_key: `${testRun}-title`,
    });
    const titlePayload = JSON.parse(titleResult.content[0].text);
    const titleIssueId = titlePayload.entities[0].entity_id as string;
    createdEntityIds.push(titleIssueId);
    createdSourceIds.push(titlePayload.source_id as string);
    expect(titleIssueId).not.toBe(canonicalIssueId);

    await expect(
      store({
        user_id: userId,
        commit: false,
        entities: [
          {
            entity_type: "issue",
            target_id: titleIssueId,
            title: "Canonical GitHub issue",
            status: "open",
            github_number: githubNumber,
            repo,
            data_source: testRun,
          },
        ],
        idempotency_key: `${testRun}-conflict`,
      }),
    ).rejects.toThrow(/Identity conflict: target_id/);
  });
});

/**
 * End-to-end integration for the self-contained local feedback pipeline.
 *
 * Verifies:
 *   - Submitting via LocalFeedbackTransport writes both the JSON record
 *     and a `neotoma_feedback` entity observation (via the mirror) under
 *     the record's submitter_id.
 *   - The local-mode admin endpoints (`listPendingLocal`, `updateStatusLocal`)
 *     operate against the JSON store and re-mirror on every write, so the
 *     entity snapshot stays in sync as status/triage_notes/classification
 *     change.
 *   - The idempotency key is stable across submit -> triage -> resolve, so
 *     Neotoma collapses every pipeline hop onto a single
 *     `neotoma_feedback` entity rather than creating duplicates per write.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mirrorCalls: Array<{
  record_id: string;
  status: string;
  data_source: string | undefined;
  idempotency_key: string;
  user_id: string;
}> = [];

vi.mock("../../src/services/feedback/mirror_local_to_entity.js", () => ({
  mirrorLocalFeedbackToEntity: vi.fn(async (record: any, options: any) => {
    const idempotency_key = `neotoma_feedback-${record.id}`;
    mirrorCalls.push({
      record_id: record.id,
      status: record.status,
      data_source: options?.dataSource,
      idempotency_key,
      user_id: options?.userId ?? record.submitter_id,
    });
    return {
      mirrored: true,
      entity_id: `ent_nf_${record.id}`,
      action: "created",
      idempotency_key,
    };
  }),
  __resetMirrorStoreCacheForTests: () => {},
}));

import {
  FEEDBACK_ADMIN_PROXY_INTERNALS,
} from "../../src/services/feedback/admin_proxy.js";
import {
  LocalFeedbackStore,
  resolveFeedbackStorePath,
} from "../../src/services/feedback/local_store.js";
import { LocalFeedbackTransport } from "../../src/services/feedback_transport_local.js";

const TEST_SUBMITTER = "11111111-1111-1111-1111-111111111111";

function makeMockRes() {
  const state = {
    statusCode: 200,
    body: undefined as unknown,
  };
  const res = {
    statusCode: 200,
    status(code: number) {
      state.statusCode = code;
      this.statusCode = code;
      return this;
    },
    json(value: unknown) {
      state.body = value;
      return this;
    },
    send(value: unknown) {
      state.body = value;
      return this;
    },
    type() {
      return this;
    },
  };
  return { res: res as any, state };
}

describe("local feedback pipeline end-to-end", () => {
  let dataDir: string;
  let originalDataDir: string | undefined;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neotoma-local-pipeline-"));
    originalDataDir = process.env.NEOTOMA_DATA_DIR;
    process.env.NEOTOMA_DATA_DIR = dataDir;
    mirrorCalls.length = 0;
  });

  afterEach(() => {
    if (originalDataDir !== undefined) {
      process.env.NEOTOMA_DATA_DIR = originalDataDir;
    } else {
      delete process.env.NEOTOMA_DATA_DIR;
    }
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("submit -> entity is mirrored under submitter_id with submitted status", async () => {
    const storePath = resolveFeedbackStorePath(dataDir);
    const transport = new LocalFeedbackTransport(storePath);
    const response = await transport.submit(
      {
        kind: "incident",
        title: "CLI command foo fails with opaque error",
        body: "Redacted body.",
        metadata: {
          environment: {
            neotoma_version: "0.7.0-dev",
            client_name: "cursor-agent",
            client_version: "3.4.5",
            os: "darwin",
            tool_name: "submit_feedback",
          },
        },
      },
      TEST_SUBMITTER,
    );

    expect(response.feedback_id).toMatch(/^fbk_/);
    expect(response.status).toBe("submitted");
    expect(mirrorCalls).toHaveLength(1);
    const [call] = mirrorCalls;
    expect(call.record_id).toBe(response.feedback_id);
    expect(call.status).toBe("submitted");
    expect(call.user_id).toBe(TEST_SUBMITTER);
    expect(call.data_source).toMatch(/^neotoma local submit /);
    expect(call.idempotency_key).toBe(
      `neotoma_feedback-${response.feedback_id}`,
    );

    const store = new LocalFeedbackStore(storePath);
    const saved = await store.getById(response.feedback_id);
    expect(saved).not.toBeNull();
    expect(saved?.submitter_id).toBe(TEST_SUBMITTER);
    expect(saved?.status).toBe("submitted");
  });

  it("updateStatusLocal -> re-mirrors triage updates onto the same entity idempotency key", async () => {
    const storePath = resolveFeedbackStorePath(dataDir);
    const transport = new LocalFeedbackTransport(storePath);
    const response = await transport.submit(
      {
        kind: "incident",
        title: "Local pipeline triage test",
        body: "Body placeholder.",
        metadata: {
          environment: {
            neotoma_version: "0.7.0-dev",
            client_name: "cursor-agent",
            os: "darwin",
          },
        },
      },
      TEST_SUBMITTER,
    );

    const { updateStatusLocal } = FEEDBACK_ADMIN_PROXY_INTERNALS;
    const { res, state } = makeMockRes();
    await updateStatusLocal(
      {
        body: {
          status: "triaged",
          classification: "cli_bug",
          triage_notes: "Assigned to maintainer.",
          github_issue_urls: [
            "https://github.com/markmhendrickson/neotoma/issues/101",
          ],
        },
      } as any,
      res,
      response.feedback_id,
    );

    expect(state.statusCode).toBe(200);
    const body = state.body as {
      ok: boolean;
      status: string;
      mirror: { mirrored: boolean; entity_id?: string };
      mode: string;
    };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("triaged");
    expect(body.mode).toBe("local");
    expect(body.mirror.mirrored).toBe(true);
    expect(body.mirror.entity_id).toBe(`ent_nf_${response.feedback_id}`);

    expect(mirrorCalls).toHaveLength(2);
    expect(mirrorCalls[0].status).toBe("submitted");
    expect(mirrorCalls[1].status).toBe("triaged");
    expect(mirrorCalls[0].idempotency_key).toBe(
      mirrorCalls[1].idempotency_key,
    );
    expect(mirrorCalls[1].data_source).toMatch(/^neotoma local admin /);
    expect(mirrorCalls[1].user_id).toBe(TEST_SUBMITTER);

    const store = new LocalFeedbackStore(storePath);
    const saved = await store.getById(response.feedback_id);
    expect(saved?.status).toBe("triaged");
    expect(saved?.classification).toBe("cli_bug");
    expect(saved?.triage_notes).toBe("Assigned to maintainer.");
    expect(saved?.resolution_links.github_issue_urls).toEqual([
      "https://github.com/markmhendrickson/neotoma/issues/101",
    ]);
  });

  it("listPendingLocal surfaces open records from the local store in mode=local shape", async () => {
    const storePath = resolveFeedbackStorePath(dataDir);
    const transport = new LocalFeedbackTransport(storePath);
    const first = await transport.submit(
      {
        kind: "incident",
        title: "Pending record A",
        body: "A",
        metadata: {
          environment: {
            neotoma_version: "0.7.0-dev",
            client_name: "cursor-agent",
            os: "darwin",
          },
        },
      },
      TEST_SUBMITTER,
    );
    const second = await transport.submit(
      {
        kind: "report",
        title: "Pending record B",
        body: "B",
        metadata: {
          environment: {
            neotoma_version: "0.7.0-dev",
            client_name: "cursor-agent",
            os: "darwin",
          },
        },
      },
      TEST_SUBMITTER,
    );

    const { listPendingLocal } = FEEDBACK_ADMIN_PROXY_INTERNALS;
    const { res, state } = makeMockRes();
    await listPendingLocal({ query: {} } as any, res);

    expect(state.statusCode).toBe(200);
    const body = state.body as {
      items: Array<{ id: string; status: string }>;
      mode: string;
    };
    expect(body.mode).toBe("local");
    const ids = body.items.map((i) => i.id);
    expect(ids).toContain(first.feedback_id);
    expect(ids).toContain(second.feedback_id);
  });

  it("rejects removed-state writes through updateStatusLocal with a tombstone + mirror", async () => {
    const storePath = resolveFeedbackStorePath(dataDir);
    const transport = new LocalFeedbackTransport(storePath);
    const response = await transport.submit(
      {
        kind: "incident",
        title: "Will be removed",
        body: "body",
        metadata: {
          environment: {
            neotoma_version: "0.7.0-dev",
            client_name: "cursor-agent",
            os: "darwin",
          },
        },
      },
      TEST_SUBMITTER,
    );

    const { updateStatusLocal } = FEEDBACK_ADMIN_PROXY_INTERNALS;
    const { res, state } = makeMockRes();
    await updateStatusLocal(
      { body: { status: "removed" } } as any,
      res,
      response.feedback_id,
    );

    expect(state.statusCode).toBe(200);
    const body = state.body as { record: { status: string; title: string } };
    expect(body.record.status).toBe("removed");
    expect(body.record.title).toBe("[removed]");

    const removalMirror = mirrorCalls[mirrorCalls.length - 1];
    expect(removalMirror.status).toBe("removed");
    expect(removalMirror.idempotency_key).toBe(
      `neotoma_feedback-${response.feedback_id}`,
    );
  });
});

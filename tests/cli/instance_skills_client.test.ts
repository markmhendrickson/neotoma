/**
 * Dedicated unit coverage for `src/cli/instance_skills_client.ts` — the
 * network fetch/parsing boundary for instance-stored `skill` rows (#1950)
 * and their embedded script attachments (#1951).
 *
 * `tests/cli/instance_skills.test.ts` and
 * `tests/cli/skills_sync_instance_cli.test.ts` cover the pure
 * materialization logic and the CLI action closure end to end, but neither
 * asserts against this module's own decision branches in isolation: the
 * `enabled`-filtering, EMBEDS-relationship filtering, malformed/missing-
 * field row skipping, and the three `throw`-on-API-error paths. Filed as a
 * qa-lens BLOCKING finding on PR #1956 (2026-07-22): "an untested error path
 * in the fetch layer means a malformed or attacker-influenced API response
 * ... has no test proving it's handled the way the code implies it is."
 *
 * Mocking pattern: same `vi.stubGlobal("fetch", ...)` approach already
 * established in `tests/cli/skills_sync_instance_cli.test.ts`'s
 * `makeInstanceFetchMock`, but driving the client functions directly
 * (`fetchEnabledInstanceSkills`, `fetchSkillScriptAttachments`,
 * `downloadSourceBytes`) against a real `createApiClient()` instance rather
 * than through the CLI closure — no network, no real HOME required since
 * this module makes no filesystem calls.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiClient } from "../../src/shared/api_client.ts";
import {
  downloadSourceBytes,
  fetchEnabledInstanceSkills,
  fetchSkillScriptAttachments,
} from "../../src/cli/instance_skills_client.ts";

const SKILL_ENTITY_ID = "ent_skill_1";
const ASSET_ENTITY_ID = "ent_asset_1";
const SOURCE_ID = "src_1";

function requestUrlAndMethod(input: RequestInfo | URL, init?: RequestInit): [string, string] {
  const request = input instanceof Request ? input : null;
  const url = request?.url ?? String(input);
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  return [url, method];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeClient() {
  return createApiClient({ baseUrl: "http://localhost:9999", token: "token-test" });
}

describe("instance_skills_client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("fetchEnabledInstanceSkills", () => {
    it("filters out a row with enabled: false", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const [url, method] = requestUrlAndMethod(input, init);
        if (url.includes("/entities/query") && method === "POST") {
          return jsonResponse({
            entities: [
              {
                entity_id: SKILL_ENTITY_ID,
                snapshot: { name: "disabled-tool", enabled: false },
              },
            ],
          });
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const rows = await fetchEnabledInstanceSkills(makeClient());
      expect(rows).toEqual([]);
    });

    it("filters out a row with enabled absent", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const [url, method] = requestUrlAndMethod(input, init);
        if (url.includes("/entities/query") && method === "POST") {
          return jsonResponse({
            entities: [
              {
                entity_id: SKILL_ENTITY_ID,
                snapshot: { name: "no-enabled-field" },
              },
            ],
          });
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const rows = await fetchEnabledInstanceSkills(makeClient());
      expect(rows).toEqual([]);
    });

    it("keeps an enabled: true row and maps its snapshot fields", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const [url, method] = requestUrlAndMethod(input, init);
        if (url.includes("/entities/query") && method === "POST") {
          return jsonResponse({
            entities: [
              {
                entity_id: SKILL_ENTITY_ID,
                snapshot: {
                  name: "score-tool",
                  enabled: true,
                  description: "Scores leads",
                  triggers: ["score my leads"],
                  slug: "score-tool",
                  user_invocable: true,
                  version: "1.0.0",
                  supported_harnesses: ["claude"],
                },
              },
            ],
          });
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const rows = await fetchEnabledInstanceSkills(makeClient());
      expect(rows).toEqual([
        {
          entity_id: SKILL_ENTITY_ID,
          name: "score-tool",
          description: "Scores leads",
          triggers: ["score my leads"],
          content: undefined,
          slug: "score-tool",
          user_invocable: true,
          enabled: true,
          version: "1.0.0",
          supported_harnesses: ["claude"],
        },
      ]);
    });

    it("skips a row missing name even when enabled: true", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const [url, method] = requestUrlAndMethod(input, init);
        if (url.includes("/entities/query") && method === "POST") {
          return jsonResponse({
            entities: [{ entity_id: SKILL_ENTITY_ID, snapshot: { enabled: true } }],
          });
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const rows = await fetchEnabledInstanceSkills(makeClient());
      expect(rows).toEqual([]);
    });

    it("skips a row missing entity_id even when enabled: true", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const [url, method] = requestUrlAndMethod(input, init);
        if (url.includes("/entities/query") && method === "POST") {
          return jsonResponse({
            entities: [{ snapshot: { name: "no-id", enabled: true } }],
          });
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const rows = await fetchEnabledInstanceSkills(makeClient());
      expect(rows).toEqual([]);
    });

    it("throws when POST /entities/query returns an error", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const [url, method] = requestUrlAndMethod(input, init);
        if (url.includes("/entities/query") && method === "POST") {
          return jsonResponse({ error: "internal error" }, 500);
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(fetchEnabledInstanceSkills(makeClient())).rejects.toThrow(
        /Failed to fetch instance skills/
      );
    });
  });

  describe("fetchSkillScriptAttachments", () => {
    it("filters relationships to EMBEDS with a matching source_entity_id and resolves the target snapshot", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const [url, method] = requestUrlAndMethod(input, init);
        if (url.includes("/retrieve_related_entities") && method === "POST") {
          return jsonResponse({
            relationships: [
              {
                source_entity_id: SKILL_ENTITY_ID,
                target_entity_id: ASSET_ENTITY_ID,
                relationship_type: "EMBEDS",
              },
              // Wrong relationship type: must be filtered out.
              {
                source_entity_id: SKILL_ENTITY_ID,
                target_entity_id: "ent_other",
                relationship_type: "REFERS_TO",
              },
              // Right type, wrong source: must be filtered out.
              {
                source_entity_id: "ent_some_other_skill",
                target_entity_id: "ent_spoofed",
                relationship_type: "EMBEDS",
              },
            ],
          });
        }
        if (url.includes(`/entities/${ASSET_ENTITY_ID}`) && method === "GET") {
          return jsonResponse({
            entity_id: ASSET_ENTITY_ID,
            snapshot: {
              source_id: SOURCE_ID,
              content_hash: "a".repeat(64),
              mime_type: "text/x-python",
              original_filename: "score.py",
              file_size: 42,
            },
          });
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const attachments = await fetchSkillScriptAttachments(makeClient(), SKILL_ENTITY_ID);
      expect(attachments).toEqual([
        {
          entity_id: ASSET_ENTITY_ID,
          source_id: SOURCE_ID,
          content_hash: "a".repeat(64),
          mime_type: "text/x-python",
          original_filename: "score.py",
          file_size: 42,
        },
      ]);

      // Only the one legitimate EMBEDS target should ever be fetched.
      const entityGetCalls = fetchMock.mock.calls.filter(([reqInput]) => {
        const [url, method] = requestUrlAndMethod(reqInput as RequestInfo | URL);
        return url.includes("/entities/") && method === "GET";
      });
      expect(entityGetCalls).toHaveLength(1);
    });

    it("skips an EMBEDS target missing source_id/content_hash/original_filename rather than throwing", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const [url, method] = requestUrlAndMethod(input, init);
        if (url.includes("/retrieve_related_entities") && method === "POST") {
          return jsonResponse({
            relationships: [
              {
                source_entity_id: SKILL_ENTITY_ID,
                target_entity_id: ASSET_ENTITY_ID,
                relationship_type: "EMBEDS",
              },
            ],
          });
        }
        if (url.includes(`/entities/${ASSET_ENTITY_ID}`) && method === "GET") {
          // Missing source_id, content_hash, and original_filename.
          return jsonResponse({
            entity_id: ASSET_ENTITY_ID,
            snapshot: { mime_type: "text/x-python" },
          });
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const attachments = await fetchSkillScriptAttachments(makeClient(), SKILL_ENTITY_ID);
      expect(attachments).toEqual([]);
    });

    it("skips (rather than throws) when the target entity fetch itself errors", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const [url, method] = requestUrlAndMethod(input, init);
        if (url.includes("/retrieve_related_entities") && method === "POST") {
          return jsonResponse({
            relationships: [
              {
                source_entity_id: SKILL_ENTITY_ID,
                target_entity_id: ASSET_ENTITY_ID,
                relationship_type: "EMBEDS",
              },
            ],
          });
        }
        if (url.includes(`/entities/${ASSET_ENTITY_ID}`) && method === "GET") {
          return jsonResponse({ error: "not found" }, 404);
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const attachments = await fetchSkillScriptAttachments(makeClient(), SKILL_ENTITY_ID);
      expect(attachments).toEqual([]);
    });

    it("throws when POST /retrieve_related_entities returns an error", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const [url, method] = requestUrlAndMethod(input, init);
        if (url.includes("/retrieve_related_entities") && method === "POST") {
          return jsonResponse({ error: "internal error" }, 500);
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(fetchSkillScriptAttachments(makeClient(), SKILL_ENTITY_ID)).rejects.toThrow(
        /Failed to fetch EMBEDS relationships/
      );
    });
  });

  describe("downloadSourceBytes", () => {
    it("returns the downloaded bytes on success", async () => {
      const bytes = Buffer.from("print('hello')\n");
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const [url, method] = requestUrlAndMethod(input, init);
        if (url.includes(`/sources/${SOURCE_ID}/content`) && method === "GET") {
          return new Response(new Uint8Array(bytes), {
            status: 200,
            headers: { "Content-Type": "application/octet-stream" },
          });
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await downloadSourceBytes(makeClient(), SOURCE_ID);
      expect(Buffer.compare(result, bytes)).toBe(0);
    });

    it("throws (including the HTTP status) on a non-2xx response", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const [url, method] = requestUrlAndMethod(input, init);
        if (url.includes(`/sources/${SOURCE_ID}/content`) && method === "GET") {
          return new Response("not found", { status: 404 });
        }
        throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(downloadSourceBytes(makeClient(), SOURCE_ID)).rejects.toThrow(
        /Failed to download source src_1 content \(HTTP 404\)/
      );
    });
  });
});

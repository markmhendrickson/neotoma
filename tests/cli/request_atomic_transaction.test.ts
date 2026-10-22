import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startIsolatedNeotomaServer,
  type IsolatedServer,
} from "../../packages/eval-harness/src/isolated_server.js";

const execFileAsync = promisify(execFile);
let server: IsolatedServer;
const type = "eval_atomic_cli";
async function post(path: string, body: unknown) {
  const response = await fetch(`${server.baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${server.token}` },
    body: JSON.stringify(body),
  });
  expect(response.ok).toBe(true);
  return response.json();
}
beforeAll(async () => {
  server = await startIsolatedNeotomaServer();
  await post("/register_schema", {
    entity_type: type,
    schema_version: "1.0",
    activate: true,
    schema_definition: {
      fields: {
        title: { type: "string", required: true },
        status: { type: "string" },
        remaining: { type: "number" },
      },
      canonical_name_fields: ["title"],
    },
    reducer_config: {
      merge_policies: Object.fromEntries(
        ["title", "status", "remaining"].map((field) => [
          field,
          { strategy: "highest_priority", tie_breaker: "observed_at" },
        ])
      ),
    },
  });
});
afterAll(async () => {
  await server?.stop();
});

describe("generic CLI correctTransaction actual transport effects", () => {
  it.each(["body", "params"] as const)(
    "preserves atomic state, replay and refusal using --%s",
    async (flag) => {
      const seed = await post("/store", {
        idempotency_key: `cli-seed-${flag}`,
        entities: [
          { entity_type: type, title: `CLI ${flag} draft`, status: "ready" },
          { entity_type: type, title: `CLI ${flag} source`, remaining: 1 },
        ],
      });
      const [draft, source] = seed.entities.map(
        (entity: { entity_id: string }) => entity.entity_id
      );
      const request = {
        idempotency_key: `cli-commit-${flag}`,
        entities: [
          {
            entity_id: draft,
            entity_type: type,
            expected_observation_count: 1,
            expected_snapshot: { status: "ready" },
            changes: [{ field: "status", value: "approved" }],
          },
          {
            entity_id: source,
            entity_type: type,
            expected_observation_count: 1,
            expected_snapshot: { remaining: 1 },
            changes: [{ field: "remaining", value: 0 }],
          },
        ],
      };
      async function cli(body: typeof request) {
        const { stdout } = await execFileAsync(
          process.execPath,
          [
            "dist/cli/index.js",
            "--no-log-file",
            "--json",
            "--base-url",
            server.baseUrl,
            "request",
            "--operation",
            "correctTransaction",
            `--${flag}`,
            JSON.stringify(flag === "params" ? { body } : body),
          ],
          {
            env: {
              ...process.env,
              NEOTOMA_BEARER_TOKEN: server.token,
              NEOTOMA_FORCE_LOCAL_TRANSPORT: "false",
            },
          }
        );
        return JSON.parse(stdout);
      }
      expect((await cli(request)).status).toBe("applied");
      expect((await cli(request)).status).toBe("replayed");
      const changed = structuredClone(request);
      changed.entities[1].changes[0].value = -1;
      await expect(cli(changed)).rejects.toThrow(/payload|idempotency/i);
      await expect(cli({ ...request, idempotency_key: `cli-stale-${flag}` })).rejects.toThrow(
        /CONFLICT|precondition/
      );
      const draftState = await post("/get_entity_snapshot", { entity_id: draft });
      const sourceState = await post("/get_entity_snapshot", { entity_id: source });
      expect(draftState.snapshot.status).toBe("approved");
      expect(sourceState.snapshot.remaining).toBe(0);
      expect(draftState.observation_count).toBe(2);
      expect(sourceState.observation_count).toBe(2);
    },
    30_000
  );
});

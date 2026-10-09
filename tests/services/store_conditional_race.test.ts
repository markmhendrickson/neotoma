import { fork } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startIsolatedNeotomaServer,
  type IsolatedServer,
} from "../../packages/eval-harness/src/isolated_server.js";
let server: IsolatedServer;
let owner: string;
beforeAll(async () => {
  server = await startIsolatedNeotomaServer({ useTsx: false });
  const auth = await fetch(`${server.baseUrl}/get_authenticated_user`, {
    method: "POST",
    headers: { authorization: `Bearer ${server.token}` },
  });
  expect(auth.status).toBe(200);
  const identity = await auth.json();
  owner = identity.user_id;
  expect(typeof owner).toBe("string");
  const schema = await fetch(`${server.baseUrl}/register_schema`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${server.token}` },
    body: JSON.stringify({
      entity_type: "conditional_process_test",
      schema_version: "1.0",
      activate: true,
      schema_definition: {
        fields: { code: { type: "string", required: true }, status: { type: "string" } },
        canonical_name_fields: ["code"],
      },
      reducer_config: {
        merge_policies: {
          code: { strategy: "highest_priority" },
          status: { strategy: "highest_priority" },
        },
      },
    }),
  });
  expect(schema.status).toBe(200);
});
afterAll(async () => {
  await server?.stop();
});
type State = {
  applied: boolean;
  emitted: number;
  code?: string;
  receipt?: { entity_id: string; original_observation_fields: unknown };
  native_state: unknown;
};
function worker(mode: string, key: string, code: string, status: string) {
  const child = fork(
    path.resolve("tests/fixtures/native-store/conditional_effect_process.ts"),
    [owner, mode, key, code, status],
    {
      execArgv: ["--import", "tsx"],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        NEOTOMA_DATA_DIR: server.dataDir,
        NEOTOMA_ENV: "development",
        NODE_ENV: "test",
        NEOTOMA_ENCRYPTION_ENABLED: "false",
        NEOTOMA_ACTIONS_DISABLE_AUTOSTART: "1",
        OPENAI_API_KEY: "",
        NEOTOMA_DB_BACKEND: "sqlite",
        NEOTOMA_DB_URL: "",
      },
    }
  );
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  child.stdout?.resume();
  let state: State;
  const ready = new Promise<void>((resolve, reject) => {
    child.on("message", (message) => {
      if ((message as { ready?: boolean }).ready) resolve();
      else state = message as State;
    });
    child.once("error", reject);
    child.once("exit", (exit) => {
      if (exit !== 0) reject(new Error(`Owned child exited ${exit}: ${stderr}`));
    });
  });
  const finished = new Promise<State>((resolve, reject) => {
    child.once("exit", (exit) =>
      exit === 0 && state
        ? resolve(state)
        : reject(new Error(`Owned child failed ${exit}: ${stderr}`))
    );
    child.once("error", reject);
  });
  return { child, ready, finished, go: () => child.send("go") };
}
async function snapshot(entityId: string) {
  const response = await fetch(`${server.baseUrl}/get_entity_snapshot`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${server.token}` },
    body: JSON.stringify({ entity_id: entityId }),
  });
  expect(response.status).toBe(200);
  return response.json();
}
describe("actual conditional effects across separate native processes", () => {
  it("refuses a legacy mutation paused after its old precheck when conditional creation commits first", async () => {
    const legacy = worker("paused-legacy", "paused-key", "PAUSED", "legacy-overwrite");
    const conditional = worker("conditional", "paused-key", "PAUSED", "original-bundle");
    try {
      await Promise.all([legacy.ready, conditional.ready]);
      conditional.go();
      const winner = await conditional.finished;
      expect(winner.applied).toBe(true);
      const before = await snapshot(winner.receipt!.entity_id);
      legacy.go();
      const loser = await legacy.finished;
      const current = await snapshot(winner.receipt!.entity_id);
      // Independently verify effects before checking the refusal category.
      expect(current).toEqual(before);
      expect(loser.native_state).toEqual(winner.native_state);
      expect(loser).toMatchObject({ applied: false, emitted: 0 });
      expect(current.snapshot).toEqual({ code: "PAUSED", status: "original-bundle" });
      expect(current.observation_count).toBe(1);
      expect(winner.receipt!.original_observation_fields).toEqual(current.snapshot);
      expect(loser.code).toBe("STORE_KEY_MODE_CONFLICT");
    } finally {
      for (const w of [legacy, conditional]) if (w.child.exitCode === null) w.child.kill("SIGKILL");
    }
  }, 20_000);
  it("retains the original observation when an identical legacy API store resumes after conditional commit", async () => {
    const legacy = worker("paused-legacy-api", "api-paused-key", "API-PAUSED", "original-bundle");
    const conditional = worker("conditional", "api-paused-key", "API-PAUSED", "original-bundle");
    try {
      await Promise.all([legacy.ready, conditional.ready]);
      conditional.go();
      const winner = await conditional.finished;
      expect(winner.applied).toBe(true);
      const before = await snapshot(winner.receipt!.entity_id);
      legacy.go();
      const loser = await legacy.finished;
      const after = await snapshot(winner.receipt!.entity_id);
      expect(after.observation_count).toBe(before.observation_count);
      expect(after.provenance).toEqual(before.provenance);
      expect(after.snapshot).toEqual(winner.receipt!.original_observation_fields);
      expect(loser.native_state).toEqual(winner.native_state);
      expect(loser).toMatchObject({ applied: false, emitted: 0, code: "STORE_KEY_MODE_CONFLICT" });
    } finally {
      for (const w of [legacy, conditional]) if (w.child.exitCode === null) w.child.kill("SIGKILL");
    }
  }, 20_000);
  it("commits one original bundle when distinct conditional keys race for the same physical identity", async () => {
    const a = worker("conditional", "race-a", "RACE", "A");
    const b = worker("conditional", "race-b", "RACE", "B");
    try {
      await Promise.all([a.ready, b.ready]);
      a.go();
      b.go();
      const states = await Promise.all([a.finished, b.finished]);
      expect(states.filter((state) => state.applied)).toHaveLength(1);
      expect(states.find((state) => !state.applied)).toMatchObject({
        code: "CONFLICT",
        emitted: 0,
      });
      const winner = states.find((state) => state.applied)!;
      const current = await snapshot(winner.receipt!.entity_id);
      expect(current.observation_count).toBe(1);
      expect(current.snapshot).toEqual(winner.receipt!.original_observation_fields);
      expect(
        Object.values(current.provenance).every(
          (id) => id === (winner.receipt as unknown as { observation_id: string }).observation_id
        )
      ).toBe(true);
    } finally {
      for (const w of [a, b]) if (w.child.exitCode === null) w.child.kill("SIGKILL");
    }
  }, 20_000);
});

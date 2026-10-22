import { readFileSync, existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { replayCassetteAgainstServer } from "../../packages/eval-harness/src/drivers/base.js";
import {
  replayCliRequest,
  resolveCliResultReferences,
} from "../../packages/eval-harness/src/drivers/cli_request.js";
import {
  startIsolatedNeotomaServer,
  type IsolatedServer,
} from "../../packages/eval-harness/src/isolated_server.js";
import type { DriverInvocation, ToolCall } from "../../packages/eval-harness/src/types.js";
import type { CassetteFile } from "../../packages/eval-harness/src/cassette.js";

const captures = vi.hoisted(
  () =>
    [] as Array<{
      executable: string;
      args: string[];
      options: { cwd: string; env: NodeJS.ProcessEnv };
    }>
);
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFile: (...args: Parameters<typeof actual.execFile>) => {
      captures.push({ executable: args[0], args: args[1] as string[], options: args[2] as never });
      return (actual.execFile as (...input: unknown[]) => unknown)(...args);
    },
  };
});

let server: IsolatedServer;
let invocation: DriverInvocation;
const call = (input: unknown = {}, extra = {}): ToolCall => ({
  name: "queryObservations",
  transport: "cli",
  input,
  sequence: 0,
  ...extra,
});
beforeAll(async () => {
  server = await startIsolatedNeotomaServer({ useTsx: false, env: { NEOTOMA_ENV: "test" } });
  invocation = {
    isolatedServer: server,
    neotomaBaseUrl: server.baseUrl,
    neotomaToken: server.token,
    timeoutMs: 10000,
  } as DriverInvocation;
}, 30000);
afterAll(async () => {
  await server?.stop();
});
beforeEach(() => {
  captures.length = 0;
});

describe("real CLI replay boundary", () => {
  it("executes the actual built CLI with only nonce-owned profile and explicit loopback context", async () => {
    const envNames = [
      "NODE_OPTIONS",
      "NODE_PATH",
      "GITHUB_TOKEN",
      "OPENAI_API_KEY",
      "NEOTOMA_PROJECT_ROOT",
      "NEOTOMA_BEARER_TOKEN",
    ];
    const saved = envNames.map((key) => process.env[key]);
    try {
      for (const key of envNames) process.env[key] = "synthetic-parent-must-not-propagate";
      const result = await replayCliRequest(
        invocation,
        call({ body: { entity_type: "guest_access_token" } }),
        []
      );
      expect(result.error).toBeUndefined();
      expect(result.output).toMatchObject({
        exit_code: 0,
        response: { observations: [], total: 0 },
      });
      expect(captures).toHaveLength(1);
      const child = captures[0];
      expect(child.executable).toBe(process.execPath);
      expect(isAbsolute(child.args[0])).toBe(true);
      expect(child.args[0]).toBe(join(process.cwd(), "dist/cli/index.js"));
      expect(child.args).toContain(server.baseUrl);
      expect(child.options.cwd.startsWith(join(server.dataDir, "cli-replay-"))).toBe(true);
      expect(child.options.env.HOME).toBe(child.options.cwd);
      expect(child.options.env.NEOTOMA_PROJECT_ROOT).toBe(child.options.cwd);
      expect(child.options.env.NEOTOMA_DATA_DIR).toBe(server.dataDir);
      expect(child.options.env.NEOTOMA_BEARER_TOKEN).toBe(server.token);
      expect(Object.keys(child.options.env).sort()).toEqual(
        [
          "HOME",
          "USERPROFILE",
          "TMPDIR",
          "NODE_ENV",
          "NEOTOMA_ENV",
          "NEOTOMA_PROJECT_ROOT",
          "NEOTOMA_DATA_DIR",
          "NEOTOMA_BEARER_TOKEN",
          "NEOTOMA_FORCE_LOCAL_TRANSPORT",
        ].sort()
      );
      expect(existsSync(child.options.cwd)).toBe(false);
    } finally {
      envNames.forEach((key, i) =>
        saved[i] === undefined ? delete process.env[key] : (process.env[key] = saved[i])
      );
    }
  });

  it.each([
    ["missing owned handle", () => ({ ...invocation, isolatedServer: undefined }), call()],
    ["copied handle", () => ({ ...invocation, isolatedServer: { ...server } }), call()],
    [
      "external target",
      () => ({ ...invocation, neotomaBaseUrl: "https://example.invalid" }),
      call(),
    ],
    [
      "wrong loopback target",
      () => ({ ...invocation, neotomaBaseUrl: "http://127.0.0.1:1" }),
      call(),
    ],
    ["wrong fixture bearer", () => ({ ...invocation, neotomaToken: "other-synthetic" }), call()],
    ["unknown transport", () => invocation, call({}, { transport: "shell" })],
    ["unknown auth selector", () => invocation, call({}, { auth: "ambient" })],
    ["malformed omit_auth", () => invocation, call({}, { omit_auth: "yes" })],
    ["unknown operation", () => invocation, call({}, { name: "notAnOperation" })],
    ["nonobject params", () => invocation, call(null)],
    [
      "future reference",
      () => invocation,
      call({ body: { id: { $result: { call: 0, path: ["response", "id"] } } } }),
    ],
  ])("refuses %s before its own child", async (_label, getInvocation, request) => {
    const result = await replayCliRequest(
      (getInvocation as () => DriverInvocation)(),
      request as ToolCall,
      []
    );
    expect(result.error).toBeTruthy();
    expect(result.output).toBeUndefined();
    expect(captures).toHaveLength(0);
  });

  it("retains actual prior successful effects while refusing a later malformed step without canned fallback", async () => {
    const result = await replayCassetteAgainstServer(
      invocation,
      {
        tool_calls: [
          call(
            {
              body: {
                title: "Synthetic retained prior effect",
                body: "Synthetic workflow",
                author: "synthetic-eval",
                local_issue_id: "prior-effect-control",
                reporter_app_version: "0.0.0-eval",
                visibility: "private",
              },
            },
            { name: "issuesSubmit" }
          ),
          call({}, { transport: "unknown", output: { canned: "success" } }),
        ],
        assistant_text: "Scripted transport control",
        meta: {},
      } as CassetteFile,
      { invoke: vi.fn() } as never
    );
    expect(captures).toHaveLength(1);
    expect(result.toolCalls[0].error).toBeUndefined();
    expect(result.toolCalls[1].output).toBeUndefined();
    expect(result.toolCalls[1].error).toBeTruthy();
    const read = await fetch(`${server.baseUrl}/entities/query`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${server.token}` },
      body: JSON.stringify({
        entity_type: "issue",
        filters: { title: "Synthetic retained prior effect" },
      }),
    });
    expect((await read.json()).entities).toHaveLength(1);
  });

  it.each([
    { $result: { call: 0, path: ["response", "missing"] } },
    { $result: { call: 0, path: ["response", "object"] } },
    { $result: { call: 0, path: ["response", "constructor"] } },
    { $result: { call: 0, path: ["response", "id"], unknown: true } },
  ])("refuses invalid prior metadata before its own child", async (reference) => {
    const prior: ToolCall[] = [
      call({}, { output: { exit_code: 0, response: { id: "synthetic", object: {} } } }),
    ];
    const result = await replayCliRequest(
      invocation,
      call({ body: { entity_id: reference } }),
      prior
    );
    expect(result.error).toBeTruthy();
    expect(result.output).toBeUndefined();
    expect(captures).toHaveLength(0);
  });

  it("executes the CI-discovered owner workflow through real factory, CLI and HTTP without fallback", async () => {
    const cassette = JSON.parse(
      readFileSync(
        "packages/eval-harness/cassettes/owner_token_administration__stub__replay-only.cassette.json",
        "utf8"
      )
    ) as CassetteFile;
    const result = await replayCassetteAgainstServer(invocation, cassette, {
      invoke: vi.fn(),
    } as never);
    expect(captures).toHaveLength(9);
    expect(result.toolCalls[0].output).toMatchObject({ exit_code: 0 });
    expect(result.toolCalls[2].output).toMatchObject({
      exit_code: 0,
      response: { revoked: true, replayed: false },
    });
    expect(result.toolCalls[3].output).toMatchObject({
      exit_code: 0,
      response: { revoked: true, replayed: true },
    });
    expect(result.toolCalls[4].output).toMatchObject({ exit_code: 1 });
    expect(result.toolCalls[5].output).toMatchObject({ exit_code: 1 });
    expect(result.toolCalls[6].output).toMatchObject({
      exit_code: 0,
      response: { replayed: true },
    });
    expect(captures[6].args).toContain("--skip-auth");
    expect(result.toolCalls[7].output).toMatchObject({ exit_code: 0, response: { total: 2 } });
    expect(result.toolCalls[8].output).toMatchObject({ exit_code: 0 });
  });
});

describe("scalar prior-success bindings", () => {
  const prior: ToolCall[] = [
    {
      name: "queryObservations",
      transport: "cli",
      input: {},
      sequence: 0,
      output: { exit_code: 0, response: { id: "synthetic-id", number: 1, nil: null, nested: {} } },
    },
  ];
  const reference = (path: unknown, extra = {}) => ({ $result: { call: 0, path, ...extra } });
  it("binds only scalar metadata from actual earlier successful results", () => {
    expect(
      resolveCliResultReferences(
        {
          id: reference(["response", "id"]),
          values: [reference(["response", "number"]), reference(["response", "nil"])],
        },
        prior
      )
    ).toEqual({ id: "synthetic-id", values: [1, null] });
  });
  it.each([
    reference(["response", "missing"]),
    reference(["response", "nested"]),
    reference(["response", "constructor"]),
    reference(["response", "__proto__"]),
    reference([]),
    reference("response.id"),
    reference(["response", "id"], { extra: 1 }),
    { $result: { call: -1, path: ["response"] } },
    { $result: { call: 1, path: ["response"] } },
    { $result: { call: 0.5, path: ["response"] } },
    { $result: { call: 0, path: ["response", "id"] }, extra: 1 },
    JSON.parse('{"constructor": "unsafe"}'),
  ])("rejects malformed, missing, object and prototype references", (input) => {
    expect(() => resolveCliResultReferences(input, prior)).toThrow();
  });
  it("rejects failed, non-CLI and inherited prior result fields", () => {
    for (const source of [
      { ...prior[0], error: "refused" },
      { ...prior[0], transport: undefined },
      { ...prior[0], output: { exit_code: 1, response: {} } },
      { ...prior[0], output: { exit_code: 0, response: Object.create({ id: "inherited" }) } },
    ]) {
      expect(() => resolveCliResultReferences(reference(["response", "id"]), [source])).toThrow();
    }
  });
});

/**
 * Tool-capture policy for the agent-hook packages.
 *
 * Hooks persist one `tool_invocation` record per tool call. These tests pin
 * what that record may carry: file reads store metadata only (never output
 * text), secret-bearing paths store no output text under any tool, and other
 * tools keep a bounded summary with credential-shaped text redacted. The
 * policy is duplicated across packages that ship independently, so every
 * package is driven by the same vectors
 * (`tests/fixtures/hook_output_capture/vectors.json`).
 */

import { spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  describeToolCapture,
  isSecretBearingPath,
  redactSecretText,
  scrubErrorMessage,
  toolInputMentionsSecretPath,
} from "../../packages/cursor-hooks/hooks/_common.js";
import {
  NeotomaPlugin,
  neotomaPlugin,
  type NeotomaOpenCodeOptions,
} from "../../packages/opencode-plugin/src/index.js";
import { createNeotomaAgentHooks } from "../../packages/claude-agent-sdk-adapter/src/index.js";
import type { StoreInput, StoreResult } from "../../packages/client/src/types.js";
import {
  expectCapture,
  expectRedaction,
  loadCaptureVectors,
  type CapturedFields,
} from "../helpers/hook_output_capture.js";

const vectors = loadCaptureVectors();
const REPO_ROOT = resolve(__dirname, "..", "..");
const PYTHON = process.env.NEOTOMA_EVAL_PYTHON ?? "python3";

let stateDir: string;
beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "neotoma-hook-capture-"));
  process.env.NEOTOMA_HOOK_STATE_DIR = stateDir;
});
afterEach(() => {
  delete process.env.NEOTOMA_HOOK_STATE_DIR;
  rmSync(stateDir, { recursive: true, force: true });
});

describe("cursor-hooks capture policy", () => {
  it.each(vectors.secret_paths.secret)("treats %s as a secret-bearing path", (path) => {
    expect(isSecretBearingPath(path)).toBe(true);
  });

  it.each(vectors.secret_paths.not_secret)("does not treat %j as a secret-bearing path", (path) => {
    expect(isSecretBearingPath(path)).toBe(false);
  });

  it.each(vectors.redaction.map((v) => [v.name, v] as const))("redacts: %s", (_name, vector) => {
    expectRedaction(vector, redactSecretText(vector.input));
  });

  it.each(vectors.captures.map((v) => [v.name, v] as const))("captures: %s", (_name, vector) => {
    const fields = describeToolCapture({
      toolName: vector.tool_name,
      toolInput: vector.tool_input,
      toolOutput: vector.tool_output,
    }) as unknown as CapturedFields;
    expectCapture(vector, fields);
  });

  it("scrubErrorMessage also redacts credential-shaped text", () => {
    const out = scrubErrorMessage("boom API_KEY=fixture-placeholder-9 at /tmp/x");
    expect(out).not.toContain("fixture-placeholder-9");
  });

  it("detects secret paths in shell command tokens and path fields only", () => {
    expect(toolInputMentionsSecretPath({ command: "cat ./.env.local | head" })).toBe(true);
    expect(toolInputMentionsSecretPath({ command: "ls src" })).toBe(false);
    expect(toolInputMentionsSecretPath({ path: "/work/app/.env" })).toBe(true);
    // A free-text field that merely mentions a secret file is not a path.
    expect(toolInputMentionsSecretPath({ data_source: "agent note about .env names" })).toBe(false);
  });

  it("keeps the stored byte length and hash stable for the same output", () => {
    const args = {
      toolName: "Read",
      toolInput: { path: "/work/app/README.md" },
      toolOutput: "hello",
    };
    const a = describeToolCapture(args);
    const b = describeToolCapture(args);
    expect(a.output_sha256).toBe(b.output_sha256);
    expect(a.output_bytes).toBe(5);
    expect(a.output_sha256).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });

  it("does not throw on unserializable output", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const fields = describeToolCapture({
      toolName: "custom_tool",
      toolInput: {},
      toolOutput: cyclic,
    });
    expect(fields.output_summary).toBe("<unserializable>");
    expect(fields.output_bytes).toBe(0);
  });
});

/** Runs one request against a Python hook package's `_common.py`. */
function runPython(
  hooksDir: string,
  request: { op: string; [key: string]: unknown }
): Record<string, unknown> {
  const program = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("hook_common", sys.argv[1] + "/_common.py")
mod = importlib.util.module_from_spec(spec)
sys.path.insert(0, sys.argv[1])
spec.loader.exec_module(mod)
req = json.load(sys.stdin)
op = req["op"]
if op == "path":
    out = {"result": mod.is_secret_bearing_path(req["path"])}
elif op == "paths":
    out = {"result": [mod.is_secret_bearing_path(p) for p in req["paths"]]}
elif op == "redact":
    out = {"result": mod.redact_secret_text(req["text"])}
elif op == "scrub":
    out = {"result": mod.scrub_error_message(req["text"])}
elif op == "mentions":
    out = {"result": mod.tool_input_mentions_secret_path(req["tool_input"])}
else:
    out = {"result": mod.describe_tool_capture(req["tool_name"], req["tool_input"], req["tool_output"])}
sys.stdout.write(json.dumps(out))
`;
  const run = spawnSync(PYTHON, ["-c", program, hooksDir], {
    input: JSON.stringify(request),
    encoding: "utf8",
    env: { ...process.env, NEOTOMA_LOG_LEVEL: "silent" },
  });
  if (run.status !== 0) {
    throw new Error(`python helper failed: ${run.stderr}`);
  }
  return JSON.parse(run.stdout) as Record<string, unknown>;
}

describe("claude-code-plugin capture policy (python)", () => {
  const hooksDir = join(REPO_ROOT, "packages", "claude-code-plugin", "hooks");

  it("agrees with the shared secret-path vectors", () => {
    const secret = runPython(hooksDir, { op: "paths", paths: vectors.secret_paths.secret });
    expect(secret.result).toEqual(vectors.secret_paths.secret.map(() => true));
    const plain = runPython(hooksDir, { op: "paths", paths: vectors.secret_paths.not_secret });
    expect(plain.result).toEqual(vectors.secret_paths.not_secret.map(() => false));
  });

  it.each(vectors.redaction.map((v) => [v.name, v] as const))("redacts: %s", (_name, vector) => {
    const out = runPython(hooksDir, { op: "redact", text: vector.input }).result as string;
    expectRedaction(vector, out);
  });

  it.each(vectors.captures.map((v) => [v.name, v] as const))("captures: %s", (_name, vector) => {
    const fields = runPython(hooksDir, {
      op: "capture",
      tool_name: vector.tool_name,
      tool_input: vector.tool_input,
      tool_output: vector.tool_output,
    }).result as CapturedFields;
    expectCapture(vector, fields);
  });

  it("matches the cursor-hooks implementation field for field", () => {
    for (const vector of vectors.captures) {
      const py = runPython(hooksDir, {
        op: "capture",
        tool_name: vector.tool_name,
        tool_input: vector.tool_input,
        tool_output: vector.tool_output,
      }).result as CapturedFields;
      const ts = describeToolCapture({
        toolName: vector.tool_name,
        toolInput: vector.tool_input,
        toolOutput: vector.tool_output,
      }) as unknown as CapturedFields;
      expect(py, vector.name).toEqual(ts);
    }
  });

  it("scrub_error_message redacts credential-shaped text", () => {
    const out = runPython(hooksDir, {
      op: "scrub",
      text: "boom API_KEY=fixture-placeholder-9 at /tmp/x",
    }).result as string;
    expect(out).not.toContain("fixture-placeholder-9");
  });

  it("detects secret paths in tool input", () => {
    expect(runPython(hooksDir, { op: "mentions", tool_input: { path: "/w/.env" } }).result).toBe(
      true
    );
    expect(runPython(hooksDir, { op: "mentions", tool_input: { command: "ls src" } }).result).toBe(
      false
    );
  });
});

describe("codex-hooks capture policy (python)", () => {
  // Codex hooks capture no tool output; they persist scrubbed error messages.
  const hooksDir = join(REPO_ROOT, "packages", "codex-hooks", "hooks");

  it.each(vectors.redaction.map((v) => [v.name, v] as const))("redacts: %s", (_name, vector) => {
    const out = runPython(hooksDir, { op: "redact", text: vector.input }).result as string;
    expectRedaction(vector, out);
  });

  it("scrub_error_message redacts credential-shaped text", () => {
    const out = runPython(hooksDir, {
      op: "scrub",
      text: "boom API_KEY=fixture-placeholder-9 at /tmp/x",
    }).result as string;
    expect(out).not.toContain("fixture-placeholder-9");
  });
});

function makeOpenCodeClient() {
  const stores: StoreInput[] = [];
  const client: NonNullable<NeotomaOpenCodeOptions["client"]> = {
    async store(input: StoreInput): Promise<StoreResult> {
      stores.push(input);
      return { entities: [] } as unknown as StoreResult;
    },
    async retrieveEntityByIdentifier(): Promise<unknown> {
      return null;
    },
    async listTimelineEvents(): Promise<unknown> {
      return null;
    },
    async createRelationship(): Promise<unknown> {
      return { ok: true };
    },
  };
  return { client, stores };
}

describe("opencode-plugin capture policy", () => {
  it.each(vectors.captures.map((v) => [v.name, v] as const))("captures: %s", async (_n, vector) => {
    const { client, stores } = makeOpenCodeClient();
    const hooks = neotomaPlugin({ client, cwd: "/repo", injectContext: false });
    await hooks["tool.called"]({
      session: { id: "sess_capture" },
      turnId: "turn_1",
      tool: { name: vector.tool_name, input: vector.tool_input, output: vector.tool_output },
    });
    const entity = stores
      .flatMap((s) => s.entities ?? [])
      .find((e) => e.entity_type === "tool_invocation");
    expect(entity, vector.name).toBeDefined();
    expectCapture(vector, entity as unknown as CapturedFields);
  });

  it("withholds the error text of a failed Neotoma tool call that names a secret path", async () => {
    const { client, stores } = makeOpenCodeClient();
    const hooks = neotomaPlugin({ client, cwd: "/repo", injectContext: false });
    await hooks["tool.called"]({
      session: { id: "sess_failure" },
      turnId: "turn_2",
      tool: {
        name: "mcp_neotoma_store",
        input: { file_path: "/work/billing/.env" },
        error:
          "ERR_REJECTED while reading /work/billing/.env: PAYMENTS_API_KEY=fixture-placeholder-2",
      },
    });
    const failure = stores
      .flatMap((s) => s.entities ?? [])
      .find((e) => e.entity_type === "tool_invocation_failure");
    expect(failure).toBeDefined();
    expect(String(failure?.error_message_redacted)).not.toContain("fixture-placeholder");
  });

  it("exposes the named plugin entry unchanged", async () => {
    const hooks = await NeotomaPlugin({ directory: "/workspace" });
    expect(typeof hooks.event).toBe("function");
  });
});

describe("claude-agent-sdk-adapter capture policy", () => {
  let server: Server;
  let baseUrl: string;
  const bodies: Array<Record<string, unknown>> = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        try {
          bodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
        } catch {
          // ignore non-JSON requests
        }
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ entities: [] }));
      });
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((done) => server.close(() => done()));
  });

  function storedEntities(): Array<Record<string, unknown>> {
    return bodies.flatMap((b) => (Array.isArray(b.entities) ? (b.entities as never[]) : []));
  }

  it.each(vectors.captures.map((v) => [v.name, v] as const))("captures: %s", async (_n, vector) => {
    bodies.length = 0;
    const hooks = createNeotomaAgentHooks({
      baseUrl,
      token: "fixture-token",
      sessionId: "sdk_capture",
      logLevel: "silent",
    });
    await hooks.PostToolUse({
      turn_id: "turn_1",
      tool_name: vector.tool_name,
      tool_input: vector.tool_input,
      tool_response: vector.tool_output,
    });
    const entity = storedEntities().find((e) => e.entity_type === "tool_invocation");
    expect(entity, vector.name).toBeDefined();
    expectCapture(vector, entity as CapturedFields);
  });

  it("withholds the error text of a failed Neotoma tool call that names a secret path", async () => {
    bodies.length = 0;
    const hooks = createNeotomaAgentHooks({
      baseUrl,
      token: "fixture-token",
      sessionId: "sdk_failure",
      logLevel: "silent",
    });
    await hooks.PostToolUse({
      turn_id: "turn_2",
      tool_name: "mcp_neotoma_store",
      tool_input: { file_path: "/work/billing/.env" },
      tool_response: {
        error:
          "ERR_REJECTED while reading /work/billing/.env: PAYMENTS_API_KEY=fixture-placeholder-2",
      },
    });
    const failure = storedEntities().find((e) => e.entity_type === "tool_invocation_failure");
    expect(failure).toBeDefined();
    expect(String(failure?.error_message_redacted)).not.toContain("fixture-placeholder");
  });
});

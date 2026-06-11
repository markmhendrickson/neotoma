/**
 * CLI `issues import` end-to-end tests (in-process, mock-fetch).
 *
 * Covers the --from-jsonl handler in src/cli/issues.ts:
 *   - dry-run JSON output shape
 *   - missing-file error path
 *   - --limit flag
 *   - --since / --until timestamp filtering
 *   - happy-path filing with a stubbed API client (dedup label stamped)
 *   - fold-into-existing path (dedup label match)
 *   - same-batch dedup: second identical anomaly folds into the just-filed issue
 *   - reporter-env preflight: fail fast when env is empty and flags are absent
 *   - reporter-env preflight: pass when --reporter-git-sha flag is provided
 *
 * Network is mocked — no real server is contacted.
 * github_client.listIssues is mocked at module level via a mutable delegate so
 * each test can supply the desired pre-existing issues list.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── module-level mocks ─────────────────────────────────────────────────────
// Mutable delegates let individual tests control behavior without re-importing.

type ExistingIssue = {
  number: number;
  title: string;
  state: string;
  labels: Array<{ name: string }>;
};

let listIssuesDelegate: () => Promise<ExistingIssue[]> = async () => [];
/**
 * When true, the node:module mock returns an empty package version to simulate
 * a dev-build binary where getCliVersion() returns "".
 */
let forceEmptyCliVersion = false;

vi.mock("../../src/services/issues/github_client.js", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    listIssues: async () => listIssuesDelegate(),
    mergeNeotomaToolingIssueLabels: (labels: string[]) => labels,
  };
});

vi.mock("node:module", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:module")>();
  return {
    ...original,
    createRequire: (url: string) => {
      if (forceEmptyCliVersion) {
        return () => ({ version: "" });
      }
      return original.createRequire(url);
    },
  };
});

// ── helpers ────────────────────────────────────────────────────────────────

type CliModule = { runCli: (argv: string[]) => Promise<void> };

async function loadCli(): Promise<CliModule> {
  vi.resetModules();
  return (await import("../../src/cli/index.ts")) as CliModule;
}

async function withTempHome<T>(callback: (homeDir: string) => Promise<T>): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-issues-import-"));
  const prevHome = process.env.HOME;
  const prevProfile = process.env.USERPROFILE;
  process.env.HOME = tempDir;
  process.env.USERPROFILE = tempDir;
  const configDir = path.join(tempDir, ".config", "neotoma");
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    path.join(configDir, "config.json"),
    JSON.stringify({
      base_url: "http://localhost:9999",
      access_token: "token-test",
      expires_at: "2099-01-01T00:00:00Z",
    }),
  );
  try {
    return await callback(tempDir);
  } finally {
    process.env.HOME = prevHome;
    process.env.USERPROFILE = prevProfile;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function captureStdout(): { output: string[]; restore: () => void } {
  const output: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    output.push(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString());
    return true;
  });
  return { output, restore: () => spy.mockRestore() };
}

function captureStderr(): { output: string[]; restore: () => void } {
  const output: string[] = [];
  const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    output.push(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString());
    return true;
  });
  return { output, restore: () => spy.mockRestore() };
}

/** Build a minimal observer JSONL anomaly line (hard_error class). */
function hardErrorLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    timestamp: "2026-01-15T10:00:00Z",
    command: "store entities",
    exit_code: 1,
    stderr: "ERR_TRANSPORT_FAILED: connection refused",
    duration_ms: 120,
    reporter_channel: "test-channel",
    reporter_git_sha: "abc1234",
    reporter_app_version: "1.2.3",
    ...overrides,
  });
}

/** A JSONL line that is clean (should NOT be filed). */
function cleanLine(): string {
  return JSON.stringify({
    timestamp: "2026-01-15T10:01:00Z",
    command: "store entities",
    exit_code: 0,
    stderr: "",
    duration_ms: 50,
    reporter_channel: "test-channel",
  });
}

interface MockNetworkSetup {
  submitCalls: Array<{ url: string; body: Record<string, unknown> }>;
  messageCalls: Array<{ url: string; body: Record<string, unknown> }>;
}

function stubNeotomaFetch(setup: MockNetworkSetup): () => void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = request?.url ?? String(input);
    const rawBody = init?.body ?? (request ? await request.clone().text() : undefined);
    const body = rawBody ? (JSON.parse(String(rawBody)) as Record<string, unknown>) : {};

    if (url.includes("/issues/submit")) {
      setup.submitCalls.push({ url, body });
      return new Response(
        JSON.stringify({
          entity_id: "ent_test_filed",
          issue_number: 999,
          pushed_to_github: false,
          github_url: "",
          github_mirror_guidance: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (url.includes("/issues/add_message")) {
      setup.messageCalls.push({ url, body });
      return new Response(
        JSON.stringify({
          message_entity_id: "ent_msg_1",
          submitted_to_neotoma: true,
          pushed_to_github: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  vi.stubGlobal("fetch", fetchMock);
  return () => vi.unstubAllGlobals();
}

// ── tests ──────────────────────────────────────────────────────────────────

describe("CLI issues import", () => {
  beforeEach(() => {
    // Reset delegates to defaults before each test.
    listIssuesDelegate = async () => [];
    forceEmptyCliVersion = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.exitCode = undefined;
  });

  it("dry-run emits a structured JSON sweep report without filing issues", async () => {
    await withTempHome(async (home) => {
      const jsonlFile = path.join(home, "observer.jsonl");
      await fs.writeFile(jsonlFile, [hardErrorLine(), cleanLine(), hardErrorLine()].join("\n") + "\n");

      const network: MockNetworkSetup = { submitCalls: [], messageCalls: [] };
      const restore = stubNeotomaFetch(network);
      const { runCli } = await loadCli();
      const stdout = captureStdout();

      try {
        await runCli([
          "node",
          "cli",
          "issues",
          "import",
          "--from-jsonl",
          jsonlFile,
          "--dry-run",
          "--reporter-git-sha",
          "test-sha",
        ]);
      } finally {
        stdout.restore();
        restore();
      }

      const out = JSON.parse(stdout.output.join("")) as {
        lines_scanned: number;
        anomalies_extracted: number;
        issues_filed: number;
        outcomes: Array<{ outcome: { status: string } }>;
      };

      expect(out.lines_scanned).toBe(3);
      expect(out.anomalies_extracted).toBe(2);
      expect(out.issues_filed).toBe(0);
      expect(out.outcomes).toHaveLength(2);
      expect(out.outcomes.every((o) => o.outcome.status === "dry_run")).toBe(true);
      // No network calls in dry-run mode.
      expect(network.submitCalls).toHaveLength(0);
    });
  });

  it("returns exit code 1 and stderr when the JSONL file is missing", async () => {
    await withTempHome(async (home) => {
      const missing = path.join(home, "does_not_exist.jsonl");
      const { runCli } = await loadCli();
      const stderr = captureStderr();
      const stdout = captureStdout();

      try {
        await runCli([
          "node",
          "cli",
          "issues",
          "import",
          "--from-jsonl",
          missing,
          "--reporter-git-sha",
          "test-sha",
        ]);
      } finally {
        stderr.restore();
        stdout.restore();
      }

      expect(process.exitCode).toBe(1);
      expect(stderr.output.join("")).toMatch(/cannot read file|ENOENT/i);
    });
  });

  it("--limit stops after extracting the requested number of anomalies", async () => {
    await withTempHome(async (home) => {
      const jsonlFile = path.join(home, "observer.jsonl");
      await fs.writeFile(
        jsonlFile,
        [hardErrorLine(), hardErrorLine(), hardErrorLine(), hardErrorLine()].join("\n") + "\n",
      );

      const network: MockNetworkSetup = { submitCalls: [], messageCalls: [] };
      const restore = stubNeotomaFetch(network);
      const { runCli } = await loadCli();
      const stdout = captureStdout();

      try {
        await runCli([
          "node",
          "cli",
          "issues",
          "import",
          "--from-jsonl",
          jsonlFile,
          "--dry-run",
          "--limit",
          "2",
          "--reporter-git-sha",
          "test-sha",
        ]);
      } finally {
        stdout.restore();
        restore();
      }

      const out = JSON.parse(stdout.output.join("")) as { anomalies_extracted: number };
      expect(out.anomalies_extracted).toBe(2);
    });
  });

  it("--since and --until filter lines by timestamp", async () => {
    await withTempHome(async (home) => {
      const jsonlFile = path.join(home, "observer.jsonl");
      await fs.writeFile(
        jsonlFile,
        [
          hardErrorLine({ timestamp: "2026-01-10T00:00:00Z" }), // before --since
          hardErrorLine({ timestamp: "2026-01-15T12:00:00Z" }), // in range
          hardErrorLine({ timestamp: "2026-01-20T00:00:00Z" }), // after --until
        ].join("\n") + "\n",
      );

      const network: MockNetworkSetup = { submitCalls: [], messageCalls: [] };
      const restore = stubNeotomaFetch(network);
      const { runCli } = await loadCli();
      const stdout = captureStdout();

      try {
        await runCli([
          "node",
          "cli",
          "issues",
          "import",
          "--from-jsonl",
          jsonlFile,
          "--since",
          "2026-01-12T00:00:00Z",
          "--until",
          "2026-01-17T00:00:00Z",
          "--dry-run",
          "--reporter-git-sha",
          "test-sha",
        ]);
      } finally {
        stdout.restore();
        restore();
      }

      const out = JSON.parse(stdout.output.join("")) as {
        lines_scanned: number;
        lines_skipped_by_filter: number;
        anomalies_extracted: number;
      };
      expect(out.lines_scanned).toBe(3);
      expect(out.lines_skipped_by_filter).toBe(2);
      expect(out.anomalies_extracted).toBe(1);
    });
  });

  it("happy-path proactive filing posts to /issues/submit with dedup label", async () => {
    await withTempHome(async (home) => {
      const jsonlFile = path.join(home, "observer.jsonl");
      await fs.writeFile(jsonlFile, hardErrorLine() + "\n");

      const network: MockNetworkSetup = { submitCalls: [], messageCalls: [] };
      const restore = stubNeotomaFetch(network);
      const { runCli } = await loadCli();
      const stdout = captureStdout();
      const stderr = captureStderr();

      try {
        await runCli([
          "node",
          "cli",
          "issues",
          "import",
          "--from-jsonl",
          jsonlFile,
          "--mode",
          "proactive",
          "--reporter-git-sha",
          "test-sha-001",
          "--json",
        ]);
      } finally {
        stdout.restore();
        stderr.restore();
        restore();
      }

      expect(network.submitCalls).toHaveLength(1);
      const submitBody = network.submitCalls[0].body;
      expect(submitBody.title).toMatch(/\[observer\]/);
      // Labels must include both observer-import and the dedup label.
      const labels = submitBody.labels as string[];
      expect(labels).toContain("observer-import");
      const dedupLabel = labels.find((l) => l.startsWith("observer-dedup:"));
      expect(dedupLabel).toBeTruthy();

      const out = JSON.parse(stdout.output.join("")) as { issues_filed: number };
      expect(out.issues_filed).toBe(1);
    });
  });

  it("fold-into-existing appends a message when the dedup label matches an existing issue", async () => {
    await withTempHome(async (home) => {
      const jsonlFile = path.join(home, "observer.jsonl");
      await fs.writeFile(jsonlFile, hardErrorLine() + "\n");

      // Pre-compute the dedup label for the anomaly we'll submit so we can seed
      // the listIssues delegate with an already-filed issue carrying that label.
      const { observerDedupLabel } = await import("../../src/cli/issues.ts");
      const { anomalyDedupKey, extractAnomalies } = await import(
        "../../src/services/issues/observer_import.ts"
      );
      const { anomalies } = extractAnomalies(hardErrorLine());
      const dedupLabel = observerDedupLabel(anomalyDedupKey(anomalies[0]));

      // Seed the module-level delegate with the pre-existing issue.
      listIssuesDelegate = async () => [
        {
          number: 42,
          title: "[observer] ERR_TRANSPORT_FAILED on `store entities` (2026-01-15)",
          state: "open",
          labels: [{ name: "observer-import" }, { name: dedupLabel }],
        },
      ];

      const network: MockNetworkSetup = { submitCalls: [], messageCalls: [] };
      const restore = stubNeotomaFetch(network);
      const { runCli } = await loadCli();
      const stdout = captureStdout();
      const stderr = captureStderr();

      try {
        await runCli([
          "node",
          "cli",
          "issues",
          "import",
          "--from-jsonl",
          jsonlFile,
          "--mode",
          "proactive",
          "--reporter-git-sha",
          "test-sha-fold",
          "--json",
        ]);
      } finally {
        stdout.restore();
        stderr.restore();
        restore();
      }

      expect(network.submitCalls).toHaveLength(0);
      expect(network.messageCalls).toHaveLength(1);
      const msgBody = network.messageCalls[0].body;
      expect(msgBody.issue_number).toBe(42);
      expect(String(msgBody.body)).toMatch(/dedup key/);

      const out = JSON.parse(stdout.output.join("")) as { issues_folded: number };
      expect(out.issues_folded).toBe(1);
    });
  });

  it("same-batch dedup: second identical anomaly folds into the just-filed issue", async () => {
    await withTempHome(async (home) => {
      const jsonlFile = path.join(home, "observer.jsonl");
      // Two identical hard_error lines — same dedup key, no pre-existing issues.
      await fs.writeFile(
        jsonlFile,
        [hardErrorLine(), hardErrorLine()].join("\n") + "\n",
      );

      const network: MockNetworkSetup = { submitCalls: [], messageCalls: [] };
      const restore = stubNeotomaFetch(network);
      const { runCli } = await loadCli();
      const stdout = captureStdout();
      const stderr = captureStderr();

      try {
        await runCli([
          "node",
          "cli",
          "issues",
          "import",
          "--from-jsonl",
          jsonlFile,
          "--mode",
          "proactive",
          "--reporter-git-sha",
          "test-sha-same-batch",
          "--json",
        ]);
      } finally {
        stdout.restore();
        stderr.restore();
        restore();
      }

      // First anomaly is filed; second is folded into the in-memory record.
      expect(network.submitCalls).toHaveLength(1);
      expect(network.messageCalls).toHaveLength(1);

      const out = JSON.parse(stdout.output.join("")) as {
        issues_filed: number;
        issues_folded: number;
      };
      expect(out.issues_filed).toBe(1);
      expect(out.issues_folded).toBe(1);
    });
  });

  it("reporter-env preflight fails fast when version is empty, no per-line fields, and no flags", async () => {
    await withTempHome(async (home) => {
      // Simulate a dev build where getCliVersion() returns "".
      forceEmptyCliVersion = true;

      // Line with no reporter fields at all.
      const lineNoReporter = JSON.stringify({
        timestamp: "2026-01-15T10:00:00Z",
        command: "store entities",
        exit_code: 1,
        stderr: "ERR_TRANSPORT_FAILED: connection refused",
        duration_ms: 120,
      });
      const jsonlFile = path.join(home, "observer.jsonl");
      await fs.writeFile(jsonlFile, lineNoReporter + "\n");

      const network: MockNetworkSetup = { submitCalls: [], messageCalls: [] };
      const restore = stubNeotomaFetch(network);
      const { runCli } = await loadCli();
      const stderr = captureStderr();
      const stdout = captureStdout();

      try {
        // No --reporter-git-sha or --reporter-app-version flags.
        await runCli([
          "node",
          "cli",
          "issues",
          "import",
          "--from-jsonl",
          jsonlFile,
          "--mode",
          "proactive",
        ]);
      } finally {
        stderr.restore();
        stdout.restore();
        restore();
        forceEmptyCliVersion = false;
      }

      // Should fail fast with exit code 1 and an actionable error message.
      expect(process.exitCode).toBe(1);
      const errOut = stderr.output.join("");
      expect(errOut).toMatch(/reporter environment is required/i);
      expect(errOut).toMatch(/--reporter-git-sha/);
      // No network calls should have been made.
      expect(network.submitCalls).toHaveLength(0);
    });
  });

  it("reporter-env preflight passes when --reporter-git-sha is provided", async () => {
    await withTempHome(async (home) => {
      const lineNoReporter = JSON.stringify({
        timestamp: "2026-01-15T10:00:00Z",
        command: "store entities",
        exit_code: 1,
        stderr: "ERR_TRANSPORT_FAILED: connection refused",
        duration_ms: 120,
      });
      const jsonlFile = path.join(home, "observer.jsonl");
      await fs.writeFile(jsonlFile, lineNoReporter + "\n");

      const network: MockNetworkSetup = { submitCalls: [], messageCalls: [] };
      const restore = stubNeotomaFetch(network);
      const { runCli } = await loadCli();
      const stdout = captureStdout();
      const stderr = captureStderr();

      try {
        await runCli([
          "node",
          "cli",
          "issues",
          "import",
          "--from-jsonl",
          jsonlFile,
          "--mode",
          "proactive",
          "--reporter-git-sha",
          "explicit-sha-override",
          "--json",
        ]);
      } finally {
        stdout.restore();
        stderr.restore();
        restore();
      }

      // Should NOT fail fast — a submit attempt must occur.
      const exitCode = process.exitCode ?? 0;
      expect(exitCode).not.toBe(1);
      expect(network.submitCalls.length).toBeGreaterThanOrEqual(1);
      // The flag value was threaded into the submit body.
      expect(network.submitCalls[0].body.reporter_git_sha).toBe("explicit-sha-override");
    });
  });
});

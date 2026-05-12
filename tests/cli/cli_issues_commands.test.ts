import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

type CliModule = { runCli: (argv: string[]) => Promise<void> };

async function loadCli(): Promise<CliModule> {
  vi.resetModules();
  return (await import("../../src/cli/index.ts")) as CliModule;
}

async function withTempHome<T>(callback: () => Promise<T>): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cli-issues-"));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = tempDir;
  process.env.USERPROFILE = tempDir;
  try {
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
    return await callback();
  } finally {
    process.env.HOME = previousHome;
    process.env.USERPROFILE = previousUserProfile;
  }
}

function captureStderr(): { output: string[]; restore: () => void } {
  const output: string[] = [];
  const spy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: unknown) => {
      output.push(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString());
      return true;
    });
  return { output, restore: () => spy.mockRestore() };
}

function captureStdout(): { output: string[]; restore: () => void } {
  const output: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      output.push(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString());
      return true;
    });
  return { output, restore: () => spy.mockRestore() };
}

function capturedBodyForPath(
  capturedBodies: Record<string, unknown>,
  pathFragment: string,
): unknown {
  return Object.entries(capturedBodies).find(([url]) => url.includes(pathFragment))?.[1];
}

describe("CLI issues commands", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.exitCode = undefined;
  });

  it("maps hidden issues create --advisory to private and emits a deprecation warning", async () => {
    await withTempHome(async () => {
      const capturedBodies: Record<string, unknown> = {};
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null;
        const url = request?.url ?? String(input);
        const body = init?.body ?? (request ? await request.clone().text() : undefined);
        if (body) {
          capturedBodies[url] = JSON.parse(String(body)) as Record<string, unknown>;
        }
        return new Response(
          JSON.stringify({
            issue_number: 0,
            github_url: "",
            entity_id: "ent_cli_advisory",
            pushed_to_github: false,
            github_mirror_guidance: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();
      const stderr = captureStderr();
      try {
        await runCli([
          "node",
          "cli",
          "issues",
          "create",
          "--title",
          "Legacy advisory",
          "--body",
          "Body",
          "--reporter-git-sha",
          "cli-test-sha",
          "--advisory",
        ]);
      } finally {
        stderr.restore();
      }

      expect(capturedBodyForPath(capturedBodies, "/issues/submit")).toMatchObject({
        visibility: "private",
        reporter_git_sha: "cli-test-sha",
      });
      expect(stderr.output.join("")).toContain(
        "visibility 'advisory' is deprecated; use 'private' instead.",
      );
    });
  });

  it("passes issues status --issue-number to the status endpoint", async () => {
    await withTempHome(async () => {
      const capturedBodies: Record<string, unknown> = {};
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null;
        const url = request?.url ?? String(input);
        const body = init?.body ?? (request ? await request.clone().text() : undefined);
        if (body) {
          capturedBodies[url] = JSON.parse(String(body)) as Record<string, unknown>;
        }
        return new Response(
          JSON.stringify({
            title: "Issue by number",
            status: "open",
            issue_number: 42,
            messages: [],
            synced: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli(["node", "cli", "issues", "status", "--issue-number", "42", "--json"]);
      } finally {
        stdout.restore();
      }

      expect(capturedBodyForPath(capturedBodies, "/issues/status")).toMatchObject({
        issue_number: 42,
        skip_sync: false,
      });
    });
  });

  it("passes guest token and entity id through issues status", async () => {
    await withTempHome(async () => {
      const capturedBodies: Record<string, unknown> = {};
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = input instanceof Request ? input : null;
          const url = request?.url ?? String(input);
          const body = init?.body ?? (request ? await request.clone().text() : undefined);
          if (body) {
            capturedBodies[url] = JSON.parse(String(body)) as Record<string, unknown>;
          }
          return new Response(
            JSON.stringify({
              title: "Private issue",
              status: "open",
              issue_number: 0,
              messages: [],
              synced: false,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }),
      );

      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli([
          "node",
          "cli",
          "issues",
          "status",
          "--entity-id",
          "ent_private_1",
          "--guest-access-token",
          "guest-token-1",
          "--skip-sync",
          "--json",
        ]);
      } finally {
        stdout.restore();
      }

      expect(capturedBodyForPath(capturedBodies, "/issues/status")).toMatchObject({
        entity_id: "ent_private_1",
        guest_access_token: "guest-token-1",
        skip_sync: true,
      });
    });
  });

  it("passes issue message identifiers and guest token to the message endpoint", async () => {
    await withTempHome(async () => {
      const capturedBodies: Record<string, unknown> = {};
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = input instanceof Request ? input : null;
          const url = request?.url ?? String(input);
          const body = init?.body ?? (request ? await request.clone().text() : undefined);
          if (body) {
            capturedBodies[url] = JSON.parse(String(body)) as Record<string, unknown>;
          }
          return new Response(
            JSON.stringify({
              message_entity_id: "ent_message_1",
              pushed_to_github: false,
              submitted_to_neotoma: true,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }),
      );

      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli([
          "node",
          "cli",
          "issues",
          "message",
          "--entity-id",
          "ent_private_1",
          "--guest-access-token",
          "guest-token-1",
          "--body",
          "Reporter follow-up",
          "--json",
        ]);
      } finally {
        stdout.restore();
      }

      expect(capturedBodyForPath(capturedBodies, "/issues/add_message")).toMatchObject({
        entity_id: "ent_private_1",
        guest_access_token: "guest-token-1",
        body: "Reporter follow-up",
      });
    });
  });

  it("passes issues sync filters to the sync endpoint", async () => {
    await withTempHome(async () => {
      const capturedBodies: Record<string, unknown> = {};
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = input instanceof Request ? input : null;
          const url = request?.url ?? String(input);
          const body = init?.body ?? (request ? await request.clone().text() : undefined);
          if (body) {
            capturedBodies[url] = JSON.parse(String(body)) as Record<string, unknown>;
          }
          return new Response(
            JSON.stringify({
              issues_synced: 2,
              errors: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }),
      );

      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli([
          "node",
          "cli",
          "issues",
          "sync",
          "--state",
          "all",
          "--labels",
          "neotoma,bug",
          "--since",
          "2026-05-01T00:00:00Z",
          "--json",
        ]);
      } finally {
        stdout.restore();
      }

      expect(capturedBodyForPath(capturedBodies, "/issues/sync")).toMatchObject({
        state: "all",
        labels: ["neotoma", "bug"],
        since: "2026-05-01T00:00:00Z",
      });
    });
  });
});

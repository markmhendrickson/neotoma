import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

type CliModule = {
  runCli: (argv: string[]) => Promise<void>;
  buildOAuthAuthorizeUrl: (params: {
    baseUrl: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
    clientId: string;
    devStub?: boolean;
  }) => string;
};

async function withTempHome<T>(callback: (homeDir: string) => Promise<T>): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cli-"));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = tempDir;
  process.env.USERPROFILE = tempDir;
  try {
    return await callback(tempDir);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }
  }
}

async function loadCli(): Promise<CliModule> {
  vi.resetModules();
  return (await import("../../src/cli/index.ts")) as CliModule;
}

function captureStdout(): { output: string[]; restore: () => void } {
  const output: string[] = [];
  const writeSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      output.push(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString());
      return true;
    });
  return { output, restore: () => writeSpy.mockRestore() };
}

describe("cli smoke tests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("includes dev_stub in OAuth URL when requested", async () => {
    const { buildOAuthAuthorizeUrl } = await loadCli();
    const url = buildOAuthAuthorizeUrl({
      baseUrl: "http://localhost:8080",
      redirectUri: "http://127.0.0.1:12345/callback",
      state: "state-token",
      codeChallenge: "challenge",
      clientId: "neotoma-cli",
      devStub: true,
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("dev_stub")).toBe("1");
  });

  it("prints auth status when not authenticated", async () => {
    await withTempHome(async () => {
      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli(["node", "cli", "auth", "status", "--json"]);
      } finally {
        stdout.restore();
      }
      const parsed = JSON.parse(stdout.output.join(""));
      expect(parsed).toEqual({ message: "Not authenticated." });
    });
  });

  it("lists entities using the API client", async () => {
    await withTempHome(async (homeDir) => {
      const configDir = path.join(homeDir, ".config", "neotoma");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify(
          {
            base_url: "http://localhost:9999",
            access_token: "token-test",
            expires_at: "2099-01-01T00:00:00Z",
          },
          null,
          2
        )
      );

      const fetchMock = vi.fn(async (input: RequestInfo) => {
        if (String(input).includes("/api/entities/query")) {
          return new Response(
            JSON.stringify({ entities: [{ id: "ent_test", entity_type: "company" }] }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli(["node", "cli", "entities", "list", "--type", "company", "--json"]);
      } finally {
        stdout.restore();
      }

      expect(fetchMock).toHaveBeenCalled();
      const parsed = JSON.parse(stdout.output.join(""));
      expect(parsed).toEqual({
        entities: [{ id: "ent_test", entity_type: "company" }],
      });
    });
  });
});

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

function canonicalizeTmpPath(p: string): string {
  return p.replace(/^\/private(?=\/var\/)/, "");
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
      // auth_mode can be "none", "dev-token", or "key-derived" (when encryption enabled)
      expect(parsed).toHaveProperty("auth_mode");
      expect(["none", "dev-token", "key-derived"]).toContain(parsed.auth_mode);
      expect(parsed).toHaveProperty("base_url");
      // connection_id is optional - only present when config exists
    });
  });

  it("reset removes neotoma-prefixed MCP entries from JSON and Codex TOML", async () => {
    await withTempHome(async (homeDir) => {
      const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cli-reset-"));
      await fs.writeFile(
        path.join(repoRoot, "package.json"),
        JSON.stringify({ name: "neotoma", version: "0.0.0-test" }, null, 2)
      );

      const projectCursorMcpPath = path.join(repoRoot, ".cursor", "mcp.json");
      await fs.mkdir(path.dirname(projectCursorMcpPath), { recursive: true });
      await fs.writeFile(
        projectCursorMcpPath,
        JSON.stringify(
          {
            mcpServers: {
              parquet: { command: "/tmp/parquet.sh" },
              "neotoma-dev": { command: "/tmp/neotoma-dev.sh" },
              "neotoma-prod": { command: "/tmp/neotoma-prod.sh" },
              neotoma: { command: "/tmp/neotoma.sh" },
            },
          },
          null,
          2
        )
      );

      const codexConfigPath = path.join(homeDir, ".codex", "config.toml");
      await fs.mkdir(path.dirname(codexConfigPath), { recursive: true });
      await fs.writeFile(
        codexConfigPath,
        [
          "[mcp_servers.other]",
          'command = "/tmp/other.sh"',
          "",
          "[mcp_servers.neotoma-prod]",
          'command = "/tmp/neotoma-prod.sh"',
          "[mcp_servers.neotoma-prod.env]",
          'NEOTOMA_SESSION_PROD_PORT = "8181"',
          "",
          "[mcp_servers.neotoma]",
          'command = "/tmp/neotoma.sh"',
          "",
        ].join("\n")
      );

      const previousRepoRoot = process.env.NEOTOMA_REPO_ROOT;
      process.env.NEOTOMA_REPO_ROOT = repoRoot;
      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli(["node", "cli", "reset", "--yes", "--json"]);
      } finally {
        stdout.restore();
        if (previousRepoRoot === undefined) {
          delete process.env.NEOTOMA_REPO_ROOT;
        } else {
          process.env.NEOTOMA_REPO_ROOT = previousRepoRoot;
        }
      }

      const parsedReset = JSON.parse(stdout.output.join(""));
      expect(parsedReset.success).toBe(true);
      expect(Array.isArray(parsedReset.mcp_configs_updated)).toBe(true);

      const projectCursorRaw = await fs.readFile(projectCursorMcpPath, "utf-8");
      const projectCursor = JSON.parse(projectCursorRaw) as {
        mcpServers?: Record<string, unknown>;
      };
      expect(projectCursor.mcpServers?.parquet).toBeDefined();
      expect(projectCursor.mcpServers?.["neotoma-dev"]).toBeUndefined();
      expect(projectCursor.mcpServers?.["neotoma-prod"]).toBeUndefined();
      expect(projectCursor.mcpServers?.neotoma).toBeUndefined();

      const codexConfig = await fs.readFile(codexConfigPath, "utf-8");
      expect(codexConfig).toMatch(/\[mcp_servers\.other\]/);
      expect(codexConfig).not.toMatch(/\[mcp_servers\.neotoma/i);
    });
  });

  it("reset backs up repo-local NEOTOMA_DATA_DIR when configured", async () => {
    await withTempHome(async () => {
      const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cli-reset-data-"));
      await fs.writeFile(
        path.join(repoRoot, "package.json"),
        JSON.stringify({ name: "neotoma", version: "0.0.0-test" }, null, 2)
      );

      const configuredDataDir = path.join(repoRoot, "custom-data");
      await fs.mkdir(configuredDataDir, { recursive: true });
      await fs.writeFile(path.join(configuredDataDir, "neotoma.prod.db"), "seed");
      await fs.writeFile(path.join(repoRoot, ".env"), "NEOTOMA_DATA_DIR=./custom-data\n");

      const previousRepoRoot = process.env.NEOTOMA_REPO_ROOT;
      process.env.NEOTOMA_REPO_ROOT = repoRoot;
      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli(["node", "cli", "reset", "--yes", "--json"]);
      } finally {
        stdout.restore();
        if (previousRepoRoot === undefined) {
          delete process.env.NEOTOMA_REPO_ROOT;
        } else {
          process.env.NEOTOMA_REPO_ROOT = previousRepoRoot;
        }
      }

      const parsedReset = JSON.parse(stdout.output.join("")) as {
        success: boolean;
        backups_moved: Array<{ from: string; to: string }>;
      };
      expect(parsedReset.success).toBe(true);
      const expectedDataDir = canonicalizeTmpPath(configuredDataDir);
      expect(
        parsedReset.backups_moved.some(
          (item) => canonicalizeTmpPath(item.from) === expectedDataDir
        )
      ).toBe(true);
    });
  });

  it("reset does not back up external NEOTOMA_DATA_DIR", async () => {
    await withTempHome(async () => {
      const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cli-reset-data-external-"));
      await fs.writeFile(
        path.join(repoRoot, "package.json"),
        JSON.stringify({ name: "neotoma", version: "0.0.0-test" }, null, 2)
      );

      const externalDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cli-external-data-"));
      await fs.writeFile(path.join(externalDataDir, "neotoma.prod.db"), "seed");
      await fs.writeFile(path.join(repoRoot, ".env"), `NEOTOMA_DATA_DIR=${externalDataDir}\n`);

      const previousRepoRoot = process.env.NEOTOMA_REPO_ROOT;
      process.env.NEOTOMA_REPO_ROOT = repoRoot;
      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli(["node", "cli", "reset", "--yes", "--json"]);
      } finally {
        stdout.restore();
        if (previousRepoRoot === undefined) {
          delete process.env.NEOTOMA_REPO_ROOT;
        } else {
          process.env.NEOTOMA_REPO_ROOT = previousRepoRoot;
        }
      }

      const parsedReset = JSON.parse(stdout.output.join("")) as {
        success: boolean;
        backups_moved: Array<{ from: string; to: string }>;
      };
      expect(parsedReset.success).toBe(true);
      const expectedExternalDir = canonicalizeTmpPath(externalDataDir);
      expect(
        parsedReset.backups_moved.some(
          (item) => canonicalizeTmpPath(item.from) === expectedExternalDir
        )
      ).toBe(false);
      const expectedDefaultDataDir = canonicalizeTmpPath(path.join(repoRoot, "data"));
      expect(
        parsedReset.backups_moved.some(
          (item) => canonicalizeTmpPath(item.from) === expectedDefaultDataDir
        )
      ).toBe(false);
    });
  });

  it("reset backs up symlinked NEOTOMA_DATA_DIR when symlink target is repo-local", async () => {
    await withTempHome(async () => {
      const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cli-reset-data-symlink-in-"));
      await fs.writeFile(
        path.join(repoRoot, "package.json"),
        JSON.stringify({ name: "neotoma", version: "0.0.0-test" }, null, 2)
      );

      const realDataDir = path.join(repoRoot, "actual-data");
      await fs.mkdir(realDataDir, { recursive: true });
      await fs.writeFile(path.join(realDataDir, "neotoma.prod.db"), "seed");
      const symlinkPath = path.join(repoRoot, "linked-data");
      await fs.symlink(realDataDir, symlinkPath, "dir");
      await fs.writeFile(path.join(repoRoot, ".env"), "NEOTOMA_DATA_DIR=./linked-data\n");

      const previousRepoRoot = process.env.NEOTOMA_REPO_ROOT;
      process.env.NEOTOMA_REPO_ROOT = repoRoot;
      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli(["node", "cli", "reset", "--yes", "--json"]);
      } finally {
        stdout.restore();
        if (previousRepoRoot === undefined) {
          delete process.env.NEOTOMA_REPO_ROOT;
        } else {
          process.env.NEOTOMA_REPO_ROOT = previousRepoRoot;
        }
      }

      const parsedReset = JSON.parse(stdout.output.join("")) as {
        success: boolean;
        backups_moved: Array<{ from: string; to: string }>;
      };
      expect(parsedReset.success).toBe(true);
      const expectedSymlinkPath = canonicalizeTmpPath(symlinkPath);
      expect(
        parsedReset.backups_moved.some(
          (item) => canonicalizeTmpPath(item.from) === expectedSymlinkPath
        )
      ).toBe(true);
    });
  });

  it("reset does not back up symlinked NEOTOMA_DATA_DIR when symlink target is external", async () => {
    await withTempHome(async () => {
      const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cli-reset-data-symlink-out-"));
      await fs.writeFile(
        path.join(repoRoot, "package.json"),
        JSON.stringify({ name: "neotoma", version: "0.0.0-test" }, null, 2)
      );

      const externalDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cli-external-symlink-data-"));
      await fs.writeFile(path.join(externalDataDir, "neotoma.prod.db"), "seed");
      const symlinkPath = path.join(repoRoot, "linked-external-data");
      await fs.symlink(externalDataDir, symlinkPath, "dir");
      await fs.writeFile(path.join(repoRoot, ".env"), "NEOTOMA_DATA_DIR=./linked-external-data\n");

      const previousRepoRoot = process.env.NEOTOMA_REPO_ROOT;
      process.env.NEOTOMA_REPO_ROOT = repoRoot;
      const { runCli } = await loadCli();
      const stdout = captureStdout();
      try {
        await runCli(["node", "cli", "reset", "--yes", "--json"]);
      } finally {
        stdout.restore();
        if (previousRepoRoot === undefined) {
          delete process.env.NEOTOMA_REPO_ROOT;
        } else {
          process.env.NEOTOMA_REPO_ROOT = previousRepoRoot;
        }
      }

      const parsedReset = JSON.parse(stdout.output.join("")) as {
        success: boolean;
        backups_moved: Array<{ from: string; to: string }>;
      };
      expect(parsedReset.success).toBe(true);
      const expectedSymlinkPath = canonicalizeTmpPath(symlinkPath);
      expect(
        parsedReset.backups_moved.some(
          (item) => canonicalizeTmpPath(item.from) === expectedSymlinkPath
        )
      ).toBe(false);
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

      const fetchMock = vi.fn(async (input: RequestInfo | Request) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url.includes("/entities/query")) {
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
      expect(parsed).toHaveProperty("entities");
      expect(parsed.entities).toEqual([{ id: "ent_test", entity_type: "company" }]);
    });
  });

  it("filters entities by type when type is passed as positional argument", async () => {
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

      let capturedBody: Record<string, unknown> = {};
      const fetchMock = vi.fn(async (input: RequestInfo | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url.includes("/entities/query")) {
          const bodyRaw = init?.body ?? (typeof input !== "string" && (input as Request).body ? await (input as Request).clone().text() : undefined);
          if (bodyRaw) capturedBody = JSON.parse(typeof bodyRaw === "string" ? bodyRaw : await new Response(bodyRaw).text()) as Record<string, unknown>;
          return new Response(
            JSON.stringify({
              entities: [{ id: "ent_image_1", entity_type: "image" }],
              limit: 100,
              offset: 0,
              total: 1,
            }),
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
        await runCli(["node", "cli", "entities", "list", "image", "--json"]);
      } finally {
        stdout.restore();
      }

      expect(fetchMock).toHaveBeenCalled();
      expect(capturedBody).toMatchObject({ entity_type: "image" });
      const parsed = JSON.parse(stdout.output.join(""));
      expect(parsed.entities).toHaveLength(1);
      expect(parsed.entities[0].entity_type).toBe("image");
    });
  });
});

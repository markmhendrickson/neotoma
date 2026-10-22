import { afterEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const OWNER = "00000000-0000-4000-8000-000000000001";

afterEach(() => {
  vi.doUnmock("../../src/server.js");
  vi.resetModules();
});

describe("core operations runtime initialization", () => {
  it("leaves host environment and owned ambient-config canaries untouched in a real built child", () => {
    const temporary = mkdtempSync(join(tmpdir(), "neotoma-core-import-"));
    try {
      const cwd = join(temporary, "cwd");
      const home = join(temporary, "home");
      const homeConfig = join(home, ".config", "neotoma");
      mkdirSync(cwd, { recursive: true });
      mkdirSync(homeConfig, { recursive: true });
      writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "neotoma" }));
      writeFileSync(
        join(cwd, ".env"),
        `NEOTOMA_DATA_DIR=${join(temporary, "project-trap")}\nNEOTOMA_IMPORT_CANARY=project\n`
      );
      writeFileSync(join(homeConfig, ".env"), `NEOTOMA_DATA_DIR=${join(temporary, "home-trap")}\n`);
      const coreUrl = new URL("../../dist/core/operations.js", import.meta.url).href;
      const networkGuard = fileURLToPath(
        new URL("../fixtures/schema_release_gate/network.cjs", import.meta.url)
      );
      const journal = join(temporary, "network-journal");
      writeFileSync(journal, "");
      const child = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `import assert from "node:assert/strict";
           import fs from "node:fs";
           import {syncBuiltinESMExports} from "node:module";
           const before = {...process.env};
           const ambientReads = [];
           for (const name of ["existsSync", "readFileSync", "readdirSync"]) {
             const original = fs[name];
             fs[name] = function(path, ...args) {
               if (typeof path === "string" &&
                   (path.startsWith(${JSON.stringify(cwd)}) || path.startsWith(${JSON.stringify(home)}))) {
                 ambientReads.push(name);
               }
               return original.call(this, path, ...args);
             };
           }
           syncBuiltinESMExports();
           const { createOperations } = await import(${JSON.stringify(coreUrl)});
           const operations = createOperations({userId: ${JSON.stringify(OWNER)}});
           await operations.dispose();
           assert.deepEqual({...process.env}, before);
           assert.deepEqual(ambientReads, []);
           process.stdout.write("CORE_IMPORT_READY\\n");`,
        ],
        {
          cwd,
          encoding: "utf8",
          timeout: 10000,
          env: {
            PATH: process.env.PATH,
            HOME: home,
            USERPROFILE: home,
            TMPDIR: temporary,
            NODE_ENV: "test",
            NEOTOMA_ENV: "development",
            NEOTOMA_DATA_DIR: join(temporary, "caller-data"),
            NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR: "1",
            NODE_OPTIONS: `--require=${JSON.stringify(networkGuard)}`,
            SCHEMA_GATE_NETWORK_JOURNAL: journal,
            SCHEMA_GATE_IPC_ROOT: temporary,
          },
        }
      );
      expect(child.error, child.stderr).toBeUndefined();
      expect(child.status, child.stderr).toBe(0);
      expect(child.stdout).toBe("CORE_IMPORT_READY\n");
      expect(readFileSync(journal, "utf8")).toBe("");
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("imports, creates and disposes an unused facade without loading the legacy runtime", async () => {
    const load = vi.fn(() => {
      throw new Error("legacy runtime must not load before an operation");
    });
    vi.doMock("../../src/server.js", load);
    const { createOperations } = await import("../../src/core/operations.js");
    const operations = createOperations({ userId: OWNER });
    await operations.dispose();
    expect(load).not.toHaveBeenCalled();
  });

  it("shares one guarded dispatcher across simultaneous first calls and forwards exact arguments", async () => {
    const calls: Array<{ name: string; args: unknown; userId: string }> = [];
    const construct = vi.fn();
    vi.doMock("../../src/server.js", () => ({
      NeotomaServer: class {
        constructor() {
          construct();
        }
        async executeToolForCli(name: string, args: unknown, userId: string) {
          calls.push({ name, args, userId });
          return { content: [{ type: "text", text: JSON.stringify({ name, args }) }] };
        }
      },
    }));
    const { createOperations } = await import("../../src/core/operations.js");
    const operations = createOperations({ userId: OWNER });
    expect(construct).not.toHaveBeenCalled();
    const snapshot = { entity_id: "ent_fixture", at_ingested: "2026-01-01T00:00:00Z" };
    const rawArgs = { value: "must reach guarded dispatcher" };
    const result = await Promise.all([
      operations.retrieveEntitySnapshot(snapshot),
      operations.executeTool("unsupported_or_guarded_tool", rawArgs),
    ]);
    expect(construct).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      { name: "retrieve_entity_snapshot", args: snapshot, userId: OWNER },
      { name: "unsupported_or_guarded_tool", args: rawArgs, userId: OWNER },
    ]);
    expect(result).toEqual([
      { name: "retrieve_entity_snapshot", args: snapshot },
      { name: "unsupported_or_guarded_tool", args: rawArgs },
    ]);
    await operations.listEntityTypes();
    expect(construct).toHaveBeenCalledTimes(1);
  });

  it("uses an explicitly supplied server without importing or constructing another runtime", async () => {
    const load = vi.fn(() => {
      throw new Error("an injected server must not load the legacy runtime");
    });
    vi.doMock("../../src/server.js", load);
    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "null" }] }));
    const { createOperations } = await import("../../src/core/operations.js");
    const server = { executeToolForCli: execute } as unknown as NonNullable<
      Parameters<typeof createOperations>[0]["server"]
    >;
    const operations = createOperations({ userId: OWNER, server });
    expect(await operations.listEntityTypes({ search: "fixture" })).toBeNull();
    await operations.dispose();
    expect(execute).toHaveBeenCalledWith("list_entity_types", { search: "fixture" }, OWNER);
    expect(load).not.toHaveBeenCalled();
  });

  it("propagates guarded dispatcher failures without replaying a mutation", async () => {
    const failure = new Error("guard refused the operation");
    const execute = vi.fn(async () => {
      throw failure;
    });
    vi.doMock("../../src/server.js", () => ({
      NeotomaServer: class {
        executeToolForCli = execute;
      },
    }));
    const { createOperations } = await import("../../src/core/operations.js");
    const operations = createOperations({ userId: OWNER });
    await expect(
      operations.correct({
        entity_id: "ent_fixture",
        field: "value",
        value: 3,
        idempotency_key: "fixture-correction",
      })
    ).rejects.toBe(failure);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

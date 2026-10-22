import { afterEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { getDb, clearDbCache } from "../../src/repositories/db/connection.js";
import { AsyncSqliteDatabase } from "../../src/repositories/sqlite/sqlite_driver.js";
import {
  EmbeddedRuntimeContext,
  getEmbeddedRuntimeContext,
} from "../../src/core/runtime_context.js";
import { createEmbeddedRuntimeConfiguration } from "../../src/core/runtime_configuration.js";

const opened: AsyncSqliteDatabase[] = [];
const closed = new Set<AsyncSqliteDatabase>();

afterEach(async () => {
  for (const database of opened.splice(0)) {
    if (!closed.has(database)) await database.close();
  }
  closed.clear();
});

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function fixture(label: string, ownership: "caller" | "runtime" = "caller") {
  const database = new AsyncSqliteDatabase(":memory:");
  opened.push(database);
  await database.exec("CREATE TABLE scope_fixture (value TEXT NOT NULL)");
  await database.prepare("INSERT INTO scope_fixture(value) VALUES (?)").run(label);
  const configuration = createEmbeddedRuntimeConfiguration({
    dataDirectory: join(process.cwd(), ".vitest", `context-${label}`),
    packageRoot: process.cwd(),
  });
  const context = new EmbeddedRuntimeContext({
    database,
    configuration,
    adapters: { fixture: { label } },
    databaseOwnership: ownership,
  });
  return { database, context };
}

async function currentValue() {
  const database = await getDb();
  return database.prepare("SELECT value FROM scope_fixture").get();
}

describe("embedded runtime context foundation", () => {
  it("builds a pure configuration/context despite poisoned host config and creates no files", () => {
    const temporary = mkdtempSync(join(tmpdir(), "neotoma-context-import-"));
    try {
      const home = join(temporary, "home");
      const cwd = join(temporary, "cwd");
      const data = join(temporary, "explicit-data");
      mkdirSync(join(home, ".config", "neotoma"), { recursive: true });
      mkdirSync(cwd);
      writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "neotoma" }));
      writeFileSync(join(cwd, ".env"), "NEOTOMA_IMPORT_CANARY=project\n");
      writeFileSync(join(home, ".config", "neotoma", ".env"), "NEOTOMA_IMPORT_CANARY=home\n");
      const journal = join(temporary, "network-journal");
      writeFileSync(journal, "");
      const contextUrl = new URL("../../dist/core/runtime_context.js", import.meta.url).href;
      const configurationUrl = new URL("../../dist/core/runtime_configuration.js", import.meta.url)
        .href;
      const guard = fileURLToPath(
        new URL("../fixtures/schema_release_gate/network.cjs", import.meta.url)
      );
      const child = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `import assert from "node:assert/strict";
           const before = {...process.env};
           const {createEmbeddedRuntimeConfiguration} = await import(${JSON.stringify(configurationUrl)});
           const {EmbeddedRuntimeContext,getEmbeddedRuntimeContext} = await import(${JSON.stringify(contextUrl)});
           const configuration = createEmbeddedRuntimeConfiguration({dataDirectory:${JSON.stringify(data)},packageRoot:${JSON.stringify(cwd)}});
           const context = new EmbeddedRuntimeContext({database:{},configuration,adapters:{}});
           await context.run(() => assert.equal(getEmbeddedRuntimeContext().configuration.dataDir, ${JSON.stringify(data)}));
           await context.dispose();
           assert.deepEqual({...process.env}, before);
           console.log("PURE_CONTEXT_READY");`,
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
            NEOTOMA_DB_BACKEND: "poisoned-host-value",
            NEOTOMA_DATA_DIR: join(temporary, "ambient-trap"),
            NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR: "1",
            NODE_OPTIONS: `--require=${JSON.stringify(guard)}`,
            SCHEMA_GATE_NETWORK_JOURNAL: journal,
            SCHEMA_GATE_IPC_ROOT: temporary,
          },
        }
      );
      expect(child.error, child.stderr).toBeUndefined();
      expect(child.status, child.stderr).toBe(0);
      expect(child.stdout).toBe("PURE_CONTEXT_READY\n");
      expect(readFileSync(journal, "utf8")).toBe("");
      expect(existsSync(data)).toBe(false);
      expect(existsSync(join(temporary, "ambient-trap"))).toBe(false);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("keeps simultaneous DB/config/adapter scopes and legacy lookup separate without environment mutation", async () => {
    const before = { ...process.env };
    const ambient = await getDb();
    const a = await fixture("a");
    const b = await fixture("b");
    const aEntered = deferred();
    const bEntered = deferred();
    await Promise.all([
      a.context.run(async () => {
        aEntered.release();
        await bEntered.promise;
        expect(await currentValue()).toEqual({ value: "a" });
        expect(getEmbeddedRuntimeContext()?.configuration.dataDir).toContain("context-a");
        expect(getEmbeddedRuntimeContext()?.adapters.fixture).toEqual({ label: "a" });
        await b.context.run(async () => {
          expect(await currentValue()).toEqual({ value: "b" });
        });
        expect(await currentValue()).toEqual({ value: "a" });
      }),
      b.context.run(async () => {
        bEntered.release();
        await aEntered.promise;
        expect(await currentValue()).toEqual({ value: "b" });
        expect(getEmbeddedRuntimeContext()?.configuration.dataDir).toContain("context-b");
        expect(getEmbeddedRuntimeContext()?.adapters.fixture).toEqual({ label: "b" });
      }),
      (async () => {
        await aEntered.promise;
        expect(getEmbeddedRuntimeContext()).toBeNull();
        expect(await getDb()).toBe(ambient);
      })(),
    ]);
    expect(await getDb()).toBe(ambient);
    expect({ ...process.env }).toEqual(before);
    await a.context.dispose();
    await b.context.dispose();
  });

  it("never initializes an injected database and leaves a caller-owned handle usable after disposal", async () => {
    const { database, context } = await fixture("caller");
    const execute = vi.spyOn(database, "exec");
    const close = vi.spyOn(database, "close");
    await context.run(async () => expect(await currentValue()).toEqual({ value: "caller" }));
    await context.dispose();
    await context.dispose();
    expect(execute).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(await database.prepare("SELECT value FROM scope_fixture").get()).toEqual({
      value: "caller",
    });
    await expect(context.run(() => undefined)).rejects.toThrow("EXPLICIT_RUNTIME_CLOSED");
  });

  it("waits for active operations, refuses new calls and closes an explicitly owned handle once", async () => {
    const { database, context } = await fixture("owned", "runtime");
    const close = vi.spyOn(database, "close");
    const entered = deferred();
    const finish = deferred();
    const operation = context.run(async () => {
      entered.release();
      await finish.promise;
      expect(await currentValue()).toEqual({ value: "owned" });
    });
    await entered.promise;
    const disposal = context.dispose();
    expect(context.dispose()).toBe(disposal);
    expect(close).not.toHaveBeenCalled();
    await expect(context.run(() => undefined)).rejects.toThrow("EXPLICIT_RUNTIME_CLOSED");
    finish.release();
    await operation;
    await disposal;
    closed.add(database);
    expect(close).toHaveBeenCalledTimes(1);
    await context.dispose();
    expect(close).toHaveBeenCalledTimes(1);
    await expect(database.prepare("SELECT 1").get()).rejects.toThrow();
  });

  it("expires escaped async descendants instead of falling back to the ambient handle", async () => {
    const { context } = await fixture("expired");
    const gate = deferred();
    let escaped!: Promise<unknown>;
    await context.run(() => {
      escaped = gate.promise.then(() => getDb());
    });
    gate.release();
    await expect(escaped).rejects.toThrow("EXPLICIT_RUNTIME_OPERATION_EXPIRED");
    await context.dispose();
  });

  it("protects ambient cache ownership and refuses disposal from inside its own operation", async () => {
    const ambient = await getDb();
    const { context } = await fixture("guard");
    await context.run(async () => {
      expect(() => clearDbCache()).toThrow("EXPLICIT_RUNTIME_AMBIENT_CACHE_FORBIDDEN");
      await expect(context.dispose()).rejects.toThrow("EXPLICIT_RUNTIME_DISPOSE_INSIDE_OPERATION");
      expect(await currentValue()).toEqual({ value: "guard" });
    });
    expect(await getDb()).toBe(ambient);
    await context.dispose();
  });

  it("snapshots configuration and adapter bindings without freezing caller-owned adapter values", async () => {
    const database = new AsyncSqliteDatabase(":memory:");
    opened.push(database);
    const pure = createEmbeddedRuntimeConfiguration({
      dataDirectory: join(process.cwd(), ".vitest", "snapshot"),
      packageRoot: process.cwd(),
    });
    const configuration = { ...pure, iconGeneration: { ...pure.iconGeneration } };
    const adapter = { calls: 0 };
    const adapters: Record<string, unknown> = { fixture: adapter };
    const context = new EmbeddedRuntimeContext({ database, configuration, adapters });
    configuration.iconGeneration.enabled = true;
    adapters.fixture = "rebound";
    adapter.calls += 1;
    expect(context.configuration.iconGeneration.enabled).toBe(false);
    expect(context.adapters.fixture).toEqual({ calls: 1 });
    expect(() => {
      context.configuration.iconGeneration.enabled = true;
    }).toThrow();
    await context.dispose();
  });

  it("rejects relative paths rather than resolving them against the host cwd", () => {
    expect(() =>
      createEmbeddedRuntimeConfiguration({ dataDirectory: "data", packageRoot: process.cwd() })
    ).toThrow("EXPLICIT_RUNTIME_ABSOLUTE_PATH_REQUIRED");
  });
});

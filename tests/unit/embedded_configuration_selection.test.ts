import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { config, getConfiguration } from "../../src/config.js";
import { EmbeddedRuntimeContext } from "../../src/core/runtime_context.js";
import { createEmbeddedRuntimeConfiguration } from "../../src/core/runtime_configuration.js";
import type { DbDatabase } from "../../src/repositories/db/driver.js";

function context(label: string) {
  return new EmbeddedRuntimeContext({
    database: {} as DbDatabase,
    configuration: createEmbeddedRuntimeConfiguration({
      dataDirectory: join(process.cwd(), ".vitest", label),
      packageRoot: process.cwd(),
    }),
    adapters: {},
  });
}

describe("contextual configuration selection", () => {
  it("selects concurrent explicit configurations after legacy initialization and restores legacy", async () => {
    const legacy = getConfiguration();
    const a = context("configuration-a");
    const b = context("configuration-b");
    await Promise.all([
      a.run(async () => {
        await Promise.resolve();
        expect(config.dataDir).toBe(a.configuration.dataDir);
        expect({ ...config }).toEqual(a.configuration);
        expect(() => {
          config.dataDir = "forbidden";
        }).toThrow("EXPLICIT_RUNTIME_CONFIGURATION_IMMUTABLE");
      }),
      b.run(async () => {
        await Promise.resolve();
        expect(config.dataDir).toBe(b.configuration.dataDir);
        expect(getConfiguration()).toBe(b.configuration);
      }),
    ]);
    expect(getConfiguration()).toBe(legacy);
    expect(config.dataDir).toBe(legacy.dataDir);
    await a.dispose();
    await b.dispose();
  });

  it("rejects reflective mutations inside explicit operations without poisoning later scopes", async () => {
    const legacy = getConfiguration();
    const prototype = Object.getPrototypeOf(config);
    const a = context("reflection-a"),
      b = context("reflection-b");
    const attacks = [
      () => Object.defineProperty(config, "dataDir", { value: "poisoned" }),
      () => Object.setPrototypeOf(config, null),
      () => Object.preventExtensions(config),
      () => Object.freeze(config),
      () => Object.seal(config),
    ];
    try {
      for (const attack of attacks) {
        await a.run(() => {
          expect(attack).toThrow("EXPLICIT_RUNTIME_CONFIGURATION_IMMUTABLE");
          expect(config.dataDir).toBe(a.configuration.dataDir);
          expect({ ...config }).toEqual(a.configuration);
          expect(Object.getPrototypeOf(config)).toBe(prototype);
        });
        await b.run(() => expect({ ...config }).toEqual(b.configuration));
        expect(getConfiguration()).toBe(legacy);
        expect({ ...config }).toEqual(legacy);
      }
      expect(() => Object.freeze(config)).toThrow(
        "CONTEXTUAL_CONFIGURATION_EXTENSIBILITY_REQUIRED"
      );
      expect(() => Object.defineProperty(config, "poison", { value: true })).toThrow(
        "CONTEXTUAL_CONFIGURATION_CONFIGURABLE_DESCRIPTOR_REQUIRED"
      );
      Object.defineProperty(config, "reflectionFixture", { value: true, configurable: true });
      expect(Reflect.get(config, "reflectionFixture")).toBe(true);
      expect(Reflect.deleteProperty(config, "reflectionFixture")).toBe(true);
      expect({ ...config }).toEqual(legacy);
      await a.run(() => expect({ ...config }).toEqual(a.configuration));
    } finally {
      await a.dispose();
      await b.dispose();
    }
  });

  it("can import config and provider modules first inside explicit scopes without capturing their values", () => {
    const temporary = mkdtempSync(join(tmpdir(), "neotoma-configuration-selection-"));
    try {
      const home = join(temporary, "home");
      const cwd = join(temporary, "cwd");
      mkdirSync(join(home, ".config", "neotoma"), { recursive: true });
      mkdirSync(cwd);
      writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "neotoma" }));
      writeFileSync(join(cwd, ".env"), "NEOTOMA_IMPORT_CANARY=project\n");
      writeFileSync(join(home, ".config", "neotoma", ".env"), "NEOTOMA_IMPORT_CANARY=home\n");
      const journal = join(temporary, "network-journal");
      writeFileSync(journal, "");
      const url = (file: string) => new URL(`../../dist/${file}`, import.meta.url).href;
      const guard = fileURLToPath(
        new URL("../fixtures/schema_release_gate/network.cjs", import.meta.url)
      );
      const script = `import assert from "node:assert/strict";
        const before = {...process.env};
        const {EmbeddedRuntimeContext} = await import(${JSON.stringify(url("core/runtime_context.js"))});
        const {createEmbeddedRuntimeConfiguration} = await import(${JSON.stringify(url("core/runtime_configuration.js"))});
        function make(label) {return new EmbeddedRuntimeContext({database:{},configuration:createEmbeddedRuntimeConfiguration({dataDirectory:${JSON.stringify(temporary)}+"/"+label,packageRoot:${JSON.stringify(cwd)}}),adapters:{}});}
        const a=make("a"), b=make("b");
        let settings, icons, embeddings, oauth;
        await a.run(async () => {
          settings = await import(${JSON.stringify(url("config.js"))});
          icons = await import(${JSON.stringify(url("services/schema_icon_service.js"))});
          embeddings = await import(${JSON.stringify(url("embeddings.js"))});
          oauth = await import(${JSON.stringify(url("services/mcp_oauth.js"))});
          assert.equal(settings.config.dataDir, a.configuration.dataDir);
          assert.equal(icons.isIconGenerationAvailable(), false);
          assert.equal(await embeddings.generateEmbedding("synthetic fixture"), null);
          assert.throws(() => oauth.encryptRefreshToken("synthetic token"));
        });
        await Promise.all([a.run(async()=>{await Promise.resolve();assert.equal(settings.config.dataDir,a.configuration.dataDir);}),b.run(async()=>{await Promise.resolve();assert.equal(settings.config.dataDir,b.configuration.dataDir);assert.equal(icons.isIconGenerationAvailable(),false);})]);
        assert.deepEqual({...process.env},before);
        // The same imported modules must still serve an ordinary legacy caller.
        assert.equal(settings.config.dataDir, process.env.NEOTOMA_DATA_DIR);
        assert.equal(process.env.NEOTOMA_IMPORT_CANARY,"project");
        assert.equal(icons.isIconGenerationAvailable(),true);
        const encrypted=oauth.encryptRefreshToken("synthetic token");
        assert.equal(oauth.decryptRefreshToken(encrypted),"synthetic token");
        await a.run(()=>{assert.equal(icons.isIconGenerationAvailable(),false);assert.equal(settings.config.dataDir,a.configuration.dataDir);});
        await a.dispose();await b.dispose();
        console.log("CONTEXT_CONFIGURATION_READY");`;
      const child = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
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
          NEOTOMA_DATA_DIR: join(temporary, "legacy-data"),
          NEOTOMA_DB_BACKEND: "sqlite",
          NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR: "1",
          OPENAI_API_KEY: "synthetic-unused-provider-key",
          NEOTOMA_MCP_TOKEN_ENCRYPTION_KEY: "0".repeat(64),
          NODE_OPTIONS: `--require=${JSON.stringify(guard)}`,
          SCHEMA_GATE_NETWORK_JOURNAL: journal,
          SCHEMA_GATE_IPC_ROOT: temporary,
        },
      });
      expect(child.error, child.stderr).toBeUndefined();
      expect(child.status, child.stderr).toBe(0);
      expect(child.stdout).toBe("CONTEXT_CONFIGURATION_READY\n");
      expect(readFileSync(journal, "utf8")).toBe("");
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("interleaves built guarded writes, corrections, replay and reads across two databases and legacy", () => {
    const temporary = mkdtempSync(join(tmpdir(), "neotoma-dual-store-"));
    try {
      const home = join(temporary, "home");
      const cwd = join(temporary, "cwd");
      mkdirSync(join(home, ".config", "neotoma"), { recursive: true });
      mkdirSync(cwd);
      writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "neotoma" }));
      writeFileSync(join(cwd, ".env"), "NEOTOMA_IMPORT_CANARY=project\n");
      writeFileSync(join(home, ".config", "neotoma", ".env"), "NEOTOMA_IMPORT_CANARY=home\n");
      const journal = join(temporary, "network-journal");
      writeFileSync(journal, "");
      const fixture = fileURLToPath(
        new URL("../fixtures/embedded_runtime/dual_store.mjs", import.meta.url)
      );
      const guard = fileURLToPath(
        new URL("../fixtures/schema_release_gate/network.cjs", import.meta.url)
      );
      for (const mode of ["explicit-only", "legacy-interleaved"]) {
        const child = spawnSync(process.execPath, [fixture, join(temporary, mode), mode], {
          cwd,
          encoding: "utf8",
          timeout: 15000,
          env: {
            PATH: process.env.PATH,
            HOME: home,
            USERPROFILE: home,
            TMPDIR: temporary,
            NODE_ENV: mode === "explicit-only" ? "development" : "test",
            NEOTOMA_ENV: "development",
            NEOTOMA_DATA_DIR: join(temporary, "legacy-data"),
            NEOTOMA_DB_BACKEND: "sqlite",
            NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR: "1",
            OPENAI_API_KEY: "",
            NEOTOMA_ICON_GENERATION_ENABLED: "false",
            NODE_OPTIONS: `--require=${JSON.stringify(guard)}`,
            SCHEMA_GATE_NETWORK_JOURNAL: journal,
            SCHEMA_GATE_IPC_ROOT: temporary,
          },
        });
        expect(child.error, child.stderr).toBeUndefined();
        expect(child.status, child.stderr).toBe(0);
        expect(child.stdout).toBe("GUARDED_DUAL_STORE_OK\n");
        expect(readFileSync(journal, "utf8")).toBe("");
      }
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});

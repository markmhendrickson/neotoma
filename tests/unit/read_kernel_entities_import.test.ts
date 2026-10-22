import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

describe("built private plain-list import and operation closure", () => {
  it("lists real guarded fixtures without transport/provider/initializer imports or ambient logging reads", () => {
    const directory = mkdtempSync(join(tmpdir(), "neotoma-read-kernel-"));
    try {
      const home = join(directory, "home"),
        cwd = join(directory, "cwd"),
        data = join(directory, "data");
      mkdirSync(join(home, ".config", "neotoma"), { recursive: true });
      mkdirSync(cwd);
      mkdirSync(data);
      writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "neotoma" }));
      writeFileSync(join(cwd, ".env"), "NEOTOMA_READ_KERNEL_CANARY=project\n");
      writeFileSync(join(home, ".config", "neotoma", ".env"), "NEOTOMA_READ_KERNEL_CANARY=home\n");
      const guard = fileURLToPath(
        new URL("../fixtures/schema_release_gate/network.cjs", import.meta.url)
      );
      const fixture = (name: string) =>
        fileURLToPath(new URL(`../fixtures/embedded_runtime/${name}`, import.meta.url));
      const journal = join(directory, "network-journal"),
        imports = join(directory, "import-journal");
      writeFileSync(journal, "");
      writeFileSync(imports, "");
      const env = {
        PATH: process.env.PATH,
        HOME: home,
        USERPROFILE: home,
        TMPDIR: directory,
        NODE_ENV: "test",
        NEOTOMA_ENV: "development",
        NEOTOMA_DATA_DIR: join(directory, "unused-ambient"),
        NEOTOMA_DB_BACKEND: "sqlite",
        NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR: "1",
        NODE_OPTIONS: `--require=${JSON.stringify(guard)}`,
        SCHEMA_GATE_NETWORK_JOURNAL: journal,
        SCHEMA_GATE_IPC_ROOT: directory,
        KERNEL_IMPORT_JOURNAL: imports,
      };
      const prepared = spawnSync(
        process.execPath,
        [fixture("read_kernel_entities_prepare.mjs"), data],
        {
          cwd,
          env,
          encoding: "utf8",
          timeout: 15000,
        }
      );
      expect(prepared.error, prepared.stderr).toBeUndefined();
      expect(prepared.status, prepared.stderr).toBe(0);
      expect(prepared.stdout).toBe("READ_FIXTURE_READY\n");
      const child = spawnSync(
        process.execPath,
        [
          "--experimental-loader",
          fixture("read_kernel_entities_loader.mjs"),
          fixture("read_kernel_entities_consumer.mjs"),
          data,
        ],
        {
          cwd,
          env: {
            ...env,
            NODE_ENV: "production",
            NEOTOMA_DB_BACKEND: "invalid-inherited-backend",
            OPENAI_API_KEY: "synthetic-unused-provider-key",
            NEOTOMA_SQLITE_BUSY_TIMEOUT_MS: "invalid-inherited-timeout",
          },
          encoding: "utf8",
          timeout: 15000,
        }
      );
      expect(child.error, child.stderr).toBeUndefined();
      expect(child.status, child.stderr).toBe(0);
      expect(child.stdout).toBe("READ_KERNEL_READY\n");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

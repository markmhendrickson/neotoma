import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * In embedded mode every runtime setting is read from the explicit configuration map,
 * not from the host process environment, and no file under a home directory is read.
 *
 * Each case observes a real effect of one setting (a policy snapshot, a guard verdict,
 * a resolved mode) in four situations:
 *   - set only in the host process environment: no effect (equals the unset result);
 *   - set in the explicit `env` option: takes effect;
 *   - set in the host and named in `allowProcessEnv`: the host value applies;
 *   - set in both, named in `allowProcessEnv`: the explicit `env` value wins.
 * The "no setting" result is asserted to differ from the "takes effect" results, so a
 * case cannot pass by observing nothing.
 */

interface Fixture {
  root: string;
  homeDir: string;
  dataDir: string;
}

async function makeFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-embedded-env-"));
  const homeDir = path.join(root, "home");
  const dataDir = path.join(root, "data");
  await fs.mkdir(path.join(homeDir, ".config", "neotoma"), { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
  return { root, homeDir, dataDir };
}

let f: Fixture;

beforeEach(async () => {
  f = await makeFixture();
  vi.resetModules();
  vi.stubEnv("HOME", f.homeDir);
  vi.stubEnv("USERPROFILE", f.homeDir);
  vi.stubEnv("NEOTOMA_ALLOW_USER_ENV_IN_TEST", "1");
});

afterEach(async () => {
  const { clearEmbeddedConfig } = await import("../../src/config_embedded.ts");
  clearEmbeddedConfig();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await fs.rm(f.root, { recursive: true, force: true });
});

interface Scenario {
  hostValue?: string;
  envValue?: string;
  allow?: boolean;
}

/** Declare embedded mode with a fresh module graph, run `read`, then forget the declaration. */
async function observe<T>(key: string, scenario: Scenario, read: () => Promise<T> | T): Promise<T> {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("HOME", f.homeDir);
  vi.stubEnv("USERPROFILE", f.homeDir);
  vi.stubEnv("NEOTOMA_ALLOW_USER_ENV_IN_TEST", "1");
  if (scenario.hostValue !== undefined) vi.stubEnv(key, scenario.hostValue);
  const ce = await import("../../src/config_embedded.ts");
  ce.clearEmbeddedConfig();
  ce.setEmbeddedConfig(
    ce.resolveEmbeddedConfig({
      dataDir: f.dataDir,
      env: scenario.envValue !== undefined ? { [key]: scenario.envValue } : undefined,
      allowProcessEnv: scenario.allow ? [key] : undefined,
    })
  );
  try {
    return await read();
  } finally {
    ce.clearEmbeddedConfig();
  }
}

interface Case {
  name: string;
  key: string;
  hostValue: string;
  envValue: string;
  read: () => Promise<unknown> | unknown;
}

const cases: Case[] = [
  {
    name: "attribution policy mode",
    key: "NEOTOMA_ATTRIBUTION_POLICY",
    hostValue: "reject",
    envValue: "warn",
    read: async () =>
      (await import("../../src/services/attribution_policy.ts")).getAttributionPolicySnapshot()
        .anonymous_writes,
  },
  {
    name: "attribution policy JSON overrides",
    key: "NEOTOMA_ATTRIBUTION_POLICY_JSON",
    hostValue: '{"observations":"reject"}',
    envValue: '{"observations":"warn"}',
    read: async () =>
      (await import("../../src/services/attribution_policy.ts")).getAttributionPolicySnapshot()
        .per_path?.observations ?? null,
  },
  {
    name: "minimum attribution tier",
    key: "NEOTOMA_MIN_ATTRIBUTION_TIER",
    hostValue: "hardware",
    envValue: "software",
    read: async () =>
      (await import("../../src/services/attribution_policy.ts")).getAttributionPolicySnapshot()
        .min_tier ?? null,
  },
  {
    name: "forbidden entity type patterns",
    key: "NEOTOMA_FORBIDDEN_TYPE_PATTERNS",
    hostValue: "^hostpat_",
    envValue: "^explicitpat_",
    read: async () => {
      const g = await import("../../src/services/entity_type_guard.ts");
      return [
        g.checkForbiddenTestArtifactType("hostpat_x").reason,
        g.checkForbiddenTestArtifactType("explicitpat_x").reason,
      ];
    },
  },
  {
    name: "allowed test entity types",
    key: "NEOTOMA_ALLOWED_TEST_TYPES",
    hostValue: "test_type_001",
    envValue: "auto_test_alpha",
    read: async () => {
      const g = await import("../../src/services/entity_type_guard.ts");
      return [
        g.checkForbiddenTestArtifactType("test_type_001").reason,
        g.checkForbiddenTestArtifactType("auto_test_alpha").reason,
      ];
    },
  },
  {
    name: "allowed plural entity types",
    key: "NEOTOMA_ALLOWED_PLURAL_TYPES",
    hostValue: "hostthings",
    envValue: "explicitthings",
    read: async () => {
      const g = await import("../../src/services/entity_type_guard.ts");
      return [
        g.checkPluralEntityType("hostthings").reason,
        g.checkPluralEntityType("explicitthings").reason,
      ];
    },
  },
  {
    name: "tenant-scoped entity ids",
    key: "NEOTOMA_TENANT_SCOPED_ENTITY_IDS",
    hostValue: "1",
    envValue: "yes",
    read: async () =>
      (await import("../../src/services/entity_resolution.ts")).entityIdTenantSalt("user-a") ??
      null,
  },
  {
    name: "sandbox mode",
    key: "NEOTOMA_SANDBOX_MODE",
    hostValue: "true",
    envValue: "1",
    read: async () => (await import("../../src/services/sandbox_mode.ts")).isSandboxMode(),
  },
  {
    name: "schema mode",
    key: "NEOTOMA_SCHEMA_MODE",
    hostValue: "locked",
    envValue: "guided",
    read: async () => (await import("../../src/services/schema_mode.ts")).getSchemaMode(),
  },
  {
    name: "log silencing switch",
    key: "NEOTOMA_ACTIONS_DISABLE_AUTOSTART",
    hostValue: "1",
    envValue: "1",
    read: async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { logger } = await import("../../src/utils/logger.ts");
      logger.error("probe");
      const emitted = spy.mock.calls.length > 0;
      spy.mockRestore();
      return emitted;
    },
  },
  {
    name: "guest access policy override",
    key: "NEOTOMA_ACCESS_POLICY_NOTE",
    hostValue: "open",
    envValue: "read_only",
    read: async () => {
      const m = await import("../../src/services/access_policy.ts");
      return (await m.resolveAccessPolicyWithSource("note")).mode;
    },
  },
];

describe("embedded mode routes runtime settings through the explicit configuration", () => {
  for (const c of cases) {
    it(`${c.name}: host value ignored unless named, explicit value takes effect`, async () => {
      const unset = await observe(c.key, {}, c.read);
      const hostOnly = await observe(c.key, { hostValue: c.hostValue }, c.read);
      const viaEnv = await observe(c.key, { envValue: c.envValue }, c.read);
      const hostAllowed = await observe(c.key, { hostValue: c.hostValue, allow: true }, c.read);
      const both = await observe(
        c.key,
        { hostValue: c.hostValue, envValue: c.envValue, allow: true },
        c.read
      );

      // Instrument check: the setting changes what is observed.
      if (c.key !== "NEOTOMA_ACTIONS_DISABLE_AUTOSTART") {
        expect(viaEnv).not.toEqual(unset);
        expect(hostAllowed).not.toEqual(unset);
      }
      // 1. A host value that is not named has no effect.
      expect(hostOnly).toEqual(unset);
      // 2. The explicit `env` option takes effect.
      if (c.key === "NEOTOMA_ACTIONS_DISABLE_AUTOSTART") {
        // The host sets the switch that silences logging in server mode; embedded mode logs.
        expect(unset).toBe(true);
        expect(hostOnly).toBe(true);
        expect(viaEnv).toBe(false);
        expect(hostAllowed).toBe(false);
      }
      // 3. Naming the variable in allowProcessEnv lets the host value apply.
      // 4. When both are given, the explicit `env` value wins.
      expect(both).toEqual(viaEnv);
    });
  }

  it("standard (non-embedded) mode still reads the host environment for the same settings", async () => {
    vi.resetModules();
    vi.stubEnv("NEOTOMA_ATTRIBUTION_POLICY", "reject");
    vi.stubEnv("NEOTOMA_SCHEMA_MODE", "locked");
    const ce = await import("../../src/config_embedded.ts");
    ce.clearEmbeddedConfig();
    expect(ce.runtimeEnv()).toBe(process.env);
    const { getAttributionPolicySnapshot } =
      await import("../../src/services/attribution_policy.ts");
    expect(getAttributionPolicySnapshot().anonymous_writes).toBe("reject");
    const { getSchemaMode } = await import("../../src/services/schema_mode.ts");
    expect(getSchemaMode()).toBe("locked");
  });
});

describe("embedded operations honour the explicit policy end to end", () => {
  it("a host attribution policy does not reject an anonymous embedded store, the explicit one does", async () => {
    vi.stubEnv("NEOTOMA_ATTRIBUTION_POLICY", "reject");
    vi.stubEnv("NEOTOMA_SCHEMA_MODE", "locked");
    vi.resetModules();
    const { createEmbeddedNeotoma } = await import("../../src/embedded.ts");
    const neotoma = await createEmbeddedNeotoma({ dataDir: f.dataDir });
    const ops = neotoma.createOperations({ userId: "00000000-0000-4000-8000-0000000000aa" });
    // Host policy "reject" is not applied: the anonymous write is admitted.
    const stored = (await ops.store({
      entities: [{ entity_type: "note", title: "host policy ignored" }],
      idempotency_key: "embedded-env-host-ignored",
    })) as { structured?: { entities?: unknown[] } };
    expect(JSON.stringify(stored)).not.toMatch(/attribution/i);
    expect(JSON.stringify(stored).length).toBeGreaterThan(0);

    // The same host variable named in the explicit option is applied: rejected.
    vi.resetModules();
    const ce = await import("../../src/config_embedded.ts");
    ce.clearEmbeddedConfig();
    const dir2 = path.join(f.root, "data2");
    const mod = await import("../../src/embedded.ts");
    const strict = await mod.createEmbeddedNeotoma({
      dataDir: dir2,
      env: { NEOTOMA_ATTRIBUTION_POLICY: "reject" },
    });
    const strictOps = strict.createOperations({ userId: "00000000-0000-4000-8000-0000000000ab" });
    await expect(
      strictOps.store({
        entities: [{ entity_type: "note", title: "explicit policy applied" }],
        idempotency_key: "embedded-env-explicit-applied",
      })
    ).rejects.toThrow(/anonymous|attribution|reject/i);
  });
});

describe("embedded mode reads nothing under a home directory", () => {
  async function writeConflictingHomeState(): Promise<{ files: Record<string, string> }> {
    const dir = path.join(f.homeDir, ".config", "neotoma");
    const config = path.join(dir, "config.json");
    const bundle = path.join(dir, "bundle_state.json");
    await fs.writeFile(
      config,
      JSON.stringify({
        access_policies: { note: "open" },
        issues: { repo: "home-conflict/repo", reporting_mode: "proactive" },
      })
    );
    await fs.writeFile(
      bundle,
      JSON.stringify({ version: 1, enabled: { "home-only-bundle": true } })
    );
    return { files: { config, bundle } };
  }

  it("ignores a conflicting home config, bundle state and CLI-based credentials, and writes under the data directory", async () => {
    const { files } = await writeConflictingHomeState();
    const before = {
      config: await fs.readFile(files.config, "utf-8"),
      bundle: await fs.readFile(files.bundle, "utf-8"),
    };

    const execCalls: string[][] = [];
    vi.doMock("node:child_process", async (orig) => {
      const real = await orig<typeof import("node:child_process")>();
      return {
        ...real,
        execFile: ((cmd: string, args: string[], ...rest: unknown[]) => {
          execCalls.push([cmd, ...(args ?? [])]);
          const cb = rest.find((r) => typeof r === "function") as
            | ((err: Error) => void)
            | undefined;
          cb?.(new Error("blocked in test"));
          return { on: () => undefined } as never;
        }) as never,
      };
    });
    const readSpy = vi.spyOn(fs, "readFile");

    vi.resetModules();
    const { createEmbeddedNeotoma } = await import("../../src/embedded.ts");
    const neotoma = await createEmbeddedNeotoma({ dataDir: f.dataDir });
    const ops = neotoma.createOperations({ userId: "00000000-0000-4000-8000-0000000000cc" });

    const access = await import("../../src/services/access_policy.ts");
    const resolved = await access.resolveAccessPolicyWithSource("note");
    expect(resolved.source).not.toBe("config_file");
    expect(resolved.mode).not.toBe("open");
    expect((await access.loadAccessPolicies()).note).toBeUndefined();

    const issues = await import("../../src/services/issues/config.ts");
    expect((await issues.loadIssuesConfig()).repo).not.toBe("home-conflict/repo");

    const bundles = await import("../../src/services/bundles/state_store.ts");
    expect(bundles.bundleStatePath()).toBe(path.join(f.dataDir, "bundle_state.json"));
    expect(bundles.listInstalledBundles().map((b) => b.name)).not.toContain("home-only-bundle");
    const listed = JSON.stringify(await ops.executeTool("manage_bundles", { action: "list" }));
    expect(listed).not.toContain("home-only-bundle");

    const gh = await import("../../src/services/issues/gh_auth.ts");
    expect(await gh.getGhToken()).toBeNull();
    expect(await gh.isGhAuthenticated()).toBe(false);
    expect(await gh.verifyGhAuth()).toBeNull();
    expect(await gh.resolveGitHubToken()).toBeNull();
    expect(execCalls).toEqual([]);

    // Writes land under the explicit data directory, not the home directory.
    await access.setAccessPolicy("note", "read_only");
    await issues.updateIssuesConfig({ repo: "explicit/repo" });
    const written = JSON.parse(await fs.readFile(path.join(f.dataDir, "config.json"), "utf-8"));
    expect(written.access_policies.note).toBe("read_only");
    expect(written.issues.repo).toBe("explicit/repo");

    const homeReads = readSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((p) => p.startsWith(f.homeDir));
    expect(homeReads).toEqual([]);
    expect(await fs.readFile(files.config, "utf-8")).toBe(before.config);
    expect(await fs.readFile(files.bundle, "utf-8")).toBe(before.bundle);
    vi.doUnmock("node:child_process");
  });

  it("uses the home-directory location only when the host names HOME in allowProcessEnv", async () => {
    await writeConflictingHomeState();
    vi.resetModules();
    const { createEmbeddedNeotoma } = await import("../../src/embedded.ts");
    await createEmbeddedNeotoma({ dataDir: f.dataDir, allowProcessEnv: ["HOME"] });
    const issues = await import("../../src/services/issues/config.ts");
    expect((await issues.loadIssuesConfig()).repo).toBe("home-conflict/repo");
    const bundles = await import("../../src/services/bundles/state_store.ts");
    expect(bundles.bundleStatePath()).toBe(
      path.join(f.homeDir, ".config", "neotoma", "bundle_state.json")
    );
  });
});

describe("no raw host-environment reads remain on embedded-reachable code", () => {
  // Entry points and tools that run only in the CLI or as separate processes, not through
  // the embedded operations. Everything else under src/ must read settings through
  // runtimeEnv() so that embedded mode can supply them.
  const EXEMPT = [
    "src/cli/",
    "src/proxy/",
    "src/maintenance/",
    "src/openclaw_entry.ts",
    "src/mcp_ws_bridge.ts",
    "src/mcp_dev_shim.ts",
    "src/index.ts",
    "src/config.ts",
    "src/config_embedded.ts",
    "src/shared/api_client.ts",
    "src/shared/local_transport.ts",
  ];

  async function walk(dir: string, out: string[]): Promise<void> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, out);
      else if (entry.name.endsWith(".ts") && !/\.test\.ts$/.test(entry.name)) out.push(full);
    }
  }

  it("finds none outside the exempt entry points", async () => {
    const repo = process.cwd();
    const files: string[] = [];
    await walk(path.join(repo, "src"), files);
    const needle = new RegExp("process" + "\\." + "env");
    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(repo, file).split(path.sep).join("/");
      if (rel.includes("__tests__") || EXEMPT.some((e) => rel.startsWith(e))) continue;
      const lines = (await fs.readFile(file, "utf-8")).split("\n");
      lines.forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
        if (i > 0 && lines[i - 1].includes("runtime-env-ok")) return;
        if (needle.test(line)) offenders.push(`${rel}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

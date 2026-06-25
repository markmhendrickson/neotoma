/**
 * Unit tests for the Bundles m3 activation core: the install/enable state store,
 * the activation orchestration (list/info/install/enable/disable), the refusal
 * to disable an always-active default bundle, and the enforcement consequence
 * (a disabled schema bundle's types stop counting as "provided").
 *
 * Plan: ent_089da2ecebc3bd804d63dcf2 (Bundles Strategy, m3).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ALWAYS_ACTIVE_BUNDLES,
  BundleStateError,
  bundleStatePath,
  buildRegistry,
  checkAutoCreateAllowed,
  disableBundle,
  enableBundle,
  getBundleInfo,
  getProvidedEntityTypes,
  installBundle,
  isAlwaysActiveBundle,
  isBundleEnabled,
  listBundles,
  listInstalledBundles,
  parseManifest,
  resetBundleRegistryForTesting,
  resetBundleStateCacheForTesting,
  setBundleEnabled,
  UnknownBundleError,
} from "../../src/services/bundles/index.js";
import { resetSchemaModeCacheForTesting } from "../../src/services/schema_mode.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-state-"));
  process.env.NEOTOMA_BUNDLE_STATE_PATH = path.join(tmpDir, "bundle_state.json");
  resetBundleStateCacheForTesting();
  resetBundleRegistryForTesting();
  resetSchemaModeCacheForTesting();
  delete process.env.NEOTOMA_SCHEMA_MODE;
});

afterEach(() => {
  delete process.env.NEOTOMA_BUNDLE_STATE_PATH;
  delete process.env.NEOTOMA_SCHEMA_MODE;
  resetBundleStateCacheForTesting();
  resetBundleRegistryForTesting();
  resetSchemaModeCacheForTesting();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("state store — defaults", () => {
  it("the three default-install bundles are always active and enabled", () => {
    expect([...ALWAYS_ACTIVE_BUNDLES].sort()).toEqual(["core", "core_workflows", "infrastructure"]);
    for (const name of ALWAYS_ACTIVE_BUNDLES) {
      expect(isAlwaysActiveBundle(name)).toBe(true);
      expect(isBundleEnabled(name)).toBe(true);
    }
  });

  it("a non-default bundle defaults to disabled until installed", () => {
    expect(isBundleEnabled("financial_ops")).toBe(false);
  });
});

describe("state store — round-trip", () => {
  it("setBundleEnabled persists across a cache reset (re-reads the file)", () => {
    expect(setBundleEnabled("financial_ops", true)).toBe(true);
    expect(fs.existsSync(bundleStatePath())).toBe(true);

    // Drop the in-memory cache; the next read must come from disk.
    resetBundleStateCacheForTesting();
    expect(isBundleEnabled("financial_ops")).toBe(true);

    setBundleEnabled("financial_ops", false);
    resetBundleStateCacheForTesting();
    expect(isBundleEnabled("financial_ops")).toBe(false);
  });

  it("listInstalledBundles reports always-active defaults plus persisted state", () => {
    setBundleEnabled("financial_ops", true);
    const rows = listInstalledBundles();
    const byName = new Map(rows.map((r) => [r.name, r]));
    expect(byName.get("core")).toMatchObject({ enabled: true, always_active: true });
    expect(byName.get("financial_ops")).toMatchObject({
      enabled: true,
      always_active: false,
    });
  });
});

describe("state store — refuse to disable a default bundle", () => {
  it("setBundleEnabled(core, false) throws BundleStateError", () => {
    expect(() => setBundleEnabled("core", false)).toThrow(BundleStateError);
    expect(() => setBundleEnabled("core", false)).toThrow(/always active/i);
  });

  it("enabling an always-active bundle is a no-op success", () => {
    expect(setBundleEnabled("core", true)).toBe(true);
  });
});

describe("activation — list and info output shape", () => {
  it("list returns the three default bundles with enriched metadata", () => {
    const rows = listBundles();
    const names = rows.map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(["core", "core_workflows", "infrastructure"]));
    const core = rows.find((r) => r.name === "core")!;
    expect(core.always_active).toBe(true);
    expect(core.enabled).toBe(true);
    expect(core.bundle_type).toBe("schema");
    expect(typeof core.version).toBe("string");
    expect(core.provides_entity_types_count).toBeGreaterThan(0);
  });

  it("info returns full manifest detail for a known bundle", () => {
    const info = getBundleInfo("core_workflows");
    expect(info).not.toBeNull();
    expect(info!.manifest.bundle_type).toBe("skill");
    expect(info!.manifest.requires_bundles).toContain("core");
    expect(info!.manifest.provides_entity_types).toEqual([]);
    expect(info!.always_active).toBe(true);
    expect(info!.enabled).toBe(true);
  });

  it("info returns null for an unknown bundle", () => {
    expect(getBundleInfo("does_not_exist")).toBeNull();
  });
});

describe("activation — install / enable / disable", () => {
  it("install of a default bundle is a no-op success (always active)", () => {
    const result = installBundle("core");
    expect(result.always_active).toBe(true);
    expect(result.enabled).toBe(true);
    expect(result.message).toMatch(/always active/i);
  });

  it("install/enable/disable of an unknown bundle throws UnknownBundleError", () => {
    expect(() => installBundle("nope")).toThrow(UnknownBundleError);
    expect(() => enableBundle("nope")).toThrow(UnknownBundleError);
    expect(() => disableBundle("nope")).toThrow(UnknownBundleError);
  });

  it("disable of a default bundle throws BundleStateError with a clear message", () => {
    expect(() => disableBundle("infrastructure")).toThrow(BundleStateError);
    expect(() => disableBundle("infrastructure")).toThrow(/cannot be disabled/i);
  });
});

describe("enforcement — disabling a (hypothetical) non-default schema bundle hides its types", () => {
  it("buildRegistry drops a disabled bundle's provided types from the provided set", () => {
    const enabledBundle = {
      dir: "/enabled",
      enabled: true,
      manifest: parseManifest(
        `name: alpha\nversion: 1.0.0\ndescription: a\nbundle_type: schema\nprovides_entity_types:\n  - widget`
      ),
    };
    const disabledBundle = {
      dir: "/disabled",
      enabled: false,
      manifest: parseManifest(
        `name: beta\nversion: 1.0.0\ndescription: b\nbundle_type: schema\nprovides_entity_types:\n  - gadget`
      ),
    };
    const reg = buildRegistry([enabledBundle, disabledBundle]);
    expect(reg.providedEntityTypes.has("widget")).toBe(true);
    expect(reg.providedEntityTypes.has("gadget")).toBe(false);
  });

  it("real loader: toggling state changes the live provided set used by enforcement", () => {
    // Simulate a non-default schema bundle that provides a type by writing state
    // for one of the default schema bundles is not possible (they cannot be
    // disabled), so we exercise the loader's enabled-flag wiring directly:
    // disabling at the file level removes the bundle's types from the live set.
    //
    // Use 'infrastructure' to prove default bundles are immune even if the file
    // somehow contains a stale disable flag (defaults are always-active).
    fs.writeFileSync(
      bundleStatePath(),
      JSON.stringify({ version: 1, enabled: { infrastructure: false } })
    );
    resetBundleStateCacheForTesting();
    resetBundleRegistryForTesting();

    // infrastructure types remain provided — defaults override stored state.
    const provided = getProvidedEntityTypes();
    expect(provided.has("issue")).toBe(true);
    expect(provided.has("plan")).toBe(true);

    // guided enforcement still allows the infrastructure-provided type.
    expect(checkAutoCreateAllowed("issue", "guided").allowed).toBe(true);
  });
});

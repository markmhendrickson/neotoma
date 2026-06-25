/**
 * Unit tests for the Bundles m2 runtime: manifest parsing, loader resolution,
 * the default-install provides-set, and mode enforcement at each lock posture.
 *
 * Plan: ent_089da2ecebc3bd804d63dcf2 (Bundles Strategy).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ManifestError,
  buildRegistry,
  checkAutoCreateAllowed,
  getBundleRegistry,
  getProvidedEntityTypes,
  loadBundlesFrom,
  parseManifest,
  resetBundleRegistryForTesting,
  resolveRequires,
} from "../../src/services/bundles/index.js";
import { resetSchemaModeCacheForTesting } from "../../src/services/schema_mode.js";

const VALID_SCHEMA_MANIFEST = `
name: demo_schema
version: 1.0.0
description: A demo schema bundle.
bundle_type: schema
provides_entity_types:
  - widget
  - gadget
`;

describe("parseManifest", () => {
  it("parses a well-formed schema manifest and defaults list/mode fields", () => {
    const m = parseManifest(VALID_SCHEMA_MANIFEST);
    expect(m.name).toBe("demo_schema");
    expect(m.version).toBe("1.0.0");
    expect(m.bundle_type).toBe("schema");
    expect(m.provides_entity_types).toEqual(["widget", "gadget"]);
    expect(m.requires_bundles).toEqual([]);
    expect(m.references_shared_schemas).toEqual([]);
    expect(m.provides_skills).toEqual([]);
    // compatible_modes defaults to all three.
    expect(m.compatible_modes).toEqual(["evolving", "guided", "locked"]);
    expect(m.serves_use_cases).toEqual([]);
  });

  it("rejects a missing required field", () => {
    expect(() =>
      parseManifest(`version: 1.0.0\ndescription: x\nbundle_type: schema`)
    ).toThrow(ManifestError);
  });

  it("rejects an invalid bundle_type", () => {
    expect(() =>
      parseManifest(`name: x\nversion: 1.0.0\ndescription: y\nbundle_type: nonsense`)
    ).toThrow(/bundle_type/);
  });

  it("rejects a skill bundle that provides entity types", () => {
    expect(() =>
      parseManifest(
        `name: bad_skill\nversion: 1.0.0\ndescription: y\nbundle_type: skill\nprovides_entity_types:\n  - thing`
      )
    ).toThrow(/empty provides_entity_types/);
  });

  it("parses provides_skills objects and string shorthand", () => {
    const m = parseManifest(`
name: skills_bundle
version: 1.0.0
description: y
bundle_type: skill
requires_bundles:
  - core
provides_skills:
  - name: do-thing
    depth: core
    requires_entity_types:
      - task
  - bare-skill
`);
    expect(m.provides_skills).toHaveLength(2);
    expect(m.provides_skills[0]).toMatchObject({ name: "do-thing", depth: "core" });
    expect(m.provides_skills[0].requires_entity_types).toEqual(["task"]);
    expect(m.provides_skills[1]).toEqual({ name: "bare-skill" });
  });

  it("rejects an invalid compatible_modes value", () => {
    expect(() =>
      parseManifest(
        `name: x\nversion: 1.0.0\ndescription: y\nbundle_type: schema\ncompatible_modes:\n  - frozen`
      )
    ).toThrow(/compatible_modes/);
  });
});

describe("resolveRequires", () => {
  it("passes when all deps are present", () => {
    const bundles = [
      {
        dir: "/a",
        enabled: true,
        manifest: parseManifest(VALID_SCHEMA_MANIFEST),
      },
      {
        dir: "/b",
        enabled: true,
        manifest: parseManifest(`
name: needs_demo
version: 1.0.0
description: y
bundle_type: skill
requires_bundles:
  - demo_schema
`),
      },
    ];
    expect(() => resolveRequires(bundles)).not.toThrow();
  });

  it("throws on a missing dependency", () => {
    const bundles = [
      {
        dir: "/b",
        enabled: true,
        manifest: parseManifest(`
name: orphan
version: 1.0.0
description: y
bundle_type: skill
requires_bundles:
  - nonexistent
`),
      },
    ];
    expect(() => resolveRequires(bundles)).toThrow(/not installed/);
  });
});

describe("buildRegistry provided-entity-types", () => {
  it("indexes provided types from enabled bundles only", () => {
    const enabled = {
      dir: "/a",
      enabled: true,
      manifest: parseManifest(VALID_SCHEMA_MANIFEST),
    };
    const disabled = {
      dir: "/b",
      enabled: false,
      manifest: parseManifest(`
name: other_schema
version: 1.0.0
description: y
bundle_type: schema
provides_entity_types:
  - hidden
`),
    };
    const reg = buildRegistry([enabled, disabled]);
    expect(reg.providedEntityTypes.get("widget")).toBe("demo_schema");
    expect(reg.providedEntityTypes.has("hidden")).toBe(false);
  });
});

describe("default install (real bundle dirs)", () => {
  beforeEach(() => resetBundleRegistryForTesting());
  afterEach(() => resetBundleRegistryForTesting());

  it("discovers exactly the three default bundles", () => {
    const reg = getBundleRegistry();
    const names = reg.bundles.map((b) => b.manifest.name).sort();
    expect(names).toEqual(["core", "core_workflows", "infrastructure"]);
  });

  it("core_workflows is a skill bundle requiring core with empty provides", () => {
    const reg = getBundleRegistry();
    const cw = reg.bundles.find((b) => b.manifest.name === "core_workflows")!;
    expect(cw.manifest.bundle_type).toBe("skill");
    expect(cw.manifest.provides_entity_types).toEqual([]);
    expect(cw.manifest.requires_bundles).toContain("core");
    expect(cw.manifest.references_shared_schemas).toEqual(
      expect.arrayContaining(["interaction", "session_close"])
    );
  });

  it("default provides-set includes core + infrastructure types", () => {
    const provided = getProvidedEntityTypes();
    for (const t of [
      "conversation",
      "conversation_message",
      "agent_message",
      "note",
      "task",
      "event",
      "contact",
      "file_asset",
      "document",
      "issue",
      "plan",
      "subscription",
      "submission_config",
      "peer_config",
      "sandbox_abuse_report",
    ]) {
      expect(provided.has(t)).toBe(true);
    }
  });

  it("the real bundles resolve their requires", () => {
    const bundles = getBundleRegistry().bundles;
    expect(() => resolveRequires(bundles)).not.toThrow();
  });
});

describe("checkAutoCreateAllowed (mode enforcement)", () => {
  beforeEach(() => {
    resetSchemaModeCacheForTesting();
    resetBundleRegistryForTesting();
    delete process.env.NEOTOMA_SCHEMA_MODE;
  });
  afterEach(() => {
    delete process.env.NEOTOMA_SCHEMA_MODE;
    resetSchemaModeCacheForTesting();
    resetBundleRegistryForTesting();
  });

  it("evolving (default): any type allowed — parity", () => {
    const d = checkAutoCreateAllowed("totally_new_type");
    expect(d.allowed).toBe(true);
  });

  it("evolving via explicit override allows unknown types", () => {
    const d = checkAutoCreateAllowed("totally_new_type", "evolving");
    expect(d.allowed).toBe(true);
  });

  it("guided: bundle-provided type allowed", () => {
    const d = checkAutoCreateAllowed("task", "guided");
    expect(d.allowed).toBe(true);
  });

  it("guided: unprovided type blocked with structured reason", () => {
    const d = checkAutoCreateAllowed("totally_new_type", "guided");
    expect(d.allowed).toBe(false);
    if (!d.allowed) {
      expect(d.reason).toBe("guided_unprovided");
      expect(d.message).toMatch(/no bundle provides this type/i);
    }
  });

  it("locked: every type blocked with register instruction", () => {
    const d = checkAutoCreateAllowed("task", "locked");
    expect(d.allowed).toBe(false);
    if (!d.allowed) {
      expect(d.reason).toBe("locked");
      expect(d.message).toMatch(/register the type explicitly/i);
    }
  });

  it("reads the env var when no override is passed (guided)", () => {
    process.env.NEOTOMA_SCHEMA_MODE = "guided";
    resetSchemaModeCacheForTesting();
    expect(checkAutoCreateAllowed("contact").allowed).toBe(true);
    expect(checkAutoCreateAllowed("totally_new_type").allowed).toBe(false);
  });
});

describe("loadBundlesFrom (fixtures)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bundles-test-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("discovers bundle dirs and skips non-bundle dirs", () => {
    fs.mkdirSync(path.join(tmp, "alpha"));
    fs.writeFileSync(
      path.join(tmp, "alpha", "manifest.yaml"),
      `name: alpha\nversion: 1.0.0\ndescription: a\nbundle_type: schema\nprovides_entity_types:\n  - a1`
    );
    // _shared_schemas and a dir without manifest must be ignored.
    fs.mkdirSync(path.join(tmp, "_shared_schemas"));
    fs.mkdirSync(path.join(tmp, "not_a_bundle"));
    const loaded = loadBundlesFrom(tmp);
    expect(loaded.map((b) => b.manifest.name)).toEqual(["alpha"]);
  });

  it("propagates a malformed manifest as ManifestError", () => {
    fs.mkdirSync(path.join(tmp, "broken"));
    fs.writeFileSync(path.join(tmp, "broken", "manifest.yaml"), `name: broken`);
    expect(() => loadBundlesFrom(tmp)).toThrow(ManifestError);
  });
});

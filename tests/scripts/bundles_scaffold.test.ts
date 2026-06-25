import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseArgs, renderManifest, scaffoldBundle } from "../../scripts/bundles_scaffold.js";
import {
  loadBundlesFrom,
  parseManifest,
  resolveRequires,
} from "../../src/services/bundles/index.js";

/**
 * Mirrors the `npm run bundles:check` validation pipeline for a single bundles
 * root: load every manifest, then resolve requires/cycles. Throws on any
 * violation, so a passing call proves `bundles:check` would accept the bundle.
 */
function bundlesCheck(bundlesRoot: string): void {
  const bundles = loadBundlesFrom(bundlesRoot);
  expect(bundles.length).toBeGreaterThan(0);
  resolveRequires(bundles);
}

describe("bundles:scaffold", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bundles-scaffold-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("produces a schema-bundle manifest that bundles:check accepts", () => {
    const result = scaffoldBundle({ name: "demo_bundle", bundlesRoot: tmpRoot });

    expect(fs.existsSync(result.manifestPath)).toBe(true);
    for (const sub of ["schemas", "skills", "record_types", "tests"]) {
      expect(fs.existsSync(path.join(result.dir, sub, ".gitkeep"))).toBe(true);
    }

    // Manifest parses + normalizes (the parser enforces required fields).
    const manifest = parseManifest(
      fs.readFileSync(result.manifestPath, "utf8"),
      result.manifestPath
    );
    expect(manifest.name).toBe("demo_bundle");
    expect(manifest.bundle_type).toBe("schema");
    expect(manifest.compatible_modes).toEqual(["evolving", "guided", "locked"]);

    // Full bundles:check pipeline over the scaffolded root.
    expect(() => bundlesCheck(tmpRoot)).not.toThrow();
  });

  it("produces a skill-bundle manifest with empty provides_entity_types", () => {
    const result = scaffoldBundle({
      name: "demo_skills",
      type: "skill",
      bundlesRoot: tmpRoot,
    });
    const manifest = parseManifest(
      fs.readFileSync(result.manifestPath, "utf8"),
      result.manifestPath
    );
    expect(manifest.bundle_type).toBe("skill");
    expect(manifest.provides_entity_types).toEqual([]);
    expect(() => bundlesCheck(tmpRoot)).not.toThrow();
  });

  it("rejects an invalid (non-snake_case) bundle name", () => {
    expect(() => scaffoldBundle({ name: "Bad-Name", bundlesRoot: tmpRoot })).toThrow(/snake_case/);
  });

  it("refuses to overwrite an existing dir without --force", () => {
    scaffoldBundle({ name: "dup", bundlesRoot: tmpRoot });
    expect(() => scaffoldBundle({ name: "dup", bundlesRoot: tmpRoot })).toThrow(/already exists/);
    expect(() => scaffoldBundle({ name: "dup", force: true, bundlesRoot: tmpRoot })).not.toThrow();
  });

  it("renders a valid manifest body for both bundle types", () => {
    expect(parseManifest(renderManifest("x", "schema")).bundle_type).toBe("schema");
    expect(parseManifest(renderManifest("y", "skill")).bundle_type).toBe("skill");
  });

  describe("parseArgs", () => {
    it("parses name plus --type and --force", () => {
      expect(parseArgs(["my_bundle", "--type", "skill", "--force"])).toEqual({
        name: "my_bundle",
        type: "skill",
        force: true,
        bundlesRoot: undefined,
      });
    });

    it("throws when the bundle name is missing", () => {
      expect(() => parseArgs(["--force"])).toThrow(/missing bundle name/);
    });

    it("throws on an unknown option", () => {
      expect(() => parseArgs(["b", "--nope"])).toThrow(/unknown option/);
    });
  });
});

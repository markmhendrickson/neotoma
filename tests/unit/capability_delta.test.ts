/**
 * Unit tests for src/services/capability_delta.ts.
 *
 * Covers:
 * - loadCapabilityManifest: missing-file path returns null
 * - loadCapabilityManifest: malformed-JSON path returns null
 * - computeCapabilityDelta: identifies new and removed tools across version ranges
 * - computeCapabilityDelta: degrades gracefully when versions are unparseable
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadCapabilityManifest,
  computeCapabilityDelta,
  parseSemver,
  versionInRange,
} from "../../src/services/capability_delta.js";
import type { CapabilityManifest } from "../../src/shared/capability_manifest_types.js";

// ---------------------------------------------------------------------------
// loadCapabilityManifest — filesystem edge cases
// ---------------------------------------------------------------------------

describe("loadCapabilityManifest", () => {
  const testDirs: string[] = [];

  afterEach(() => {
    for (const dir of testDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
    testDirs.length = 0;
  });

  function makeTmpDir(): string {
    const dir = join(tmpdir(), `neotoma-cap-delta-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    testDirs.push(dir);
    return dir;
  }

  it("returns null when the manifest file does not exist", async () => {
    const root = makeTmpDir();
    // No src/shared/capability_manifest.json created — file is absent
    const result = await loadCapabilityManifest(root);
    expect(result).toBeNull();
  });

  it("returns null when the manifest file contains malformed JSON", async () => {
    const root = makeTmpDir();
    const sharedDir = join(root, "src", "shared");
    mkdirSync(sharedDir, { recursive: true });
    writeFileSync(join(sharedDir, "capability_manifest.json"), "{ this is not valid json }", "utf-8");
    const result = await loadCapabilityManifest(root);
    expect(result).toBeNull();
  });

  it("returns the parsed manifest when the file is valid JSON", async () => {
    const root = makeTmpDir();
    const sharedDir = join(root, "src", "shared");
    mkdirSync(sharedDir, { recursive: true });
    const manifest: CapabilityManifest = {
      _meta: {
        description: "test",
        generated_from: "test",
        first_tracked_version: "v0.1.0",
      },
      tools: {
        store: { addedInVersion: "v0.1.0" },
        retrieve_entities: { addedInVersion: "v0.2.0" },
      },
    };
    writeFileSync(join(sharedDir, "capability_manifest.json"), JSON.stringify(manifest), "utf-8");
    const result = await loadCapabilityManifest(root);
    expect(result).not.toBeNull();
    expect(result?.tools?.store?.addedInVersion).toBe("v0.1.0");
  });
});

// ---------------------------------------------------------------------------
// parseSemver
// ---------------------------------------------------------------------------

describe("parseSemver", () => {
  it("parses a bare semver string", () => {
    expect(parseSemver("1.2.3")).toEqual([1, 2, 3]);
  });

  it("parses a v-prefixed semver string", () => {
    expect(parseSemver("v0.16.0")).toEqual([0, 16, 0]);
  });

  it("returns null for non-semver strings", () => {
    expect(parseSemver("not-a-version")).toBeNull();
    expect(parseSemver("")).toBeNull();
    expect(parseSemver("1.2")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// versionInRange
// ---------------------------------------------------------------------------

describe("versionInRange", () => {
  it("returns true for a version strictly inside the range (exclusive low, inclusive high)", () => {
    expect(versionInRange("v0.5.0", "v0.4.0", "v0.5.0")).toBe(true);
  });

  it("returns false for a version equal to the lower bound (exclusive)", () => {
    expect(versionInRange("v0.4.0", "v0.4.0", "v0.6.0")).toBe(false);
  });

  it("returns false for a version below the range", () => {
    expect(versionInRange("v0.3.0", "v0.4.0", "v0.6.0")).toBe(false);
  });

  it("returns false when any version is unparseable", () => {
    expect(versionInRange("bad", "v0.1.0", "v0.2.0")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeCapabilityDelta
// ---------------------------------------------------------------------------

const SAMPLE_MANIFEST: CapabilityManifest = {
  _meta: {
    description: "test manifest",
    generated_from: "test",
    first_tracked_version: "v0.1.0",
  },
  tools: {
    store: { addedInVersion: "v0.1.0" },
    retrieve_entities: { addedInVersion: "v0.1.0" },
    identify_entity_by_signals: { addedInVersion: "v0.16.0" },
    legacy_tool: { addedInVersion: "v0.1.0", removedInVersion: "v0.16.0" },
  },
};

describe("computeCapabilityDelta", () => {
  it("identifies tools added in the upgrade range", () => {
    const result = computeCapabilityDelta({
      currentVersion: "v0.15.1",
      latestVersion: "v0.16.0",
      manifest: SAMPLE_MANIFEST,
    });
    expect(result.new_tools).toContain("identify_entity_by_signals");
    expect(result.new_tools).not.toContain("store");
    expect(result.new_tools).not.toContain("retrieve_entities");
  });

  it("identifies tools removed in the upgrade range", () => {
    const result = computeCapabilityDelta({
      currentVersion: "v0.15.1",
      latestVersion: "v0.16.0",
      manifest: SAMPLE_MANIFEST,
    });
    expect(result.removed_tools).toContain("legacy_tool");
  });

  it("returns empty arrays when already on latest version", () => {
    const result = computeCapabilityDelta({
      currentVersion: "v0.16.0",
      latestVersion: "v0.16.0",
      manifest: SAMPLE_MANIFEST,
    });
    expect(result.new_tools).toEqual([]);
    expect(result.removed_tools).toEqual([]);
    expect(result.capability_delta_recommendation).toBe("Already on the latest version.");
    expect(result.capability_delta_note).toBeUndefined();
  });

  it("degrades gracefully when currentVersion is unparseable", () => {
    const result = computeCapabilityDelta({
      currentVersion: "not-a-semver",
      latestVersion: "v0.16.0",
      manifest: SAMPLE_MANIFEST,
    });
    expect(result.new_tools).toEqual([]);
    expect(result.removed_tools).toEqual([]);
    expect(typeof result.capability_delta_note).toBe("string");
    expect(result.capability_delta_note).toContain("not-a-semver");
  });

  it("degrades gracefully when latestVersion is unparseable", () => {
    const result = computeCapabilityDelta({
      currentVersion: "v0.15.1",
      latestVersion: "nightly-build",
      manifest: SAMPLE_MANIFEST,
    });
    expect(result.new_tools).toEqual([]);
    expect(result.removed_tools).toEqual([]);
    expect(typeof result.capability_delta_note).toBe("string");
    expect(result.capability_delta_note).toContain("nightly-build");
  });

  it("returns a capability_delta_recommendation string in all paths", () => {
    const result = computeCapabilityDelta({
      currentVersion: "v0.15.1",
      latestVersion: "v0.16.0",
      manifest: SAMPLE_MANIFEST,
    });
    expect(typeof result.capability_delta_recommendation).toBe("string");
    expect(result.capability_delta_recommendation.length).toBeGreaterThan(0);
  });

  it("does not set capability_delta_note on a clean delta computation", () => {
    const result = computeCapabilityDelta({
      currentVersion: "v0.15.1",
      latestVersion: "v0.16.0",
      manifest: SAMPLE_MANIFEST,
    });
    // capability_delta_note must be absent (not just undefined) when computation succeeds
    expect(result.capability_delta_note).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(result, "capability_delta_note")).toBe(false);
  });
});

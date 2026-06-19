/**
 * Unit tests for the capability delta computation service.
 *
 * Covers: new tool detected, removed tool detected, no-delta case,
 * unknown-version graceful degradation, and recommendation string format.
 */

import { describe, expect, it } from "vitest";

import type { CapabilityManifest } from "../shared/capability_manifest_types.js";
import {
  computeCapabilityDelta,
  parseSemver,
  compareSemver,
  versionInRange,
} from "./capability_delta.js";

// ---------------------------------------------------------------------------
// Helpers / fixtures
// ---------------------------------------------------------------------------

function makeManifest(
  tools: Record<string, { addedInVersion: string; removedInVersion?: string }>
): CapabilityManifest {
  return {
    _meta: {
      description: "test",
      generated_from: "test",
      first_tracked_version: "v0.1.0",
    },
    tools,
  };
}

// ---------------------------------------------------------------------------
// parseSemver
// ---------------------------------------------------------------------------

describe("parseSemver", () => {
  it("parses bare semver", () => {
    expect(parseSemver("1.2.3")).toEqual([1, 2, 3]);
  });

  it("parses v-prefixed semver", () => {
    expect(parseSemver("v0.12.0")).toEqual([0, 12, 0]);
  });

  it("returns null for unparseable strings", () => {
    expect(parseSemver("latest")).toBeNull();
    expect(parseSemver("")).toBeNull();
    expect(parseSemver("1.2")).toBeNull();
  });

  it("handles pre-release suffix gracefully (strips it)", () => {
    expect(parseSemver("v0.16.0-rc.1")).toEqual([0, 16, 0]);
  });
});

// ---------------------------------------------------------------------------
// compareSemver
// ---------------------------------------------------------------------------

describe("compareSemver", () => {
  it("returns -1 when a < b", () => {
    expect(compareSemver([0, 11, 0], [0, 12, 0])).toBe(-1);
  });

  it("returns 1 when a > b", () => {
    expect(compareSemver([1, 0, 0], [0, 99, 99])).toBe(1);
  });

  it("returns 0 when equal", () => {
    expect(compareSemver([0, 16, 0], [0, 16, 0])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// versionInRange
// ---------------------------------------------------------------------------

describe("versionInRange", () => {
  it("returns true when v is strictly > from and <= to", () => {
    expect(versionInRange("v0.12.0", "v0.11.0", "v0.12.0")).toBe(true);
    expect(versionInRange("v0.11.5", "v0.11.0", "v0.12.0")).toBe(true);
  });

  it("returns false when v equals from (exclusive lower bound)", () => {
    expect(versionInRange("v0.11.0", "v0.11.0", "v0.12.0")).toBe(false);
  });

  it("returns false when v is above to", () => {
    expect(versionInRange("v0.13.0", "v0.11.0", "v0.12.0")).toBe(false);
  });

  it("returns false for unparseable version strings", () => {
    expect(versionInRange("latest", "v0.11.0", "v0.12.0")).toBe(false);
    expect(versionInRange("v0.12.0", "unknown", "v0.12.0")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeCapabilityDelta — new tool detected
// ---------------------------------------------------------------------------

describe("computeCapabilityDelta — new tools", () => {
  it("detects a tool added between current and latest", () => {
    const manifest = makeManifest({
      old_tool: { addedInVersion: "v0.10.0" },
      new_tool: { addedInVersion: "v0.12.0" },
    });

    const result = computeCapabilityDelta({
      currentVersion: "0.11.0",
      latestVersion: "0.12.0",
      manifest,
    });

    expect(result.new_tools).toEqual(["new_tool"]);
    expect(result.removed_tools).toEqual([]);
  });

  it("does not include a tool added before current version", () => {
    const manifest = makeManifest({
      old_tool: { addedInVersion: "v0.10.0" },
    });

    const result = computeCapabilityDelta({
      currentVersion: "0.11.0",
      latestVersion: "0.12.0",
      manifest,
    });

    expect(result.new_tools).toEqual([]);
  });

  it("includes a tool added exactly at the latest version boundary", () => {
    const manifest = makeManifest({
      boundary_tool: { addedInVersion: "v0.12.0" },
    });

    const result = computeCapabilityDelta({
      currentVersion: "0.11.0",
      latestVersion: "0.12.0",
      manifest,
    });

    expect(result.new_tools).toContain("boundary_tool");
  });
});

// ---------------------------------------------------------------------------
// computeCapabilityDelta — removed tool detected
// ---------------------------------------------------------------------------

describe("computeCapabilityDelta — removed tools", () => {
  it("detects a tool removed between current and latest", () => {
    const manifest = makeManifest({
      gone_tool: { addedInVersion: "v0.6.0", removedInVersion: "v0.12.0" },
    });

    const result = computeCapabilityDelta({
      currentVersion: "0.11.0",
      latestVersion: "0.12.0",
      manifest,
    });

    expect(result.removed_tools).toEqual(["gone_tool"]);
  });

  it("does not flag a tool removed before current version", () => {
    const manifest = makeManifest({
      already_gone: { addedInVersion: "v0.6.0", removedInVersion: "v0.10.0" },
    });

    const result = computeCapabilityDelta({
      currentVersion: "0.11.0",
      latestVersion: "0.12.0",
      manifest,
    });

    expect(result.removed_tools).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeCapabilityDelta — no-delta case
// ---------------------------------------------------------------------------

describe("computeCapabilityDelta — no delta", () => {
  it("returns empty arrays when no tools changed between versions", () => {
    const manifest = makeManifest({
      stable_tool: { addedInVersion: "v0.4.3" },
    });

    const result = computeCapabilityDelta({
      currentVersion: "0.15.0",
      latestVersion: "0.16.0",
      manifest,
    });

    expect(result.new_tools).toEqual([]);
    expect(result.removed_tools).toEqual([]);
  });

  it("returns empty arrays when current already equals latest", () => {
    const manifest = makeManifest({
      tool_a: { addedInVersion: "v0.16.0" },
    });

    const result = computeCapabilityDelta({
      currentVersion: "0.16.0",
      latestVersion: "0.16.0",
      manifest,
    });

    expect(result.new_tools).toEqual([]);
    expect(result.removed_tools).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeCapabilityDelta — unknown version graceful degradation
// ---------------------------------------------------------------------------

describe("computeCapabilityDelta — graceful degradation", () => {
  it("degrades gracefully on unparseable currentVersion", () => {
    const manifest = makeManifest({
      some_tool: { addedInVersion: "v0.12.0" },
    });

    const result = computeCapabilityDelta({
      currentVersion: "unknown",
      latestVersion: "0.12.0",
      manifest,
    });

    expect(result.new_tools).toEqual([]);
    expect(result.removed_tools).toEqual([]);
    expect(result.capability_delta_note).toMatch(/could not parse/i);
  });

  it("degrades gracefully on unparseable latestVersion", () => {
    const manifest = makeManifest({});

    const result = computeCapabilityDelta({
      currentVersion: "0.11.0",
      latestVersion: "latest",
      manifest,
    });

    expect(result.new_tools).toEqual([]);
    expect(result.capability_delta_note).toMatch(/could not parse/i);
  });

  it("still returns empty arrays on empty manifest tools map", () => {
    const manifest = makeManifest({});

    const result = computeCapabilityDelta({
      currentVersion: "0.11.0",
      latestVersion: "0.12.0",
      manifest,
    });

    expect(result.new_tools).toEqual([]);
    expect(result.removed_tools).toEqual([]);
    expect(result.capability_delta_recommendation).toMatch(/upgrade/i);
  });
});

// ---------------------------------------------------------------------------
// computeCapabilityDelta — recommendation string format
// ---------------------------------------------------------------------------

describe("computeCapabilityDelta — recommendation format", () => {
  it("names new tools in the recommendation", () => {
    const manifest = makeManifest({
      alpha_tool: { addedInVersion: "v0.12.0" },
      beta_tool: { addedInVersion: "v0.12.0" },
    });

    const result = computeCapabilityDelta({
      currentVersion: "0.11.0",
      latestVersion: "0.12.0",
      manifest,
    });

    expect(result.capability_delta_recommendation).toContain("alpha_tool");
    expect(result.capability_delta_recommendation).toContain("beta_tool");
    expect(result.capability_delta_recommendation).toMatch(/upgrade/i);
  });

  it("mentions removed tools in the recommendation", () => {
    const manifest = makeManifest({
      legacy_tool: { addedInVersion: "v0.6.0", removedInVersion: "v0.12.0" },
    });

    const result = computeCapabilityDelta({
      currentVersion: "0.11.0",
      latestVersion: "0.12.0",
      manifest,
    });

    expect(result.capability_delta_recommendation).toContain("legacy_tool");
    expect(result.capability_delta_recommendation).toMatch(/deprecated/i);
  });

  it("produces a clean no-change recommendation when already up to date", () => {
    const manifest = makeManifest({});

    const result = computeCapabilityDelta({
      currentVersion: "0.16.0",
      latestVersion: "0.16.0",
      manifest,
    });

    expect(result.capability_delta_recommendation).toMatch(/latest/i);
  });

  it("sorts new_tools and removed_tools alphabetically", () => {
    const manifest = makeManifest({
      zebra_tool: { addedInVersion: "v0.12.0" },
      apple_tool: { addedInVersion: "v0.12.0" },
      mango_tool: { addedInVersion: "v0.12.0" },
    });

    const result = computeCapabilityDelta({
      currentVersion: "0.11.0",
      latestVersion: "0.12.0",
      manifest,
    });

    expect(result.new_tools).toEqual(["apple_tool", "mango_tool", "zebra_tool"]);
  });
});

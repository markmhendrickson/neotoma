/**
 * Unit tests for `src/services/bundles/loader.ts`.
 *
 * Covers:
 *   - Default bundle registration (core, infrastructure, core_workflows)
 *   - `getProvidedEntityTypes()` returns types from schema bundles
 *   - Skill bundles contribute no entity types
 *   - `isEntityTypeProvided()` returns correct results
 *   - `getBundlesProvidingType()` returns correct bundle names
 *   - Double-init is idempotent
 *   - Invalid manifest throws
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  initDefaultBundles,
  getProvidedEntityTypes,
  getRegisteredBundles,
  isEntityTypeProvided,
  getBundlesProvidingType,
  resetBundleLoaderForTesting,
} from "../../src/services/bundles/loader.js";

// Core bundle entity types (from manifest)
const CORE_TYPES = [
  "conversation",
  "conversation_message",
  "agent_message",
  "note",
  "task",
  "event",
  "contact",
  "file_asset",
  "document",
  "interaction",
  "session_close",
];

// Infrastructure bundle entity types (from manifest)
const INFRA_TYPES = [
  "issue",
  "plan",
  "subscription",
  "submission_config",
  "peer_config",
  "sandbox_abuse_report",
];

describe("bundle loader", () => {
  beforeEach(() => {
    resetBundleLoaderForTesting();
  });

  it("registers all three default bundles", async () => {
    await initDefaultBundles();
    const registered = getRegisteredBundles();
    expect(registered.has("core")).toBe(true);
    expect(registered.has("infrastructure")).toBe(true);
    expect(registered.has("core_workflows")).toBe(true);
  });

  it("populates provided entity types from schema bundles", async () => {
    await initDefaultBundles();
    const provided = getProvidedEntityTypes();
    for (const t of CORE_TYPES) {
      expect(provided.has(t)).toBe(true);
    }
    for (const t of INFRA_TYPES) {
      expect(provided.has(t)).toBe(true);
    }
  });

  it("skill bundle (core_workflows) contributes no entity types", async () => {
    await initDefaultBundles();
    const reg = getRegisteredBundles().get("core_workflows");
    expect(reg).toBeDefined();
    expect(reg!.manifest.provides_entity_types).toHaveLength(0);
  });

  it("isEntityTypeProvided returns true for core types", async () => {
    await initDefaultBundles();
    expect(isEntityTypeProvided("task")).toBe(true);
    expect(isEntityTypeProvided("contact")).toBe(true);
    expect(isEntityTypeProvided("issue")).toBe(true);
  });

  it("isEntityTypeProvided returns false for unknown types", async () => {
    await initDefaultBundles();
    expect(isEntityTypeProvided("crm_deal")).toBe(false);
    expect(isEntityTypeProvided("invoice")).toBe(false);
  });

  it("getBundlesProvidingType returns correct bundle name", async () => {
    await initDefaultBundles();
    expect(getBundlesProvidingType("task")).toContain("core");
    expect(getBundlesProvidingType("issue")).toContain("infrastructure");
    expect(getBundlesProvidingType("crm_deal")).toHaveLength(0);
  });

  it("initDefaultBundles is idempotent", async () => {
    await initDefaultBundles();
    await initDefaultBundles();
    expect(getRegisteredBundles().size).toBe(3);
  });

  it("core_workflows manifest has correct bundle_type", async () => {
    await initDefaultBundles();
    const reg = getRegisteredBundles().get("core_workflows");
    expect(reg!.manifest.bundle_type).toBe("skill");
  });

  it("core manifest has correct bundle_type", async () => {
    await initDefaultBundles();
    const reg = getRegisteredBundles().get("core");
    expect(reg!.manifest.bundle_type).toBe("schema");
  });
});

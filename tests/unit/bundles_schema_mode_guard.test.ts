/**
 * Unit tests for `src/services/bundles/schema_mode_guard.ts`.
 *
 * Covers:
 *   - `evolving`: assertEntityTypeAllowed never throws
 *   - `guided`: passes for provided types, throws SchemaModeBlockedError for unknown
 *   - `locked`: always throws SchemaModeBlockedError
 *   - Error payload shape: error_code, entity_type, schema_mode, available_bundles
 *   - `available_bundles` populated correctly in guided mode
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  assertEntityTypeAllowed,
  SchemaModeBlockedError,
} from "../../src/services/bundles/schema_mode_guard.js";
import { resetSchemaModeCacheForTesting } from "../../src/services/schema_mode.js";
import {
  initDefaultBundles,
  resetBundleLoaderForTesting,
} from "../../src/services/bundles/loader.js";

function setMode(mode: string) {
  process.env.NEOTOMA_SCHEMA_MODE = mode;
  resetSchemaModeCacheForTesting();
}

describe("schema_mode_guard — evolving mode", () => {
  beforeEach(async () => {
    resetBundleLoaderForTesting();
    await initDefaultBundles();
    setMode("evolving");
  });
  afterEach(() => {
    delete process.env.NEOTOMA_SCHEMA_MODE;
    resetSchemaModeCacheForTesting();
    resetBundleLoaderForTesting();
  });

  it("allows any entity type", () => {
    expect(() => assertEntityTypeAllowed("task")).not.toThrow();
    expect(() => assertEntityTypeAllowed("crm_deal")).not.toThrow();
    expect(() => assertEntityTypeAllowed("completely_unknown_type")).not.toThrow();
  });
});

describe("schema_mode_guard — guided mode", () => {
  beforeEach(async () => {
    resetBundleLoaderForTesting();
    await initDefaultBundles();
    setMode("guided");
  });
  afterEach(() => {
    delete process.env.NEOTOMA_SCHEMA_MODE;
    resetSchemaModeCacheForTesting();
    resetBundleLoaderForTesting();
  });

  it("allows entity types provided by installed bundles", () => {
    expect(() => assertEntityTypeAllowed("task")).not.toThrow();
    expect(() => assertEntityTypeAllowed("contact")).not.toThrow();
    expect(() => assertEntityTypeAllowed("issue")).not.toThrow();
    expect(() => assertEntityTypeAllowed("plan")).not.toThrow();
  });

  it("throws SchemaModeBlockedError for unknown entity types", () => {
    expect(() => assertEntityTypeAllowed("crm_deal")).toThrow(SchemaModeBlockedError);
  });

  it("error payload has correct error_code", () => {
    try {
      assertEntityTypeAllowed("crm_deal");
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaModeBlockedError);
      expect((err as SchemaModeBlockedError).payload.error_code).toBe("SCHEMA_NOT_REGISTERED");
    }
  });

  it("error payload has correct entity_type", () => {
    try {
      assertEntityTypeAllowed("invoice_line");
    } catch (err) {
      expect((err as SchemaModeBlockedError).payload.entity_type).toBe("invoice_line");
    }
  });

  it("error payload has schema_mode=guided", () => {
    try {
      assertEntityTypeAllowed("unknown_type");
    } catch (err) {
      expect((err as SchemaModeBlockedError).payload.schema_mode).toBe("guided");
    }
  });

  it("error payload available_bundles is empty for truly unknown type", () => {
    try {
      assertEntityTypeAllowed("truly_unknown_type_xyz");
    } catch (err) {
      expect((err as SchemaModeBlockedError).payload.available_bundles).toHaveLength(0);
    }
  });
});

describe("schema_mode_guard — locked mode", () => {
  beforeEach(async () => {
    resetBundleLoaderForTesting();
    await initDefaultBundles();
    setMode("locked");
  });
  afterEach(() => {
    delete process.env.NEOTOMA_SCHEMA_MODE;
    resetSchemaModeCacheForTesting();
    resetBundleLoaderForTesting();
  });

  it("throws for any entity type including core types", () => {
    expect(() => assertEntityTypeAllowed("task")).toThrow(SchemaModeBlockedError);
    expect(() => assertEntityTypeAllowed("contact")).toThrow(SchemaModeBlockedError);
  });

  it("throws for unknown entity types", () => {
    expect(() => assertEntityTypeAllowed("crm_deal")).toThrow(SchemaModeBlockedError);
  });

  it("error payload has schema_mode=locked", () => {
    try {
      assertEntityTypeAllowed("task");
    } catch (err) {
      expect((err as SchemaModeBlockedError).payload.schema_mode).toBe("locked");
    }
  });

  it("error payload available_bundles is empty in locked mode", () => {
    try {
      assertEntityTypeAllowed("task");
    } catch (err) {
      expect((err as SchemaModeBlockedError).payload.available_bundles).toHaveLength(0);
    }
  });

  it("error payload error_code is SCHEMA_NOT_REGISTERED", () => {
    try {
      assertEntityTypeAllowed("task");
    } catch (err) {
      expect((err as SchemaModeBlockedError).payload.error_code).toBe("SCHEMA_NOT_REGISTERED");
    }
  });
});

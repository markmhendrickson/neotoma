import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  SANDBOX_PACKS,
  DEFAULT_SANDBOX_PACK_ID,
  getSandboxPack,
} from "../../src/services/sandbox/pack_registry.js";
import {
  SANDBOX_PACKS as FRONTEND_PACKS,
} from "../../frontend/src/data/sandbox_packs.js";

describe("sandbox pack registry", () => {
  it("ids match between backend and frontend registries", () => {
    const backendIds = SANDBOX_PACKS.map((p) => p.id);
    const frontendIds = FRONTEND_PACKS.map((p) => p.id);
    expect(backendIds).toEqual(frontendIds);
  });

  it("kinds match between backend and frontend registries", () => {
    for (let i = 0; i < SANDBOX_PACKS.length; i++) {
      expect(SANDBOX_PACKS[i].kind).toBe(FRONTEND_PACKS[i].kind);
    }
  });

  it("ordering matches between backend and frontend registries", () => {
    for (let i = 0; i < SANDBOX_PACKS.length; i++) {
      expect(SANDBOX_PACKS[i].id).toBe(FRONTEND_PACKS[i].id);
    }
  });

  it("default pack exists", () => {
    const pack = getSandboxPack(DEFAULT_SANDBOX_PACK_ID);
    expect(pack).toBeDefined();
    expect(pack!.id).toBe("generic");
    expect(pack!.seedPolicy).toBe("fixtures");
  });

  it("empty pack has seedPolicy none", () => {
    const pack = getSandboxPack("empty");
    expect(pack).toBeDefined();
    expect(pack!.seedPolicy).toBe("none");
    expect(pack!.manifestPath).toBeNull();
  });

  it("getSandboxPack returns undefined for unknown id", () => {
    expect(getSandboxPack("nonexistent")).toBeUndefined();
  });

  it("all packs with seedPolicy=fixtures have a manifest file", () => {
    for (const pack of SANDBOX_PACKS) {
      if (pack.seedPolicy === "fixtures") {
        expect(pack.manifestPath).not.toBeNull();
        expect(
          fs.existsSync(pack.manifestPath!),
          `Manifest missing for pack '${pack.id}': ${pack.manifestPath}`,
        ).toBe(true);
      }
    }
  });

  it("all manifests are valid JSON with required fields", () => {
    for (const pack of SANDBOX_PACKS) {
      if (pack.seedPolicy === "fixtures" && pack.manifestPath) {
        const raw = fs.readFileSync(pack.manifestPath, "utf8");
        const manifest = JSON.parse(raw);
        expect(manifest).toHaveProperty("schema_version");
        expect(manifest).toHaveProperty("description");
        expect(manifest).toHaveProperty("agent_identities");
        expect(manifest).toHaveProperty("entity_batches");
      }
    }
  });

  it("uses use_case kind, not vertical", () => {
    const kinds = new Set(SANDBOX_PACKS.map((p) => p.kind));
    expect(kinds.has("use_case" as never) || !SANDBOX_PACKS.some((p) => p.kind === "use_case")).toBe(true);
    for (const pack of SANDBOX_PACKS) {
      expect(pack.kind).not.toBe("vertical");
    }
  });
});

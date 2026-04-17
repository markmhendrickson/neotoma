/**
 * Unit tests for the canonical markdown mirror subsystem.
 *
 * Focus: pure slug/path helpers + the write/remove helpers exercised against
 * a tmp directory with `NEOTOMA_MIRROR_PATH` set. DB-driven paths (index
 * regeneration, rebuildMirror) are covered by integration tests that run
 * against the full SQLite harness.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import {
  entitySlug,
  relationshipSlug,
  mirrorPaths,
  getMirrorConfig,
  ALL_MIRROR_KINDS,
} from "./canonical_mirror.js";

describe("canonical_mirror", () => {
  let tmpRoot: string;
  let originalEnabled: string | undefined;
  let originalPath: string | undefined;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), "neotoma-mirror-test-"));
    originalEnabled = process.env.NEOTOMA_MIRROR_ENABLED;
    originalPath = process.env.NEOTOMA_MIRROR_PATH;
    process.env.NEOTOMA_MIRROR_ENABLED = "true";
    process.env.NEOTOMA_MIRROR_PATH = tmpRoot;
  });

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.NEOTOMA_MIRROR_ENABLED;
    else process.env.NEOTOMA_MIRROR_ENABLED = originalEnabled;
    if (originalPath === undefined) delete process.env.NEOTOMA_MIRROR_PATH;
    else process.env.NEOTOMA_MIRROR_PATH = originalPath;
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe("entitySlug", () => {
    it("is deterministic for the same inputs", () => {
      const a = entitySlug("ent_abc123", "Sarah Johnson");
      const b = entitySlug("ent_abc123", "Sarah Johnson");
      expect(a).toBe(b);
    });

    it("derives slug from canonical name and appends short id hash", () => {
      const slug = entitySlug("ent_abc123", "Sarah Johnson");
      expect(slug.startsWith("sarah-johnson-")).toBe(true);
      // Short hash suffix: 8 hex chars.
      expect(slug).toMatch(/sarah-johnson-[0-9a-f]{8}$/);
    });

    it("falls back to a stable placeholder slug when canonical name is empty", () => {
      const slug = entitySlug("ent_abc123", "");
      expect(slug).toMatch(/^untitled-[0-9a-f]{8}$/);
    });

    it("normalizes unicode and punctuation", () => {
      const slug = entitySlug("ent_xyz", "Café — Déjà vu!");
      expect(slug.startsWith("cafe-deja-vu-")).toBe(true);
    });
  });

  describe("relationshipSlug", () => {
    it("encodes type and endpoints and is deterministic", () => {
      const a = relationshipSlug("key1", "src_1", "tgt_2", "WORKS_WITH");
      const b = relationshipSlug("key1", "src_1", "tgt_2", "WORKS_WITH");
      expect(a).toBe(b);
      expect(a.startsWith("WORKS_WITH__src-1__tgt-2-")).toBe(true);
    });

    it("produces different slugs for different keys", () => {
      const a = relationshipSlug("key1", "src_1", "tgt_2", "WORKS_WITH");
      const b = relationshipSlug("key2", "src_1", "tgt_2", "WORKS_WITH");
      expect(a).not.toBe(b);
    });
  });

  describe("mirrorPaths", () => {
    it("returns all expected top-level directories beneath the root", () => {
      const p = mirrorPaths({
        enabled: true,
        path: tmpRoot,
        kinds: [...ALL_MIRROR_KINDS],
        git_enabled: false,
        memory_export: { enabled: false, path: "MEMORY.md", limit_lines: 200 },
      });
      expect(p.root).toBe(tmpRoot);
      expect(p.entities).toBe(path.join(tmpRoot, "entities"));
      expect(p.relationships).toBe(path.join(tmpRoot, "relationships"));
      expect(p.sources).toBe(path.join(tmpRoot, "sources"));
      expect(p.timeline).toBe(path.join(tmpRoot, "timeline"));
      expect(p.schemas).toBe(path.join(tmpRoot, "schemas"));
      expect(p.topIndex).toBe(path.join(tmpRoot, "index.md"));
    });
  });

  describe("getMirrorConfig", () => {
    it("honours NEOTOMA_MIRROR_ENABLED and NEOTOMA_MIRROR_PATH env vars", () => {
      const cfg = getMirrorConfig();
      expect(cfg.enabled).toBe(true);
      expect(cfg.path).toBe(tmpRoot);
    });

    it("restricts kinds via NEOTOMA_MIRROR_KINDS", () => {
      process.env.NEOTOMA_MIRROR_KINDS = "entities,schemas";
      try {
        const cfg = getMirrorConfig();
        expect(cfg.kinds).toEqual(["entities", "schemas"]);
      } finally {
        delete process.env.NEOTOMA_MIRROR_KINDS;
      }
    });
  });

  describe("mirrorSource", () => {
    it("writes a deterministic markdown file and is idempotent", async () => {
      const { mirrorSource } = await import("./canonical_mirror.js");
      const src = {
        id: "src_test_001",
        content_hash: "sha256:abcd",
        mime_type: "application/pdf",
        file_name: "invoice.pdf",
        original_filename: "invoice_2026_04_17.pdf",
        byte_size: 12345,
        source_type: "file_upload",
        created_at: "2026-04-17T10:00:00.000Z",
      };
      await mirrorSource(src);
      const filePath = path.join(tmpRoot, "sources", "src_test_001.md");
      const firstStat = await stat(filePath);
      const firstContent = await readFile(filePath, "utf8");

      expect(firstContent).toContain("src_test_001");
      expect(firstContent).toContain("invoice_2026_04_17.pdf");
      expect(firstContent.toLowerCase()).toContain("do not edit");
      expect(firstContent).toContain("12345");

      // Small delay so mtime would change if a write occurs.
      await new Promise((r) => setTimeout(r, 10));

      // Second call with identical content: must not rewrite (no mtime change).
      await mirrorSource(src);
      const secondStat = await stat(filePath);
      const secondContent = await readFile(filePath, "utf8");
      expect(secondContent).toBe(firstContent);
      expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);
    });
  });

  describe("mirror kind gating", () => {
    it("no-ops when mirror is disabled", async () => {
      process.env.NEOTOMA_MIRROR_ENABLED = "false";
      const { mirrorSource } = await import("./canonical_mirror.js");
      await mirrorSource({
        id: "src_disabled_001",
        content_hash: "sha256:d1",
        mime_type: "text/plain",
        file_name: "x.txt",
        source_type: "file_upload",
        created_at: "2026-04-17T10:00:00.000Z",
      });
      // No file should have been created under the tmp root.
      let exists = true;
      try {
        await stat(path.join(tmpRoot, "sources", "src_disabled_001.md"));
      } catch {
        exists = false;
      }
      expect(exists).toBe(false);
    });

    it("no-ops when the specific kind is not enabled", async () => {
      process.env.NEOTOMA_MIRROR_KINDS = "entities";
      try {
        const { mirrorSource } = await import("./canonical_mirror.js");
        await mirrorSource({
          id: "src_kind_gated_001",
          content_hash: "sha256:d2",
          mime_type: "text/plain",
          file_name: "y.txt",
          source_type: "file_upload",
          created_at: "2026-04-17T10:00:00.000Z",
        });
        let exists = true;
        try {
          await stat(path.join(tmpRoot, "sources", "src_kind_gated_001.md"));
        } catch {
          exists = false;
        }
        expect(exists).toBe(false);
      } finally {
        delete process.env.NEOTOMA_MIRROR_KINDS;
      }
    });
  });
});

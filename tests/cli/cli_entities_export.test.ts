/**
 * CLI `entities export` tests (in-process, mock-fetch).
 *
 * `entities export` is the inverse of `entities import`: it pages through all
 * entities via POST /entities/query and emits import-compatible JSONL — one
 * object per line, `entity_type` plus the snapshot's fields flattened to the top
 * level, which is exactly the shape `entities import` consumes. This is the
 * export half of the leave-and-rebuild round-trip (docs/developer/exit_rebuild_test.md,
 * commitment #6 in adopter_dependency_commitments.md).
 *
 * The key behaviors under test:
 *  - it pages /entities/query until `total` is reached
 *  - each emitted line is flat (entity_type at top level + snapshot fields),
 *    NOT the nested EntitySnapshot shape, so the output round-trips into import
 *  - reducer metadata (entity_id, provenance) is dropped — identity is
 *    re-derived deterministically on import
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";

type CliModule = { runCli: (argv: string[]) => Promise<void> };

async function loadCli(): Promise<CliModule> {
  vi.resetModules();
  return (await import("../../src/cli/index.ts")) as CliModule;
}

interface ExportedSnapshot {
  entity_id: string;
  entity_type: string;
  snapshot: Record<string, unknown>;
  provenance?: Record<string, string>;
}

/**
 * Mock POST /entities/query with a fixed corpus, paged by limit/offset.
 * Returns { entities, total } like the real endpoint.
 */
async function withQueryMock<T>(
  corpus: ExportedSnapshot[],
  callback: () => Promise<T>
): Promise<T> {
  const fetchMock = vi.fn(async (input: RequestInfo | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes("/entities/query")) {
      let bodyText: string | undefined;
      if (typeof init?.body === "string") bodyText = init.body;
      else if (typeof input !== "string" && typeof (input as Request).clone === "function") {
        bodyText = await (input as Request).clone().text();
      }
      const body = bodyText ? (JSON.parse(bodyText) as { limit?: number; offset?: number }) : {};
      const limit = body.limit ?? 500;
      const offset = body.offset ?? 0;
      const page = corpus.slice(offset, offset + limit);
      return new Response(JSON.stringify({ entities: page, total: corpus.length }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  try {
    return await callback();
  } finally {
    vi.unstubAllGlobals();
  }
}

async function withTempHome<T>(callback: (homeDir: string) => Promise<T>): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-export-"));
  const prevHome = process.env.HOME;
  const prevProfile = process.env.USERPROFILE;
  process.env.HOME = tempDir;
  process.env.USERPROFILE = tempDir;
  const configDir = path.join(tempDir, ".config", "neotoma");
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    path.join(configDir, "config.json"),
    JSON.stringify({
      base_url: "http://localhost:9999",
      access_token: "token-test",
      expires_at: "2099-01-01T00:00:00Z",
    })
  );
  try {
    return await callback(tempDir);
  } finally {
    process.env.HOME = prevHome;
    process.env.USERPROFILE = prevProfile;
  }
}

describe("CLI entities export (exit-rebuild round-trip, #6)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("emits import-compatible JSONL: entity_type plus flattened snapshot fields, one per line", async () => {
    await withTempHome(async (home) => {
      const corpus: ExportedSnapshot[] = [
        {
          entity_id: "ent_aaa",
          entity_type: "contact",
          snapshot: { name: "Sarah Chen", role: "Partner" },
          provenance: { name: "obs_1" },
        },
        {
          entity_id: "ent_bbb",
          entity_type: "contact",
          snapshot: { name: "James Patel", role: "Founder" },
          provenance: { name: "obs_2" },
        },
      ];
      const out = path.join(home, "export.jsonl");
      await withQueryMock(corpus, async () => {
        const { runCli } = await loadCli();
        await runCli([
          "node",
          "cli",
          "entities",
          "export",
          "--base-url",
          "http://localhost:9999",
          "--type",
          "contact",
          "--out",
          out,
        ]);
      });

      const written = await fs.readFile(out, "utf8");
      const lines = written.trim().split("\n");
      expect(lines).toHaveLength(2);

      const first = JSON.parse(lines[0]) as Record<string, unknown>;
      // Flat, import-shaped: entity_type + snapshot fields at the TOP level.
      expect(first.entity_type).toBe("contact");
      expect(first.name).toBe("Sarah Chen");
      expect(first.role).toBe("Partner");
      // Nested snapshot wrapper and reducer metadata are NOT present (so the
      // line round-trips straight into `entities import`).
      expect(first.snapshot).toBeUndefined();
      expect(first.entity_id).toBeUndefined();
      expect(first.provenance).toBeUndefined();
    });
  });

  it("pages /entities/query until total is reached", async () => {
    await withTempHome(async (home) => {
      const corpus: ExportedSnapshot[] = Array.from({ length: 7 }, (_, i) => ({
        entity_id: `ent_${i}`,
        entity_type: "contact",
        snapshot: { name: `Contact ${i}` },
      }));
      const out = path.join(home, "export.jsonl");
      await withQueryMock(corpus, async () => {
        const { runCli } = await loadCli();
        await runCli([
          "node",
          "cli",
          "entities",
          "export",
          "--base-url",
          "http://localhost:9999",
          "--page-size",
          "3",
          "--out",
          out,
        ]);
      });
      const lines = (await fs.readFile(out, "utf8")).trim().split("\n");
      expect(lines).toHaveLength(7);
      const names = lines.map((l) => (JSON.parse(l) as { name: string }).name).sort();
      expect(names).toContain("Contact 0");
      expect(names).toContain("Contact 6");
    });
  });

  it("pins a stable paging sort so the round-trip is reproducible", async () => {
    await withTempHome(async (home) => {
      const corpus: ExportedSnapshot[] = [
        { entity_id: "ent_a", entity_type: "contact", snapshot: { name: "A" } },
      ];
      const sortFields: Array<{ sort_by?: unknown; sort_order?: unknown }> = [];
      const fetchMock = vi.fn(async (input: RequestInfo | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url.includes("/entities/query")) {
          let bodyText: string | undefined;
          if (typeof init?.body === "string") bodyText = init.body;
          else if (typeof input !== "string" && typeof (input as Request).clone === "function") {
            bodyText = await (input as Request).clone().text();
          }
          const body = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
          sortFields.push({ sort_by: body.sort_by, sort_order: body.sort_order });
          const offset = (body.offset as number) ?? 0;
          return new Response(
            JSON.stringify({ entities: corpus.slice(offset), total: corpus.length }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
      });
      vi.stubGlobal("fetch", fetchMock);
      try {
        const { runCli } = await loadCli();
        await runCli([
          "node",
          "cli",
          "entities",
          "export",
          "--base-url",
          "http://localhost:9999",
          "--out",
          path.join(home, "export.jsonl"),
        ]);
      } finally {
        vi.unstubAllGlobals();
      }
      // Every page request must pin a deterministic order so the export is not
      // at the mercy of the endpoint's evolving default sort.
      expect(sortFields.length).toBeGreaterThan(0);
      for (const s of sortFields) {
        expect(s.sort_by).toBe("entity_id");
        expect(s.sort_order).toBe("asc");
      }
    });
  });

  it("refuses --with-relationships without --out rather than silently dropping edges", async () => {
    await withTempHome(async () => {
      await withQueryMock([], async () => {
        const { runCli } = await loadCli();
        await expect(
          runCli([
            "node",
            "cli",
            "entities",
            "export",
            "--base-url",
            "http://localhost:9999",
            "--with-relationships",
          ])
        ).rejects.toThrow(/--with-relationships requires --out/);
      });
    });
  });
});

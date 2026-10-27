import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertSiteBuildHead,
  parseSiteHttpInput,
  readSiteHttp,
  resolveStaticFile,
} from "../../packages/eval-harness/src/site_http";

const BASE = "http://127.0.0.1:41234";
afterEach(() => vi.unstubAllGlobals());

describe("closed website eval HTTP reader", () => {
  it("rejects URLs, traversal, encoded paths, and unknown fields before fetch", () => {
    for (const path of [
      "https://example.invalid/",
      "/../private",
      "/%2e%2e/private",
      "/%2fetc",
      "/es\\..\\private",
      "/unknown",
    ]) {
      expect(() => parseSiteHttpInput({ operation: "static_html", path })).toThrow();
    }
    expect(() =>
      parseSiteHttpInput({ operation: "root_json", path: "/", url: "https://example.invalid" })
    ).toThrow();
  });

  it("rejects a missing build and a symlink outside the build root", () => {
    const root = mkdtempSync(join(tmpdir(), "site-http-test-"));
    try {
      expect(() => resolveStaticFile(root, "/")).toThrow();
      mkdirSync(join(root, "es"));
      const outside = join(tmpdir(), `site-http-private-${process.pid}.html`);
      writeFileSync(outside, "private");
      try {
        symlinkSync(outside, join(root, "es", "index.html"));
        expect(() => resolveStaticFile(root, "/es")).toThrow(/escaped build root/);
      } finally {
        rmSync(outside, { force: true });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a static export generated from another commit", () => {
    const root = mkdtempSync(join(tmpdir(), "site-http-head-"));
    try {
      mkdirSync(join(root, "es"));
      writeFileSync(
        join(root, "index.html"),
        '<!DOCTYPE html><html><meta name="neotoma-ui-head" content="old"></html>'
      );
      writeFileSync(
        join(root, "es", "index.html"),
        '<!DOCTYPE html><html><meta name="neotoma-ui-head" content="old"></html>'
      );
      expect(() => assertSiteBuildHead(root, "a".repeat(40))).toThrow(/exact-head/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    [
      "off-origin redirect",
      new Response("", { status: 302, headers: { location: "https://example.invalid/private" } }),
    ],
    ["non-2xx", new Response("missing", { status: 404, headers: { "content-type": "text/html" } })],
    [
      "wrong content type",
      new Response("{}", { status: 200, headers: { "content-type": "text/plain" } }),
    ],
    [
      "malformed JSON",
      new Response("{", { status: 200, headers: { "content-type": "application/json" } }),
    ],
  ])("fails closed on %s", async (_label, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(readSiteHttp({ operation: "root_json", path: "/" }, BASE, BASE)).rejects.toThrow();
  });

  it("rejects an oversized body before consuming it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("x", {
          status: 200,
          headers: { "content-type": "text/html", "content-length": "2000001" },
        })
      )
    );
    await expect(readSiteHttp({ operation: "static_html", path: "/" }, BASE, BASE)).rejects.toThrow(
      /too large/
    );
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSiteBuildHead,
  parseSiteHttpInput,
  readSiteHttp,
  resolveStaticFile,
  validateSiteCassette,
  validateSiteScenario,
} from "../../packages/eval-harness/src/site_http";
import { readCassette } from "../../packages/eval-harness/src/cassette";
import { loadScenarioFile } from "../../packages/eval-harness/src/scenario";

const BASE = "http://127.0.0.1:41234";
const repoRoot = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
afterEach(() => vi.unstubAllGlobals());

describe("closed website eval HTTP reader", () => {
  it("rejects a weakened assertion contract or canned cassette output", () => {
    const packageRoot = join(repoRoot, "packages", "eval-harness");
    const scenario = loadScenarioFile(
      join(packageRoot, "scenarios", "site_publication_http_contract.scenario.yaml")
    );
    const cassette = readCassette(
      join(
        packageRoot,
        "cassettes",
        "site_publication_http_contract__stub__replay-only.cassette.json"
      )
    )?.cassette;
    expect(cassette).toBeDefined();
    validateSiteScenario(scenario);
    validateSiteCassette(cassette!, scenario);
    expect(() =>
      validateSiteScenario({
        ...scenario,
        expected: scenario.expected.filter(
          (assertion) => !(assertion.tool_name === "site_http" && assertion.which === 0)
        ),
      })
    ).toThrow(/root guidance/);
    expect(() =>
      validateSiteScenario({
        ...scenario,
        expected: scenario.expected.filter(
          (assertion) =>
            !(
              assertion.which === 1 &&
              assertion.result_contains === 'href="/install/system-changes/"'
            )
        ),
      })
    ).toThrow(/static route assertion/);
    for (let which = 1; which <= 10; which++) {
      for (const identityCheck of ["h1", "h2_text"]) {
        expect(() =>
          validateSiteScenario({
            ...scenario,
            expected: scenario.expected.filter(
              (assertion) =>
                !(
                  assertion.which === which &&
                  (identityCheck === "h1"
                    ? assertion.result_subset?.h1 !== undefined
                    : assertion.result_key === "h2_text")
                )
            ),
          })
        ).toThrow(/static route assertion/);
      }
    }
    expect(() =>
      validateSiteCassette(
        {
          ...cassette!,
          tool_calls: [
            { ...cassette!.tool_calls[0], output: { canned: true } },
            ...cassette!.tool_calls.slice(1),
          ],
        },
        scenario
      )
    ).toThrow(/closed contract/);
    expect(() =>
      validateSiteCassette(
        { ...cassette!, meta: { ...cassette!.meta, scenario_id: "another_scenario" } },
        scenario
      )
    ).toThrow(/identity or prompt/);
    expect(() =>
      validateSiteCassette({ ...cassette!, user_prompt: "Different request" }, scenario)
    ).toThrow(/identity or prompt/);
  });
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
      "JSONP content type",
      new Response("{}", { status: 200, headers: { "content-type": "application/jsonp" } }),
    ],
    [
      "malformed JSON",
      new Response("{", { status: 200, headers: { "content-type": "application/json" } }),
    ],
  ])("fails closed on %s", async (_label, response) => {
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    await expect(readSiteHttp({ operation: "root_json", path: "/" }, BASE, BASE)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ redirect: "manual", method: "GET" })
    );
  });

  it("rejects an HTML media type prefix with a different subtype", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<!DOCTYPE html><html></html>", {
          status: 200,
          headers: { "content-type": "text/html-unsafe" },
        })
      )
    );
    await expect(readSiteHttp({ operation: "static_html", path: "/" }, BASE, BASE)).rejects.toThrow(
      /content type/
    );
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

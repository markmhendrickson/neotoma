import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DOCS_VIEWER_MANIFEST,
  type DocsViewerEntry,
  buildDocsViewerIndex,
  excludedReason,
  isDocsViewerRoute,
} from "../../frontend/src/site/docs_viewer_manifest";
import {
  RETIRED_DESTINATIONS,
  buildRedirectStub,
  isRetiredRoute,
  resolveDestination,
} from "../../frontend/src/site/route_retirement";
import { buildSitemapXml } from "../../frontend/src/site/seo_metadata";
import {
  appendSitemapUrls,
  containedRepoFile,
  docsViewerSitemapUrls,
  manifestProblems,
  runDocsViewer,
} from "../../scripts/docs_viewer/build";
import {
  pageText,
  retiredRouteLinks,
  unsafeMarkup,
  validateDocsViewerExport,
} from "../../scripts/docs_viewer/validate_export";

const root = join(__dirname, "..", "..");
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

const CLEAN = (title: string, extra = "") =>
  `# ${title}\n\nA summary sentence for ${title}.\n\nApplies to v0.25.0 and main.\n\n## Overview\n\nSee the [CLI](../developer/cli_reference.md) and the [index](../README.md).\n${extra}\n## Details\n\nText.\n\n## More\n\nText.\n`;
const FAILING = `# Failing\n\nA summary sentence.\n\nApplies to main.\n\nNeotoma is the state layer.\n\n\`\`\`\nno language\n\`\`\`\n`;

const SOURCES: Record<string, string> = {
  "docs/README.md": `# Documentation\n\nThe docs index.\n\nApplies to main.\n\n- [REST API](api/rest_api.md)\n- [CLI](developer/cli_reference.md)\n`,
  "docs/api/rest_api.md": CLEAN("REST API"),
  "docs/developer/cli_reference.md": CLEAN("CLI reference"),
  "docs/developer/mcp_overview.md": FAILING,
};

function entry(
  slug: string,
  source: string,
  status: DocsViewerEntry["status"],
  order: number
): DocsViewerEntry {
  return {
    slug,
    source,
    title: slug || "Documentation",
    group: "Start here",
    order,
    status,
    ...(slug === "" ? { aliases: ["docs/"] } : {}),
  };
}

const MANIFEST: DocsViewerEntry[] = [
  entry("", "docs/README.md", "included", 0),
  entry("rest-api", "docs/api/rest_api.md", "included", 40),
  entry("cli", "docs/developer/cli_reference.md", "included", 20),
  entry("mcp", "docs/developer/mcp_overview.md", "pending", 30),
];

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function run(
  manifest: DocsViewerEntry[],
  opts: { write?: boolean; sources?: Record<string, string> } = {}
) {
  const outDir = mkdtempSync(join(tmpdir(), "docs-viewer-"));
  dirs.push(outDir);
  const sources = opts.sources ?? SOURCES;
  const result = runDocsViewer({
    repoRoot: root,
    outDir,
    write: opts.write,
    manifest,
    commit: COMMIT,
    readSource: (p) => sources[p] ?? null,
    pathKind: (p) => (p in sources ? "file" : p === "docs" || p === "packages" ? "dir" : null),
  });
  return { result, outDir };
}

describe("docs viewer whitelist", () => {
  it("publishes included entries and only reports pending ones, even when a pending one fails the lint", () => {
    const { result, outDir } = run(MANIFEST, { write: true });
    expect(result.failures).toEqual([]);
    expect(result.published.map((e) => e.slug).sort()).toEqual(["", "cli", "rest-api"]);
    expect(existsSync(join(outDir, "docs/rest-api/index.html"))).toBe(true);
    expect(existsSync(join(outDir, "docs/index.html"))).toBe(true);
    expect(existsSync(join(outDir, "docs/mcp/index.html"))).toBe(false);
    const mcp = result.reports.find((r) => r.entry.slug === "mcp")!;
    expect(mcp.errors.map((f) => f.rule).sort()).toEqual(["fence-language", "retired-noun"]);
  });

  it("fails the build when an included entry fails the lint, and writes nothing", () => {
    const m = MANIFEST.map((e) => (e.slug === "mcp" ? { ...e, status: "included" as const } : e));
    const { result, outDir } = run(m, { write: true });
    expect(
      result.failures.some(
        (f) => f.includes("docs/developer/mcp_overview.md") && f.includes("retired-noun")
      )
    ).toBe(true);
    expect(existsSync(join(outDir, "docs"))).toBe(false);
  });

  it("fails the build when an included entry is missing from the checkout", () => {
    const sources = { ...SOURCES };
    delete sources["docs/README.md"];
    const { result } = run(MANIFEST, { sources });
    expect(
      result.failures.some((f) => f.includes("docs/README.md") && f.includes("missing-source"))
    ).toBe(true);
    // ... but a missing pending entry is only reported.
    const pending = MANIFEST.map((e) => (e.slug === "" ? { ...e, status: "pending" as const } : e));
    expect(
      run(pending, { sources }).result.failures.filter((f) => f.includes("missing-source"))
    ).toEqual([]);
  });

  it("refuses install.md and docs/foundation in the manifest", () => {
    expect(excludedReason("install.md")).toMatch(/agent installation protocol/);
    expect(excludedReason("docs/foundation/core_identity.md")).toMatch(/foundation/);
    const bad = [
      ...MANIFEST,
      entry("install", "install.md", "pending", 90),
      entry("core", "docs/foundation/core_identity.md", "pending", 91),
    ];
    expect(manifestProblems(bad).filter((p) => p.includes("may never be rendered"))).toHaveLength(
      2
    );
    expect(manifestProblems([...MANIFEST, entry("cli", "docs/other.md", "pending", 99)])).toContain(
      'docs viewer manifest: duplicate slug "cli"'
    );
  });

  it("keeps the real manifest structurally valid and away from excluded paths", () => {
    expect(manifestProblems(DOCS_VIEWER_MANIFEST)).toEqual([]);
    for (const e of DOCS_VIEWER_MANIFEST) expect(excludedReason(e.source), e.source).toBeNull();
  });

  it("renders links between published pages as viewer routes, and to pending pages as GitHub links", () => {
    const { outDir } = run(MANIFEST, { write: true });
    const html = readFileSync(join(outDir, "docs/index.html"), "utf-8");
    expect(html).toContain('<a href="/docs/rest-api/">REST API</a>');
    const rest = readFileSync(join(outDir, "docs/rest-api/index.html"), "utf-8");
    expect(rest).toContain('<a href="/docs/cli/">CLI</a>');
    expect(rest).toContain('<link rel="canonical" href="https://neotoma.io/docs/rest-api/">');
    expect(rest).toContain(
      `href="https://github.com/markmhendrickson/neotoma/blob/${COMMIT}/docs/api/rest_api.md">View and edit on GitHub</a>`
    );
    expect(rest).toContain("<code>0123456</code>");
    expect(rest).toContain('<a class="prev" href="/docs/cli/" rel="prev">');
    expect(rest).not.toMatch(/<script/i);
  });
});

describe("docs viewer routes, redirect stubs and sitemap", () => {
  const index = buildDocsViewerIndex(MANIFEST.filter((e) => e.status === "included"));

  it("treats published viewer routes as real pages and everything else under /docs as before", () => {
    expect(isRetiredRoute("/docs/rest-api", index)).toBe(false);
    expect(isRetiredRoute("/docs/rest-api/", index)).toBe(false);
    expect(isRetiredRoute("/docs", index)).toBe(false);
    expect(isRetiredRoute("/docs/mcp", index)).toBe(true);
    expect(isDocsViewerRoute("/docs/cli/#setup", index)).toBe(true);
    // The real manifest: /docs is the viewer index once docs/README.md is included, and a route
    // whose document is still pending keeps its GitHub stub.
    const realIndexIncluded = DOCS_VIEWER_MANIFEST.some(
      (e) => e.slug === "" && e.status === "included"
    );
    expect(isRetiredRoute("/docs")).toBe(!realIndexIncluded);
    if (realIndexIncluded) expect(resolveDestination("/docs").url).toBe("https://neotoma.io/docs/");
    for (const e of DOCS_VIEWER_MANIFEST.filter((x) => x.status === "pending")) {
      for (const [route, mapped] of Object.entries(RETIRED_DESTINATIONS)) {
        if (mapped === e.source)
          expect(resolveDestination(route).url, route).toMatch(/^https:\/\/github\.com\//);
      }
    }
  });

  it("repoints stubs whose destination is a published document, and keeps every other stub", () => {
    expect(resolveDestination("/api", index)).toMatchObject({
      url: "https://neotoma.io/docs/rest-api/",
      kind: "site",
    });
    expect(resolveDestination("/cli", index).url).toBe("https://neotoma.io/docs/cli/");
    expect(resolveDestination("/mcp", index).url).toBe(
      "https://github.com/markmhendrickson/neotoma/blob/main/docs/developer/mcp_overview.md"
    );
    expect(resolveDestination("/install/manual", index).url).toBe(
      "https://github.com/markmhendrickson/neotoma/blob/main/install.md"
    );
    expect(resolveDestination("/faq", index)).toMatchObject({ url: "/", kind: "onepager" });
    const stub = buildRedirectStub("/api", "https://neotoma.io", index);
    expect(stub).toContain('content="0; url=https://neotoma.io/docs/rest-api/"');
    expect(stub).toContain('<link rel="canonical" href="https://neotoma.io/docs/rest-api/">');
    expect(stub).toContain("the Neotoma site");
    // Every stub whose destination is a published file now lands on the viewer; nothing else moved.
    for (const [route, mapped] of Object.entries(RETIRED_DESTINATIONS)) {
      const dest = resolveDestination(route, index).url;
      if (mapped && index.bySource.has(mapped))
        expect(dest, route).toMatch(/^https:\/\/neotoma\.io\/docs\//);
      else expect(dest, route).toBe(resolveDestination(route, buildDocsViewerIndex([])).url);
    }
  });

  it("lists viewer pages in the sitemap with their trailing slash, once", () => {
    const xml = appendSitemapUrls(
      buildSitemapXml(["/", "/install"]),
      docsViewerSitemapUrls(index.entries)
    );
    expect(xml).toContain("<loc>https://neotoma.io/docs/rest-api/</loc>");
    expect(xml).toContain("<loc>https://neotoma.io/docs/</loc>");
    expect(xml.match(/<loc>https:\/\/neotoma\.io\/docs\/cli\/<\/loc>/g)).toHaveLength(1);
    expect(xml.trim().endsWith("</urlset>")).toBe(true);
  });
});

describe("docs viewer export validation", () => {
  const included = MANIFEST.filter((e) => e.status === "included");
  const index = buildDocsViewerIndex(included);

  function built() {
    const { outDir } = run(MANIFEST, { write: true });
    writeFileSync(
      join(outDir, "sitemap.xml"),
      appendSitemapUrls(buildSitemapXml(["/"]), docsViewerSitemapUrls(index.entries))
    );
    for (const route of ["/api", "/cli"]) {
      mkdirSync(join(outDir, route.slice(1)), { recursive: true });
      writeFileSync(
        join(outDir, route.slice(1), "index.html"),
        buildRedirectStub(route, "https://neotoma.io", index)
      );
    }
    return outDir;
  }
  const validate = (outDir: string) =>
    validateDocsViewerExport(outDir, { index, manifest: MANIFEST }).problems;
  const edit = (file: string, fn: (s: string) => string) =>
    writeFileSync(file, fn(readFileSync(file, "utf-8")));

  it("passes a correct build", () => {
    expect(validate(built())).toEqual([]);
  });

  it("accepts the canonical vocabulary's quoted forbidden terms after source lint", () => {
    const outDir = mkdtempSync(join(tmpdir(), "docs-viewer-vocabulary-"));
    dirs.push(outDir);
    const vocabulary = entry("vocabulary", "docs/vocabulary/canonical_terms.md", "included", 70);
    const result = runDocsViewer({
      repoRoot: root,
      outDir,
      write: true,
      manifest: [vocabulary],
      commit: COMMIT,
    });
    expect(result.failures).toEqual([]);
    expect(
      validateDocsViewerExport(outDir, {
        index: buildDocsViewerIndex([vocabulary]),
        manifest: [vocabulary],
      }).problems
    ).toEqual([]);
  });

  it.each([
    [
      "a <script> element",
      (s: string) => s.replace("</main>", "<script>alert(1)</script></main>"),
      /script/,
    ],
    [
      "an event attribute",
      (s: string) => s.replace("<h1>", '<h1 onclick="x()">'),
      /event attribute/,
    ],
    [
      "a style attribute",
      (s: string) => s.replace("<h1>", '<h1 style="color:red">'),
      /style attribute/,
    ],
    [
      "a javascript: link",
      (s: string) => s.replace('href="/docs/cli/"', 'href="javascript:alert(1)"'),
      /disallowed scheme/,
    ],
    [
      "an iframe",
      (s: string) => s.replace("</main>", '<iframe src="https://x"></iframe></main>'),
      /frame/,
    ],
    [
      "a retired-route link",
      (s: string) => s.replace('href="/docs/cli/"', 'href="https://neotoma.io/integrations"'),
      /retired neotoma.io route/,
    ],
    [
      "an omitted claim in the text",
      (s: string) => s.replace("<p>Text.</p>", "<p>Corrections always win.</p>"),
      /corrections always win/,
    ],
    [
      "a missing source link",
      (s: string) => s.replace(">View and edit on GitHub</a>", ">GitHub</a>"),
      /View and edit on GitHub/,
    ],
  ])("fails on %s", (_label, mutate, expected) => {
    const outDir = built();
    edit(join(outDir, "docs/rest-api/index.html"), mutate);
    expect(validate(outDir).join("\n")).toMatch(expected);
  });

  it("fails when an included page is missing, a pending page is published, a stub is not repointed or the sitemap omits a page", () => {
    let outDir = built();
    rmSync(join(outDir, "docs/cli/index.html"));
    expect(validate(outDir).join("\n")).toMatch(/docs\/cli\/index.html is missing/);

    outDir = built();
    mkdirSync(join(outDir, "docs/mcp"), { recursive: true });
    writeFileSync(
      join(outDir, "docs/mcp/index.html"),
      readFileSync(join(outDir, "docs/cli/index.html"))
    );
    expect(validate(outDir).join("\n")).toMatch(
      /publishes docs\/developer\/mcp_overview.md, which is not included/
    );

    outDir = built();
    writeFileSync(
      join(outDir, "api/index.html"),
      buildRedirectStub("/api", "https://neotoma.io", buildDocsViewerIndex([]))
    );
    expect(validate(outDir).join("\n")).toMatch(
      /api\/index.html does not redirect to the viewer page/
    );

    outDir = built();
    writeFileSync(join(outDir, "sitemap.xml"), buildSitemapXml(["/"]));
    expect(validate(outDir).join("\n")).toMatch(/sitemap.xml does not list the docs viewer page/);
  });
});

describe("docs viewer follow-up: exclusion guard and real-path containment", () => {
  it("refuses every spelling of an excluded path", () => {
    for (const p of [
      "install.md",
      "./install.md",
      "INSTALL.md",
      "Install.MD",
      "/install.md",
      "docs//foundation/core_identity.md",
      "docs/x/../foundation/core_identity.md",
      "docs/./foundation/core_identity.md",
      "Docs/Foundation/core_identity.md",
      "docs\\foundation\\core_identity.md",
      "foundation/x.md",
      "",
    ]) {
      expect(excludedReason(p), JSON.stringify(p)).not.toBeNull();
    }
    expect(excludedReason("docs/api/rest_api.md")).toBeNull();
    expect(excludedReason("docs/")).toBeNull();
    const bad = [
      entry("x", "./install.md", "pending", 90),
      entry("y", "docs/x/../foundation/a.md", "pending", 91),
    ];
    expect(
      manifestProblems([...MANIFEST, ...bad]).filter((p) => p.includes("may never be rendered"))
    ).toHaveLength(2);
  });

  function tempRepo() {
    const repo = mkdtempSync(join(tmpdir(), "docs-viewer-repo-"));
    const outside = mkdtempSync(join(tmpdir(), "docs-viewer-outside-"));
    dirs.push(repo, outside);
    mkdirSync(join(repo, "docs/foundation"), { recursive: true });
    mkdirSync(join(repo, "docs/img"), { recursive: true });
    writeFileSync(join(repo, "docs/ok.md"), CLEAN("OK"));
    writeFileSync(join(repo, "install.md"), CLEAN("Install"));
    writeFileSync(join(repo, "docs/foundation/core.md"), CLEAN("Core"));
    writeFileSync(join(outside, "secret.md"), CLEAN("Secret"));
    writeFileSync(join(outside, "secret.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(join(repo, "docs/img/ok.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(
      join(repo, "docs/img/logo.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    );
    symlinkSync(join(repo, "install.md"), join(repo, "docs/link-to-install.md"));
    symlinkSync(join(outside, "secret.md"), join(repo, "docs/link-outside.md"));
    symlinkSync(join(repo, "docs/foundation"), join(repo, "docs/alias"));
    symlinkSync(join(outside, "secret.png"), join(repo, "docs/img/outside.png"));
    symlinkSync(outside, join(repo, "docs/ext"));
    return repo;
  }

  it("reads only regular files whose real path stays inside the repository and is not excluded", () => {
    const repo = tempRepo();
    expect(containedRepoFile(repo, "docs/ok.md")).toHaveProperty("real");
    expect(containedRepoFile(repo, "docs/missing.md")).toEqual({ absent: true });
    expect(containedRepoFile(repo, "docs/link-to-install.md")).toMatchObject({
      problem: expect.stringMatching(/symlink/),
    });
    expect(containedRepoFile(repo, "docs/link-outside.md")).toMatchObject({
      problem: expect.stringMatching(/symlink/),
    });
    expect(containedRepoFile(repo, "docs/alias/core.md")).toMatchObject({
      problem: expect.stringMatching(/may never be rendered/),
    });
    expect(containedRepoFile(repo, "docs/ext/secret.md")).toMatchObject({
      problem: expect.stringMatching(/outside the repository/),
    });
    expect(containedRepoFile(repo, "docs/../install.md")).toMatchObject({
      problem: expect.stringMatching(/plain/),
    });
  });

  it("fails the build for a manifest entry that is a symlink or resolves into an excluded folder", () => {
    const repo = tempRepo();
    for (const source of [
      "docs/link-to-install.md",
      "docs/link-outside.md",
      "docs/alias/core.md",
    ]) {
      const result = runDocsViewer({
        repoRoot: repo,
        manifest: [entry("x", source, "pending", 1)],
        commit: COMMIT,
        pathKind: () => "file",
      });
      expect(result.failures.join("\n"), source).toMatch(/docs viewer manifest: /);
      expect(result.reports[0].exists).toBe(false);
    }
    expect(
      runDocsViewer({
        repoRoot: repo,
        manifest: [entry("x", "docs/ok.md", "included", 1)],
        commit: COMMIT,
        pathKind: () => "file",
      }).failures
    ).toEqual([]);
  });

  it("copies only raster images whose real path stays inside the repository; never SVG", () => {
    const repo = tempRepo();
    writeFileSync(
      join(repo, "docs/ok.md"),
      CLEAN("OK", "\n![ok](img/ok.png)\n\n![outside](img/outside.png)\n\n![svg](img/logo.svg)\n")
    );
    const outDir = mkdtempSync(join(tmpdir(), "docs-viewer-out-"));
    dirs.push(outDir);
    const result = runDocsViewer({
      repoRoot: repo,
      outDir,
      write: true,
      manifest: [entry("ok", "docs/ok.md", "pending", 1)],
      includePending: true,
      commit: COMMIT,
      pathKind: (p) => (p.startsWith("docs/img/") || p.endsWith(".md") ? "file" : "dir"),
    });
    const html = readFileSync(join(outDir, "docs/ok/index.html"), "utf-8");
    expect((html.match(/<img src="\/docs\/_media\//g) ?? []).length).toBe(1);
    expect(readdirSync(join(outDir, "docs/_media"))).toHaveLength(1);
    const errors = result.reports[0].errors.map((f) => `${f.rule} ${f.message}`).join("\n");
    expect(errors).toMatch(/image-source image img\/logo\.svg/);
  });
});

describe("docs viewer follow-up: export validation", () => {
  const index = buildDocsViewerIndex(MANIFEST.filter((e) => e.status === "included"));

  it("fails when the sitemap lists anything under /docs beyond the included pages", () => {
    const { outDir } = run(MANIFEST, { write: true });
    writeFileSync(
      join(outDir, "sitemap.xml"),
      appendSitemapUrls(buildSitemapXml(["/"]), [
        ...docsViewerSitemapUrls(index.entries),
        "https://neotoma.io/docs/mcp/",
      ])
    );
    const problems = validateDocsViewerExport(outDir, { index, manifest: MANIFEST }).problems.join(
      "\n"
    );
    expect(problems).toMatch(
      /sitemap.xml lists https:\/\/neotoma.io\/docs\/mcp\/, which is not an included docs viewer page/
    );
  });

  it("finds unsafe markup that hides behind quoted '>' and unusual spacing", () => {
    expect(unsafeMarkup('<style></style><a title="x>y" onclick="z()">a</a>').join()).toMatch(
      /event attribute/
    );
    expect(unsafeMarkup('<style></style><img src = "javascript:alert(1)">').join()).toMatch(
      /disallowed scheme/
    );
    expect(unsafeMarkup('<style></style><a href="/\\evil">a</a>').join()).toMatch(/backslash/);
    expect(unsafeMarkup('<style></style><p aria-label="x online=1">ok</p>')).toEqual([]);
    expect(unsafeMarkup("<style></style><SCRIPT>x</SCRIPT>").join()).toMatch(/script/);
  });

  it("runs every page check in linear time on pathological input", () => {
    const inputs = [
      "<".repeat(200_000),
      "<a ".repeat(70_000),
      '<a href="'.repeat(25_000),
      "<style>".repeat(30_000),
      "<!--".repeat(50_000),
      `<a title="${"x".repeat(200_000)}`,
    ];
    for (const html of inputs) {
      const t0 = performance.now();
      unsafeMarkup(html);
      pageText(html);
      retiredRouteLinks(html, index);
      expect(performance.now() - t0, html.slice(0, 12)).toBeLessThan(1000);
    }
  });
});

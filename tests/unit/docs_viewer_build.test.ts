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
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { CONNECTIONS, CONNECTIONS_SETUP } from "../../src/shared/harness_connections";
import { PREVIEW_REFERENCE_COMMIT } from "../../scripts/docs_viewer/render";
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
  docsViewerAliasRoutes,
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
  `# ${title}\n\nA summary sentence for ${title}.\n\nApplies to v0.25.0 and main.\n\n## Overview\n\nSee the [CLI](../developer/cli_reference.md) and the [README](../../README.md).\n${extra}\n## Details\n\nText.\n\n## More\n\nText.\n`;
const FAILING = `# Failing\n\nA summary sentence.\n\nApplies to main.\n\nNeotoma is the state layer.\n\n\`\`\`\nno language\n\`\`\`\n`;

const SOURCES: Record<string, string> = {
  "README.md": `# README\n\nA summary sentence for README.\n\nApplies to main.\n\n- [REST API](docs/api/rest_api.md)\n- [CLI](docs/developer/cli_reference.md)\n`,
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
    id: slug,
    slug,
    source,
    title: slug,
    summary: `Read ${slug}.`,
    group: "Start here",
    collection: "start",
    order,
    status,
  };
}

const MANIFEST: DocsViewerEntry[] = [
  entry("readme", "README.md", "included", 10),
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
  if (opts.write) {
    mkdirSync(join(outDir, "assets"), { recursive: true });
    writeFileSync(join(outDir, "assets/reader-language.js"), readFileSync(join(root, "public/assets/reader-language.js")));
  }
  return { result, outDir };
}

describe("docs viewer whitelist", () => {
  it("publishes included entries and only reports pending ones, even when a pending one fails the lint", () => {
    const { result, outDir } = run(MANIFEST, { write: true });
    expect(result.failures).toEqual([]);
    expect(result.published.map((e) => e.slug).sort()).toEqual(["cli", "readme", "rest-api"]);
    expect(existsSync(join(outDir, "rest-api/index.html"))).toBe(true);
    expect(existsSync(join(outDir, "readme/index.html"))).toBe(true);
    expect(existsSync(join(outDir, "mcp/index.html"))).toBe(false);
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
    delete sources["README.md"];
    const { result } = run(MANIFEST, { sources });
    expect(
      result.failures.some((f) => f.includes("README.md") && f.includes("missing-source"))
    ).toBe(true);
    // ... but a missing pending entry is only reported.
    const pending = MANIFEST.map((e) =>
      e.slug === "readme" ? { ...e, status: "pending" as const } : e
    );
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
    expect(
      manifestProblems([...MANIFEST, entry("", "docs/README.md", "included", 0)]).join(" ")
    ).toMatch(/slug "" must be lower-case/);
  });

  it("keeps the real manifest structurally valid and away from excluded paths", () => {
    expect(manifestProblems(DOCS_VIEWER_MANIFEST)).toEqual([]);
    for (const e of DOCS_VIEWER_MANIFEST) expect(excludedReason(e.source), e.source).toBeNull();
  });

  it("serves focused reader pages while leaving detailed contracts as repository references", () => {
    const expected = {
      cli: "docs/topics/interfaces/cli.md",
      "rest-api": "docs/topics/interfaces/rest-api.md",
      vocabulary: "docs/topics/architecture/vocabulary.md",
      "read-search": "docs/topics/interfaces/read-search.md",
      "store-correct": "docs/topics/interfaces/store-correct.md",
      history: "docs/topics/architecture/history.md",
      "export-backup": "docs/topics/trust/export-backup.md",
    } as const;
    const included = DOCS_VIEWER_MANIFEST.filter((item) => item.status === "included");
    const index = buildDocsViewerIndex(included);
    for (const [slug, source] of Object.entries(expected)) {
      expect(index.byRoute.get(`/${slug}`)?.source, slug).toBe(source);
      expect(existsSync(join(root, source)), source).toBe(true);
    }
    for (const reference of [
      "docs/developer/cli_reference.md",
      "docs/api/rest_api.md",
      "docs/vocabulary/canonical_terms.md",
    ]) {
      expect(index.bySource.has(reference), reference).toBe(false);
    }
    expect(resolveDestination("/docs/cli", index).url).toBe("https://neotoma.io/cli/");
    expect(resolveDestination("/docs/rest-api", index).url).toBe("https://neotoma.io/rest-api/");
  });

  it("derives reader routes and aliases from the included manifest", () => {
    const included = DOCS_VIEWER_MANIFEST.filter((e) => e.status === "included");
    const index = buildDocsViewerIndex(included);
    expect(index.byRoute.get("/mcp")?.source).toBe("docs/topics/interfaces/mcp.md");
    expect(index.bySource.get("docs/topics/mcp.md")?.slug).toBe("mcp");
    expect(index.byAliasRoute.get("/docs/mcp")?.slug).toBe("mcp");
    expect(docsViewerAliasRoutes(included)).toContain("/docs/mcp");
    expect(resolveDestination("/docs/mcp", index).url).toBe("https://neotoma.io/mcp/");
    expect(index.bySource.has("docs/developer/mcp_overview.md")).toBe(false);
    expect(
      manifestProblems([
        ...included,
        { ...included[0], slug: "other", routeAliases: ["/docs/mcp"] },
      ])
    ).toContain("docs viewer manifest: invalid or duplicate route alias /docs/mcp");
  });

  it("supports nested install guide routes without publishing their source directories", () => {
    const guide = {
      ...entry("install/codex", "docs/topics/install-codex.md", "included", 5),
      id: "install-codex",
      parentId: "install",
      collection: "install" as const,
    };
    expect(manifestProblems([guide])).toEqual([]);
    const index = buildDocsViewerIndex([guide]);
    expect(isDocsViewerRoute("/install/codex/", index)).toBe(true);
    expect(docsViewerAliasRoutes([guide])).toContain("/docs/install/codex");
  });

  it("publishes every connection guide from the shared host contract", () => {
    const guides = DOCS_VIEWER_MANIFEST.filter((entry) => entry.source.startsWith("docs/guides/connections/"));
    expect(guides).toHaveLength(CONNECTIONS.length);
    expect(CONNECTIONS_SETUP.map((connection) => connection.id)).toEqual([
      "claude-code",
      "cursor",
      "codex",
      "claude-desktop",
    ]);
    for (const connection of CONNECTIONS) {
      const entry = guides.find((guide) => guide.source === connection.guide);
      expect(entry?.status, connection.id).toBe("included");
      expect(entry && `/${entry.slug}/`, connection.id).toBe(connection.guideRoute);
      expect(existsSync(join(root, connection.guide)), connection.guide).toBe(true);
    }
    const outDir = mkdtempSync(join(tmpdir(), "docs-guides-"));
    dirs.push(outDir);
    const result = runDocsViewer({
      repoRoot: root,
      outDir,
      write: true,
      manifest: guides,
      commit: COMMIT,
    });
    expect(result.failures).toEqual([]);
    for (const connection of CONNECTIONS) {
      const html = readFileSync(
        join(outDir, connection.guideRoute.slice(1), "index.html"),
        "utf-8"
      );
      expect(html).toContain('<li><a href="/install/">Install</a></li>');
      const related =
        /<section class="dv-topic-links" aria-labelledby="dv-related-title">([\s\S]*?)<\/section>/.exec(
          html
        )?.[1];
      expect(related, connection.id).toBeDefined();
      const hrefs = [...related!.matchAll(/<a href="([^"]+)">/g)].map((match) => match[1]);
      expect(hrefs.length, connection.id).toBeGreaterThanOrEqual(3);
      expect(hrefs.length, connection.id).toBeLessThanOrEqual(6);
      expect(new Set(hrefs).size, connection.id).toBe(hrefs.length);
      expect(hrefs, connection.id).not.toContain(connection.guideRoute);
      expect(hrefs.every((href) => guides.some((guide) => `/${guide.slug}/` === href))).toBe(true);
      const guideIndex = guides.findIndex((guide) => `/${guide.slug}/` === connection.guideRoute);
      if (guideIndex > 0) expect(hrefs).toContain(`/${guides[guideIndex - 1].slug}/`);
      if (guideIndex < guides.length - 1)
        expect(hrefs).toContain(`/${guides[guideIndex + 1].slug}/`);
      const footer = html.slice(html.indexOf('<footer class="plan-site-footer"'));
      for (const [label, href] of [
        ["REST API", "/rest-api/"],
        ["CLI", "/cli/"],
        ["Vocabulary", "/vocabulary/"],
      ]) {
        expect(footer, connection.id).toContain(`<a href="${href}">${label}</a>`);
      }
      expect(html.replace('<script defer src="/assets/reader-language.js" data-neotoma-reader-language="1"></script>', "")).not.toMatch(/<script/i);
    }
  });

  it("fails closed on missing or cyclic parents, pending relations, and unknown visuals", () => {
    const a = {
      ...entry("a", "docs/a.md", "included", 1),
      parentId: "b",
      relatedIds: ["b"],
      visualId: "missing",
    };
    const b = { ...entry("b", "docs/b.md", "pending", 2), parentId: "a" };
    const problems = manifestProblems([a, b]).join("\n");
    expect(problems).toContain("parent cycle at a");
    expect(problems).toContain("unpublished parent b for a");
    expect(problems).toContain("unpublished related id b for docs/a.md");
    expect(problems).toContain("unknown visual id missing for docs/a.md");
    expect(manifestProblems([{ ...a, parentId: "absent", relatedIds: ["a"] }]).join("\n")).toMatch(
      /missing parent absent[\s\S]*self-related id a/
    );
  });

  it("renders links between published pages as viewer routes, and to pending pages as GitHub links", () => {
    const { outDir } = run(MANIFEST, { write: true });
    const html = readFileSync(join(outDir, "readme/index.html"), "utf-8");
    expect(html).toContain('<a href="/rest-api/">REST API</a>');
    const rest = readFileSync(join(outDir, "rest-api/index.html"), "utf-8");
    expect(rest).toContain('<a href="/cli/">CLI</a>');
    expect(rest).toContain('<link rel="canonical" href="https://neotoma.io/rest-api/">');
    expect(rest).toContain(
      `<link rel="alternate" type="text/markdown" href="https://raw.githubusercontent.com/markmhendrickson/neotoma/${COMMIT}/docs/api/rest_api.md"`
    );
    expect(rest).toContain(`<meta name="docs-viewer-commit" content="${COMMIT}">`);
    expect(rest).toContain('<a class="prev" href="/cli/" rel="prev">');
    expect(rest.replace('<script defer src="/assets/reader-language.js" data-neotoma-reader-language="1"></script>', "")).not.toMatch(/<script/i);
  });
});

describe("docs viewer routes, redirect stubs and sitemap", () => {
  const index = buildDocsViewerIndex(MANIFEST.filter((e) => e.status === "included"));

  it("serves the curated root topics and retires the former docs routes", () => {
    expect(isRetiredRoute("/docs/rest-api", index)).toBe(true);
    expect(isRetiredRoute("/rest-api/", index)).toBe(false);
    expect(isRetiredRoute("/docs", index)).toBe(true);
    expect(isRetiredRoute("/docs/mcp", index)).toBe(true);
    expect(isDocsViewerRoute("/cli/#setup", index)).toBe(true);
    expect(DOCS_VIEWER_MANIFEST.map((e) => e.slug)).toEqual(
      expect.arrayContaining([
        "readme",
        "cli",
        "mcp",
        "rest-api",
        "integrations",
        "architecture",
        "vocabulary",
        "interfaces",
        "provenance",
        "trust",
        "local-first",
        "license",
        "record-model",
        "observations",
        "current-snapshot",
        "schemas",
        "limitations",
      ])
    );
    expect(resolveDestination("/docs").url).toBe("https://neotoma.io/#references");
    expect(resolveDestination("/docs/readme").url).toBe("https://neotoma.io/readme/");
    for (const e of DOCS_VIEWER_MANIFEST.filter((x) => x.status === "pending")) {
      for (const [route, mapped] of Object.entries(RETIRED_DESTINATIONS)) {
        if (mapped === e.source)
          expect(resolveDestination(route).url, route).toMatch(/^https:\/\/github\.com\//);
      }
    }
  });

  it("repoints stubs whose destination is a published document, and keeps every other stub", () => {
    expect(resolveDestination("/api", index)).toMatchObject({
      url: "https://neotoma.io/rest-api/",
      kind: "site",
    });
    expect(resolveDestination("/docs/cli", index).url).toBe("https://neotoma.io/cli/");
    expect(resolveDestination("/docs/mcp", index).url).toBe(
      "https://github.com/markmhendrickson/neotoma/blob/main/docs/developer/mcp_overview.md"
    );
    expect(resolveDestination("/install/manual", index).url).toBe(
      "https://github.com/markmhendrickson/neotoma/blob/main/install.md"
    );
    expect(resolveDestination("/faq", index)).toMatchObject({
      url: "https://neotoma.io/limitations/",
      kind: "site",
    });
    const stub = buildRedirectStub("/api", "https://neotoma.io", index);
    expect(stub).toContain('content="0; url=https://neotoma.io/rest-api/"');
    expect(stub).toContain('<link rel="canonical" href="https://neotoma.io/rest-api/">');
    expect(stub).toContain("the Neotoma site");
    // Every stub whose destination is a published file now lands on the viewer; nothing else moved.
    for (const [route, mapped] of Object.entries(RETIRED_DESTINATIONS)) {
      const dest = resolveDestination(route, index).url;
      if (mapped && index.bySource.has(mapped))
        expect(dest, route).toMatch(/^https:\/\/neotoma\.io\/(readme|cli|rest-api)\//);
      else expect(dest, route).toBe(resolveDestination(route, buildDocsViewerIndex([])).url);
    }
  });

  it("lists viewer pages in the sitemap with their trailing slash, once", () => {
    const xml = appendSitemapUrls(
      buildSitemapXml(["/", "/install"]),
      docsViewerSitemapUrls(index.entries)
    );
    expect(xml).toContain("<loc>https://neotoma.io/rest-api/</loc>");
    expect(xml).toContain("<loc>https://neotoma.io/readme/</loc>");
    expect(xml.match(/<loc>https:\/\/neotoma\.io\/cli\/<\/loc>/g)).toHaveLength(1);
    expect(xml).not.toContain("https://neotoma.io/docs/");
    expect(xml.trim().endsWith("</urlset>")).toBe(true);
  });

  it("keeps an included noindex topic out of the sitemap", () => {
    const hidden = {
      ...entry("hidden", "docs/hidden.md", "included", 90),
      robots: "noindex" as const,
    };
    expect(docsViewerSitemapUrls([...index.entries, hidden])).not.toContain(
      "https://neotoma.io/hidden/"
    );
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
    for (const route of ["/api", "/docs", "/docs/readme", "/docs/cli", "/docs/rest-api"]) {
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

  it("validates legacy Claude entrypoints against the shared current connection destinations", () => {
    const manifest = [
      ...MANIFEST,
      entry("integrations", "docs/integrations/matrix.md", "included", 50),
    ];
    const viewer = buildDocsViewerIndex(
      manifest.filter((candidate) => candidate.status === "included")
    );
    const { outDir, result } = run(manifest, {
      write: true,
      sources: { ...SOURCES, "docs/integrations/matrix.md": CLEAN("Integrations") },
    });
    expect(result.failures).toEqual([]);
    const routes = [
      "/neotoma-with-claude",
      "/neotoma-with-claude-connect-desktop",
      "/neotoma-with-claude-connect-remote-mcp",
    ];
    for (const route of ["/docs", ...docsViewerAliasRoutes(viewer.entries), ...routes]) {
      mkdirSync(join(outDir, route.slice(1)), { recursive: true });
      writeFileSync(
        join(outDir, route.slice(1), "index.html"),
        buildRedirectStub(route, "https://neotoma.io", viewer)
      );
    }
    const check = () => validateDocsViewerExport(outDir, { index: viewer, manifest }).problems;
    expect(check()).toEqual([]);
    for (const route of routes) {
      const stub = join(outDir, route.slice(1), "index.html");
      const original = readFileSync(stub, "utf-8");
      expect(original).toContain(`url=${resolveDestination(route, viewer).url}\"`);
      writeFileSync(
        stub,
        original.replace(
          `url=${resolveDestination(route, viewer).url}\"`,
          'url=https://neotoma.io/integrations/"'
        )
      );
      expect(check().join("\n")).toContain(`site_pages${route}/index.html does not redirect`);
      writeFileSync(stub, original);
    }
    expect(check()).toEqual([]);
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
    mkdirSync(join(outDir, "assets"), { recursive: true });
    writeFileSync(join(outDir, "assets/reader-language.js"), readFileSync(join(root, "public/assets/reader-language.js")));
    for (const route of ["/docs", "/docs/vocabulary"]) {
      const stub = join(outDir, route.slice(1), "index.html");
      mkdirSync(join(outDir, route.slice(1)), { recursive: true });
      writeFileSync(
        stub,
        buildRedirectStub(route, "https://neotoma.io", buildDocsViewerIndex([vocabulary]))
      );
    }
    expect(
      validateDocsViewerExport(outDir, {
        index: buildDocsViewerIndex([vocabulary]),
        manifest: [vocabulary],
      }).problems
    ).toEqual([]);

    const page = join(outDir, "vocabulary/index.html");
    const original = readFileSync(page, "utf-8");
    const check = () =>
      validateDocsViewerExport(outDir, {
        index: buildDocsViewerIndex([vocabulary]),
        manifest: [vocabulary],
      }).problems.join("\n");
    writeFileSync(page, original.replace("</main>", "<p>Neotoma is the state layer.</p></main>"));
    expect(check()).toMatch(/retired category noun/);
    writeFileSync(
      page,
      original.replace("</main>", "<p>Neotoma is a unified platform.</p></main>")
    );
    expect(check()).toMatch(/unified platform/);
    writeFileSync(page, original);
    expect(check()).toBe("");
  });

  it("rejects a retired noun on an ordinary included page", () => {
    const outDir = built();
    edit(join(outDir, "rest-api/index.html"), (s) =>
      s.replace("</main>", "<p>Neotoma is the state layer.</p></main>")
    );
    expect(validate(outDir).join("\n")).toMatch(/retired category noun/);
  });

  it.each([
    [
      "the fixed language asset moved into the reader body",
      (s: string) => {
        const tag = '<script defer src="/assets/reader-language.js" data-neotoma-reader-language="1"></script>';
        return s.replace(tag, "").replace("</main>", `${tag}</main>`);
      },
      /script.*head|head.*script/,
    ],
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
      (s: string) => s.replace('href="/cli/"', 'href="javascript:alert(1)"'),
      /disallowed scheme/,
    ],
    [
      "an iframe",
      (s: string) => s.replace("</main>", '<iframe src="https://x"></iframe></main>'),
      /frame/,
    ],
    [
      "a retired-route link",
      (s: string) => s.replace('href="/cli/"', 'href="https://neotoma.io/faq"'),
      /retired neotoma.io route/,
    ],
    [
      "an omitted claim in the text",
      (s: string) => s.replace("<p>Text.</p>", "<p>Corrections always win.</p>"),
      /corrections always win/,
    ],
    [
      "a missing source link",
      (s: string) =>
        s.replace(
          '<link rel="alternate" type="text/markdown"',
          '<link rel="alternate" type="text/plain"'
        ),
      /text\/markdown/,
    ],
  ])("fails on %s", (_label, mutate, expected) => {
    const outDir = built();
    edit(join(outDir, "rest-api/index.html"), mutate);
    expect(validate(outDir).join("\n")).toMatch(expected);
  });

  it("fails when an included page is missing, a pending page is published, a stub is not repointed or the sitemap omits a page", () => {
    let outDir = built();
    rmSync(join(outDir, "cli/index.html"));
    expect(validate(outDir).join("\n")).toMatch(/site_pages\/cli\/index.html is missing/);

    outDir = built();
    mkdirSync(join(outDir, "mcp"), { recursive: true });
    writeFileSync(join(outDir, "mcp/index.html"), readFileSync(join(outDir, "cli/index.html")));
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

    outDir = built();
    rmSync(join(outDir, "docs/rest-api/index.html"));
    expect(validate(outDir).join("\n")).toMatch(/missing the legacy redirect/);
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
    writeFileSync(
      join(repo, "docs/ok.md"),
      "# OK\n\nA summary sentence.\n\nApplies to main.\n\n## Details\n\nText.\n"
    );
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
    const html = readFileSync(join(outDir, "ok/index.html"), "utf-8");
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

describe("local docs preview source contract", () => {
  it("takes public integration readers to the current Continue guide and leaves no broken setup in legacy entrypoints", () => {
    const outDir = mkdtempSync(join(tmpdir(), "docs-public-integrations-"));
    dirs.push(outDir);
    const result = runDocsViewer({ repoRoot: root, outDir, write: true, commit: COMMIT });
    expect(result.failures).toEqual([]);
    const matrix = readFileSync(join(outDir, "integrations/index.html"), "utf8");
    expect(matrix).toContain('href="/install/continue/"');
    const guide = readFileSync(join(outDir, "install/continue/index.html"), "utf8");
    expect(guide).toContain("manual MCP configuration");
    expect(guide).toContain("known entity");
    expect(resolveDestination("/neotoma-with-continue").url).toBe(
      "https://neotoma.io/install/continue/"
    );
    const legacySources = readdirSync(join(root, "docs/site/pages/en")).filter(
      (name) =>
        name === "integrations.mdx" ||
        name === "integrations.md" ||
        /^neotoma-with-.*\.(md|mdx)$/.test(name)
    );
    expect(legacySources).toHaveLength(44);
    for (const name of legacySources) {
      const source = readFileSync(join(root, "docs/site/pages/en", name), "utf8");
      expect(source, name).not.toMatch(
        /neotoma setup --tool (?:continue|windsurf|vscode|ironclaw)(?:\s|`)/
      );
      expect(source, name).not.toMatch(/(?:"mcp",\s*"stdio"|neotoma mcp stdio)/);
      expect(source, name).not.toMatch(/~\/\.continue\/config\.json/);
      expect(source, name).toMatch(/install\//);
    }
  });

  it("keeps a nested mounted guide's source, breadcrumbs, pager, and body links inside the preview", () => {
    const outDir = mkdtempSync(join(tmpdir(), "docs-viewer-mounted-"));
    dirs.push(outDir);
    const result = runDocsViewer({
      repoRoot: root,
      outDir,
      write: true,
      sourceContext: "local-preview",
      commit: COMMIT,
    });
    expect(result.failures).toEqual([]);
    const page = join(outDir, "install/continue/index.html");
    const rootHtml = readFileSync(page, "utf8");
    expect(rootHtml).toContain(
      '<link rel="alternate" type="text/markdown" href="/source/install/continue.md"'
    );
    const probe = join(outDir, "mount-probe.html");
    writeFileSync(
      probe,
      '<img srcset="/brand/a.webp 1x, /brand/b.webp 2x" src="/assets/a.png"><a href="/pr-42/install/">Already mounted</a><a href="https://vendor.example/docs">Vendor</a><link rel="canonical" href="https://neotoma.io/install/continue/"><style>.x{background:url(/brand/a.webp)}</style>'
    );
    execFileSync(join(root, "node_modules/.bin/tsx"), [
      join(root, "scripts/rewrite_docs_pr_preview.ts"),
      outDir,
      "42",
    ]);
    const mounted = readFileSync(page, "utf8");
    for (const path of [
      "/source/install/continue.md",
      "/install/",
      "/install/windsurf/",
      "/install/vscode/",
    ]) {
      expect(rootHtml).toContain(`href="${path}"`);
      expect(mounted).toContain(`href="/pr-42${path}"`);
      expect(mounted).not.toContain(`href="${path}"`);
    }
    const breadcrumb = mounted.slice(
      mounted.indexOf('class="dv-breadcrumbs"'),
      mounted.indexOf('class="dv-sheet"')
    );
    const body = mounted.slice(
      mounted.indexOf('class="dv-body"'),
      mounted.indexOf('class="dv-pager"')
    );
    const pager = mounted.slice(
      mounted.indexOf('class="dv-pager"'),
      mounted.indexOf("</nav>", mounted.indexOf('class="dv-pager"'))
    );
    expect(breadcrumb).toContain('href="/pr-42/install/"');
    expect(body).toContain('href="/pr-42/install/"');
    expect(pager).toContain('href="/pr-42/install/windsurf/"');
    const probeHtml = readFileSync(probe, "utf8");
    expect(probeHtml).toContain('srcset="/pr-42/brand/a.webp 1x, /pr-42/brand/b.webp 2x"');
    expect(probeHtml).toContain('src="/pr-42/assets/a.png"');
    expect(probeHtml).toContain("url(/pr-42/brand/a.webp)");
    expect(probeHtml).toContain('href="/pr-42/install/"');
    expect(probeHtml).toContain('href="https://vendor.example/docs"');
    expect(mounted).toContain('<link rel="canonical" href="https://neotoma.io/install/continue/">');
    expect(mounted.replace('<script defer src="/pr-42/assets/reader-language.js" data-neotoma-reader-language="1"></script>', "")).not.toMatch(/<script/i);
    execFileSync(join(root, "node_modules/.bin/tsx"), [
      join(root, "scripts/rewrite_docs_pr_preview.ts"),
      outDir,
      "42",
    ]);
    expect(readFileSync(page, "utf8")).toBe(mounted);
    expect(readFileSync(probe, "utf8")).toBe(probeHtml);
    expect(
      readFileSync(join(outDir, "source/install/continue.md")).equals(
        readFileSync(join(root, "docs/guides/connections/continue.md"))
      )
    ).toBe(true);
  });

  it("gives the preview build and validator the same source mode and full reference history", () => {
    const baselineWorkflow = readFileSync(join(root, ".github/workflows/ci_test_lanes.yml"), "utf8");
    const baseline = baselineWorkflow.slice(baselineWorkflow.indexOf("  baseline:"), baselineWorkflow.indexOf("  contract_parity:"));
    expect(baseline).toMatch(/uses: actions\/checkout@v4\n\s+with:\n(?:\s+#.*\n)*\s+fetch-depth: 0/);

    for (const workflow of ["docs_pr_preview.yml", "deploy-pages-dev-site.yml"]) {
      const yaml = readFileSync(join(root, ".github/workflows", workflow), "utf8");
      expect(yaml).toMatch(
        /uses: actions\/checkout@v4\n\s+with:\n(?:\s+ref: dev\n)?\s+fetch-depth: 0/
      );
      expect(yaml).toMatch(
        /name: Build (?:static site|site for preview)\n\s+env:\n\s+SITE_PREVIEW: "1"/
      );
      expect(yaml).toMatch(
        /name: Validate site export\n\s+env:\n\s+SITE_PREVIEW: "1"[^]*?run: npm run validate:site-export/
      );
    }
    const checkout = mkdtempSync(join(tmpdir(), "docs-preview-shallow-"));
    dirs.push(checkout);
    const gitDir = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      {
        cwd: root,
        encoding: "utf8",
      }
    ).trim();
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    const source = pathToFileURL(gitDir).href;
    execFileSync("git", ["clone", "--quiet", "--no-checkout", "--depth", "1", source, checkout]);
    execFileSync("git", ["fetch", "--quiet", "--depth", "1", source, head], { cwd: checkout });
    const hasReference = () => {
      try {
        execFileSync("git", ["cat-file", "-e", `${PREVIEW_REFERENCE_COMMIT}^{commit}`], {
          cwd: checkout,
          stdio: "ignore",
        });
        return true;
      } catch {
        return false;
      }
    };
    expect(hasReference()).toBe(false);
    // The preview reference may be on a separate source line from this checkout's HEAD.
    execFileSync("git", ["fetch", "--quiet", source, PREVIEW_REFERENCE_COMMIT], { cwd: checkout });
    expect(hasReference()).toBe(true);
  }, 20_000);

  it("accepts only included raw Markdown links in a local preview", () => {
    const index = buildDocsViewerIndex(
      DOCS_VIEWER_MANIFEST.filter((entry) => entry.status === "included")
    );
    const html =
      '<a href="/source/install/claude-code.md">source</a>' +
      '<a href="/source/not-in-manifest.md">unknown</a>' +
      '<a href="https://neotoma.io/source/install/claude-code.md">published</a>';
    const previewProblems = retiredRouteLinks(html, index, "local-preview");
    expect(previewProblems).toEqual([
      "/source/not-in-manifest.md",
      "https://neotoma.io/source/install/claude-code.md",
    ]);
    expect(retiredRouteLinks(html, index)).toEqual([
      "/source/install/claude-code.md",
      "/source/not-in-manifest.md",
      "https://neotoma.io/source/install/claude-code.md",
    ]);
  });

  it("serves only manifest Markdown with matching bytes and no unpublished GitHub action", () => {
    const outDir = mkdtempSync(join(tmpdir(), "docs-viewer-local-"));
    dirs.push(outDir);
    const result = runDocsViewer({
      repoRoot: root,
      outDir,
      write: true,
      sourceContext: "local-preview",
      commit: COMMIT,
    });
    expect(result.failures).toEqual([]);
    const included = DOCS_VIEWER_MANIFEST.filter((entry) => entry.status === "included");
    expect(
      readdirSync(join(outDir, "source"), { recursive: true })
        .filter((name) => name.endsWith(".md"))
        .sort()
    ).toEqual(included.map((entry) => `${entry.slug}.md`).sort());
    for (const entry of included) {
      const html = readFileSync(join(outDir, entry.slug, "index.html"), "utf-8");
      const markdown = readFileSync(join(outDir, "source", `${entry.slug}.md`));
      expect(markdown.equals(readFileSync(join(root, entry.source))), entry.slug).toBe(true);
      expect(html).toContain(
        `<link rel="alternate" type="text/markdown" href="/source/${entry.slug}.md"`
      );
      expect(html).toContain(`<meta name="docs-viewer-commit" content="${COMMIT}">`);
      expect(html).toContain('<meta name="robots" content="noindex,follow">');
      expect(html).not.toContain("View and edit on GitHub");
      expect(html).not.toContain(`github.com/markmhendrickson/neotoma/blob/${COMMIT}/`);
    }
    const validate = () =>
      validateDocsViewerExport(outDir, {
        sourceContext: "local-preview",
        repoRoot: root,
      }).problems.filter((problem) =>
        /robots|Markdown source|GitHub source action|text\/markdown/.test(problem)
      );
    expect(validate()).toEqual([]);
    expect(
      validateDocsViewerExport(outDir, {
        sourceContext: "local-preview",
        repoRoot: root,
      }).problems.filter((problem) => problem.includes("retired neotoma.io route"))
    ).toEqual([]);
    const readme = join(outDir, "readme", "index.html");
    const original = readFileSync(readme, "utf-8");
    writeFileSync(readme, original.replace('content="noindex,follow"', 'content="index,follow"'));
    expect(validate().join("\n")).toContain("lacks robots noindex,follow");
    writeFileSync(readme, original);
    writeFileSync(join(outDir, "source", "readme.md"), "wrong source");
    expect(validate().join("\n")).toContain("lacks a matching public Markdown source");
    writeFileSync(join(outDir, "source", "not-in-manifest.md"), "unexpected");
    expect(
      validateDocsViewerExport(outDir, {
        sourceContext: "local-preview",
        repoRoot: root,
      }).problems.join("\n")
    ).toContain("source/not-in-manifest.md is not an allowed Markdown source");

    const published = runDocsViewer({ repoRoot: root, outDir, write: true, commit: COMMIT });
    expect(published.failures).toEqual([]);
    expect(existsSync(join(outDir, "source", "readme.md"))).toBe(false);
    expect(validateDocsViewerExport(outDir).problems.join("\n")).toContain(
      "source/not-in-manifest.md is not an allowed Markdown source"
    );
  });
});

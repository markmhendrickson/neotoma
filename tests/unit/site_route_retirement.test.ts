import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { llmsLinkProblems } from "../../scripts/llms_links";
import { CONNECTIONS } from "../../src/shared/harness_connections";
import { isDocsViewerRoute } from "../../frontend/src/site/docs_viewer_manifest";
import { SPANISH_RETAINED_BASE_ROUTES } from "../../frontend/src/site/spanish_route_set";
import {
  HELD_ROUTES,
  LOCALIZED_LEGAL_PATHS,
  LIVE_ROUTES,
  RETIRED_DESTINATIONS,
  buildRedirectStub,
  heldReason,
  isRetiredRoute,
  resolveDestination,
} from "../../frontend/src/site/route_retirement";

const root = join(__dirname, "..", "..");

/** Every static route the app registers (APP_ROUTES) plus every indexable metadata route. */
function appRoutes(): string[] {
  const main = readFileSync(join(root, "frontend/src/components/MainApp.tsx"), "utf-8");
  const block = /const APP_ROUTES:\s*readonly\s+AppRoute\[\]\s*=\s*\[([^]*?)\n\];/.exec(main)![1];
  const fromApp = [...block.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);
  const seo = readFileSync(join(root, "frontend/src/site/seo_metadata.ts"), "utf-8");
  const meta =
    /const ROUTE_METADATA:\s*Record<string,\s*SeoRouteMetadata>\s*=\s*\{([^]*?)\n\};/.exec(seo)![1];
  const fromSeo = [...meta.matchAll(/^\s+"(\/[^"]*)":\s*\{/gm)].map((m) => m[1]);
  return [...new Set([...fromApp, ...fromSeo])].filter((r) => !r.includes(":") && !r.includes("*"));
}

describe("one-pager route set", () => {
  it("classifies every app route as live, held (with a reason) or retired with a destination", () => {
    const unclassified: string[] = [];
    for (const route of appRoutes()) {
      if (LIVE_ROUTES.includes(route) || isDocsViewerRoute(route)) continue;
      if (heldReason(route)) continue;
      if (!(route in RETIRED_DESTINATIONS)) unclassified.push(route);
    }
    expect(unclassified, `routes without a retirement decision: ${unclassified.join(" ")}`).toEqual(
      []
    );
  });

  it("never lists a live or held route as retired", () => {
    for (const route of Object.keys(RETIRED_DESTINATIONS)) {
      expect(LIVE_ROUTES.includes(route), `live route listed as retired: ${route}`).toBe(false);
      expect(heldReason(route), `held route listed as retired: ${route}`).toBeNull();
    }
  });

  it("keeps retained English and Spanish routes live and maps other retired locale routes", () => {
    expect(isRetiredRoute("/install")).toBe(false);
    expect(isRetiredRoute("/compare")).toBe(false);
    expect(LIVE_ROUTES).toContain("/compare");
    expect(isRetiredRoute("/")).toBe(false);
    expect(isRetiredRoute("/es")).toBe(false);
    expect(isRetiredRoute("/en/")).toBe(false);
    expect(resolveDestination("/de/docs").url).toBe("https://neotoma.io/#references");
    expect(resolveDestination("/fr/install").url).toBe("https://neotoma.io/install");
    expect(resolveDestination("/ar/evaluate").url).toBe("https://neotoma.io/evaluate");
    for (const route of ["/en/install", "/de/docs", "/fr/install", "/ar/evaluate"])
      expect(isRetiredRoute(route)).toBe(true);
  });

  it("holds routes that agents fetch or that are legal surfaces", () => {
    for (const route of [
      "/evaluate",
      "/evaluate/agent-instructions",
      "/markdown/install",
      "/skills/ensure-neotoma",
      "/privacy",
      "/terms",
      "/sandbox",
      "/sandbox/terms-of-use",
      "/meet",
    ]) {
      expect(isRetiredRoute(route), route).toBe(false);
    }
    expect(HELD_ROUTES.every((h) => h.reason.length > 20)).toBe(true);
  });

  it("points every GitHub destination at a file or folder that exists in this repository", () => {
    for (const route of Object.keys(RETIRED_DESTINATIONS)) {
      const dest = resolveDestination(route);
      if (dest.repoPath) {
        expect(existsSync(join(root, dest.repoPath)), `${route} -> ${dest.repoPath}`).toBe(true);
        expect(dest.url.startsWith("https://github.com/markmhendrickson/neotoma/")).toBe(true);
      }
    }
  });

  it("builds a stub with meta refresh, canonical, noindex and a visible link", () => {
    const html = buildRedirectStub("/ai-infrastructure-engineers");
    expect(html).toContain(
      'http-equiv="refresh" content="0; url=https://github.com/markmhendrickson/neotoma/tree/main/docs/icp/"'
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://github.com/markmhendrickson/neotoma/tree/main/docs/icp/">'
    );
    expect(html).toContain('name="robots" content="noindex,follow"');
    expect(html).toMatch(
      /<a href="https:\/\/github\.com\/markmhendrickson\/neotoma\/tree\/main\/docs\/icp\/">Continue/
    );
    expect(buildRedirectStub("/es/docs")).toContain(
      'content="0; url=https://neotoma.io/#references"'
    );
  });

  it("keeps alias fallbacks canonical while navigating preview aliases locally with inbound state", () => {
    const html = buildRedirectStub("/docs/mcp");
    expect(html).toContain('name="robots" content="noindex,follow"');
    expect(html).toContain('content="0; url=https://neotoma.io/mcp/"');
    expect(html).toContain('href="https://neotoma.io/mcp/"');
    const script = /<script>([^]*?)<\/script>/.exec(html)?.[1];
    expect(script).toBeTruthy();
    for (const [pathname, origin, expected] of [
      ["/docs/mcp/", "http://127.0.0.1:4000", "http://127.0.0.1:4000/mcp/?view=all#tools"],
      [
        "/pr-42/docs/mcp/",
        "https://preview.example",
        "https://preview.example/pr-42/mcp/?view=all#tools",
      ],
    ]) {
      let navigated = "";
      runInNewContext(script!, {
        URL,
        location: {
          pathname,
          origin,
          search: "?view=all",
          hash: "#tools",
          replace: (href: string) => {
            navigated = href;
          },
        },
      });
      expect(navigated).toBe(expected);
    }
    expect(buildRedirectStub("/docker")).not.toContain("<script");
    const docsScript = /<script>([^]*?)<\/script>/.exec(buildRedirectStub("/docs"))?.[1];
    let docsTarget = "";
    runInNewContext(docsScript!, {
      URL,
      location: {
        pathname: "/docs",
        origin: "https://neotoma.io",
        search: "",
        hash: "#obsolete",
        replace: (href: string) => {
          docsTarget = href;
        },
      },
    });
    expect(docsTarget).toBe("https://neotoma.io/#references");
  });

  it("sends every former host address and its Markdown mirror to a current connection guide", () => {
    for (const route of Object.keys(RETIRED_DESTINATIONS).filter((r) =>
      r.startsWith("/neotoma-with-")
    )) {
      const host = route.slice("/neotoma-with-".length).split("-connect-")[0];
      const id = host === "claude" ? "claude-desktop" : host;
      const connection = CONNECTIONS.find((item) => item.id === id);
      expect(connection, route).toBeDefined();
      const expected =
        route === "/neotoma-with-claude"
          ? "https://neotoma.io/install/"
          : `https://neotoma.io${connection!.guideRoute}`;
      for (const oldRoute of [route, `/markdown${route}`]) {
        expect(resolveDestination(oldRoute).url, oldRoute).toBe(expected);
        expect(buildRedirectStub(oldRoute), oldRoute).toContain(`content="0; url=${expected}"`);
      }
    }
  });

  it("gives every committed page that disappears a stub, including client-side-only redirects", () => {
    for (const route of ["/docker", "/knowledge-workers", "/quick-start"]) {
      expect(route in RETIRED_DESTINATIONS, route).toBe(true);
      expect(isRetiredRoute(route)).toBe(true);
    }
    expect(resolveDestination("/docker").repoPath).toBe("docs/developer/docker.md");
    expect(resolveDestination("/knowledge-workers").url).toBe("https://neotoma.io/readme/");
    expect(resolveDestination("/quick-start").url).toBe("https://neotoma.io/install");
  });

  it("keeps all Spanish page pairs and connection guides while retiring unknown Spanish routes", () => {
    expect(SPANISH_RETAINED_BASE_ROUTES).toEqual(
      expect.arrayContaining(CONNECTIONS.map((connection) => connection.guideRoute.replace(/\/$/, "")))
    );
    for (const base of SPANISH_RETAINED_BASE_ROUTES) {
      const route = base === "/" ? "/es/" : `/es${base}`;
      expect(isRetiredRoute(route), route).toBe(false);
    }
    for (const route of [
      "/es/docs",
      "/es/install/manual",
      "/es/skills/unknown",
      "/es/neotoma-with-chatgpt",
      "/es/privacy-first",
      "/es/unknown",
    ]) {
      expect(isRetiredRoute(route), route).toBe(true);
    }
  });

  it("holds other localized legal routes and retires their nonlegal routes", () => {
    for (const locale of ["ca", "zh", "de"]) {
      for (const legal of ["/privacy", "/terms", "/sandbox/terms-of-use"]) {
        expect(isRetiredRoute(`/${locale}${legal}`), `${locale}${legal}`).toBe(false);
        expect(heldReason(`/${locale}${legal}`)).toMatch(/counsel/);
      }
      for (const other of ["", "/install", "/evaluate", "/sandbox", "/privacy-first", "/docs"]) {
        expect(isRetiredRoute(`/${locale}${other}`), `${locale}${other}`).toBe(true);
      }
    }
  });
});

describe("llms.txt Links block (agent-fetched)", () => {
  const llms = readFileSync(join(root, "frontend/public/llms.txt"), "utf-8");
  it("lands every link on a live or held route or an existing repository path", () => {
    expect(llmsLinkProblems(llms, root)).toEqual([]);
  });

  it("flags a retired neotoma.io route, a dead GitHub path and an unknown host", () => {
    const bad = (extra: string) => llmsLinkProblems(`${llms}\n- X: ${extra}\n`, root);
    expect(bad("https://neotoma.io/faq").join(" ")).toMatch(/retired route/);
    expect(
      bad("https://github.com/markmhendrickson/neotoma/blob/main/docs/nope.md").join(" ")
    ).toMatch(/does not exist/);
    expect(bad("https://example.com/x").join(" ")).toMatch(/unexpected host/);
    expect(llmsLinkProblems("# Neotoma\n", root).join(" ")).toMatch(/no '## Links' block/);
  });

  it("is based on the Links block only, so a body rewrite does not change the result", () => {
    const rewritten = llms.replace(
      /^[\s\S]*?## Links/,
      "# Neotoma\n\nA different body.\n\n## Links"
    );
    expect(llmsLinkProblems(rewritten, root)).toEqual([]);
  });
});

describe("localized legal routes and their markdown mirrors", () => {
  it("holds the page and the markdown mirror of every localized legal route", () => {
    for (const locale of ["es", "ca", "zh", "hi", "ar", "fr", "pt", "ru", "bn", "ur", "id", "de"]) {
      for (const legal of LOCALIZED_LEGAL_PATHS) {
        for (const route of [`/${locale}${legal}`, `/${locale}/markdown${legal}`]) {
          expect(isRetiredRoute(route), route).toBe(false);
          expect(heldReason(route), route).toMatch(/counsel/);
        }
      }
      // Other localized markdown mirrors are still retired.
      expect(isRetiredRoute(`/${locale}/markdown/install`)).toBe(true);
      expect(isRetiredRoute(`/${locale}/markdown/privacy-first`)).toBe(true);
    }
  });

  it("has one source for the legal path list: the app shell imports it instead of repeating it", () => {
    const main = readFileSync(join(root, "frontend/src/components/MainApp.tsx"), "utf-8");
    expect(main).toContain("LOCALIZED_LEGAL_PATHS");
    expect(main).toContain('from "@/site/route_retirement"');
    expect(main).not.toMatch(/\[\s*"\/privacy"\s*,\s*"\/terms"/);
    // The literal appears once, in the APP_ROUTES entry that defines the page, and nowhere else.
    expect((main.match(/"\/sandbox\/terms-of-use"/g) ?? []).length).toBe(1);
    expect(main).toMatch(/\{ path: "\/sandbox\/terms-of-use", element:/);
    const rr = readFileSync(join(root, "frontend/src/site/route_retirement.ts"), "utf-8");
    expect(rr).not.toMatch(/\*\/\s*\/\*\*[^*]*\*\/\s*export const LOCALIZED_LEGAL_PATHS/);
    const validator = readFileSync(join(root, "scripts/validate_site_export.ts"), "utf-8");
    expect(validator).toContain("LOCALIZED_LEGAL_PATHS");
    expect(validator).toContain("renders the not-found page instead of its content");
  });
});

describe("llms.txt link hardening", () => {
  const llms = readFileSync(join(root, "frontend/public/llms.txt"), "utf-8");
  const bad = (extra: string) => llmsLinkProblems(`${llms}\n- X: ${extra}\n`, root).join(" ");
  it("rejects a path that escapes the repository, plain or percent-encoded", () => {
    expect(bad("https://github.com/markmhendrickson/neotoma/blob/main/../../etc/passwd")).toMatch(
      /escapes the repository/
    );
    expect(
      bad("https://github.com/markmhendrickson/neotoma/blob/main/%2e%2e/%2e%2e/etc/passwd")
    ).toMatch(/escapes the repository/);
    expect(bad("https://github.com/markmhendrickson/neotoma/tree/main/docs/../../..")).toMatch(
      /escapes the repository/
    );
  });

  it("reports a malformed percent-escape as a problem instead of throwing", () => {
    expect(() =>
      bad("https://github.com/markmhendrickson/neotoma/blob/main/docs/%E0%A4%A")
    ).not.toThrow();
    expect(bad("https://github.com/markmhendrickson/neotoma/blob/main/docs/%E0%A4%A")).toMatch(
      /malformed percent-escape/
    );
  });

  it("still accepts a real file and folder inside the repository", () => {
    expect(
      bad("https://github.com/markmhendrickson/neotoma/blob/main/docs/architecture/architecture.md")
    ).toBe("");
    expect(bad("https://github.com/markmhendrickson/neotoma/tree/main/docs/")).toBe("");
  });
});

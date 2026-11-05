import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkSiteArtifact } from "../../scripts/check_site_launch_readiness";

describe("site artifact launch gate", () => {
  it("fails when a preview page loses noindex, then passes with it", () => {
    const root = mkdtempSync(join(tmpdir(), "site-gate-"));
    try {
      const html = '<title>Neotoma</title><link rel="canonical" href="https://neotoma.io/">';
      writeFileSync(join(root, "index.html"), html);
      writeFileSync(join(root, "404.html"), `${html}<meta name="robots" content="noindex,follow">`);
      writeFileSync(join(root, "robots.txt"), "User-agent: *\nDisallow: /\n");
      writeFileSync(join(root, "sitemap.xml"), "<urlset></urlset>");
      expect(checkSiteArtifact(root, true).failures).toContain(
        "index.html: missing preview noindex"
      );
      writeFileSync(
        join(root, "index.html"),
        `${html}<meta name="robots" content="noindex,follow">`
      );
      expect(checkSiteArtifact(root, true).failures).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

import { describe, expect, it } from "vitest";
import { auditMigrationPaths, sitemapUrls } from "../../scripts/site_migration_audit";

describe("sitemap migration audit", () => {
  it("separates retained pages, mapped redirects, and unknown home fallbacks", () => {
    const rows = auditMigrationPaths([
      "https://neotoma.io/install",
      "https://neotoma.io/quick-start",
      "https://neotoma.io/unlisted-private-path",
    ]);
    expect(rows.map((row) => row.disposition)).toEqual(["retained", "redirect", "unmapped"]);
    expect(rows[1].needsHttpRedirect).toBe(true);
    expect(rows[1].destination).toBe("https://neotoma.io/install");
  });

  it("rejects URLs with query or hash and parses sitemap locations", () => {
    expect(() => auditMigrationPaths(["https://neotoma.io/?token=secret"])).toThrow();
    expect(sitemapUrls("<url><loc>https://neotoma.io/install</loc></url>")).toEqual([
      "https://neotoma.io/install",
    ]);
  });

  it("maps retired locale routes to the corresponding English topic", () => {
    const rows = auditMigrationPaths([
      "https://neotoma.io/es/install",
      "https://neotoma.io/fr/backup",
    ]);
    expect(rows[0].destination).toBe("https://neotoma.io/install");
    expect(rows[1].destination).toBe(
      "https://github.com/markmhendrickson/neotoma/blob/main/docs/operations/runbook.md"
    );
  });

  it("does not send former comparison and product topics to the home page", () => {
    const rows = auditMigrationPaths([
      "https://neotoma.io/knowledge-workers",
      "https://neotoma.io/es/neotoma-vs-rag",
      "https://neotoma.io/privacy-first",
    ]);
    expect(rows.every((row) => row.disposition === "redirect")).toBe(true);
    expect(rows.map((row) => row.destination)).toEqual([
      "https://neotoma.io/readme/",
      "https://neotoma.io/read-search/",
      "https://neotoma.io/local-first/",
    ]);
  });
});

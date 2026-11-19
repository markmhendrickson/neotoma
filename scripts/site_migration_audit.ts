/** Audit an observed neotoma.io sitemap against the proposed route migration.
 * A GitHub Pages HTML stub is never counted as a permanent HTTP redirect.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  isRetiredRoute,
  resolveDestination,
  stripTrailingSlash,
} from "../frontend/src/site/route_retirement";

export type MigrationRow = {
  source: string;
  disposition: "retained" | "redirect" | "unmapped" | "chain" | "loop";
  destination: string | null;
  needsHttpRedirect: boolean;
  queryPolicy: "retain_self" | "same_site_only" | "discard_external";
  fragmentPolicy: "retain_self" | "target_anchor_first" | "discard_external";
};

export function auditMigrationPaths(urls: readonly string[]): MigrationRow[] {
  return urls.map((source) => {
    const parsed = new URL(source);
    if (parsed.hostname !== "neotoma.io" || parsed.search || parsed.hash) {
      throw new Error(`Expected a canonical sitemap URL: ${source}`);
    }
    const route = stripTrailingSlash(parsed.pathname);
    if (!isRetiredRoute(route)) {
      return {
        source,
        disposition: "retained",
        destination: source,
        needsHttpRedirect: false,
        queryPolicy: "retain_self",
        fragmentPolicy: "retain_self",
      };
    }
    const target = resolveDestination(route);
    const destination = new URL(target.url, "https://neotoma.io").href;
    const targetPath = new URL(destination).pathname;
    const localeRoot = /^\/(es|ca|zh|hi|ar|fr|pt|ru|bn|ur|id|de)$/.test(route);
    let disposition: MigrationRow["disposition"] = "redirect";
    if (target.kind === "onepager" && !localeRoot) disposition = "unmapped";
    if (destination === source) disposition = "loop";
    if (target.kind === "site" && isRetiredRoute(targetPath)) disposition = "chain";
    const sameSite = new URL(destination).hostname === "neotoma.io";
    return {
      source,
      disposition,
      destination,
      needsHttpRedirect: true,
      queryPolicy: sameSite ? "same_site_only" : "discard_external",
      fragmentPolicy: sameSite ? "target_anchor_first" : "discard_external",
    };
  });
}

export function sitemapUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>(https:\/\/neotoma\.io\/[^<]*)<\/loc>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&")
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const input = process.argv[2];
  if (!input) throw new Error("Usage: tsx scripts/site_migration_audit.ts <saved-sitemap.xml>");
  const rows = auditMigrationPaths(sitemapUrls(fs.readFileSync(input, "utf8")));
  const counts = Object.fromEntries(
    ["retained", "redirect", "unmapped", "chain", "loop"].map((kind) => [
      kind,
      rows.filter((row) => row.disposition === kind).length,
    ])
  );
  process.stdout.write(`${JSON.stringify({ counts, rows }, null, 2)}\n`);
  if (counts.unmapped || counts.chain || counts.loop) process.exitCode = 1;
}

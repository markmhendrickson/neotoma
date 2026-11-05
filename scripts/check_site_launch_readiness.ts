/** Local artifact gate for the finite Neotoma site readiness revision. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type Gate = {
  id: string;
  owner: string;
  status: "pass" | "blocked";
  evidence: string;
  dependency?: string;
};

function filesBelow(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? filesBelow(full) : entry.isFile() ? [full] : [];
  });
}

export function checkSiteArtifact(root: string, preview: boolean) {
  const files = filesBelow(root).sort();
  const html = files.filter((file) => file.endsWith(".html"));
  const failures: string[] = [];
  if (!html.length) failures.push("No HTML pages in artifact");
  for (const file of html) {
    const relative = path.relative(root, file);
    const body = fs.readFileSync(file, "utf8");
    if (!/<title>[^<]+<\/title>/i.test(body)) failures.push(`${relative}: missing title`);
    if (!/<link rel="canonical" href="https:\/\/[^\"]+"/i.test(body))
      failures.push(`${relative}: missing canonical`);
    if (preview && !/<meta name="robots" content="noindex,follow"/i.test(body))
      failures.push(`${relative}: missing preview noindex`);
  }
  const robots = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
  const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
  if (preview) {
    if (robots !== "User-agent: *\nDisallow: /\n")
      failures.push("preview robots is not Disallow: /");
    if (/<loc>/.test(sitemap)) failures.push("preview sitemap includes production URLs");
  } else {
    if (!robots.includes("Sitemap: https://neotoma.io/sitemap.xml"))
      failures.push("production robots lacks sitemap pointer");
    if (!sitemap.includes("<loc>https://neotoma.io/</loc>"))
      failures.push("production sitemap lacks home");
  }
  if (!fs.existsSync(path.join(root, "404.html"))) failures.push("missing 404.html");
  const manifest = files.map((file) => ({
    path: path.relative(root, file).split(path.sep).join("/"),
    bytes: fs.statSync(file).size,
    sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
  }));
  const manifestSha256 = crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  const gates: Gate[] = [
    {
      id: "local_export",
      owner: "Cicada",
      status: failures.length ? "blocked" : "pass",
      evidence: `${html.length} HTML pages; ${files.length} files; manifest sha256 ${manifestSha256}`,
      ...(failures.length ? { dependency: failures.slice(0, 20).join("; ") } : {}),
    },
    {
      id: "http_permanent_redirects",
      owner: "production host owner",
      status: "blocked",
      evidence: "GitHub Pages static redirect stubs do not issue HTTP 301/308",
      dependency:
        "Canonical production deployment configuration and qualified redirect-capable host or edge",
    },
    {
      id: "analytics_and_search_baseline",
      owner: "existing measurement owner",
      status: "blocked",
      evidence: "Client event code alone cannot establish delivery, account access, or indexation",
      dependency:
        "Readback through existing Umami and Search Console access; unknown until available",
    },
    {
      id: "production_switch_and_rollback",
      owner: "root and production host owner",
      status: "blocked",
      evidence: "This is a local preview artifact only",
      dependency:
        "Separate product launch decision, current deployment configuration, production build and rollback artifact",
    },
  ];
  return {
    preview,
    gates,
    failures,
    manifestSha256,
    htmlCount: html.length,
    fileCount: files.length,
    manifest,
  };
}

if (process.argv[1]?.endsWith("check_site_launch_readiness.ts")) {
  const root = process.argv[2];
  const mode = process.argv[3];
  if (!root || !["preview", "production"].includes(mode))
    throw new Error(
      "Usage: tsx scripts/check_site_launch_readiness.ts <site_pages> preview|production"
    );
  const result = checkSiteArtifact(root, mode === "preview");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.failures.length) process.exitCode = 1;
}

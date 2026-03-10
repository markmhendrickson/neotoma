#!/usr/bin/env tsx
/**
 * Writes frontend/src/site/repo_info.json with version (from package.json) and
 * releasesCount (from GitHub API). Used by the landing page so version and
 * "N releases" stay in sync with the repo. Run on npm run dev (watch:ui) and
 * before build:ui / build:pages:site.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const pkgPath = path.join(repoRoot, "package.json");
const outPath = path.join(repoRoot, "frontend", "src", "site", "repo_info.json");

interface RepoInfo {
  version: string;
  releasesCount: number;
}

function getRepoSlug(): string {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const url = pkg.repository?.url ?? "";
  const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  if (match) return match[1];
  return "markmhendrickson/neotoma";
}

function getVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  return (pkg.version as string) ?? "0.0.0";
}

async function fetchReleasesCount(repoSlug: string): Promise<number> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "neotoma-repo-info",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let total = 0;
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `https://api.github.com/repos/${repoSlug}/releases?per_page=${perPage}&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
    }
    const data = (await res.json()) as { draft?: boolean }[];
    const count = Array.isArray(data) ? data.filter((r) => !r.draft).length : 0;
    total += count;
    if (count < perPage) break;
    page++;
  }
  return total;
}

function readExisting(): RepoInfo | null {
  try {
    const raw = fs.readFileSync(outPath, "utf-8");
    return JSON.parse(raw) as RepoInfo;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const version = getVersion();
  const repoSlug = getRepoSlug();
  const existing = readExisting();

  let releasesCount: number;
  try {
    releasesCount = await fetchReleasesCount(repoSlug);
  } catch (err) {
    console.warn("repo_info: could not fetch releases count:", (err as Error).message);
    releasesCount = existing?.releasesCount ?? 0;
  }

  const info: RepoInfo = { version, releasesCount };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(info, null, 2) + "\n", "utf-8");
  console.log(`repo_info: wrote v${info.version} · ${info.releasesCount} releases`);
}

main().catch((err) => {
  console.error("repo_info:", err);
  process.exit(1);
});

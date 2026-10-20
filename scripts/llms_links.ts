/**
 * Checks the Links block of llms.txt, the agent-discovery file served at the site root.
 *
 * Agents follow these links without a browser, so each one must land on a real page:
 * - a neotoma.io link must be a live or held route (never a retired redirect stub);
 * - a GitHub blob or tree link must name a file or folder that exists in this repository;
 * - the GitHub repository root and its releases, issues and discussions pages are allowed;
 * - the npm package page is allowed; any other host is a problem.
 *
 * Only the Links block is checked (from the "## Links" heading), so a rewrite of the body
 * does not affect it.
 */
import fs from "node:fs";
import path from "node:path";
import { isRetiredRoute } from "../frontend/src/site/route_retirement";

const GITHUB = "https://github.com/markmhendrickson/neotoma";

export function llmsLinksBlock(text: string): string | null {
  const i = text.indexOf("## Links");
  return i < 0 ? null : text.slice(i);
}

export function llmsLinkProblems(text: string, repoRoot: string): string[] {
  const block = llmsLinksBlock(text);
  if (block === null) return ["llms.txt has no '## Links' block"];
  const problems: string[] = [];
  const urls = [...block.matchAll(/https?:\/\/[^\s)>\]]+/g)].map((m) =>
    m[0].replace(/[.,;]+$/, "")
  );
  if (urls.length === 0) problems.push("llms.txt Links block has no links");
  let siteLinks = 0;
  for (const url of urls) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      problems.push(`not a URL: ${url}`);
      continue;
    }
    if (u.hostname === "neotoma.io") {
      siteLinks++;
      const route = u.pathname.replace(/\/+$/, "") || "/";
      if (isRetiredRoute(route)) problems.push(`neotoma.io link is a retired route: ${url}`);
    } else if (url === GITHUB || url.startsWith(`${GITHUB}/`) || url.startsWith(`${GITHUB}#`)) {
      const rest = url.slice(GITHUB.length).replace(/#.*$/, "");
      if (rest === "" || rest === "/" || /^\/(releases|issues|discussions)$/.test(rest)) continue;
      const m = /^\/(blob|tree)\/main\/(.+)$/.exec(rest);
      if (!m) {
        problems.push(`unrecognised GitHub link shape: ${url}`);
      } else if (!fs.existsSync(path.join(repoRoot, decodeURIComponent(m[2])))) {
        problems.push(`GitHub link names a path that does not exist in the repository: ${url}`);
      }
    } else if (url === "https://www.npmjs.com/package/neotoma") {
      continue;
    } else {
      problems.push(`link to an unexpected host: ${url}`);
    }
  }
  if (siteLinks === 0) problems.push("llms.txt Links block has no neotoma.io link");
  return problems;
}

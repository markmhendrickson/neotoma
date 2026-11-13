import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Contract: every input to the server image must classify as "deploy".
 *
 * scripts/classify_deploy_changes.mjs skips the operator-instance deploy for
 * pushes that touch only paths it believes cannot change the image. Its skip
 * list is hand-maintained and nothing else ties it to the Dockerfile, so a new
 * `COPY <path>` (or a `!path` re-include in .dockerignore) for a path the skip
 * list covers (docs/, *.md, tests/, ...) would make edits to that file silently
 * undeployable. This test derives the image inputs from the Dockerfile and
 * .dockerignore and fails when the classifier would skip any of them.
 */

const classifier: unknown = await import("../../scripts/classify_deploy_changes.mjs");
const { classifyPath } = classifier as {
  classifyPath: (p: string) => { verdict: string; why: string };
};

const ROOT = path.resolve(__dirname, "../..");

/**
 * "deploy", or "package_json": the classifier decides package.json by parsed
 * content (metadata-only edits skip by design), so it is the one image input
 * whose path alone is not an unconditional deploy. Anything else, i.e. "skip",
 * fails.
 */
const DEPLOYS = /^(deploy|package_json)$/;

/**
 * Re-included in .dockerignore but not copied into any image stage (only
 * package.json "files" for npm uses it), so editing it cannot change the image.
 * An entry here is ignored if a COPY source ever covers the path.
 */
const NOT_IMAGE_INPUTS: Record<string, string> = {
  "README.md": "re-included for the npm package; no Dockerfile stage copies it",
};

/** Joins backslash continuations and drops comment and blank lines. */
function logicalLines(text: string): string[] {
  const out: string[] = [];
  let acc = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!acc && (line === "" || line.startsWith("#"))) continue;
    if (acc && line.startsWith("#")) continue; // comment inside a continuation
    if (line.endsWith("\\")) {
      acc += line.slice(0, -1) + " ";
      continue;
    }
    out.push((acc + line).trim());
    acc = "";
  }
  if (acc.trim()) out.push(acc.trim());
  return out;
}

/** Local (non --from) COPY/ADD sources, in shell or JSON-array form. */
export function dockerfileSources(text: string): string[] {
  const sources: string[] = [];
  for (const line of logicalLines(text)) {
    const m = /^(COPY|ADD)\s+(.*)$/i.exec(line);
    if (!m) continue;
    let rest = m[2].trim();
    let fromStage = false;
    for (;;) {
      const flag = /^--([\w-]+)(?:=\S*)?\s*/.exec(rest);
      if (!flag) break;
      if (flag[1] === "from") fromStage = true;
      rest = rest.slice(flag[0].length);
    }
    if (fromStage) continue;
    let args: string[];
    if (rest.startsWith("[")) args = JSON.parse(rest) as string[];
    else args = rest.split(/\s+/).filter(Boolean);
    sources.push(...args.slice(0, -1)); // last arg is the destination
  }
  return sources;
}

/** `!pattern` re-include lines from .dockerignore. */
export function dockerignoreReincludes(text: string): string[] {
  return logicalLines(text)
    .filter((l) => l.startsWith("!"))
    .map((l) => l.slice(1).trim().replace(/^\//, ""));
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.name === "node_modules") continue;
    if (e.isDirectory()) out.push(...listFiles(rel));
    else out.push(rel);
  }
  return out;
}

/**
 * Concrete repo paths to classify for one source. A directory yields its
 * prefix (with trailing slash) plus a representative file inside; a glob is
 * matched against the entries of its directory.
 */
function expand(source: string): string[] {
  const clean = source.replace(/^\.\//, "").replace(/\/+$/, "");
  if (/[*?[]/.test(clean)) {
    const dir = path.posix.dirname(clean);
    const re = new RegExp(
      "^" +
        path.posix
          .basename(clean)
          .replace(/[.+^${}()|\\]/g, "\\$&")
          .replace(/\*/g, "[^/]*")
          .replace(/\?/g, "[^/]") +
        "$"
    );
    const base = dir === "." ? "" : dir;
    return fs
      .readdirSync(path.join(ROOT, base || "."))
      .filter((n) => re.test(n))
      .flatMap((n) => expand(path.posix.join(base, n)));
  }
  const abs = path.join(ROOT, clean);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isDirectory()) {
    const files = listFiles(clean);
    return files.length ? [`${clean}/`, files[0]] : [`${clean}/`];
  }
  return [clean];
}

describe("deploy image input contract", () => {
  const dockerfile = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
  const dockerignore = fs.readFileSync(path.join(ROOT, ".dockerignore"), "utf8");

  it("parser handles continuations, multiple sources, JSON form, comments, --from", () => {
    const sample = [
      "# COPY ignored/ ./",
      "COPY a.txt \\",
      "  # comment mid-continuation",
      "     b/ ./dest/",
      'COPY ["c d.txt", "e/", "./"]',
      "COPY --chown=1:1 --from=build /app/dist ./dist",
      "copy --link f* ./",
      "RUN echo COPY nope ./",
    ].join("\n");
    expect(dockerfileSources(sample)).toEqual(["a.txt", "b/", "c d.txt", "e/", "f*"]);
    expect(dockerignoreReincludes("# !x\ndocs/\n!/a/b.yaml\n  !README.md\n")).toEqual([
      "a/b.yaml",
      "README.md",
    ]);
  });

  it("finds a non-trivial set of image inputs (instrument is not vacuous)", () => {
    const sources = dockerfileSources(dockerfile);
    expect(sources).toContain("inspector/");
    expect(sources).toContain("tests/fixtures/json");
    expect(expand("package*.json")).toEqual(expect.arrayContaining(["package.json"]));
    expect(dockerignoreReincludes(dockerignore).length).toBeGreaterThan(0);
  });

  // `COPY . .` (build stage) takes the whole context; what the context holds is
  // governed by .dockerignore, whose re-includes are checked below.
  const copySources = dockerfileSources(dockerfile).filter((s) => s !== ".");

  it.each(copySources)("COPY source %s classifies as deploy", (source) => {
    const paths = expand(source);
    expect(paths.length, `COPY source ${source} matches nothing in the repo`).toBeGreaterThan(0);
    for (const p of paths) {
      expect(classifyPath(p).verdict, `${p} (COPY ${source}) would skip the deploy`).toMatch(
        DEPLOYS
      );
    }
  });

  const reincludes = dockerignoreReincludes(dockerignore);
  it.each(reincludes)(".dockerignore re-include !%s classifies as deploy", (pattern) => {
    const covered = copySources.some((s) => expand(s).some((p) => expand(pattern).includes(p)));
    if (NOT_IMAGE_INPUTS[pattern] && !covered) return;
    const paths = expand(pattern);
    expect(paths.length, `re-include !${pattern} matches nothing in the repo`).toBeGreaterThan(0);
    for (const p of paths) {
      expect(classifyPath(p).verdict, `${p} (!${pattern}) would skip the deploy`).toMatch(DEPLOYS);
    }
  });
});

import { execFileSync } from "node:child_process";
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
 * "skip" is the only failing verdict. "package_json" is the one input the
 * classifier decides by parsed content (metadata-only edits skip by design), so
 * its path alone is not an unconditional deploy.
 */
const SKIPS = "skip";

/**
 * Re-included in .dockerignore but not read by any build step or carried into
 * the runtime image (`COPY . .` puts it in the build stage only; the runtime
 * stage copies explicit paths, and package.json "files" is its sole user), so
 * editing it cannot change the image. An entry here is ignored if a COPY source
 * ever covers the path.
 */
const NOT_IMAGE_INPUTS: Record<string, string> = {
  "README.md": "re-included for the npm package; no stage reads it into the runtime image",
};

/**
 * Joins backslash continuations and drops comment and blank lines. A blank or
 * comment line inside a continuation is ignored, as Docker does.
 */
function logicalLines(text: string): string[] {
  const out: string[] = [];
  let acc = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
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

/**
 * Sources that originate in the build context: every local COPY/ADD source
 * (shell or JSON-array form, ONBUILD included), plus `COPY --from=<stage>
 * /app/<path>` sources, because the build stage runs `COPY . .` into WORKDIR
 * /app, so a stage path that is also a tracked repo path (openapi.yaml) is a
 * context file. Stage outputs that are not repo paths (dist/) drop out later,
 * when no tracked file matches.
 */
export function dockerfileSources(text: string): string[] {
  const sources: string[] = [];
  for (const line of logicalLines(text)) {
    const m = /^(?:ONBUILD\s+)?(COPY|ADD)\s+(.*)$/i.exec(line);
    if (!m) continue;
    let rest = m[2].trim();
    let fromStage = false;
    for (;;) {
      const flag = /^--([\w-]+)(?:=\S*)?\s*/.exec(rest);
      if (!flag) break;
      if (flag[1] === "from") fromStage = true;
      rest = rest.slice(flag[0].length);
    }
    const args: string[] = rest.startsWith("[")
      ? (JSON.parse(rest) as string[])
      : rest.split(/\s+/).filter(Boolean);
    for (const src of args.slice(0, -1)) {
      if (!fromStage) sources.push(src);
      else if (src.startsWith("/app/")) sources.push(src.slice("/app/".length));
    }
  }
  return sources;
}

/** `!pattern` re-include lines from .dockerignore. */
export function dockerignoreReincludes(text: string): string[] {
  return logicalLines(text)
    .filter((l) => l.startsWith("!"))
    .map((l) => l.slice(1).trim().replace(/^\//, ""));
}

function trackedFiles(p: string): string[] {
  // Run git against ROOT regardless of any GIT_* variables the caller exports.
  const gitEnv: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("GIT_")) gitEnv[k] = v;
  return execFileSync("git", ["ls-files", "-z", "--", p], {
    cwd: ROOT,
    env: gitEnv,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .sort();
}

/**
 * Concrete repo paths to classify for one source: a tracked file is itself; a
 * tracked directory yields its prefix (with trailing slash) plus EVERY tracked
 * file under it, sorted, because the classifier decides by path shape and any
 * file in the directory may be the one on the skip list. A glob is matched
 * against the entries of its directory. Untracked build outputs yield nothing.
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
    return fs
      .readdirSync(path.join(ROOT, dir))
      .filter((n) => re.test(n))
      .sort()
      .flatMap((n) => expand(dir === "." ? n : path.posix.join(dir, n)));
  }
  const files = trackedFiles(clean);
  if (files.length === 0) return [];
  return files.length === 1 && files[0] === clean ? files : [`${clean}/`, ...files];
}

const FIX =
  "add an ALWAYS_DEPLOY rule for it in scripts/classify_deploy_changes.mjs " +
  "(ahead of the SKIP rules), or stop copying it into the image";

/** Image-input paths the classifier would skip, with the fix named. */
function skipped(source: string, label: string): string[] {
  return expand(source)
    .filter((p) => classifyPath(p).verdict === SKIPS)
    .map((p) => `${p} (${label}) would skip the deploy; ${FIX}`);
}

/** Every violation for a Dockerfile / .dockerignore pair. */
function violations(dockerfile: string, dockerignore: string): string[] {
  const out: string[] = [];
  // `COPY . .` (build stage) takes the whole context; what it holds is governed
  // by the .dockerignore re-includes, checked below.
  const copies = dockerfileSources(dockerfile).filter((s) => s !== ".");
  for (const s of copies) out.push(...skipped(s, `COPY ${s}`));
  for (const r of dockerignoreReincludes(dockerignore)) {
    const covered = copies.some((s) => expand(s).some((p) => expand(r).includes(p)));
    if (NOT_IMAGE_INPUTS[r] && !covered) continue;
    out.push(...skipped(r, `!${r}`));
  }
  return out;
}

describe("deploy image input contract", () => {
  const dockerfile = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
  const dockerignore = fs.readFileSync(path.join(ROOT, ".dockerignore"), "utf8");

  it("parser handles continuations, blank lines, multiple sources, JSON form, ONBUILD, comments, --from", () => {
    const sample = [
      "# COPY ignored/ ./",
      "COPY a.txt \\",
      "  # comment mid-continuation",
      "",
      "     b/ ./dest/",
      'COPY ["c d.txt", "e/", "./"]',
      "COPY --chown=1:1 --from=build /app/dist ./dist",
      "COPY --from=build /app/openapi.yaml ./openapi.yaml",
      "COPY --from=other /etc/x ./x",
      "copy --link f* ./",
      "ONBUILD COPY g/ ./g/",
      "RUN echo COPY nope ./",
    ].join("\n");
    expect(dockerfileSources(sample)).toEqual([
      "a.txt",
      "b/",
      "c d.txt",
      "e/",
      "dist",
      "openapi.yaml",
      "f*",
      "g/",
    ]);
    expect(dockerignoreReincludes("# !x\ndocs/\n!/a/b.yaml\n  !README.md\n")).toEqual([
      "a/b.yaml",
      "README.md",
    ]);
  });

  it("finds a non-trivial set of image inputs (instrument is not vacuous)", () => {
    const sources = dockerfileSources(dockerfile);
    expect(sources).toContain("inspector/");
    expect(sources).toContain("tests/fixtures/json");
    // A context file copied via a build-stage path is still an input, and the
    // always-deploy rules cover it.
    expect(sources).toContain("openapi.yaml");
    expect(classifyPath("openapi.yaml").verdict).toBe("deploy");
    expect(expand("package*.json")).toEqual(expect.arrayContaining(["package.json"]));
    expect(expand("inspector/").length).toBeGreaterThan(2);
    expect(dockerignoreReincludes(dockerignore).length).toBeGreaterThan(0);
  });

  it("the repository's image inputs all deploy", () => {
    expect(violations(dockerfile, dockerignore)).toEqual([]);
  });

  it("checks every file under a directory source, not a sample", () => {
    const found = violations(`${dockerfile}\nCOPY config/ ./config/\n`, dockerignore).join("\n");
    expect(found).toContain("config/aauth/tpm_attestation_roots/README.md");
    expect(found).toContain("ALWAYS_DEPLOY");
  });

  it("flags a re-included directory the same way", () => {
    const found = violations(dockerfile, `${dockerignore}\n!config/\n`).join("\n");
    expect(found).toContain("config/aauth/tpm_attestation_roots/README.md");
  });
});

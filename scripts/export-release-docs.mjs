import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};

try {
  const allowed = new Set(["--release", "--commit", "--output", "--check"]);
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i]) || !args[i + 1] || args[i + 1].startsWith("--"))
      throw new Error(
        "Expected --release vX.Y.Z --commit <40-character SHA> [--output file | --check file]"
      );
    i++;
  }
  const release = option("--release");
  const commit = option("--commit");
  if (!/^v\d+\.\d+\.\d+$/.test(release ?? "") || !/^[a-f0-9]{40}$/.test(commit ?? ""))
    throw new Error("An explicit release tag and immutable commit SHA are required");
  if (option("--output") && option("--check"))
    throw new Error("--output and --check are mutually exclusive");
  if (git("rev-parse", "--is-shallow-repository") !== "false")
    throw new Error("Fetch full release history and tags before exporting");
  if (git("rev-parse", `refs/tags/${release}^{commit}`) !== commit)
    throw new Error("Release tag does not resolve to the requested commit");
  const remote = git("remote", "get-url", "origin");
  const repository = remote.match(
    /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/
  )?.[1];
  if (!repository) throw new Error("Expected a GitHub origin for immutable source links");
  const manifestText = readFileSync(
    new URL("../docs/site/release_docs_manifest.json", import.meta.url),
    "utf8"
  );
  const manifest = JSON.parse(manifestText);
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.pages) || !manifest.pages.length)
    throw new Error("Invalid or empty release documentation manifest");
  const seen = new Set();
  const pages = manifest.pages
    .map((page) => {
      if (!/^\/docs\/[a-z0-9-]+$/.test(page.route) || seen.has(page.route))
        throw new Error("Invalid or duplicate route");
      seen.add(page.route);
      if (!/^docs\/(developer|specs)\/[a-zA-Z0-9_-]+\.md$/.test(page.source))
        throw new Error("Source outside public documentation allowlist");
      if (page.coverage !== "reference_only") throw new Error("Unrecognized coverage state");
      const content = execFileSync("git", ["show", `${commit}:${page.source}`], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (!content.trim()) throw new Error(`Empty source: ${page.source}`);
      return {
        ...page,
        content,
        sha256: hash(content),
        source_url: `https://github.com/${repository}/blob/${commit}/${page.source}`,
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route));
  const toolSource = git("show", `${commit}:src/tool_definitions.ts`);
  const tools = [
    ...new Set([...toolSource.matchAll(/^\s*name: "([a-z][a-z0-9_]*)",\s*$/gm)].map((m) => m[1])),
  ].sort();
  if (!tools.length) throw new Error("MCP tool extraction returned no tools");
  const reference = pages.find((page) => page.source === "docs/specs/MCP_SPEC.md");
  if (!reference) throw new Error("MCP inventory has no reference page");
  const payload = {
    schema_version: 1,
    product: "neotoma",
    release,
    implementation_commit: commit,
    documentation_commit: commit,
    manifest_sha256: hash(manifestText),
    exporter_sha256: hash(readFileSync(fileURLToPath(import.meta.url), "utf8")),
    coverage: "reference_only",
    pages,
    capabilities: tools.map((name) => ({
      id: `mcp:${name}`,
      surface: "mcp",
      state: "released",
      route: reference.route,
      coverage: "reference_only",
    })),
  };
  const serialized =
    JSON.stringify({ ...payload, payload_sha256: hash(JSON.stringify(payload)) }, null, 2) + "\n";
  if (option("--check")) {
    if (readFileSync(option("--check"), "utf8") !== serialized)
      throw new Error("Documentation bundle is stale or altered");
    console.log("Release documentation bundle matches pinned sources");
  } else if (option("--output")) {
    writeFileSync(option("--output"), serialized, { flag: "wx" });
    console.log(`Exported ${pages.length} pages and ${tools.length} MCP reference entries`);
  } else process.stdout.write(serialized);
} catch (error) {
  console.error(`Release docs export failed: ${error.message}`);
  process.exitCode = 1;
}

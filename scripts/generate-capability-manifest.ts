/**
 * Generator script for src/shared/capability_manifest.json.
 *
 * Walks all vX.Y.Z git release tags (oldest-first) and detects the earliest
 * version in which each MCP tool name appeared in src/tool_definitions.ts,
 * and the version in which it was last seen before removal (if ever removed).
 *
 * The result is written to src/shared/capability_manifest.json.
 *
 * Usage:
 *   npm run generate:capability-manifest
 *
 * When to re-run:
 *   - After adding or removing an MCP tool in src/tool_definitions.ts
 *   - After cutting a new release tag (the new tag will be included)
 *   - CI: run with --check to verify the committed file is up-to-date
 *
 * DO NOT edit src/shared/capability_manifest.json by hand.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outPath = resolve(repoRoot, "src/shared/capability_manifest.json");

/** Parse semver-shaped tag for sorting. Tags must be vX.Y.Z. */
function semverKey(tag: string): [number, number, number] {
  const m = tag.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1]!), parseInt(m[2]!), parseInt(m[3]!)];
}

/** Extract the set of tool names from a raw tool_definitions.ts source file. */
function extractToolNames(source: string): Set<string> {
  const tools = new Set<string>();
  for (const line of source.split("\n")) {
    const stripped = line.trim();
    // Match lines like:    name: "tool_name",
    if (stripped.startsWith('name: "') && stripped.endsWith('",')) {
      const name = stripped.slice(7, -2);
      // Sanity check: tool names are snake_case identifiers
      if (/^[a-z][a-z0-9_]*$/.test(name)) {
        tools.add(name);
      }
    }
  }
  return tools;
}

/** Run git and capture stdout. Returns null on non-zero exit. */
function gitShow(ref: string): string | null {
  try {
    return execSync(`git show "${ref}"`, {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

function main(): void {
  const checkMode = process.argv.includes("--check");

  // Collect all vX.Y.Z release tags
  const tagOutput = execSync("git tag", { cwd: repoRoot, encoding: "utf-8" });
  const allTags = tagOutput
    .trim()
    .split("\n")
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t));

  if (allTags.length === 0) {
    console.error("No vX.Y.Z release tags found. Aborting.");
    process.exit(1);
  }

  // Sort oldest-first so we detect first-appearance correctly
  allTags.sort((a, b) => {
    const [a1, a2, a3] = semverKey(a);
    const [b1, b2, b3] = semverKey(b);
    return a1 - b1 || a2 - b2 || a3 - b3;
  });

  const firstTrackedVersion = allTags[0]!;

  // Walk tags, tracking first and last appearance of each tool
  const toolFirstVersion = new Map<string, string>();
  const toolLastSeen = new Map<string, string>(); // last tag where the tool was present
  let prevTools = new Set<string>();

  for (const tag of allTags) {
    const source = gitShow(`${tag}:src/tool_definitions.ts`);
    if (source === null) continue; // file didn't exist yet at this tag

    const tools = extractToolNames(source);
    if (tools.size === 0) {
      console.warn(`Tag ${tag} produced 0 tools — possible parser drift`);
      continue; // skip if parse yielded nothing (shouldn't happen)
    }

    // Detect new tools at this tag
    for (const t of tools) {
      if (!prevTools.has(t) && !toolFirstVersion.has(t)) {
        toolFirstVersion.set(t, tag);
      }
      toolLastSeen.set(t, tag);
    }

    prevTools = tools;
  }

  // The last tag in our walk represents HEAD-of-release. Tools absent from the
  // final set (but present in toolLastSeen) were removed at some point.
  // removedInVersion = the first tag where the tool was NO longer present.
  // Since we only have per-tag snapshots, we approximate: removed "at" the next
  // tag after toolLastSeen[tool]. We store toolLastSeen+1 as the removal marker,
  // but since we only know discrete tags, we record the tag AFTER their last
  // appearance — which is the one where they first went missing.
  const toolRemovedVersion = new Map<string, string>();
  for (const [tool, lastSeenTag] of toolLastSeen) {
    if (!prevTools.has(tool)) {
      // Tool was removed. Find the tag immediately after lastSeenTag.
      const idx = allTags.indexOf(lastSeenTag);
      if (idx >= 0 && idx + 1 < allTags.length) {
        toolRemovedVersion.set(tool, allTags[idx + 1]!);
      }
    }
  }

  // Build manifest
  const toolsManifest: Record<
    string,
    { addedInVersion: string; removedInVersion?: string }
  > = {};

  for (const [tool, version] of [...toolFirstVersion.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  )) {
    const entry: { addedInVersion: string; removedInVersion?: string } = {
      addedInVersion: version,
    };
    const removed = toolRemovedVersion.get(tool);
    if (removed) {
      entry.removedInVersion = removed;
    }
    toolsManifest[tool] = entry;
  }

  const manifest = {
    _meta: {
      description:
        "Generated manifest of MCP tool introduction versions. DO NOT edit by hand. Regenerate with: npm run generate:capability-manifest",
      generated_from: "git tags (vX.Y.Z release tags)",
      first_tracked_version: firstTrackedVersion,
    },
    tools: toolsManifest,
  };

  const jsonOutput = JSON.stringify(manifest, null, 2) + "\n";

  if (checkMode) {
    // Read the committed file and compare
    let existing: string;
    try {
      existing = readFileSync(outPath, "utf-8");
    } catch {
      console.error(`FAIL: ${outPath} does not exist. Run npm run generate:capability-manifest`);
      process.exit(1);
    }
    if (existing === jsonOutput) {
      console.log("OK: capability_manifest.json is up-to-date.");
      process.exit(0);
    } else {
      console.error(
        "FAIL: capability_manifest.json is stale. Run: npm run generate:capability-manifest"
      );
      process.exit(1);
    }
  }

  writeFileSync(outPath, jsonOutput, "utf-8");
  const toolCount = Object.keys(toolsManifest).length;
  console.log(
    `Wrote ${outPath} — ${toolCount} tools tracked across ${allTags.length} release tags.`
  );
}

main();

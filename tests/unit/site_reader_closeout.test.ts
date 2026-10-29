import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOPIC_VISUALS } from "../../frontend/src/site/topic_visuals";
import { DOCS_VIEWER_MANIFEST } from "../../frontend/src/site/docs_viewer_manifest";
import { manifestProblems, runDocsViewer } from "../../scripts/docs_viewer/build";

const root = join(__dirname, "..", "..");

// This is the accepted reader population, independent of the runtime manifest and host registry.
// A route disappears or points at another source only after this acceptance map is reviewed.
const INTENDED_READERS: Record<string, string> = {
  "/readme": "docs/topics/start.md",
  "/install/system-changes": "docs/topics/install/system-changes.md",
  "/cli": "docs/topics/interfaces/cli.md",
  "/mcp": "docs/topics/interfaces/mcp.md",
  "/rest-api": "docs/topics/interfaces/rest-api.md",
  "/integrations": "docs/integrations/matrix.md",
  "/architecture": "docs/topics/architecture/README.md",
  "/vocabulary": "docs/topics/architecture/vocabulary.md",
  "/interfaces": "docs/topics/interfaces/README.md",
  "/read-search": "docs/topics/interfaces/read-search.md",
  "/store-correct": "docs/topics/interfaces/store-correct.md",
  "/provenance": "docs/topics/architecture/provenance.md",
  "/record-model": "docs/topics/architecture/record-model.md",
  "/observations": "docs/topics/architecture/observations.md",
  "/current-snapshot": "docs/topics/architecture/current-snapshot.md",
  "/schemas": "docs/topics/architecture/schemas.md",
  "/history": "docs/topics/architecture/history.md",
  "/trust": "docs/topics/trust/README.md",
  "/local-first": "docs/topics/trust/local-first.md",
  "/export-backup": "docs/topics/trust/export-backup.md",
  "/license": "docs/topics/trust/license.md",
  "/limitations": "docs/topics/trust/limitations.md",
  "/install/claude-code": "docs/guides/connections/claude-code.md",
  "/install/cursor": "docs/guides/connections/cursor.md",
  "/install/codex": "docs/guides/connections/codex.md",
  "/install/openclaw": "docs/guides/connections/openclaw.md",
  "/install/claude-desktop": "docs/guides/connections/claude-desktop.md",
  "/install/chatgpt": "docs/guides/connections/chatgpt.md",
  "/install/windsurf": "docs/guides/connections/windsurf.md",
  "/install/continue": "docs/guides/connections/continue.md",
  "/install/vscode": "docs/guides/connections/vscode.md",
  "/install/ironclaw": "docs/guides/connections/ironclaw.md",
  "/install/letta": "docs/guides/connections/letta.md",
  "/install/opencode": "docs/guides/connections/opencode.md",
  "/install/claude-agent-sdk": "docs/guides/connections/claude-agent-sdk.md",
  "/install/antigravity": "docs/guides/connections/antigravity.md",
  "/install/grok-bot": "docs/guides/connections/grok-bot.md",
  "/install/smithery": "docs/guides/connections/smithery.md",
};

describe("site reader closeout", () => {
  it("publishes the complete intended route and canonical source set", () => {
    expect(Object.keys(INTENDED_READERS)).toHaveLength(38);
    expect(manifestProblems(DOCS_VIEWER_MANIFEST)).toEqual([]);
    const included = DOCS_VIEWER_MANIFEST.filter((entry) => entry.status === "included");
    expect(Object.fromEntries(included.map((entry) => [`/${entry.slug}`, entry.source]))).toEqual(
      INTENDED_READERS
    );

    const build = runDocsViewer({ repoRoot: root, manifest: DOCS_VIEWER_MANIFEST });
    expect(build.failures).toEqual([]);
    expect(
      Object.fromEntries(build.published.map((entry) => [`/${entry.slug}`, entry.source]))
    ).toEqual(INTENDED_READERS);
  });

  it("keeps each included reader within a moderate one-page word budget", () => {
    const included = DOCS_VIEWER_MANIFEST.filter((entry) => entry.status === "included");
    expect(included).toHaveLength(Object.keys(INTENDED_READERS).length);
    for (const entry of included) {
      const source = readFileSync(join(root, entry.source), "utf8");
      const words = source.trim().split(/\s+/).filter(Boolean).length;
      expect(words, `${entry.slug}: ${words} whitespace-delimited words`).toBeLessThanOrEqual(
        entry.id === "architecture" ? 1800 : entry.id === "install-system-changes" ? 1300 : 900
      );
    }
  });
});

describe("architecture overview and distinct topic identities", () => {
  it("introduces the architecture before its invoice example and links to the detailed topics", () => {
    const source = readFileSync(join(root, "docs/topics/architecture/README.md"), "utf8");
    const example = source.indexOf("## Follow an invoice");
    expect(example).toBeGreaterThan(0);
    expect(source.slice(0, example).match(/^## /gm)).toHaveLength(4);
    expect(source.slice(0, example)).not.toContain("INV-2041");
    expect(source.match(/https:\/\/neotoma.io\//g)!.length).toBeGreaterThanOrEqual(12);
    expect(source).toContain("# How the system of record works");
    expect(source.indexOf("`last_write`", example)).toBeGreaterThan(example);
  });
  it("gives the 35 illustrated readers and virtual Install topic distinct compositions", () => {
    const included = DOCS_VIEWER_MANIFEST.filter((entry) => entry.status === "included");
    const illustrated = included.filter((entry) => entry.visualId);
    expect(included.filter((entry) => !entry.visualId).map((entry) => entry.id)).toEqual([
      "install-system-changes",
      "install-antigravity",
      "install-grok-bot",
    ]);
    const ids = [...illustrated.map((entry) => entry.visualId), "install"];
    expect(ids).toHaveLength(36);
    expect(ids.every(Boolean)).toBe(true);
    const scenes = ids.map((id) => TOPIC_VISUALS[id as keyof typeof TOPIC_VISUALS].scene);
    expect(new Set(scenes).size).toBe(36);
    const duplicate = included.map((entry, index) =>
      index === 1 ? { ...entry, visualId: included[0].visualId } : entry
    );
    expect(
      manifestProblems(duplicate).some((problem) => problem.includes("duplicate topic visual"))
    ).toBe(true);
  });
});

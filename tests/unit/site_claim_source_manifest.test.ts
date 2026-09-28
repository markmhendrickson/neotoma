import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateSiteClaimSources } from "../../scripts/validate_site_claim_sources";

const tempRoots: string[] = [];
const COMMIT = "4578f8e2e6d8defe288ab807afebe4f043bb180f";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function makeFixture(overrides: Record<string, string | number | boolean> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "site-claims-"));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, "docs/site"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/foundation"), { recursive: true });
  const source = "# Product category\n\nThe system of record for AI agents.\n";
  fs.writeFileSync(path.join(root, "docs/foundation/category.md"), source);

  const row = {
    claim_id: "home.category",
    routes: ["/"],
    section_id: "hero",
    required: true,
    claim_class: "current",
    source_repository: "example/neotoma",
    source_path: "docs/foundation/category.md",
    source_commit: COMMIT,
    source_digest: digest(source),
    transform: "whole_file_sha256_v1",
    fallback: "fail_closed",
    public_url: `https://github.com/example/neotoma/blob/${COMMIT}/docs/foundation/category.md`,
    reviewer: "product-review",
    last_verified: "2026-09-28",
    freshness_days: 30,
    license: "repository-license",
    provenance: "repository-source",
    public_classification: "public",
    ...overrides,
  };
  const manifest = [
    "version: 1",
    "claim_source_contract:",
    "  schema_version: 1",
    "  manifest_revision: test-v1",
    "  source_repository: example/neotoma",
    "claims:",
    ...Object.entries(row).flatMap(([key, value]) => {
      if (Array.isArray(value)) return [`    ${key}:`, ...value.map((item) => `      - ${item}`)];
      const prefix = key === "claim_id" ? "  - " : "    ";
      return [`${prefix}${key}: ${JSON.stringify(value)}`];
    }),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(root, "docs/site/site_doc_manifest.yaml"), manifest);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("site claim-source manifest", () => {
  it("accepts a complete, fresh, public, digest-matched row", () => {
    const root = makeFixture();
    expect(validateSiteClaimSources({ repoRoot: root, asOf: "2026-09-28" })).toEqual([]);
  });

  it("fails closed when source bytes drift", () => {
    const root = makeFixture();
    fs.appendFileSync(
      path.join(root, "docs/foundation/category.md"),
      "Changed without manifest update.\n"
    );
    expect(validateSiteClaimSources({ repoRoot: root, asOf: "2026-09-28" })).toContain(
      "home.category: source digest drift for docs/foundation/category.md"
    );
  });

  it("rejects stale current claims", () => {
    const root = makeFixture({ last_verified: "2026-08-01", freshness_days: 30 });
    expect(validateSiteClaimSources({ repoRoot: root, asOf: "2026-09-28" })).toContain(
      "home.category: current claim is stale as of 2026-09-28"
    );
  });

  it("rejects non-public source paths and mismatched immutable links", () => {
    const root = makeFixture({
      source_path: "docs/private/category.md",
      public_url: "https://example.invalid/category",
    });
    const errors = validateSiteClaimSources({ repoRoot: root, asOf: "2026-09-28" });
    expect(errors).toContain(
      "home.category: source_path must be a public repository-relative path"
    );
    expect(errors).toContain(
      "home.category: public_url must resolve exactly to the pinned repository path"
    );
  });
});

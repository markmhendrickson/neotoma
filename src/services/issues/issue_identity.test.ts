import { describe, it, expect } from "vitest";

import {
  deriveCanonicalNameFromFields,
  CanonicalNameUnresolvedError,
} from "../entity_resolution.js";
import { buildSchemaDefinition } from "./seed_schema.js";

/**
 * Regression coverage for #1761 — issue entities with the same logical identity
 * (github_number, repo) must coalesce to one entity, and a write that misses the
 * declared identity must fail loudly instead of minting a divergent title-keyed
 * duplicate.
 *
 * Root cause: the issue schema used `title` as an identity fallback, and the
 * resolver's heuristic fallback also keys on `title`. A triage write carrying
 * only a title got a title-hashed entity_id; once it later gained
 * github_number+repo its snapshot canonical_name recomputed to the composite
 * form, so it *displayed* identical to the real issue yet never coalesced with
 * it. Fix: drop `title` from `canonical_name_fields` AND mark the issue schema
 * `canonical_name_strict` so the heuristic title fallback is refused.
 */
describe("issue identity (#1761)", () => {
  const schema = buildSchemaDefinition();

  it("does not use title as a declared identity rule", () => {
    const flattened = JSON.stringify(schema.canonical_name_fields);
    expect(flattened).not.toContain("title");
  });

  it("is canonical_name_strict (heuristic title fallback refused)", () => {
    expect(schema.canonical_name_strict).toBe(true);
  });

  it("keys a GitHub-backed issue on (github_number, repo), independent of title", () => {
    const a = deriveCanonicalNameFromFields(
      "issue",
      { github_number: 1755, repo: "markmhendrickson/neotoma", title: "first title" },
      schema
    );
    const b = deriveCanonicalNameFromFields(
      "issue",
      { github_number: 1755, repo: "markmhendrickson/neotoma", title: "RENAMED later" },
      schema
    );
    // Same composite identity → same canonical_name → same entity_id → coalesce.
    expect(a).toBe(b);
    expect(a).toContain("1755");
    expect(a).toContain("markmhendrickson/neotoma");
  });

  it("falls back to local_issue_id for local-only issues", () => {
    const c = deriveCanonicalNameFromFields(
      "issue",
      { local_issue_id: "local:markmhendrickson/neotoma:abc123", title: "local one" },
      schema
    );
    expect(c).toContain("local:markmhendrickson/neotoma:abc123");
  });

  it("REFUSES to mint a title-keyed entity when identity fields are missing (the #1761 collision)", () => {
    // A write carrying only a title (no composite, no local_issue_id) must throw
    // rather than silently create a divergent title-hashed `issue` entity.
    expect(() =>
      deriveCanonicalNameFromFields("issue", { title: "orphan triage write", status: "open" }, schema)
    ).toThrow(CanonicalNameUnresolvedError);
  });

  it("is opt-in: a non-strict schema still allows the heuristic title fallback (back-compat)", () => {
    const lenient = {
      canonical_name_fields: [{ composite: ["github_number", "repo"] as string[] }],
      // canonical_name_strict omitted → legacy behavior
    };
    const v = deriveCanonicalNameFromFields("issue", { title: "heuristic ok here" }, lenient);
    expect(v).toContain("heuristic ok here");
  });
});

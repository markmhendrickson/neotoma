import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lookupDoc } from "./render.js";

let tmpRoot: string;
let docsRoot: string;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neotoma-docs-test-"));
  docsRoot = path.join(tmpRoot, "docs");
  fs.mkdirSync(path.join(docsRoot, "foundation"), { recursive: true });
  fs.mkdirSync(path.join(docsRoot, "plans"), { recursive: true });
  fs.mkdirSync(path.join(docsRoot, "private"), { recursive: true });
  fs.writeFileSync(
    path.join(docsRoot, "foundation", "core_identity.md"),
    "# Core Identity\n\nNeotoma is the State Layer.\n",
  );
  fs.writeFileSync(path.join(docsRoot, "plans", "next.md"), "# Next Plan\n\nDraft.\n");
  fs.writeFileSync(
    path.join(docsRoot, "private", "secret.md"),
    "# Secret\n\nShould never render.\n",
  );
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("lookupDoc — slug sanitization", () => {
  it("rejects traversal", () => {
    const r = lookupDoc("../etc/passwd", { docsRoot, env: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("invalid_slug");
  });
  it("rejects empty slug", () => {
    const r = lookupDoc("", { docsRoot, env: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("invalid_slug");
  });
  it("rejects disallowed characters", () => {
    const r = lookupDoc("foo bar", { docsRoot, env: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("invalid_slug");
  });
  it("rejects extension in slug", () => {
    const r = lookupDoc("foundation/core_identity.md", { docsRoot, env: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("invalid_slug");
  });
  it("rejects docs/private regardless of visibility", () => {
    const r = lookupDoc("private/secret", { docsRoot, env: { NEOTOMA_DOCS_SHOW_INTERNAL: "true" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("not_found");
  });
});

describe("lookupDoc — visibility", () => {
  it("renders a public doc", () => {
    const r = lookupDoc("foundation/core_identity", { docsRoot, env: { NODE_ENV: "production" } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doc.frontmatter.title).toBe("Core Identity");
      expect(r.doc.html).toContain("<h1");
      expect(r.doc.html).toContain("Core Identity");
    }
  });

  it("hides an internal doc in production", () => {
    const r = lookupDoc("plans/next", { docsRoot, env: { NODE_ENV: "production" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("hidden");
  });

  it("shows an internal doc with show-internal flag", () => {
    const r = lookupDoc("plans/next", {
      docsRoot,
      env: { NODE_ENV: "production", NEOTOMA_DOCS_SHOW_INTERNAL: "true" },
    });
    expect(r.ok).toBe(true);
  });

  it("returns not_found for missing slugs", () => {
    const r = lookupDoc("foundation/nope", { docsRoot, env: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("not_found");
  });
});

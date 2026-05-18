import { describe, it, expect } from "vitest";
import {
  resolveFrontmatter,
  resolveFolderDefaults,
  splitFrontmatter,
  parseFlatYaml,
  extractFirstH1,
  extractFirstParagraph,
  humanizeFilename,
} from "./doc_frontmatter.js";

describe("splitFrontmatter", () => {
  it("returns null yaml when source has no leading fence", () => {
    const r = splitFrontmatter("# Hello\n\nBody");
    expect(r.yaml).toBeNull();
    expect(r.body).toBe("# Hello\n\nBody");
  });

  it("extracts a leading yaml block", () => {
    const r = splitFrontmatter("---\ntitle: X\n---\n# Hello\n");
    expect(r.yaml).toBe("title: X");
    expect(r.body).toBe("# Hello\n");
  });

  it("handles trailing newline after closing fence", () => {
    const r = splitFrontmatter("---\ntitle: X\n---\nBody\n");
    expect(r.yaml).toBe("title: X");
    expect(r.body).toBe("Body\n");
  });
});

describe("parseFlatYaml", () => {
  it("parses primitives", () => {
    const r = parseFlatYaml("title: Hello\norder: 5\nfeatured: true\n");
    expect(r.title).toBe("Hello");
    expect(r.order).toBe(5);
    expect(r.featured).toBe(true);
  });
  it("parses string lists", () => {
    const r = parseFlatYaml("tags: [alpha, beta, gamma]\n");
    expect(r.tags).toEqual(["alpha", "beta", "gamma"]);
  });
  it("strips quotes from scalars", () => {
    const r = parseFlatYaml('title: "Quoted Title"\n');
    expect(r.title).toBe("Quoted Title");
  });
  it("ignores comments", () => {
    const r = parseFlatYaml("# comment line\ntitle: Hi\n");
    expect(r.title).toBe("Hi");
  });
});

describe("resolveFolderDefaults", () => {
  it("maps foundation/ to foundation category", () => {
    const r = resolveFolderDefaults("foundation/core_identity.md");
    expect(r.category).toBe("foundation");
    expect(r.visibility).toBe("public");
  });
  it("maps developer/mcp/ to api/mcp subcategory", () => {
    const r = resolveFolderDefaults("developer/mcp/instructions.md");
    expect(r.category).toBe("api");
    expect(r.subcategory).toBe("mcp");
    expect(r.audience).toBe("agent");
  });
  it("maps plans/ to internal visibility", () => {
    const r = resolveFolderDefaults("plans/anything.md");
    expect(r.visibility).toBe("internal");
    expect(r.category).toBe("internal");
  });
  it("maps reports/ to internal visibility", () => {
    const r = resolveFolderDefaults("reports/something.md");
    expect(r.visibility).toBe("internal");
  });
  it("falls back to reference/public for unknown folders", () => {
    const r = resolveFolderDefaults("brand_new_folder/foo.md");
    expect(r.category).toBe("reference");
    expect(r.visibility).toBe("public");
  });
});

describe("extractFirstH1", () => {
  it("returns the first H1", () => {
    expect(extractFirstH1("# Title\n\nbody")).toBe("Title");
  });
  it("returns null when no H1", () => {
    expect(extractFirstH1("## H2 only\n\nbody")).toBeNull();
  });
});

describe("extractFirstParagraph", () => {
  it("returns first paragraph after H1", () => {
    expect(extractFirstParagraph("# Title\n\nFirst paragraph.\n\nSecond.")).toBe(
      "First paragraph.",
    );
  });
  it("truncates long paragraphs", () => {
    const long = "x".repeat(300);
    const r = extractFirstParagraph(`# T\n\n${long}`);
    expect(r!.length).toBe(240);
    expect(r!.endsWith("...")).toBe(true);
  });
});

describe("humanizeFilename", () => {
  it("converts snake_case .md to Title Case", () => {
    expect(humanizeFilename("core_identity.md")).toBe("Core Identity");
  });
});

describe("resolveFrontmatter", () => {
  it("infers fields from path and H1 when frontmatter absent", () => {
    const fm = resolveFrontmatter(
      "foundation/philosophy.md",
      "# Philosophy\n\nNeotoma is structured personal data memory.\n",
    );
    expect(fm.title).toBe("Philosophy");
    expect(fm.category).toBe("foundation");
    expect(fm.visibility).toBe("public");
    expect(fm.summary).toBe("Neotoma is structured personal data memory.");
    expect(fm.order).toBe(100);
    expect(fm.featured).toBe(false);
  });

  it("respects explicit frontmatter over inferred defaults", () => {
    const source = [
      "---",
      "title: Custom Title",
      "category: development",
      "visibility: internal",
      "order: 5",
      "featured: true",
      "tags: [alpha, beta]",
      "---",
      "# Different H1",
      "",
      "Body.",
    ].join("\n");
    const fm = resolveFrontmatter("foundation/x.md", source);
    expect(fm.title).toBe("Custom Title");
    expect(fm.category).toBe("development");
    expect(fm.visibility).toBe("internal");
    expect(fm.order).toBe(5);
    expect(fm.featured).toBe(true);
    expect(fm.tags).toEqual(["alpha", "beta"]);
  });

  it("treats manifest internal_only status as internal visibility", () => {
    const fm = resolveFrontmatter("foundation/x.md", "# X\n", { status: "internal_only" });
    expect(fm.visibility).toBe("internal");
  });

  it("treats manifest archive status as internal visibility", () => {
    const fm = resolveFrontmatter("foundation/x.md", "# X\n", { status: "archive" });
    expect(fm.visibility).toBe("internal");
  });

  it("uses humanized filename when no H1 and no title field", () => {
    const fm = resolveFrontmatter("foundation/core_identity.md", "Body with no heading.\n");
    expect(fm.title).toBe("Core Identity");
  });

  it("README.md gets order 0", () => {
    const fm = resolveFrontmatter("developer/README.md", "# Readme\n");
    expect(fm.order).toBe(0);
  });
});

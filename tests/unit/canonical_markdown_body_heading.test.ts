/**
 * Regression tests for issue #262: mirror profile renderer emits spurious
 * `## body` section heading when the harness stores plan body content that
 * literally begins with "## body\n\n".
 */
import { describe, expect, it } from "vitest";
import { renderProfileEntity } from "../../src/services/canonical_markdown.js";

const BASE_META = {
  entity_id: "ent_abc123",
  entity_type: "plan",
  schema_version: "1.0",
};

describe("renderProfileEntity — body heading stripping (issue #262)", () => {
  it("strips leading '## body' heading from body content", () => {
    const snapshot = {
      title: "My Plan",
      body: "## body\n\n## Problem\n\nThe widget is broken.\n",
    };
    const result = renderProfileEntity(snapshot, BASE_META, {
      render_mode: "frontmatter_content",
      content_field: "body",
    });
    expect(result).not.toContain("## body");
    expect(result).toContain("## Problem");
    expect(result).toContain("The widget is broken.");
  });

  it("strips leading '# body' heading (single hash) from body content", () => {
    const snapshot = {
      title: "My Plan",
      body: "# body\n\n## Solution\n\nReplace the widget.\n",
    };
    const result = renderProfileEntity(snapshot, BASE_META, {
      render_mode: "frontmatter_content",
      content_field: "body",
    });
    expect(result).not.toMatch(/^# body/m);
    expect(result).toContain("## Solution");
  });

  it("strips case-insensitively (## Body)", () => {
    const snapshot = {
      body: "## Body\n\n## Goals\n\nShip it.\n",
    };
    const result = renderProfileEntity(snapshot, BASE_META, {
      render_mode: "frontmatter_content",
      content_field: "body",
    });
    expect(result).not.toContain("## Body");
    expect(result).toContain("## Goals");
  });

  it("does not strip an embedded '## body' that is not at the start", () => {
    const snapshot = {
      body: "## Overview\n\n## body\n\nSome content.\n",
    };
    const result = renderProfileEntity(snapshot, BASE_META, {
      render_mode: "frontmatter_content",
      content_field: "body",
    });
    // First heading is ## Overview, not ## body — the embedded one stays
    expect(result).toContain("## Overview");
    expect(result).toContain("## body");
  });

  it("preserves body content that does not start with '## body'", () => {
    const snapshot = {
      body: "## Problem\n\nSomething is wrong.\n",
    };
    const result = renderProfileEntity(snapshot, BASE_META, {
      render_mode: "frontmatter_content",
      content_field: "body",
    });
    expect(result).toContain("## Problem");
    expect(result).not.toMatch(/## body/i);
  });

  it("handles content_only render_mode without stripping (stripping only needed in frontmatter_content)", () => {
    // content_only mode has a separate code path; stripping is not applied there
    // (the heading would still be rendered, but that mode is used for raw export
    // not the mirror renderer that triggered issue #262).
    const snapshot = {
      body: "## body\n\nRaw content.\n",
    };
    const result = renderProfileEntity(snapshot, BASE_META, {
      render_mode: "content_only",
      content_field: "body",
    });
    // content_only returns the raw value — no stripping in that path
    expect(result).toContain("## body");
    expect(result).toContain("Raw content.");
  });
});

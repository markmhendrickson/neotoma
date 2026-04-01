import { describe, expect, it } from "vitest";
import {
  isFullPageMarkdownSourcePath,
  markdownSplatToSourcePath,
} from "../../frontend/src/site/markdown_mirror_paths";

describe("markdown_mirror_paths", () => {
  it("markdownSplatToSourcePath maps splat to pathname", () => {
    expect(markdownSplatToSourcePath(undefined)).toBe("/");
    expect(markdownSplatToSourcePath("")).toBe("/");
    expect(markdownSplatToSourcePath("install")).toBe("/install");
    expect(markdownSplatToSourcePath("neotoma-vs-mem0")).toBe("/neotoma-vs-mem0");
  });

  it("isFullPageMarkdownSourcePath matches indexable routes", () => {
    expect(isFullPageMarkdownSourcePath("/install")).toBe(true);
    expect(isFullPageMarkdownSourcePath("/markdown")).toBe(false);
    expect(isFullPageMarkdownSourcePath("/site-markdown")).toBe(false);
  });
});

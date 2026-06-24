import { describe, it, expect } from "vitest";
import { renderRenderedPageHtml } from "./html_template";

describe("renderRenderedPageHtml heading anchors", () => {
  it("injects the heading-anchor script over <main> headings", () => {
    const out = renderRenderedPageHtml({ title: "T", htmlBody: "<h2>Hello World</h2>" });
    // client script that assigns ids + appends permalink anchors to headings
    expect(out).toContain(
      'querySelectorAll("main h1, main h2, main h3, main h4, main h5, main h6")'
    );
    expect(out).toContain('a.className = "hanchor"');
    // styling for the permalink affordance
    expect(out).toContain("a.hanchor {");
    expect(out).toContain("scroll-margin-top");
  });

  it("still renders the body verbatim and keeps the custom style tag", () => {
    const out = renderRenderedPageHtml({
      title: "T",
      htmlBody: '<h1 id="keep">Kept</h1>',
      customCss: "h1{color:red}",
    });
    expect(out).toContain('<h1 id="keep">Kept</h1>');
    expect(out).toContain("<style>h1{color:red}</style>");
  });
});

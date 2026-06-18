import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Compass } from "lucide-react";
import { EmptyState } from "./empty_state";

/**
 * Smoke tests for the shared {@link EmptyState} primitive. We render to a
 * static HTML string (no jsdom required) and assert on a few stable
 * fragments: the title text, the description text, an actions slot, and
 * that a Lucide icon component is rendered into an `<svg>` with the
 * design-token color class.
 */
describe("EmptyState", () => {
  it("renders the title and optional description", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, {
        title: "Nothing here yet",
        description: "Ingest your first record to see it.",
      }),
    );
    expect(html).toContain("Nothing here yet");
    expect(html).toContain("Ingest your first record to see it.");
    expect(html).toContain('role="status"');
  });

  it("renders a Lucide icon component with muted token color", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, {
        icon: Compass,
        title: "Not found",
      }),
    );
    expect(html).toContain("<svg");
    expect(html).toContain("text-muted-foreground");
  });

  it("renders an actions slot when provided", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, {
        title: "Empty",
        actions: createElement(
          "button",
          { type: "button", "data-testid": "open-settings" },
          "Open Settings",
        ),
      }),
    );
    expect(html).toContain('data-testid="open-settings"');
    expect(html).toContain("Open Settings");
  });

  it("omits the description container when description is absent", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, { title: "Only the title" }),
    );
    expect(html).toContain("Only the title");
    // No description means no <p> sibling for muted text body
    expect(html).not.toMatch(/text-sm text-muted-foreground[^"]*">[^<]/);
  });
});

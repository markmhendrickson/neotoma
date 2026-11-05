// @vitest-environment node

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { RetiredRouteStub } from "./RetiredRouteStub";

describe("server-rendered retired route navigation", () => {
  it("renders the destination link without a browser window", () => {
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ["/readme/"] }, createElement(RetiredRouteStub))
    );

    expect(markup).toContain('href="/readme/"');
    expect(markup).toContain("This page has moved.");
  });
});

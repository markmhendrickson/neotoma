// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DOCS_VIEWER_INDEX } from "@/site/docs_viewer_manifest";

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/RetiredRouteStub", () => ({
  RetiredRouteStub: () => <main data-testid="static-reader-navigation">Reader navigation</main>,
}));
vi.mock("@/components/NotFound", () => ({ NotFound: () => <main data-testid="not-found" /> }));
vi.mock("@/components/subpages/MdxSitePage", () => ({
  MdxSitePage: () => <main data-testid="existing-reader-route">Existing reader route</main>,
}));
vi.mock("@/components/subpages/ArchitecturePage", () => ({
  ArchitecturePage: () => <main data-testid="existing-reader-route">Existing reader route</main>,
}));
vi.mock("@/utils/analytics", () => ({ sendPageView: vi.fn() }));

import { MainApp } from "@/components/MainApp";

afterEach(() => cleanup());

describe("published docs viewer routes in the client app", () => {
  it("routes every published root page to a reader handler instead of the not-found page", () => {
    for (const entry of DOCS_VIEWER_INDEX.entries) {
      const { unmount } = render(
        <MemoryRouter initialEntries={[`/${entry.slug}/`]}>
          <MainApp />
        </MemoryRouter>
      );

      expect(screen.queryByTestId("not-found"), entry.slug).toBeNull();
      expect(
        screen.queryByTestId("static-reader-navigation") ||
          screen.queryByTestId("existing-reader-route"),
        entry.slug
      ).not.toBeNull();
      unmount();
    }
  });

  it("matches /readme through the static reader navigation handler", () => {
    render(
      <MemoryRouter initialEntries={["/readme"]}>
        <MainApp />
      </MemoryRouter>
    );

    expect(screen.getByTestId("static-reader-navigation")).toBeInTheDocument();
    expect(screen.queryByTestId("not-found")).toBeNull();
  });
});

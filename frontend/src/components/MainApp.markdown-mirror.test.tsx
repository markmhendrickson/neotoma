// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { LocaleProvider } from "@/i18n/LocaleContext";
import { NON_DEFAULT_LOCALES } from "@/i18n/config";
import { LOCALIZED_LEGAL_PATHS } from "@/site/route_retirement";
import { buildCanonicalUrl } from "@/site/seo_metadata";

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/utils/analytics", () => ({ sendPageView: vi.fn() }));

import { MainApp } from "@/components/MainApp";
import { SiteMarkdownMirrorPage } from "@/components/subpages/SiteMarkdownMirrorPage";

const fetchMock = vi.fn<typeof fetch>();
const generatedAt = "2026-01-01T00:00:00.000Z";

function fixtureHtml(source: string): string {
  return `<main data-site-markdown-root><h1>Fixture ${source}</h1><p>Unique original ${source}: this synthetic page has enough content for full-page Markdown extraction without any network or production page data.</p></main>`;
}

function serveFixture(source: string): void {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input));
    // A wrong caller binding deliberately returns a distinguishable home page.
    return new Response(fixtureHtml(url.pathname === source ? source : "HOME"));
  });
}

function mount(path: string, element: ReactNode = <MainApp />) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <LocaleProvider>{element}</LocaleProvider>
      </MemoryRouter>
    </HelmetProvider>
  );
}

async function expectExport(container: HTMLElement, source: string, route: string) {
  await waitFor(() => expect(container.querySelector("pre")).not.toBeNull());
  const markdown = container.querySelector("pre")!.textContent!;
  expect(markdown, markdown).toContain(`Source: ${buildCanonicalUrl(source)}`);
  expect(markdown).toContain(`Generated: ${generatedAt}`);
  expect(markdown).toContain(`# Fixture ${source}`);
  expect(markdown).toContain(`Unique original ${source}:`);
  expect(markdown).not.toContain("Fixture HOME");
  await waitFor(() =>
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      "href",
      buildCanonicalUrl(route)
    )
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(generatedAt));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("scrollTo", vi.fn());
  fetchMock.mockReset();
  fetchMock.mockRejectedValue(new Error("No real requests allowed in this test"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MainApp full-page Markdown source bindings", () => {
  const localizedLegalCases = NON_DEFAULT_LOCALES.flatMap((locale) =>
    LOCALIZED_LEGAL_PATHS.map((legalPath) => ({ locale, legalPath }))
  );

  it("covers all 36 exact localized legal callers", () => {
    expect(NON_DEFAULT_LOCALES).toHaveLength(12);
    expect(LOCALIZED_LEGAL_PATHS).toHaveLength(3);
    expect(localizedLegalCases).toHaveLength(36);
  });

  it.each(localizedLegalCases)(
    "exports $locale $legalPath from its legal original",
    async ({ locale, legalPath }) => {
      const source = `/${locale}${legalPath}`;
      const route = `/${locale}/markdown${legalPath}`;
      serveFixture(source);
      const { container } = mount(route);

      await expectExport(container, source, route);
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}${source}`, {
        credentials: "same-origin",
        headers: { Accept: "text/html" },
      });
      expect(fetchMock).not.toHaveBeenCalledWith(
        `${window.location.origin}/${locale}`,
        expect.anything()
      );
    }
  );

  it.each([
    ["/markdown", "/"],
    ["/markdown/", "/"],
    ["/markdown/install", "/install"],
    ["/markdown/privacy", "/privacy"],
    ["/markdown/sandbox/terms-of-use/", "/sandbox/terms-of-use"],
  ])("preserves ordinary wildcard route %s", async (route, source) => {
    serveFixture(source);
    const { container } = mount(route);
    await expectExport(container, source, route);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      `${window.location.origin}${source}`,
      expect.anything()
    );
  });

  it.each([
    ["/es/markdown/privacy?view=plain#retention", "/es/privacy"],
    ["/markdown/install?view=plain#setup", "/install"],
  ])("keeps query omission and hash forwarding for %s", async (route, source) => {
    serveFixture(source);
    const { container } = mount(route);
    await expectExport(container, source, route);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      `${window.location.origin}${source}#${route.split("#")[1]}`,
      expect.anything()
    );
  });

  it("does not fetch a non-indexable wildcard path", () => {
    mount("/markdown/not-an-indexable-page");
    expect(
      screen.getByText("Unknown or non-indexable path for full-page Markdown.")
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTitle("Markdown capture")).not.toBeInTheDocument();
  });

  it.each([
    "",
    "/not-an-indexable-page",
    "/es/privacy",
    "https://example.invalid/privacy",
    "//example.invalid/privacy",
    "/privacy?x=1",
    "/privacy#x",
  ])("rejects an invalid explicit original %j", (sourcePath) => {
    mount(
      "/markdown/privacy",
      <Routes>
        <Route path="/markdown/*" element={<SiteMarkdownMirrorPage sourcePath={sourcePath} />} />
      </Routes>
    );
    expect(
      screen.getByText("Unknown or non-indexable path for full-page Markdown.")
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retains iframe fallback for the exact localized legal original", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })
    );
    const { container, unmount } = mount("/es/markdown/privacy");
    const iframe = screen.getByTitle<HTMLIFrameElement>("Markdown capture");
    const capturedDocument = new DOMParser().parseFromString(
      fixtureHtml("/es/privacy"),
      "text/html"
    );
    vi.spyOn(iframe, "contentDocument", "get").mockReturnValue(capturedDocument);
    await act(async () => {
      finish(new Response("not prerendered", { status: 404 }));
    });
    await waitFor(() => expect(iframe.src).toBe(`${window.location.origin}/es/privacy`));
    fireEvent.load(iframe);
    await expectExport(container, "/es/privacy", "/es/markdown/privacy");
    unmount();
  });

  it("ignores a fetch completing after unmount", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })
    );
    const { container, unmount } = mount("/es/markdown/terms");
    unmount();
    await act(async () => {
      finish(new Response(fixtureHtml("/es/terms")));
    });
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores the prior legal original after navigating to another exact caller", async () => {
    const pending = new Map<string, (response: Response) => void>();
    fetchMock.mockImplementation(
      (input) =>
        new Promise<Response>((resolve) => {
          pending.set(new URL(String(input)).pathname, resolve);
        })
    );
    function SwitchOriginal() {
      const navigate = useNavigate();
      return <button onClick={() => navigate("/es/markdown/terms")}>Next original</button>;
    }
    const { container } = mount(
      "/es/markdown/privacy",
      <>
        <MainApp />
        <SwitchOriginal />
      </>
    );
    fireEvent.click(screen.getByRole("button", { name: "Next original" }));
    expect([...pending.keys()]).toEqual(["/es/privacy", "/es/terms"]);
    await act(async () => {
      pending.get("/es/terms")!(new Response(fixtureHtml("/es/terms")));
    });
    await expectExport(container, "/es/terms", "/es/markdown/terms");
    await act(async () => {
      pending.get("/es/privacy")!(new Response(fixtureHtml("/es/privacy")));
    });
    await expectExport(container, "/es/terms", "/es/markdown/terms");
    expect(container.querySelector("pre")!.textContent).not.toContain(
      "Unique original /es/privacy:"
    );
  });

  it("clears fallback polling and timeout on unmount", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    fetchMock.mockResolvedValue(new Response("not prerendered", { status: 404 }));
    const { unmount } = mount("/es/markdown/terms");
    const iframe = screen.getByTitle<HTMLIFrameElement>("Markdown capture");
    await waitFor(() => expect(iframe.src).toBe(`${window.location.origin}/es/terms`));
    vi.spyOn(iframe, "contentDocument", "get").mockReturnValue(
      document.implementation.createHTMLDocument()
    );
    fireEvent.load(iframe);
    const pollIndex = setIntervalSpy.mock.calls.findIndex((call) => call[1] === 120);
    const timeoutIndex = setTimeoutSpy.mock.calls.findIndex((call) => call[1] === 25_000);
    expect(pollIndex).toBeGreaterThanOrEqual(0);
    expect(timeoutIndex).toBeGreaterThanOrEqual(0);
    const pollTimer = setIntervalSpy.mock.results[pollIndex].value;
    const timeoutTimer = setTimeoutSpy.mock.results[timeoutIndex].value;
    clearIntervalSpy.mockClear();
    clearTimeoutSpy.mockClear();
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledWith(pollTimer);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timeoutTimer);
  });
});

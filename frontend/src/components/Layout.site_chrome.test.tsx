// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import ReactHelmetAsync from "react-helmet-async";
import { MDXProvider } from "@mdx-js/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/i18n/LocaleContext";
import { ThemeProvider } from "@/hooks/useTheme";
import { mdxSiteProviderComponents } from "./mdx/mdx_site_components";
import { Layout } from "./Layout";
import { NotFound } from "./NotFound";
import { SiteFooter, SiteHeader } from "./onepager/SiteChrome";
import { PrivacyPage } from "./subpages/PrivacyPage";
import { TermsPage } from "./subpages/TermsPage";
import { MeetPage } from "./subpages/MeetPage";
import { SandboxLandingPage } from "./subpages/SandboxLandingPage";
import { SandboxTermsOfUsePage } from "./subpages/SandboxTermsOfUsePage";
import { EvaluatePage } from "./subpages/EvaluatePage";
import { InstallPage } from "./subpages/InstallPage";
import { CompareApproaches } from "./onepager/CompareApproaches";
import { NeotomaOnePager } from "./onepager/NeotomaOnePager";
import { SkillsIndexPage } from "./subpages/SkillsIndexPage";
import { SANDBOX_TERMS_JSON_URL } from "@/site/sandbox_doc_paths";

const { HelmetProvider } = ReactHelmetAsync;

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

function visit(path: string, content: React.ReactNode): void {
  window.history.replaceState({}, "", path);
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <LocaleProvider>
          <ThemeProvider>
            <MDXProvider components={mdxSiteProviderComponents}>
              <Layout>{content}</Layout>
            </MDXProvider>
          </ThemeProvider>
        </LocaleProvider>
      </MemoryRouter>
    </HelmetProvider>
  );
}

function expectSharedChrome(path: string): void {
  expect(document.querySelectorAll(".plan-masthead")).toHaveLength(1);
  expect(document.querySelectorAll(".plan-site-footer")).toHaveLength(1);
  const spanish = path.startsWith("/es/");
  expect(screen.getByRole("navigation", { name: spanish ? "Sitio" : "Site" })).toBeTruthy();
  expect(screen.getByRole("link", { name: spanish ? "Inicio de Neotoma" : "Neotoma home" }).getAttribute("href")).toBe(spanish ? "/es/" : "/en/");
  expect(document.querySelector("[data-sidebar]")).toBeNull();
  expect(document.querySelector(`.plan-site-footer a[href='${spanish ? "/es/privacy/" : "/privacy"}']`)).toBeTruthy();
  expect(document.querySelector(`.plan-site-footer a[href='${spanish ? "/es/terms/" : "/terms"}']`)).toBeTruthy();
}

describe("public reader page chrome", () => {
  it("keeps the home's single existing skip link and focusable target", () => {
    visit("/", <NeotomaOnePager />);
    const skips = document.querySelectorAll<HTMLAnchorElement>("a.plan-skip");
    expect(skips).toHaveLength(1);
    expect(document.querySelector("a[href],button,input,select,textarea")).toBe(skips[0]);
    expect(document.querySelectorAll("main")).toHaveLength(1);
    const target = document.querySelector<HTMLElement>(skips[0].getAttribute("href")!);
    expect(target?.id).toBe("plan-content");
    expect(target?.tabIndex).toBe(-1);
    const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it.each([
    ["/install", <InstallPage />],
    ["/es/install", <InstallPage />],
    ["/compare", <CompareApproaches />],
    ["/privacy", <PrivacyPage />],
    ["/evaluate", <EvaluatePage />],
    ["/es/privacy", <PrivacyPage />],
    ["/404", <NotFound />],
  ])("puts one working skip link before repeated navigation on %s", (path, content) => {
    visit(path, content);
    const skips = document.querySelectorAll<HTMLAnchorElement>('a.plan-skip[href="#main"]');
    const mains = document.querySelectorAll<HTMLElement>("main");
    expect(skips).toHaveLength(1);
    expect(mains).toHaveLength(1);
    expect(mains[0].id).toBe("main");
    expect(mains[0].tabIndex).toBe(-1);
    expect(document.querySelector("a[href],button,input,select,textarea")).toBe(skips[0]);
    expect(
      skips[0].compareDocumentPosition(mains[0]) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it.each([
    ["/install", "Install options"],
    ["/es/install", "Opciones de instalación"],
  ])("uses the page locale for the install main landmark on %s", (path, label) => {
    visit(path, <InstallPage />);
    expect(screen.getByRole("main", { name: label })).toBeTruthy();
  });
  it.each([
    ["/privacy", <PrivacyPage />, /Privacy/i],
    ["/terms", <TermsPage />, /Terms/i],
    ["/meet", <MeetPage />, /Book via Notion Calendar/i],
    ["/sandbox", <SandboxLandingPage />, /No install required/i],
    ["/sandbox/terms-of-use", <SandboxTermsOfUsePage />, /Sandbox Terms/i],
    ["/evaluate", <EvaluatePage />, /Evaluate/i],
    ["/skills", <SkillsIndexPage />, /Skills/i],
    ["/es/privacy", <PrivacyPage />, /Privacidad/i],
  ])("renders the shared homepage header and footer on %s", (path, content, visibleText) => {
    visit(path, content);
    expectSharedChrome(path);
    expect(screen.getAllByText(visibleText).length).toBeGreaterThan(0);
  });

  it("keeps the booking destination in the meet page body", () => {
    visit("/meet", <MeetPage />);
    expect(
      screen.getByRole("link", { name: "Book via Notion Calendar" }).getAttribute("href")
    ).toBe("https://calendar.notion.so/meet/markmhendrickson/interview");
  });

  it("keeps the agent-readable JSON endpoint on the sandbox terms page", () => {
    visit("/sandbox/terms-of-use", <SandboxTermsOfUsePage />);
    expect(document.querySelector(`main a[href="${SANDBOX_TERMS_JSON_URL}"]`)).toBeTruthy();
  });

  it.each(["/", "/install", "/compare"])(
    "keeps one header and footer on %s when its page already owns them",
    (path) => {
      visit(
        path,
        <div className="plan">
          <SiteHeader />
          <SiteFooter />
        </div>
      );
      expectSharedChrome(path);
    }
  );

  it.each(["/raw", "/markdown/privacy", "/es/markdown/terms"])(
    "keeps %s machine readable without HTML site chrome",
    (path) => {
      visit(path, <pre>plain markdown</pre>);
      expect(screen.getByText("plain markdown")).toBeTruthy();
      expect(document.querySelector(".plan-masthead")).toBeNull();
      expect(document.querySelector(".plan-site-footer")).toBeNull();
    }
  );
});

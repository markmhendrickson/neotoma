import { afterEach, describe, expect, it, vi } from "vitest";
import { appPathFromBrowserPathname, getSpaBasename } from "../../frontend/src/site/spa_path";

function mockWindowPathname(pathname: string) {
  vi.stubGlobal("window", { location: { pathname } });
}

describe("spa_path", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getSpaBasename returns empty for root", () => {
    mockWindowPathname("/");
    expect(getSpaBasename()).toBe("");
  });

  it("getSpaBasename detects neotoma-prefixed first segment", () => {
    mockWindowPathname("/neotoma/install");
    expect(getSpaBasename()).toBe("/neotoma");
  });

  it("appPathFromBrowserPathname strips SPA basename and locale", () => {
    mockWindowPathname("/neotoma/es/install");
    expect(appPathFromBrowserPathname("/neotoma/es/install")).toBe("/install");
  });

  it("appPathFromBrowserPathname maps product-at-root URL to product path", () => {
    mockWindowPathname("/neotoma-with-claude-code");
    expect(appPathFromBrowserPathname("/neotoma-with-claude-code")).toBe("/neotoma-with-claude-code");
  });

  it("appPathFromBrowserPathname leaves plain paths unchanged", () => {
    mockWindowPathname("/memory-guarantees");
    expect(appPathFromBrowserPathname("/memory-guarantees")).toBe("/memory-guarantees");
  });
});

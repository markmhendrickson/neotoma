import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE } from "../../frontend/src/i18n/config";
import { getLocaleFromPath, localizePath, normalizeToDefaultRoute, stripLocaleFromPath } from "../../frontend/src/i18n/routing";

describe("i18n routing helpers", () => {
  it("detects locale from prefixed path", () => {
    expect(getLocaleFromPath("/es/docs")).toBe("es");
    expect(getLocaleFromPath("/de")).toBe("de");
    expect(getLocaleFromPath("/docs")).toBeNull();
  });

  it("strips locale prefix", () => {
    expect(stripLocaleFromPath("/es/docs")).toBe("/docs");
    expect(stripLocaleFromPath("/fr")).toBe("/");
    expect(stripLocaleFromPath("/architecture")).toBe("/architecture");
  });

  it("localizes path by locale", () => {
    expect(localizePath("/docs", "es")).toBe("/es/docs");
    expect(localizePath("/", "de")).toBe("/de");
    expect(localizePath("/docs", DEFAULT_LOCALE)).toBe("/docs");
  });

  it("normalizes to default route path", () => {
    expect(normalizeToDefaultRoute("/es/docs")).toBe("/docs");
    expect(normalizeToDefaultRoute("/fr/")).toBe("/");
    expect(normalizeToDefaultRoute("/docker/")).toBe("/docker");
  });
});

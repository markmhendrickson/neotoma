import { afterEach, describe, expect, it, vi } from "vitest";
import { getLocaleFromPath, localizePath, resolvePreferredLocale, saveLocale } from "./routing";

afterEach(() => vi.unstubAllGlobals());

function browser(saved: string | null, languages: string[], language: string, deny = false) {
  vi.stubGlobal("window", {
    navigator: { languages, language },
    localStorage: {
      getItem: () => {
        if (deny) throw new DOMException("storage denied", "SecurityError");
        return saved;
      },
      setItem: () => {
        if (deny) throw new DOMException("storage denied", "SecurityError");
      },
    },
  });
}

describe("public EN/ES locale choice", () => {
  it("uses a valid manual preference before browser languages", () => {
    browser("en", ["es-MX"], "es-MX");
    expect(resolvePreferredLocale()).toBe("en");
    browser("es", ["en-US"], "en-US");
    expect(resolvePreferredLocale()).toBe("es");
  });

  it("uses the first supported browser language, including a later Spanish choice", () => {
    browser(null, ["fr-FR", "es-MX"], "en-US");
    expect(resolvePreferredLocale()).toBe("es");
    browser(null, ["en-GB", "es-MX"], "es-MX");
    expect(resolvePreferredLocale()).toBe("en");
    browser(null, ["zz-ZZ"], "zz-ZZ");
    expect(resolvePreferredLocale()).toBe("en");
  });

  it("keeps navigation functional when storage access is denied", () => {
    browser(null, ["es-ES"], "en-US", true);
    expect(resolvePreferredLocale()).toBe("es");
    expect(() => saveLocale("en")).not.toThrow();
  });

  it("preserves query and hash when switching language, including explicit English", () => {
    expect(localizePath("/install/?source=guide#step-2", "es")).toBe(
      "/es/install/?source=guide#step-2"
    );
    expect(localizePath("/es/install/?source=guide#step-2", "en")).toBe(
      "/install/?source=guide#step-2"
    );
    expect(getLocaleFromPath("/es/install/")).toBe("es");
    expect(getLocaleFromPath("/install/")).toBeNull();
  });
});

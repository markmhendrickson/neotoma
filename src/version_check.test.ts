import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isUpdateAvailable,
  formatUpgradeCommand,
  getLatestFromRegistry,
} from "./version_check.js";

describe("isUpdateAvailable", () => {
  it("returns true when current is less than latest", () => {
    expect(isUpdateAvailable("0.2.15", "0.2.16")).toBe(true);
    expect(isUpdateAvailable("1.0.0", "2.0.0")).toBe(true);
    expect(isUpdateAvailable("0.2.15", "1.0.0")).toBe(true);
  });

  it("returns false when current equals latest", () => {
    expect(isUpdateAvailable("0.2.15", "0.2.15")).toBe(false);
  });

  it("returns false when current is greater than latest", () => {
    expect(isUpdateAvailable("0.2.16", "0.2.15")).toBe(false);
    expect(isUpdateAvailable("1.0.0", "0.2.16")).toBe(false);
  });

  it("returns false for invalid current version", () => {
    expect(isUpdateAvailable("not-a-version", "1.0.0")).toBe(false);
    expect(isUpdateAvailable("", "1.0.0")).toBe(false);
  });

  it("returns false for invalid latest version", () => {
    expect(isUpdateAvailable("1.0.0", "not-a-version")).toBe(false);
    expect(isUpdateAvailable("1.0.0", "")).toBe(false);
  });
});

describe("formatUpgradeCommand", () => {
  it("returns global npm install for context global", () => {
    expect(formatUpgradeCommand("neotoma", "latest", "global")).toBe(
      "npm i -g neotoma@latest"
    );
    expect(formatUpgradeCommand("some-pkg", "next", "global")).toBe(
      "npm i -g some-pkg@next"
    );
  });

  it("defaults to global when context omitted", () => {
    expect(formatUpgradeCommand("neotoma", "latest")).toBe(
      "npm i -g neotoma@latest"
    );
  });

  it("returns npx hint for context npx", () => {
    expect(formatUpgradeCommand("neotoma", "latest", "npx")).toBe(
      "npx neotoma@latest"
    );
    expect(formatUpgradeCommand("some-pkg", "next", "npx")).toBe(
      "npx some-pkg@next"
    );
  });
});

describe("getLatestFromRegistry", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/neotoma/")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({ latest: "0.2.20", next: "0.3.0-beta.1" }),
          } as Response);
        }
        if (url.includes("/nonexistent-pkg-xyz/")) {
          return Promise.resolve({ ok: false } as Response);
        }
        return Promise.reject(new Error("network"));
      })
    );
  });

  afterEach(() => {
    vi.stubGlobal("fetch", originalFetch);
  });

  it("returns latest version for existing package", async () => {
    const latest = await getLatestFromRegistry("neotoma");
    expect(latest).toBe("0.2.20");
  });

  it("returns requested dist-tag when specified", async () => {
    const next = await getLatestFromRegistry("neotoma", "next");
    expect(next).toBe("0.3.0-beta.1");
  });

  it("returns null when response is not ok", async () => {
    const result = await getLatestFromRegistry("nonexistent-pkg-xyz");
    expect(result).toBeNull();
  });

  it("returns null on fetch failure and does not throw", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network")));
    const result = await getLatestFromRegistry("neotoma");
    expect(result).toBeNull();
  });
});

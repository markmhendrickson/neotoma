/**
 * Smoke test for MCP tool npm_check_update (plan: npm package update UX).
 * Verifies response shape and behavior when registry is reachable or unreachable.
 */

import { describe, it, expect, beforeAll } from "vitest";
import semver from "semver";
import { NeotomaServer } from "../../src/server.js";

describe("MCP npm_check_update tool", () => {
  let server: NeotomaServer;

  beforeAll(() => {
    server = new NeotomaServer();
  });

  it("returns structured response with updateAvailable, latestVersion, message, suggestedCommand", async () => {
    const result = await (server as any).npmCheckUpdate({
      packageName: "neotoma",
      currentVersion: "0.0.1",
      distTag: "latest",
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThanOrEqual(1);
    const text = result.content[0].text;
    const data = JSON.parse(text);

    expect(typeof data.updateAvailable).toBe("boolean");
    expect(data.latestVersion === null || typeof data.latestVersion === "string").toBe(true);
    expect(typeof data.message).toBe("string");
    expect(data.suggestedCommand === null || typeof data.suggestedCommand === "string").toBe(true);
    expect(data.packageName).toBe("neotoma");
    expect(data.currentVersion).toBe("0.0.1");
    expect(data.distTag).toBe("latest");
    expect(data.release_url === null || typeof data.release_url === "string").toBe(true);
    expect(data.release_notes_excerpt === null || typeof data.release_notes_excerpt === "string").toBe(
      true,
    );
    expect(data.breaking_changes_excerpt === null || typeof data.breaking_changes_excerpt === "string").toBe(
      true,
    );
    expect(data.enrichment_error === null || typeof data.enrichment_error === "string").toBe(true);

    if (data.updateAvailable) {
      expect(data.latestVersion).toBeTruthy();
      expect(data.suggestedCommand).toContain("neotoma");
    }
  });

  it("returns updateAvailable false when current is >= latest (or registry unreachable)", async () => {
    const result = await (server as any).npmCheckUpdate({
      packageName: "neotoma",
      currentVersion: "999.999.999",
      distTag: "latest",
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.updateAvailable).toBe(false);
    expect(typeof data.message).toBe("string");
  });

  it("adds an initialize notice for stdio sessions when a newer package version is cached", async () => {
    const metadata = (server as any).getInstalledPackageMetadata() as {
      packageName: string;
      currentVersion: string;
    };
    const newerVersion = semver.inc(metadata.currentVersion, "patch") ?? "999.999.999";

    (server as any).registryCache.set(`${metadata.packageName}:latest`, {
      version: newerVersion,
      until: Date.now() + 60_000,
    });

    const notice = await (server as any).getInitializeUpdateNotice(false);

    expect(notice).toContain(metadata.packageName);
    expect(notice).toContain(metadata.currentVersion);
    expect(notice).toContain(newerVersion);
    expect(notice).toContain(`npm i -g ${metadata.packageName}@latest`);
  });

  it("skips the initialize notice for HTTP transport sessions", async () => {
    const notice = await (server as any).getInitializeUpdateNotice(true);
    expect(notice).toBeNull();
  });

  it("emits a runtime notice once for a newly detected update", async () => {
    const metadata = (server as any).getInstalledPackageMetadata() as {
      packageName: string;
      currentVersion: string;
    };
    const newerVersion = semver.inc(metadata.currentVersion, "patch") ?? "999.999.999";

    (server as any).isHTTPTransportSession = false;
    (server as any).nextRuntimeUpdateCheckAt = 0;
    (server as any).lastNotifiedUpdateVersion = null;
    (server as any).registryCache.set(`${metadata.packageName}:latest`, {
      version: newerVersion,
      until: Date.now() + 60_000,
    });

    const first = await (server as any).consumeRuntimeUpdateNotice();
    const second = await (server as any).consumeRuntimeUpdateNotice();

    expect(first).toContain(newerVersion);
    expect(second).toBeNull();
  });

  it("suppresses runtime checks until the throttle window expires", async () => {
    (server as any).nextRuntimeUpdateCheckAt = Date.now() + 60_000;
    const notice = await (server as any).consumeRuntimeUpdateNotice();
    expect(notice).toBeNull();
  });
});

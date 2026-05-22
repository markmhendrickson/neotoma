import { describe, expect, it } from "vitest";

import { mergeProbeIntoRemoteHealth, readLocalNeotomaPackageVersion } from "./peer_health.js";

describe("mergeProbeIntoRemoteHealth", () => {
  it("marks incompatible when unreachable", () => {
    const r = mergeProbeIntoRemoteHealth("0.6.0", {
      reachable: false,
      version: "unknown",
      error: "ECONNREFUSED",
    });
    expect(r.reachable).toBe(false);
    expect(r.compatible).toBe(false);
    expect(r.error).toBe("ECONNREFUSED");
  });

  it("compares when reachable and ok", () => {
    const r = mergeProbeIntoRemoteHealth("0.6.0", {
      reachable: true,
      ok: true,
      version: "0.6.1",
    });
    expect(r.reachable).toBe(true);
    expect(r.compatible).toBe(true);
    expect(r.version).toBe("0.6.1");
  });

  it("incompatible when health not ok", () => {
    const r = mergeProbeIntoRemoteHealth("0.6.0", {
      reachable: true,
      ok: false,
      version: "unknown",
      error: "http_status_502",
    });
    expect(r.compatible).toBe(false);
    expect(r.error).toBe("http_status_502");
  });
});

describe("readLocalNeotomaPackageVersion", () => {
  it("returns a semver-like string", () => {
    const v = readLocalNeotomaPackageVersion();
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
  });
});

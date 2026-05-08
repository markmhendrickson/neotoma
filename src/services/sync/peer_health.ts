import { readFileSync } from "node:fs";
import { join } from "node:path";

import { config } from "../../config.js";
import { compareCliApiCompat } from "../../semver_compat.js";

export function readLocalNeotomaPackageVersion(): string {
  try {
    const root = config.projectRoot || process.cwd();
    const pkgPath = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
    return typeof pkg.version === "string" && pkg.version ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export interface PeerHealthProbeResult {
  reachable: boolean;
  ok?: boolean;
  version: string;
  error?: string;
}

/** GET {peerUrl}/health with 5s timeout; never throws. */
export async function probePeerRemoteHealth(peerUrlBase: string): Promise<PeerHealthProbeResult> {
  const base = peerUrlBase.replace(/\/$/, "");
  try {
    const resp = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) {
      return {
        reachable: true,
        ok: false,
        version: "unknown",
        error: `http_status_${resp.status}`,
      };
    }
    const body = (await resp.json()) as { ok?: boolean; version?: string };
    const version = typeof body.version === "string" && body.version ? body.version : "unknown";
    return { reachable: true, ok: body.ok === true, version };
  } catch (e) {
    const message = e instanceof Error ? e.message : "fetch_failed";
    return { reachable: false, version: "unknown", error: message };
  }
}

export interface PeerRemoteHealth {
  reachable: boolean;
  ok?: boolean;
  /** Reported Neotoma API semver from peer /health, or "unknown". */
  version: string;
  /** False when unreachable or HTTP error from /health; otherwise from semver rules vs local_api_version. */
  compatible: boolean;
  warning?: string;
  error?: string;
}

export function mergeProbeIntoRemoteHealth(
  localApiVersion: string,
  probe: PeerHealthProbeResult,
): PeerRemoteHealth {
  if (!probe.reachable) {
    return {
      reachable: false,
      version: "unknown",
      compatible: false,
      error: probe.error ?? "unreachable",
    };
  }
  if (probe.ok === false) {
    return {
      reachable: true,
      ok: false,
      version: probe.version,
      compatible: false,
      error: probe.error ?? "health_not_ok",
    };
  }
  const { compatible, warning } = compareCliApiCompat(localApiVersion, probe.version);
  return {
    reachable: true,
    ok: probe.ok,
    version: probe.version,
    compatible,
    ...(warning ? { warning } : {}),
  };
}

/**
 * Optional `/session` preflight health and trust check.
 *
 * Hits Neotoma's `/session` introspection endpoint on startup to verify
 * connectivity and attribution tier. When `failClosed` is set, the proxy
 * aborts if the endpoint is unreachable or reports `anonymous` tier.
 */

import type { ProxyConfig } from "./mcp_stdio_proxy.js";

function sessionBaseUrl(config: ProxyConfig): string {
  if (config.sessionPreflightBase) {
    return config.sessionPreflightBase.replace(/\/+$/, "");
  }
  const parsed = new URL(config.downstreamUrl);
  return `${parsed.protocol}//${parsed.host}`;
}

function log(msg: string): void {
  const ts = new Date().toISOString();
  process.stderr.write(`${ts} [neotoma-mcp-proxy] ${msg}\n`);
}

export interface PreflightResult {
  tier: string;
  thumbprint?: string;
  eligibleForTrustedWrites?: boolean;
}

export async function runPreflight(config: ProxyConfig): Promise<PreflightResult | null> {
  const base = sessionBaseUrl(config);
  const url = `${base}/session`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (config.bearerToken) {
    headers["Authorization"] = `Bearer ${config.bearerToken}`;
  }
  if (config.aauthSigner) {
    headers["X-Agent-Label"] = config.aauthSigner.sub;
  }

  let resp: Response;
  try {
    resp = await fetch(url, { headers });
  } catch (err) {
    log(`Preflight /session unreachable at ${url}: ${String(err)}`);
    if (config.failClosed) {
      process.stderr.write(`[neotoma-mcp-proxy] fail-closed: /session unreachable at ${url}\n`);
      process.exit(1);
    }
    return null;
  }

  if (resp.status !== 200) {
    const bodyText = await resp.text();
    log(`Preflight /session returned status=${resp.status} body=${bodyText.slice(0, 200)}`);
    if (config.failClosed) {
      process.stderr.write(`[neotoma-mcp-proxy] fail-closed: /session status ${resp.status}\n`);
      process.exit(1);
    }
    return null;
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await resp.json()) as Record<string, unknown>;
  } catch {
    log(`Preflight /session returned non-JSON body`);
    return null;
  }

  const attribution = (payload.attribution ?? {}) as Record<string, unknown>;
  const tier = String(attribution.tier ?? "unknown");
  const thumbprint = attribution.agent_thumbprint as string | undefined;
  const eligible = payload.eligible_for_trusted_writes as boolean | undefined;

  log(
    `Preflight /session: tier=${tier} thumbprint=${thumbprint ?? "<none>"} eligible_for_trusted_writes=${String(eligible)}`
  );

  if (config.failClosed && tier === "anonymous") {
    process.stderr.write(
      `[neotoma-mcp-proxy] fail-closed: Neotoma resolved anonymous attribution\n`
    );
    process.exit(1);
  }

  return { tier, thumbprint, eligibleForTrustedWrites: eligible };
}

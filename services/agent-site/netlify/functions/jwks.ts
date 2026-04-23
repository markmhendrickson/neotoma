import type { Config } from "@netlify/functions";
import { jsonResponse } from "../lib/responses.js";

/**
 * JWKS endpoint for the agent.neotoma.io service identity.
 *
 * Neotoma pins this URL as the public-key source for AAuth requests signed
 * by the `agent-site@neotoma.io` sub. The set is published as-is from the
 * `AGENT_SITE_JWKS_JSON` env var — we intentionally do not derive it from
 * the private key at runtime, so a compromised function cannot quietly
 * publish a key it controls.
 *
 * Rotation strategy:
 *   1. Generate a new key pair offline.
 *   2. Set `AGENT_SITE_JWKS_JSON` to a JWKS containing BOTH the old and
 *      new public keys (kid field distinguishes them). Redeploy.
 *   3. Flip `AGENT_SITE_AAUTH_KID` / `AGENT_SITE_AAUTH_PRIVATE_JWK` to the
 *      new key. Redeploy.
 *   4. After verifiers have cache-missed the old key, remove it from
 *      `AGENT_SITE_JWKS_JSON`.
 *
 * The private key MUST NEVER appear in this response. We only read
 * `AGENT_SITE_JWKS_JSON` so misconfiguration (e.g. pointing it at the
 * private JWK by accident) is caught at deploy time.
 */
export default async (): Promise<Response> => {
  const raw = process.env.AGENT_SITE_JWKS_JSON;
  if (!raw) {
    return jsonResponse(503, {
      error: "JWKS_NOT_CONFIGURED",
      message:
        "AGENT_SITE_JWKS_JSON is not set. The agent-site service cannot " +
        "publish its signing keys until the env var is populated.",
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return jsonResponse(500, {
      error: "JWKS_MALFORMED",
      message: "AGENT_SITE_JWKS_JSON is not valid JSON.",
    });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return jsonResponse(500, {
      error: "JWKS_MALFORMED",
      message: "AGENT_SITE_JWKS_JSON must be a JWKS object with a `keys` array.",
    });
  }

  const keys = (parsed as { keys?: unknown }).keys;
  if (!Array.isArray(keys)) {
    return jsonResponse(500, {
      error: "JWKS_MALFORMED",
      message: "AGENT_SITE_JWKS_JSON is missing the required `keys` array.",
    });
  }

  // Defensive filter: drop any accidental private-key components (`d`) so a
  // misconfiguration never leaks a private key.
  const publicOnly = keys.map((key) => {
    if (!key || typeof key !== "object" || Array.isArray(key)) return key;
    const copy = { ...(key as Record<string, unknown>) };
    delete copy.d;
    delete copy.p;
    delete copy.q;
    delete copy.dp;
    delete copy.dq;
    delete copy.qi;
    // Ensure `use` is set to `sig` for clarity when absent.
    if (copy.use == null) copy.use = "sig";
    return copy;
  });

  return new Response(JSON.stringify({ keys: publicOnly }), {
    status: 200,
    headers: {
      "content-type": "application/jwk-set+json",
      // JWKS are safe to cache; Neotoma honours cache-control when fetching.
      "cache-control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
};

export const config: Config = {
  path: "/.netlify/functions/jwks",
};

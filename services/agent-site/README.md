# agent.neotoma.io

Netlify Functions + Netlify Blobs that form the agent-facing feedback intake
surface. The Neotoma MCP server `submit_feedback` / `get_feedback_status`
tools forward to these routes; the local cron (`scripts/cron/ingest_agent_incidents.ts`)
pulls pending items and writes status back.

See `docs/subsystems/agent_feedback_pipeline.md` for the full architecture.

## Routes

| Route                             | Auth                       | Purpose                                    |
| --------------------------------- | -------------------------- | ------------------------------------------ |
| `POST /feedback/submit`           | `AGENT_SITE_BEARER`        | Submit a feedback payload                  |
| `GET /feedback/status?token=…`    | access_token alone         | Poll status by per-incident access token   |
| `GET /feedback/pending`           | `AGENT_SITE_ADMIN_BEARER`  | Admin: pull items awaiting triage          |
| `POST /feedback/{id}/status`      | `AGENT_SITE_ADMIN_BEARER`  | Admin: write status, triggers push webhook |
| `POST /feedback/{id}/mirror_replay` | `AGENT_SITE_ADMIN_BEARER` | Admin: force a Neotoma mirror attempt (operator replay) |
| `GET /feedback/by_commit/:sha`    | `AGENT_SITE_ADMIN_BEARER`  | Admin: reverse lookup commit → feedback    |
| `GET /healthz`                    | none                       | Service liveness                           |
| `POST /sandbox/report/submit`     | `AGENT_SITE_SANDBOX_BEARER` | Durable store for public `sandbox.neotoma.io` abuse reports |
| `GET /sandbox/report/status`      | `AGENT_SITE_SANDBOX_BEARER` | Poll by `access_token` or `token` query param |
| `push_webhook_worker` (scheduled) | internal, every 5 min      | Drains `webhooks_pending` and `mirror_pending` |

## Environment variables

| Var | Required | Purpose |
| --- | -------- | ------- |
| `AGENT_SITE_BEARER`       | yes | Shared with Neotoma MCP server for public routes |
| `AGENT_SITE_ADMIN_BEARER` | yes | Used by Mark's local cron for admin routes      |
| `AGENT_SITE_SANDBOX_BEARER` | yes (sandbox forwarder) | Same value as Fly secret `NEOTOMA_SANDBOX_REPORT_FORWARD_BEARER` on `neotoma-sandbox` |
| `REDACTION_MODE`          | no  | `strip` (default) or `reject`                   |

### Neotoma forwarder (mirror to `neotoma_feedback` entity)

These drive the best-effort forwarder that writes each `StoredFeedback` into
a native Neotoma `neotoma_feedback` entity via a stable Cloudflare Named
Tunnel. See [`docs/subsystems/feedback_neotoma_forwarder.md`](../../docs/subsystems/feedback_neotoma_forwarder.md)
for data model and retry policy.

| Var | Required | Purpose |
| --- | -------- | ------- |
| `NEOTOMA_FEEDBACK_FORWARD_MODE`      | no (default `best_effort`) | `off` disables forwarding; `best_effort` never blocks submit; `required` returns 502 on forward failure (staging only) |
| `NEOTOMA_TUNNEL_URL`                 | yes (if not off)           | Cloudflare-tunneled base URL, e.g. `https://neotoma-tunnel.example.com` |
| `AGENT_SITE_AAUTH_PRIVATE_JWK`       | yes (if not off)           | Private signing JWK (ES256 P-256, or EdDSA Ed25519). Signs RFC 9421 HTTP Message Signatures on every outbound request. Never served publicly. |
| `AGENT_SITE_JWKS_JSON`               | yes (if not off)           | Public JWK set published at `/.well-known/jwks.json`; must contain the public counterpart of the signing key. Neotoma fetches this to verify signatures. |
| `AGENT_SITE_AAUTH_SUB`               | no (default `agent-site@neotoma.io`) | Subject claim placed on the `aa-agent+jwt` token. Must match the capability-registry entry on the Neotoma side. |
| `AGENT_SITE_AAUTH_ISS`               | no (default `https://agent.neotoma.io`) | Issuer claim; also the origin Neotoma resolves JWKS from. |
| `AGENT_SITE_AAUTH_KID`               | no                         | Explicit `kid`; falls back to the value embedded in the private JWK. |
| `AGENT_SITE_AAUTH_TOKEN_TTL_SEC`     | no (default `300`)         | Lifetime of the minted agent token (min 30s enforced by the signer). |
| `CF_ACCESS_CLIENT_ID`                | yes (if Access enabled)    | Cloudflare Access service-token client id |
| `CF_ACCESS_CLIENT_SECRET`            | yes (if Access enabled)    | Cloudflare Access service-token secret |
| `AGENT_SITE_NEOTOMA_AGENT_LABEL`     | no (default `agent-site@neotoma.io`) | Self-reported identifier stamped onto every forward via `X-Agent-Label`; Neotoma cross-checks it against the AAuth `sub` when the label is listed in `NEOTOMA_STRICT_AAUTH_SUBS`. |
| `NEOTOMA_FEEDBACK_FORWARD_TIMEOUT_MS`| no (default `2000`)        | Per-request timeout for the inline forward; higher values risk slowing submit responses |

#### Generating an AAuth key pair

```bash
node -e '
  const { generateKeyPair, exportJWK } = require("jose");
  (async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const priv = await exportJWK(privateKey);
    const pub  = await exportJWK(publicKey);
    const kid  = `agent-site-${Date.now()}`;
    priv.alg = pub.alg = "ES256"; priv.use = pub.use = "sig";
    priv.kid = pub.kid = kid;
    console.log("AGENT_SITE_AAUTH_PRIVATE_JWK=" + JSON.stringify(priv));
    console.log("AGENT_SITE_JWKS_JSON="         + JSON.stringify({ keys: [pub] }));
  })();
'
```

Paste the first line into Netlify env (private, never log) and the second
into Netlify env (public — it is returned verbatim by the JWKS function
after a defensive strip of any `d` / `p` / `q` / `dp` / `dq` / `qi` fields).

## Cloudflare Tunnel + Access setup

Netlify Functions can't talk to `localhost:3080`, so the forwarder relies
on a stable, Access-gated Cloudflare Named Tunnel. One-time setup on the
home machine:

```bash
# 1. Authenticate cloudflared with your Cloudflare account
cloudflared tunnel login

# 2. Create a named tunnel (one-time)
cloudflared tunnel create neotoma-agent-site

# 3. Route a subdomain of a zone you control to the tunnel
cloudflared tunnel route dns neotoma-agent-site neotoma-tunnel.<yourdomain>

# 4. Configure ingress (~/.cloudflared/config.yml)
#
# tunnel: <tunnel-uuid>
# credentials-file: /Users/you/.cloudflared/<uuid>.json
# ingress:
#   - hostname: neotoma-tunnel.<yourdomain>
#     service: http://localhost:3080
#   - service: http_status:404

# 5. Install as a launchd service so it survives reboots
sudo cloudflared service install
```

In Cloudflare Zero Trust:

1. **Access > Applications > Add self-hosted** — set the hostname to
   `neotoma-tunnel.<yourdomain>`.
2. Create a **Service Auth** policy that only allows a freshly-issued
   service token. Issue the token pair and copy both values into Netlify
   env as `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`.
3. (Optional) Add a second policy that allows your developer email for
   manual browser-based debugging.

The forwarder sends `CF-Access-Client-Id` and `CF-Access-Client-Secret`
headers (Cloudflare edge layer) plus AAuth-signed headers produced by
[`./netlify/lib/aauth_signer.ts`](./netlify/lib/aauth_signer.ts) (Neotoma
API layer):

- `Authorization: AAuth ...`
- `Signature` / `Signature-Input` / `Signature-Key`
- `Content-Digest`
- `Date`
- `X-Agent-Label: agent-site@neotoma.io`

Neotoma validates the signature, extracts `sub` / `iss` from the
`aa-agent+jwt` agent token, and runs the capability registry (see
[`docs/subsystems/agent_capabilities.md`](../../docs/subsystems/agent_capabilities.md))
to decide whether the request is allowed to touch the requested entity
types. Out-of-scope calls return 403 `capability_denied`.

To verify end-to-end from the tunnel host (the healthz path does not
require AAuth, so a plain curl is enough to exercise the CF Access
layer):

```bash
curl -fsS \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  https://neotoma-tunnel.<yourdomain>/healthz
```

To disable the forwarder (fallback to Blobs-only behavior), set
`NEOTOMA_FEEDBACK_FORWARD_MODE=off` in Netlify env.

## Local dev

```bash
cd services/agent-site
npm install
AGENT_SITE_BEARER=dev AGENT_SITE_ADMIN_BEARER=dev-admin netlify dev --port 8888
```

Then run the Neotoma MCP server with
`NEOTOMA_FEEDBACK_TRANSPORT=http` and `AGENT_SITE_BASE_URL=http://localhost:8888`
to route feedback through the local stub.

## Deployment

DNS: add `agent` CNAME to Netlify per `docs/infrastructure/deployment.md`.

The site deploys with standard Netlify Functions; no custom build step is
required. See `netlify.toml` for the redirect table that maps the
agent-facing paths to function names.

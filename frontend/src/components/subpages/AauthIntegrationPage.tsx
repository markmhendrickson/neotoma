import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function AauthIntegrationPage() {
  return (
    <DetailPage title="AAuth integration guide">
      <p className="text-[15px] leading-7 mb-4">
        End-to-end wiring guide for MCP client authors, local-proxy
        authors, and operators who need to wire a new agent into Neotoma
        and confirm the attribution tier their writes land with. For the
        wire format and trust-tier definitions see the{" "}
        <Link to="/aauth/spec">AAuth spec</Link>; for cryptographic
        envelopes see <Link to="/aauth/attestation">attestation</Link>;
        for CLI-side keygen see <Link to="/aauth/cli-keys">CLI keys</Link>.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        1. Wire format
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Neotoma identifies a writing agent via two complementary channels,
        stamped into every durable row (observations, relationships,
        sources, interpretations, timeline events):
      </p>
      <ol className="list-decimal pl-6 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">AAuth</strong> (RFC 9421 HTTP
          Message Signatures + AAuth profile). Caller signs the request and
          sends <code>Signature</code>, <code>Signature-Input</code> (MUST
          cover <code>@authority</code>, <code>@method</code>,{" "}
          <code>@target-uri</code>, <code>content-digest</code> when there
          is a body, and the <code>signature-key</code> header itself), and{" "}
          <code>Signature-Key</code> (the agent's JWK plus an agent-token
          JWT with <code>typ: "aa-agent+jwt"</code> carrying stable{" "}
          <code>sub</code> and <code>iss</code> claims). Neotoma verifies
          against the canonical <code>authority</code> from{" "}
          <code>NEOTOMA_AUTH_AUTHORITY</code>; using the <code>Host</code>{" "}
          header is explicitly unsafe.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            MCP <code>clientInfo</code> fallback
          </strong>
          . On <code>initialize</code> the MCP transport self-reports{" "}
          <code>{`{ name, version }`}</code>. Self-reported; subject to
          generic-name normalisation.
        </li>
      </ol>
      <p className="text-[15px] leading-7 mb-6">
        Both channels contribute to a single <code>AgentIdentity</code>{" "}
        record persisted on every write.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        2. Fallback precedence
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        For each request Neotoma resolves an <code>AgentIdentity</code> by
        walking these inputs in order; the first populated field at each
        layer wins:
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`AAuth (verified signature + JWT)   →  agent_thumbprint, agent_sub, agent_iss,
                                      agent_algorithm, agent_public_key
        │
        ▼
clientInfo.name + version          →  client_name, client_version
        │
        ▼
OAuth connection id                →  connection_id
        │
        ▼
(nothing)                          →  anonymous`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        The resulting trust tier is derived once per request. After v0.8.0
        the cascade is attestation-aware:
      </p>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>hardware</code>
          </strong>{" "}
         , AAuth verified AND the JWT carries a verified{" "}
          <code>cnf.attestation</code> envelope AND, in v0.12.0+, the bound
          key has not been revoked.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>operator_attested</code>
          </strong>{" "}
         , AAuth verified AND <code>iss</code> (or <code>iss:sub</code>)
          is in <code>NEOTOMA_OPERATOR_ATTESTED_ISSUERS</code> /{" "}
          <code>NEOTOMA_OPERATOR_ATTESTED_SUBS</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>software</code>
          </strong>{" "}
         , AAuth verified but no attestation envelope (or attestation
          failed and operator allowlist did not match), regardless of
          algorithm.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>unverified_client</code>
          </strong>{" "}
         , No AAuth, but <code>clientInfo.name</code> survived
          normalisation.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>anonymous</code>
          </strong>{" "}
         , Nothing else. <code>client_info</code> may have been too
          generic.
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        3. Generic-name normalisation
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Self-reported client names go through{" "}
        <code>normaliseClientNameWithReason()</code>. Names rejected as
        attribution surface a reason code on the <code>/session</code>{" "}
        response:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>not_a_string</code>, caller sent a non-string value.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>empty</code>, empty or whitespace-only string.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>too_generic</code>, name matches the generic-names
          blocklist (e.g. <code>mcp</code>, <code>client</code>,{" "}
          <code>anonymous</code>).
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        4. Verifying your session
      </h2>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        4a. HTTP <code>GET /session</code>
      </h3>
      <p className="text-[15px] leading-7 mb-3">
        Before enabling writes, a local proxy or CLI integrator should call{" "}
        <code>GET /session</code> with the same headers they intend to use
        for writes. The endpoint is read-only and is safe to poll.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`curl -sS \\
  -H "Signature: …" \\
  -H "Signature-Input: …" \\
  -H "Signature-Key: …" \\
  "https://neotoma.example/session" | jq`}</pre>
      <p className="text-[15px] leading-7 mb-3">Expected shape:</p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`{
  "user_id": "usr_…",
  "attribution": {
    "tier": "software",
    "agent_thumbprint": "…",
    "agent_sub": "agent:…",
    "agent_iss": "https://agent.neotoma.example",
    "agent_algorithm": "RS256",
    "client_name": "my-proxy",
    "client_version": "0.3.1",
    "decision": {
      "signature_present": true,
      "signature_verified": true,
      "resolved_tier": "software"
    }
  },
  "aauth": {
    "verified": true,
    "admitted": true,
    "grant_id": "ent_…",
    "admission_reason": "admitted",
    "agent_label": "Cursor on macbook-pro"
  },
  "policy": { "anonymous_writes": "allow" },
  "eligible_for_trusted_writes": true
}`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        <strong className="text-foreground">
          Integrator preflight rule:
        </strong>{" "}
        a healthy signed client should see{" "}
        <code>attribution.tier === "hardware"</code> or <code>"software"</code>
        , <code>attribution.decision.signature_verified === true</code>, and{" "}
        <code>eligible_for_trusted_writes === true</code>.
      </p>
      <p className="text-[15px] leading-7 mb-4">
        <code>aauth.verified</code> ≠ <code>aauth.admitted</code> on
        purpose. Verified means the signature checked out. Admitted means
        Neotoma matched that signature to one of the user's{" "}
        <code>agent_grant</code> entities and is treating the caller as
        authenticated without OAuth/Bearer. A verified-but-unmatched
        signature stays attribution-only, the caller can still write under
        existing Bearer/OAuth flows but cannot use AAuth alone for
        admission. The <code>admission_reason</code> field reports the
        resolver outcome:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>admitted</code>, active grant matched. AAuth alone is
          sufficient on this request.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>no_grants_for_user</code>, the owner user has no grants at
          all yet (Inspector → Agent grants → New).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>no_match</code>, this identity does not match any of the
          user's grants.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>grant_revoked</code> / <code>grant_suspended</code>,
          identity matched a grant whose status is <code>revoked</code> or{" "}
          <code>suspended</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>strict_rejected</code>, strict-AAuth gating rejected the
          signature before admission ran.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>aauth_disabled</code>, this deployment has AAuth disabled;
          admission did not run.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>not_signed</code>, no AAuth signature was presented; only
          attribution-only paths are open.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        If <code>signature_verified === false</code>, inspect{" "}
        <code>attribution.decision.signature_error_code</code>, it mirrors
        the diagnostic log line 1:1.
      </p>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        4b. MCP tool <code>get_session_identity</code>
      </h3>
      <p className="text-[15px] leading-7 mb-3">
        Same payload, reachable over the MCP transport, useful for clients
        that don't want a second HTTP round-trip:
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`{
  "method": "tools/call",
  "params": { "name": "get_session_identity", "arguments": {} }
}`}</pre>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        4c. CLI
      </h3>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`neotoma auth session        # JSON
neotoma auth session --text # Human-readable summary`}</pre>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        5. Policy knobs
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The Neotoma server publishes its active attribution policy on the{" "}
        <code>/session</code> response under <code>policy</code>:
      </p>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>anonymous_writes</code>, controlled by{" "}
          <code>NEOTOMA_ATTRIBUTION_POLICY=allow|warn|reject</code>; default{" "}
          <code>allow</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>min_tier</code>, controlled by{" "}
          <code>
            NEOTOMA_MIN_ATTRIBUTION_TIER=hardware|software|unverified_client
          </code>
          ; default unset.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>per_path</code>, controlled by{" "}
          <code>
            NEOTOMA_ATTRIBUTION_POLICY_JSON={`{"observations": "reject", …}`}
          </code>
          ; default unset.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-4">
        Per-path overrides accept any of the canonical write paths:{" "}
        <code>observations</code>, <code>relationships</code>,{" "}
        <code>sources</code>, <code>interpretations</code>,{" "}
        <code>timeline_events</code>, <code>corrections</code>. Missing
        paths inherit <code>anonymous_writes</code>.
      </p>
      <p className="text-[15px] leading-7 mb-3">
        When a write is rejected by policy the server returns HTTP 403 with:
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`{
  "error": {
    "code": "ATTRIBUTION_REQUIRED",
    "min_tier": "software",
    "current_tier": "anonymous",
    "hint": "Sign requests with AAuth or set NEOTOMA_ATTRIBUTION_POLICY=allow"
  }
}`}</pre>
      <p className="text-[15px] leading-7 mb-6">
        <code>warn</code> mode accepts the write, adds an{" "}
        <code>X-Neotoma-Attribution-Warning</code> response header, and
        emits a structured log event. <code>allow</code> is silent. For
        per-agent capability scoping (grants), see{" "}
        <Link to="/aauth/capabilities">capabilities</Link>.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        6. Diagnostics
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The Phase 2 diagnostic log line is the single source of truth for
        attribution resolution decisions. Every request that hits the AAuth
        middleware emits exactly one:
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`// DEBUG
{
  "event": "attribution_decision",
  "signature_present": true,
  "signature_verified": false,
  "signature_error_code": "jwt_expired",
  "resolved_tier": "anonymous"
}`}</pre>
      <p className="text-[15px] leading-7 mb-4">Stable fields:</p>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>event</code>, always{" "}
          <code>"attribution_decision"</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>signature_present</code>, caller sent any of{" "}
          <code>Signature</code>, <code>Signature-Input</code>, or{" "}
          <code>Signature-Key</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>signature_verified</code>, signature + JWT both valid.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>signature_error_code</code>, short code when{" "}
          <code>signature_verified</code> is false. Examples:{" "}
          <code>signature_invalid</code>, <code>jwt_expired</code>,{" "}
          <code>jwt_invalid</code>, <code>verification_threw</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>client_info_raw_name</code>, added on the{" "}
          <code>/session</code> response when the caller sent a non-empty
          clientInfo name.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>client_info_normalised_to_null_reason</code>,{" "}
          <code>too_generic</code> / <code>empty</code> /{" "}
          <code>not_a_string</code> when the raw name was dropped.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>resolved_tier</code>, final tier after merging AAuth +
          clientInfo.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-4">
        <strong className="text-foreground">Safety invariants</strong>{" "}
        (must hold at INFO and above): public keys, agent tokens, and
        signature bytes MUST NEVER appear in logs at INFO or higher.{" "}
        <code>agent_thumbprint</code> is safe to log at any level.
      </p>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        Common integrator failures
      </h3>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>signature_verified: false</code>,{" "}
          <code>signature_error_code: "signature_invalid"</code>, wrong{" "}
          <code>@authority</code>; body hashing misaligned;{" "}
          <code>content-digest</code> not covered.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>signature_error_code: "jwt_expired"</code>, agent token
          past its <code>exp</code>. Refresh the token.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>signature_error_code: "verification_threw"</code>,
          unreachable JWKS URL or malformed headers. Check network + header
          casing.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>tier: "anonymous"</code>, no signature headers, caller
          forgot to sign; OR <code>Host</code> header rewriting stripped{" "}
          <code>@authority</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>tier: "unverified_client"</code> but expected{" "}
          <code>software</code>/<code>hardware</code>, AAuth not wired;
          clientInfo.name survived but signature is missing.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>client_info_normalised_to_null_reason: "too_generic"</code>{" "}
         , clientInfo.name is in the blocklist (<code>mcp</code>,{" "}
          <code>client</code>, …). Pick a distinctive name.
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        7. Transport parity
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Attribution is threaded uniformly across every transport that
        reaches Neotoma's write-path services. The single enforcement seam
        is <code>enforceAttributionPolicy(path, identity)</code> inside
        each service, what changes per transport is only how the identity
        gets into the per-request <code>AsyncLocalStorage</code> context
        that the services read from.
      </p>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">HTTP <code>/mcp</code></strong>{" "}
         , <code>aauthVerify</code> global middleware;{" "}
          <code>attributionContext</code> + a nested{" "}
          <code>runWithRequestContext</code> inside the <code>/mcp</code>{" "}
          handler with the server-resolved identity.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">HTTP direct routes</strong>{" "}
          (<code>/store</code>, <code>/correct</code>,{" "}
          <code>/observations/create</code>,{" "}
          <code>/create_relationship</code>, …), <code>aauthVerify</code>{" "}
          global middleware; <code>attributionContext</code> middleware
          (globally applied in <code>src/actions.ts</code>).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            HTTP <code>GET /session</code>
          </strong>{" "}
         , <code>aauthVerify</code> global middleware; read-only; resolves
          identity inline for response assembly.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">MCP stdio</strong>, no
          AAuth verification (stdio has no HTTP layer);{" "}
          <code>NeotomaServer.setSessionAgentIdentity</code> +{" "}
          <code>sessionClientInfo</code> assembled in{" "}
          <code>InitializeRequestSchema</code>; propagated by{" "}
          <code>runWithRequestContext</code> inside{" "}
          <code>CallToolRequestSchema</code> dispatch.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            CLI-over-MCP (<code>executeToolForCli</code>)
          </strong>{" "}
         , same wrap as stdio.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            CLI over HTTP (<code>createApiClient</code>)
          </strong>{" "}
         , <code>aauthVerify</code> global middleware on target; signs
          outbound requests with <code>~/.neotoma/aauth/</code> keypair
          when configured (see <Link to="/aauth/cli-keys">CLI keys</Link>);
          middleware stamps the same decision as any other HTTP caller.
        </li>
      </ul>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        HTTP fallback headers
      </h3>
      <p className="text-[15px] leading-7 mb-4">
        Non-MCP HTTP callers (the CLI in particular) can self-report a{" "}
        <code>clientInfo</code>-equivalent value through two optional
        headers:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>X-Client-Name</code> → fallback attribution{" "}
          <code>client_name</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>X-Client-Version</code> → fallback attribution{" "}
          <code>client_version</code>.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        Both go through the same generic-name normalisation as MCP's{" "}
        <code>initialize.clientInfo</code> handshake, so a value of{" "}
        <code>mcp</code> or <code>client</code> is still dropped to{" "}
        <code>anonymous</code>.
      </p>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        CLI signer
      </h3>
      <p className="text-[15px] leading-7 mb-3">
        The CLI ships an optional AAuth signer so <code>neotoma …</code>{" "}
        commands can land as <code>hardware</code> / <code>software</code>{" "}
        tier instead of <code>anonymous</code>:
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`neotoma auth keygen           # Generate ES256 keypair under ~/.neotoma/aauth/
neotoma auth session          # Inspect resolved tier + signer configuration
neotoma auth sign-example     # Print a debugging curl with a signed JWT`}</pre>
      <p className="text-[15px] leading-7 mb-6">
        When a keypair is present at{" "}
        <code>~/.neotoma/aauth/private.jwk</code>,{" "}
        <code>createApiClient</code> transparently signs outbound requests
        via <code>@hellocoop/httpsig</code>. Signing is silently skipped
        (no error) when no keypair is configured so existing CLI users are
        unaffected. Hardware-backed keygen is on{" "}
        <Link to="/aauth/cli-keys">CLI keys</Link>.
      </p>

      <p className="text-[14px] leading-6 text-muted-foreground">
        Back to <Link to="/aauth">AAuth overview</Link>. See also{" "}
        <Link to="/aauth/spec">AAuth spec</Link>,{" "}
        <Link to="/aauth/attestation">attestation</Link>,{" "}
        <Link to="/aauth/cli-keys">CLI keys</Link>,{" "}
        <Link to="/aauth/capabilities">capabilities</Link>.
      </p>
    </DetailPage>
  );
}

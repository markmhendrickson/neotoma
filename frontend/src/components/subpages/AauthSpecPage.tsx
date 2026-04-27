import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function AauthSpecPage() {
  return (
    <DetailPage title="AAuth wire format and verification">
      <p className="text-[15px] leading-7 mb-4">
        This page is the canonical reference for Neotoma's AAuth wire format,
        signature verification rules, and trust-tier derivation. It is the
        upstream spec for the verifier in{" "}
        <code>src/middleware/aauth_verify.ts</code>, the agent-identity
        resolution in <code>src/crypto/agent_identity.ts</code>, and the
        attribution-policy seam in{" "}
        <code>src/services/attribution_policy.ts</code>.
      </p>
      <p className="text-[15px] leading-7 mb-6">
        For an integrator-oriented walkthrough see the{" "}
        <Link to="/aauth/integration">integration guide</Link>. Cryptographic
        attestation envelopes (Apple SE, WebAuthn-packed, TPM 2.0) are
        specified separately on the{" "}
        <Link to="/aauth/attestation">attestation</Link> page; CLI keygen and
        hardware backends are on{" "}
        <Link to="/aauth/cli-keys">CLI keys</Link>.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        What AAuth is (and is not)
      </h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          A writing agent owns a stable keypair (software or hardware-backed)
          and an <code>aa-agent+jwt</code> token carrying <code>iss</code>,{" "}
          <code>sub</code>, and a <code>cnf.jwk</code> confirmation key.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          The agent signs each HTTP request per RFC 9421. Neotoma verifies
          the signature, derives a <code>trust_tier</code>, and stamps{" "}
          <code>(agent_thumbprint, agent_sub, agent_iss, trust_tier, …)</code>{" "}
          onto every durable row.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Bearer tokens, OAuth, and MCP <code>connection_id</code> continue to
          resolve the human <code>user_id</code>. AAuth never bypasses
          user-scope resolution.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          When AAuth is absent, Neotoma falls back to MCP{" "}
          <code>clientInfo</code> or <code>X-Client-Name</code> /{" "}
          <code>X-Client-Version</code> HTTP headers as a self-reported
          attribution channel. Self-reported channels never reach the{" "}
          <code>hardware</code>, <code>operator_attested</code>, or{" "}
          <code>software</code> tiers, the highest they earn is{" "}
          <code>unverified_client</code>.
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Wire format
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Neotoma identifies a writing agent over <strong>two channels</strong>,
        in precedence order.
      </p>
      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        1. AAuth (signed request)
      </h3>
      <p className="text-[15px] leading-7 mb-3">The request carries:</p>
      <ul className="list-none pl-0 space-y-2 mb-4">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>Signature</code>, the signature bytes (RFC 9421).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>Signature-Input</code>, signature parameters. MUST cover, at
          minimum: <code>@authority</code>, <code>@method</code>,{" "}
          <code>@target-uri</code>, <code>content-digest</code> (when the
          request has a body), and the <code>signature-key</code> header
          itself.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>Signature-Key</code>, the agent's JWK plus an{" "}
          <code>aa-agent+jwt</code> agent token. The JWT carries{" "}
          <code>typ: "aa-agent+jwt"</code>, <code>iss</code>, <code>sub</code>,{" "}
          <code>iat</code>, <code>cnf.jwk</code>, and optionally{" "}
          <code>cnf.attestation</code>.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        Verification runs against the canonical <code>authority</code>{" "}
        configured via <code>NEOTOMA_AUTH_AUTHORITY</code> (defaults to the
        local dev host). The <code>authority</code> value MUST match the
        server's canonical host, using the request <code>Host</code> header
        is explicitly unsafe and is rejected.
      </p>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        2. MCP <code>clientInfo</code> fallback
      </h3>
      <p className="text-[15px] leading-7 mb-6">
        On <code>initialize</code> the MCP transport self-reports{" "}
        <code>{`{ name, version }`}</code>. Generic names (<code>mcp</code>,{" "}
        <code>client</code>, <code>mcp-client</code>, <code>unknown</code>,{" "}
        <code>anonymous</code>, …) are dropped through{" "}
        <code>normaliseClientNameWithReason</code> and treated as if{" "}
        <code>clientInfo</code> were absent. Non-MCP HTTP callers can pass the
        same information via the <code>X-Client-Name</code> and{" "}
        <code>X-Client-Version</code> headers.
      </p>
      <p className="text-[15px] leading-7 mb-6">
        A successful AAuth verification populates{" "}
        <code>agent_thumbprint</code> (RFC 7638), <code>agent_sub</code>,{" "}
        <code>agent_iss</code>, <code>agent_algorithm</code>, and{" "}
        <code>agent_public_key</code>. A populated <code>clientInfo</code>{" "}
        populates <code>client_name</code> and <code>client_version</code>.
        Both halves are persisted; the cascade below chooses the trust tier.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Verification rules
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Performed by <code>aauth_verify</code> middleware:
      </p>
      <ol className="list-decimal pl-6 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          Parse <code>Signature-Input</code> and reject if any required
          component is missing.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Resolve <code>@authority</code> against{" "}
          <code>NEOTOMA_AUTH_AUTHORITY</code>. Mismatch fails with{" "}
          <code>authority_mismatch</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Recompute <code>content-digest</code> (when the request has a body)
          and compare to the header. Mismatch fails with{" "}
          <code>digest_mismatch</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Parse the <code>Signature-Key</code> header into JWK + JWT. Reject
          if <code>typ</code> is not <code>aa-agent+jwt</code> or the JWT is
          malformed.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Verify the JWT signature against the embedded JWK. The JWT MUST
          bind <code>cnf.jwk</code> to the same key used to sign the request.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Check <code>iat</code> against the configured AAuth clock-skew
          window (<code>NEOTOMA_AUTH_AGENT_TOKEN_MAX_AGE_S</code>, default
          300 s).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Verify the request signature against the JWK. Failure produces{" "}
          <code>signature_invalid</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          If <code>cnf.attestation</code> is present, dispatch to the
          attestation verifier and capture the per-format{" "}
          <code>attestation_outcome</code>.
        </li>
      </ol>
      <p className="text-[15px] leading-7 mb-6">
        Verifier failures <strong>never</strong> reject the request when the
        underlying signature is valid; they only prevent tier promotion. The{" "}
        <code>attribution.decision</code> block on <code>GET /session</code>{" "}
        records the failure reason so operators can debug from the Inspector.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Trust tiers
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        A single enum is stamped onto every durable row. Tier resolution is
        performed once per request, services and clients MUST read the
        already-resolved <code>AgentIdentity.trust_tier</code> from the
        per-request context and never re-derive it.
      </p>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>hardware</code>
          </strong>{" "}
         , AAuth verified AND the JWT carries a <code>cnf.attestation</code>{" "}
          the verifier accepts AND (v0.12.0+) the bound key is not revoked.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>operator_attested</code>
          </strong>{" "}
         , AAuth verified AND <code>iss</code> (or <code>iss:sub</code>) is
          in the operator allowlist.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>software</code>
          </strong>{" "}
         , AAuth verified, but no attestation envelope (or attestation failed
          and operator allowlist did not match), regardless of signing
          algorithm.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>unverified_client</code>
          </strong>{" "}
         , No AAuth, but <code>clientInfo.name</code> (or{" "}
          <code>X-Client-Name</code>) survived normalisation.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>anonymous</code>
          </strong>{" "}
         , Nothing distinctive: generic or absent <code>clientInfo</code>, no
          AAuth, no fallback header.
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Verification cascade
      </h2>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`Request
 ├── AAuth Signature header?
 │     no  → non-generic clientInfo or X-Client-Name?
 │            yes → unverified_client
 │            no  → anonymous
 │     yes → signature verifies?
 │            no  → fall through to clientInfo channel
 │            yes → cnf.attestation present?
 │                   yes → verifier accepts?
 │                          yes → key not revoked?
 │                                 yes → hardware
 │                                 no  → software
 │                          no  → iss / iss:sub in operator allowlist?
 │                                 yes → operator_attested
 │                                 no  → software
 │                   no  → iss / iss:sub in operator allowlist?
 │                          yes → operator_attested
 │                          no  → software`}</pre>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Per-request precedence
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        For each request Neotoma walks these inputs in order; the first
        populated field at each layer wins:
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`AAuth (verified signature + JWT) → agent_thumbprint, agent_sub, agent_iss,
                                   agent_algorithm, agent_public_key
        │
        ▼
clientInfo.name + version        → client_name, client_version
        │
        ▼
X-Client-Name + X-Client-Version → client_name, client_version
        │
        ▼
OAuth connection id              → connection_id
        │
        ▼
(nothing)                        → anonymous`}</pre>
      <p className="text-[15px] leading-7 mb-6">
        Bearer tokens resolve only <code>user_id</code>; they do not mint an
        attribution tier above <code>anonymous</code> on their own.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Operator policy
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The server publishes the active policy on <code>GET /session</code>{" "}
        under <code>policy</code>:
      </p>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>NEOTOMA_ATTRIBUTION_POLICY</code>
          </strong>{" "}
          (<code>allow</code> | <code>warn</code> | <code>reject</code>;
          default <code>allow</code>), global behaviour for{" "}
          <code>anonymous</code> writes.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>NEOTOMA_MIN_ATTRIBUTION_TIER</code>
          </strong>{" "}
          (<code>hardware</code> | <code>software</code> |{" "}
          <code>unverified_client</code>), minimum tier required.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            <code>NEOTOMA_ATTRIBUTION_POLICY_JSON</code>
          </strong>{" "}
         , per-path overrides, e.g.{" "}
          <code>{`{"observations":"reject"}`}</code>.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        Behaviour: <code>reject</code> returns{" "}
        <code>HTTP 403 ATTRIBUTION_REQUIRED</code> with <code>min_tier</code>{" "}
        and <code>current_tier</code> in the error envelope. <code>warn</code>{" "}
        stamps an <code>X-Neotoma-Attribution-Warning</code> response header
        and emits an <code>attribution_decision</code> log line, but completes
        the write. <code>allow</code> is silent. <code>min_tier</code> and{" "}
        <code>per_path</code> compose: a per-path <code>reject</code> always
        wins over the global <code>allow</code>.
      </p>
      <p className="text-[15px] leading-7 mb-6">
        Per-agent fine-grained capability scoping (
        <code>(op, entity_type)</code> allow-lists) is layered on top, see{" "}
        <Link to="/aauth/capabilities">agent capabilities</Link>.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Diagnostic surface
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Every AAuth verification emits a structured{" "}
        <code>attribution_decision</code> log event with at least:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>signature_present</code>, was a <code>Signature</code> header
          on the request?
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>signature_verified</code>, did the cryptographic check pass?
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>signature_error_code</code>, when applicable: why
          verification failed (<code>authority_mismatch</code>,{" "}
          <code>digest_mismatch</code>, <code>signature_invalid</code>,{" "}
          <code>agent_token_expired</code>, <code>unsupported_algorithm</code>
          , …).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>attestation_outcome</code>, when present: result of the
          per-format verifier (<code>verified</code>,{" "}
          <code>format_unsupported</code>, <code>key_binding_failed</code>,{" "}
          <code>challenge_mismatch</code>, <code>chain_invalid</code>, …).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>revocation_outcome</code> (v0.12.0+),{" "}
          <code>not_checked</code>, <code>live</code>, <code>revoked</code>,
          or <code>error_skipped</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>resolved_tier</code>, final tier as stamped onto the request
          context.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        The same fields are exposed on <code>GET /session</code> under{" "}
        <code>attribution.decision</code> so client preflight tooling can
        surface them without scraping logs.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Transport parity
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The same identity contract is threaded through every transport:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          HTTP <code>/mcp</code> (MCP-over-HTTP).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Direct REST routes (<code>/store</code>,{" "}
          <code>/observations/create</code>,{" "}
          <code>/create_relationship</code>, <code>/correct</code>,{" "}
          <code>/session</code>, …).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          MCP stdio.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          CLI-over-MCP and CLI-over-HTTP.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        Per-transport notes live on the{" "}
        <Link to="/aauth/integration">integration</Link> page.
      </p>

      <p className="text-[14px] leading-6 text-muted-foreground">
        Back to <Link to="/aauth">AAuth overview</Link>.
      </p>
    </DetailPage>
  );
}

import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import {
  InspectorPreview,
  InspectorSidebarMock,
  InspectorPageHeaderMock,
  MockPill,
  MockStatCard,
} from "./inspector/InspectorPreview";

export function AauthReferencePage() {
  return (
    <DetailPage title="AAuth (Agent Authentication)">
      <p className="text-[15px] leading-7 mb-4">
        AAuth is Neotoma's mechanism for cryptographically verifiable{" "}
        <em>agent identity</em> on every write. It lives alongside (not in
        place of) human user authentication: where <code>user_id</code> answers
        "whose data is this?", AAuth answers "which agent wrote it?". The pair
        is stamped onto every observation, relationship, source,
        interpretation, and timeline event.
      </p>
      <p className="text-[15px] leading-7 mb-6">
        AAuth is built on two open standards: <strong>RFC 9421 HTTP Message
        Signatures</strong> for the request signature, and an{" "}
        <strong><code>aa-agent+jwt</code></strong> agent token that carries the
        agent's confirmation key and stable identifiers. Optional hardware
        attestation (Apple Secure Enclave, WebAuthn-packed, TPM 2.0) promotes
        signed clients into the highest trust tier.
      </p>
      <p className="text-[15px] leading-7 mb-6">
        Protocol-level specifications, Internet-Drafts, SDKs, and the live
        playground are on{" "}
        <a
          href="https://aauth.dev/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline underline-offset-2 hover:no-underline"
        >
          aauth.dev
        </a>
        . The rest of this page is how Neotoma implements that contract for
        writes and attribution.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Why AAuth
      </h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          Bearer tokens are operator-set shared secrets that gate connection
          access; they resolve a <code>user_id</code> but never mint an
          attribution tier above <code>anonymous</code> on their own. OAuth
          authenticates the <em>human</em> behind the connection. AAuth
          identifies the <em>agent</em> writing within that authenticated
          session, in parallel with whichever human-identity flow is in
          use.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Neotoma's AAuth is an identity-based contract today, not a
          delegation-token system: the agent presents a stable
          cryptographic identity, and the server records it alongside the
          human <code>user_id</code> on every write. Per-agent scoping is
          handled separately via <code>agent_grant</code> entities (see{" "}
          <Link to="/aauth/capabilities">capabilities</Link>).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Every durable row carries the agent's stable identifiers
          (<code>agent_thumbprint</code>, <code>agent_sub</code>,{" "}
          <code>agent_iss</code>) and a resolved <code>trust_tier</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Operators can require a minimum tier per route via attribution
          policy. Self-reported clients fall back gracefully to the
          <code> unverified_client</code> tier.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          The contract is uniform across HTTP <code>/mcp</code>, direct REST
          routes, MCP stdio, and CLI-over-MCP / CLI-over-HTTP.
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Trust tiers
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        A single enum is stamped onto every durable row. Tier resolution happens
        once per request inside <code>src/middleware/aauth_verify.ts</code>;
        services and clients MUST read the resolved tier from the request
        context rather than re-deriving it.
      </p>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground"><code>hardware</code></strong>,
          AAuth verified AND the JWT carries a <code>cnf.attestation</code>{" "}
          envelope the verifier accepts AND the bound key is not revoked.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground"><code>operator_attested</code></strong>,
          AAuth verified AND <code>iss</code> (or <code>iss:sub</code>) is in
          the operator allowlist
          (<code>NEOTOMA_OPERATOR_ATTESTED_ISSUERS</code> /{" "}
          <code>NEOTOMA_OPERATOR_ATTESTED_SUBS</code>).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground"><code>software</code></strong>,
          AAuth verified, but no attestation envelope (or attestation failed
          and operator allowlist did not match), regardless of signing
          algorithm.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground"><code>unverified_client</code></strong>,
          No AAuth signature was verified, but the caller self-reported a
          distinctive <code>clientInfo.name</code> (or{" "}
          <code>X-Client-Name</code>) that survived generic-name
          normalisation. The name is recorded on the row but is{" "}
          <em>not</em> cryptographically attested, anyone can claim it.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground"><code>anonymous</code></strong>,
          No AAuth, and no usable client name either: <code>clientInfo</code>{" "}
          and <code>X-Client-Name</code> were absent, empty, non-strings,
          or matched the generic-names blocklist
          (<code>mcp</code>, <code>client</code>, <code>mcp-client</code>,{" "}
          <code>unknown</code>, <code>anonymous</code>). The row carries no
          stable identifying name at all.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        The practical difference: <code>unverified_client</code> rows still
        let you filter and group by which integration produced the write
        (e.g. <code>cursor-agent</code> vs <code>claude-code</code>),
        whereas <code>anonymous</code> rows are an undifferentiated bucket
        that operators usually want to surface or block via attribution
        policy.
      </p>
      <p className="text-[15px] leading-7 mb-4">
        Tier resolution surfaces directly in the{" "}
        <Link
          to="/inspector/agents"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Inspector agents view
        </Link>
        : every distinct writer is one row, badged with the tier it resolved
        to (<code>hardware</code>, <code>software</code>,{" "}
        <code>unverified_client</code>, <code>anonymous</code>) plus the
        signing algorithm and last-seen activity.
      </p>

      <InspectorPreview
        path="/agents"
        caption="Inspector, Agents list. AAuth trust tiers render as inline badges; click through for the per-agent thumbprint, algorithm, attestation outcome, and grants."
      >
        <div className="flex">
          <InspectorSidebarMock active="agents" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Agents"
              subtitle="14 active identities · 8.2k writes · last 30d"
              right={
                <>
                  <MockPill tone="success">hardware (3)</MockPill>
                  <MockPill tone="info">software (8)</MockPill>
                  <MockPill tone="warning">unverified (2)</MockPill>
                  <MockPill tone="muted">anonymous (1)</MockPill>
                </>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Agent</th>
                    <th className="px-3 py-2 text-left font-medium">Tier</th>
                    <th className="px-3 py-2 text-left font-medium">Alg</th>
                    <th className="px-3 py-2 text-left font-medium">Writes</th>
                    <th className="px-3 py-2 text-left font-medium">
                      Last seen
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      n: "operator (mac · SE)",
                      kid: "es256:Dr…2Yj",
                      tier: "hardware",
                      tone: "success" as const,
                      alg: "ES256",
                      w: 412,
                      ls: "10:55",
                    },
                    {
                      n: "cursor-agent",
                      kid: "es256:Bp…4Zq",
                      tier: "hardware",
                      tone: "success" as const,
                      alg: "ES256",
                      w: 2810,
                      ls: "12:30",
                    },
                    {
                      n: "claude-code",
                      kid: "ed25519:Aa…7Lk",
                      tier: "software",
                      tone: "info" as const,
                      alg: "EdDSA",
                      w: 4120,
                      ls: "12:41",
                    },
                    {
                      n: "ingest-pipeline",
                      kid: "ed25519:Cq…9Rt",
                      tier: "software",
                      tone: "info" as const,
                      alg: "EdDSA",
                      w: 980,
                      ls: "11:08",
                    },
                    {
                      n: "custom-script@myco",
                      kid: "-",
                      tier: "unverified_client",
                      tone: "warning" as const,
                      alg: "-",
                      w: 18,
                      ls: "Apr 24",
                    },
                    {
                      n: "anonymous",
                      kid: "-",
                      tier: "anonymous",
                      tone: "muted" as const,
                      alg: "-",
                      w: 4,
                      ls: "Apr 22",
                    },
                  ].map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-3 py-2 text-foreground">
                        <div className="flex flex-col">
                          <span>{row.n}</span>
                          <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[200px]">
                            {row.kid}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <MockPill tone={row.tone}>{row.tier}</MockPill>
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">
                        {row.alg}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-foreground">
                        {row.w.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {row.ls}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Wire format
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        AAuth sends three headers on every signed request. The signature
        components MUST cover <code>@authority</code>, <code>@method</code>,{" "}
        <code>@target-uri</code>, <code>content-digest</code> (when there's a
        body), and the <code>signature-key</code> header itself.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`Signature: sig1=:AGNlbGtkdHIxMjM4...:
Signature-Input: sig1=("@authority" "@method" "@target-uri" \\
                       "content-digest" "signature-key");\\
                  alg="ed25519";created=1714003200;keyid="..."
Signature-Key: <base64url(JSON: { jwk, jwt: "<aa-agent+jwt>" })>`}</pre>
      <p className="text-[15px] leading-7 mb-4">
        The <code>aa-agent+jwt</code> agent token uses{" "}
        <code>typ: "aa-agent+jwt"</code> and carries:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-4">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>iss</code>, issuer / fleet identifier
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>sub</code>, agent identity within the issuer
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>iat</code>, issued-at; checked against the configured AAuth
          clock-skew window (default 300 s)
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>cnf.jwk</code>, confirmation key (RFC 7638 thumbprint MUST
          match the signing key)
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>cnf.attestation</code> (optional), hardware attestation
          envelope (Apple SE, WebAuthn-packed, or TPM 2.0)
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        Neotoma verifies the signature against the canonical authority
        configured via <code>NEOTOMA_AUTH_AUTHORITY</code>. Using the request{" "}
        <code>Host</code> header for verification is explicitly unsafe and
        rejected.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Verification cascade
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Tier derivation walks the signed payload, then attestation, then the
        operator allowlist, then the self-reported channels:
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`Signature header present?
  no  → clientInfo / X-Client-Name non-generic? → unverified_client
                                                | else → anonymous
  yes → signature verifies against authority + body digest?
          no  → fall through to clientInfo channel
          yes → cnf.attestation present?
                  yes → verifier accepts? → revocation OK? → hardware
                                          | else → software
                  no / fails → iss (or iss:sub) in operator allowlist?
                                yes → operator_attested
                                no  → software`}</pre>
      <p className="text-[15px] leading-7 mb-6">
        Verifier failures never reject the request when the underlying
        signature is valid, they only prevent tier promotion. The reason is
        recorded under <code>attribution.decision</code> on{" "}
        <code>GET /session</code> for debugging.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Per-request precedence
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        For each request Neotoma walks these inputs in order; the first
        populated field at each layer wins. Bearer tokens resolve only{" "}
        <code>user_id</code> and never mint a tier above <code>anonymous</code>{" "}
        on their own.
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`AAuth (verified signature + JWT)  → agent_thumbprint, agent_sub, agent_iss,
                                    agent_algorithm, agent_public_key
clientInfo (MCP initialize)       → client_name, client_version
X-Client-Name / X-Client-Version  → client_name, client_version
OAuth connection id               → connection_id
(nothing)                         → anonymous`}</pre>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Hardware attestation
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        When the agent token carries <code>cnf.attestation</code>, Neotoma
        verifies the envelope before promoting the request to{" "}
        <code>hardware</code>. The envelope binds the signing key to a hardware
        root of trust by RFC 7638 thumbprint and a server-recomputed
        challenge. Supported formats:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-4">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground"><code>apple-secure-enclave</code></strong>,
          macOS hosts; backed by the Apple Attestation Root (bundled at{" "}
          <code>config/aauth/apple_attestation_root.pem</code>).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground"><code>webauthn-packed</code></strong>,
          YubiKey 5 series and any WebAuthn authenticator emitting a{" "}
          <code>packed</code> attestation statement.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground"><code>tpm2</code></strong>,
          Linux <code>/dev/tpmrm0</code> and Windows TBS / NCrypt; verified
          against the operator-configured TPM CA bundle.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        Verification ordering inside each format: parse statement, extract
        credential public key, RFC 7638 thumbprint check against{" "}
        <code>cnf.jwk</code>, recompute challenge from JWT claims, then chain
        validation. Each step has a deterministic failure code surfaced via{" "}
        <code>attestation_outcome</code>.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Operator policy
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Operators control attribution requirements through environment
        variables. The active policy is exposed under <code>policy</code> on{" "}
        <code>GET /session</code>:
      </p>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground"><code>NEOTOMA_ATTRIBUTION_POLICY</code></strong>{" "}
          (<code>allow</code> | <code>warn</code> | <code>reject</code>;
          default <code>allow</code>), global behaviour for{" "}
          <code>anonymous</code> writes. <code>reject</code> returns{" "}
          <code>HTTP 403 ATTRIBUTION_REQUIRED</code>; <code>warn</code> stamps{" "}
          <code>X-Neotoma-Attribution-Warning</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground"><code>NEOTOMA_MIN_ATTRIBUTION_TIER</code></strong>{" "}
          (<code>hardware</code> | <code>software</code> |{" "}
          <code>unverified_client</code>), minimum tier required for the
          policy to be considered satisfied.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground"><code>NEOTOMA_ATTRIBUTION_POLICY_JSON</code></strong>{" "}
         , per-path overrides, e.g.{" "}
          <code>{`{"observations":"reject","relationships":"warn"}`}</code>.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-4">
        Per-path <code>reject</code> always wins over a global{" "}
        <code>allow</code>. Per-agent fine-grained capability scoping
        (<code>(op, entity_type)</code> allow-lists) is layered on top via{" "}
        <code>agent_grant</code> entities.
      </p>
      <p className="text-[15px] leading-7 mb-4">
        Operators can read and edit the active policy without touching env
        vars from the{" "}
        <Link
          to="/inspector/settings/attribution-policy"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Inspector settings page
        </Link>
        ; per-agent grants live alongside the agent in the{" "}
        <Link
          to="/inspector/agents"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Agents view
        </Link>
        .
      </p>

      <InspectorPreview
        path="/settings#attribution"
        caption="Inspector, Settings · Attribution policy. The same env vars (NEOTOMA_ATTRIBUTION_POLICY, NEOTOMA_MIN_ATTRIBUTION_TIER, per-path overrides) rendered as a live operator console with the resolved decision per route."
      >
        <div className="flex">
          <InspectorSidebarMock active="settings" />
          <div className="flex-1 min-w-0 p-4 space-y-4">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-[12px] font-semibold text-foreground mb-2">
                Attribution policy
              </div>
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div>
                  <div className="text-muted-foreground mb-1">Global mode</div>
                  <div className="flex gap-1">
                    <MockPill tone="muted">allow</MockPill>
                    <MockPill tone="warning">warn</MockPill>
                    <MockPill tone="danger">reject</MockPill>
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    Active: <span className="text-foreground">warn</span>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Min tier</div>
                  <div className="flex gap-1">
                    <MockPill tone="success">hardware</MockPill>
                    <MockPill tone="info">software</MockPill>
                    <MockPill tone="muted">unverified_client</MockPill>
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    Active: <span className="text-foreground">software</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-[12px] font-semibold text-foreground mb-2">
                Per-path overrides
              </div>
              <table className="w-full text-[12px]">
                <tbody>
                  {[
                    {
                      p: "/observations",
                      v: "reject",
                      tone: "danger" as const,
                    },
                    {
                      p: "/relationships",
                      v: "warn",
                      tone: "warning" as const,
                    },
                    {
                      p: "/timeline",
                      v: "warn",
                      tone: "warning" as const,
                    },
                    {
                      p: "/sources",
                      v: "allow",
                      tone: "muted" as const,
                    },
                  ].map((row) => (
                    <tr
                      key={row.p}
                      className="border-b border-border/40 last:border-0"
                    >
                      <td className="py-1.5 font-mono text-muted-foreground">
                        {row.p}
                      </td>
                      <td className="py-1.5 text-right">
                        <MockPill tone={row.tone}>{row.v}</MockPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-[12px] font-semibold text-foreground mb-2">
                Decision (last 100 requests)
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MockStatCard label="Verified sigs" value="94" hint="94%" />
                <MockStatCard label="Promoted (HW)" value="12" hint="attestation OK" />
                <MockStatCard label="Rejected" value="3" hint="anonymous → /observations" />
              </div>
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Generate keys with the CLI
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The Neotoma CLI ships hardware-aware keygen across darwin (Apple Secure
        Enclave), linux (TPM 2.0), win32 (Windows TBS / NCrypt), and YubiKey
        5 series:
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`# Software-backed keypair (cross-platform)
neotoma auth keygen

# Hardware-backed keypair (auto-selects best backend)
neotoma auth keygen --hardware

# Force a specific hardware backend
neotoma auth keygen --hardware --backend yubikey

# Inspect resolved trust tier and attestation outcome
neotoma auth session`}</pre>
      <p className="text-[15px] leading-7 mb-6">
        Keys are written to <code>~/.config/neotoma/aauth/signer.json</code>{" "}
        with a per-backend handle. The agent token is minted on demand and
        attached to every signed request. <code>neotoma auth session</code>{" "}
        renders the same diagnostics that <code>GET /session</code> exposes
        over HTTP.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Preflight (mandatory for new integrators)
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Before enabling writes, call <code>GET /session</code> (or the{" "}
        <code>get_session_identity</code> MCP tool, or{" "}
        <code>neotoma auth session</code>) and confirm:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-4">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>attribution.decision.signature_verified === true</code> when
          AAuth is intended.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>attribution.tier</code> is <code>hardware</code>,{" "}
          <code>operator_attested</code>, or <code>software</code> for signed
          clients, or at least <code>unverified_client</code> when
          intentionally relying on <code>clientInfo</code> only.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>eligible_for_trusted_writes === true</code>.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        Generic <code>clientInfo.name</code> values
        (<code>mcp</code>, <code>client</code>, <code>mcp-client</code>,{" "}
        <code>unknown</code>, <code>anonymous</code>, …) are normalised to the{" "}
        <code>anonymous</code> tier and WILL fail preflight under any
        non-<code>allow</code> policy.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Diagnostic surface
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Every AAuth verification emits a structured{" "}
        <code>attribution_decision</code> log line and exposes the same fields
        on <code>GET /session</code> under <code>attribution.decision</code>:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-4">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>signature_present</code>, <code>signature_verified</code>,{" "}
          <code>signature_error_code</code>
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>attestation_outcome</code> (<code>verified</code>,{" "}
          <code>format_unsupported</code>, <code>key_binding_failed</code>,{" "}
          <code>challenge_mismatch</code>, <code>chain_invalid</code>, …)
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>revocation_outcome</code> (<code>not_checked</code>,{" "}
          <code>live</code>, <code>revoked</code>, <code>error_skipped</code>)
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>resolved_tier</code>, final tier stamped onto the request
          context
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        The same fields render visually on each agent in the{" "}
        <Link
          to="/inspector/agents"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Inspector agent detail
        </Link>
        : thumbprint, algorithm, attestation envelope, revocation status,
        resolved tier, and the writes/relationships/sources the agent
        produced. Every durable row carries this stamp, so any{" "}
        <Link
          to="/inspector/observations-and-sources"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          observation
        </Link>{" "}
        or{" "}
        <Link
          to="/inspector/timeline"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          timeline event
        </Link>{" "}
        can be filtered or grouped by tier and signing identity after the
        fact.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Inspect attribution from the operator console
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Everything on this page has a counterpart in the{" "}
        <Link
          to="/inspector"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Inspector
        </Link>
        , Neotoma's read-only operator UI. Use these entry points when
        debugging an integration or auditing writes:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link to="/inspector/agents" {...detailPageCtaLinkProps}>
            Agents &amp; grants
          </Link>{" "}
         , every signing identity that ever wrote, with tier badges,
          thumbprint, algorithm, attestation outcome, last-seen activity,
          and the per-agent <code>(op, entity_type)</code> grant table.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link
            to="/inspector/settings/attribution-policy"
            {...detailPageCtaLinkProps}
          >
            Settings · Attribution policy
          </Link>{" "}
         , global mode, minimum tier, and per-path overrides resolved from{" "}
          <code>NEOTOMA_ATTRIBUTION_POLICY</code> /{" "}
          <code>NEOTOMA_MIN_ATTRIBUTION_TIER</code> /{" "}
          <code>NEOTOMA_ATTRIBUTION_POLICY_JSON</code>, with a live decision
          summary.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link
            to="/inspector/observations-and-sources"
            {...detailPageCtaLinkProps}
          >
            Observations &amp; sources
          </Link>{" "}
         , every immutable write tagged with <code>resolved_tier</code> and
          agent identifiers; filter by tier or by{" "}
          <code>agent_thumbprint</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link to="/inspector/timeline" {...detailPageCtaLinkProps}>
            Timeline &amp; interpretations
          </Link>{" "}
         , chronological view of every signed event across the instance,
          including verification failures and tier promotions.
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Specs and deeper reading
      </h2>
      <p className="text-[15px] leading-7 mb-3">
        Each topic below has its own dedicated reference page with the
        full implementation contract:
      </p>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link to="/aauth/spec">AAuth wire format and verification</Link>{" "}
         , signature components, trust-tier cascade, JWT contract.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link to="/aauth/attestation">Attestation</Link>, envelope
          formats, per-format verifiers, revocation policy.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link to="/aauth/cli-keys">CLI keys and hardware backends</Link>{" "}
         , keygen flows for Apple Secure Enclave, TPM 2.0, Windows TBS,
          and YubiKey.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link to="/aauth/integration">Integration guide</Link>,
          end-to-end walkthrough, preflight, diagnostics, transport
          parity.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link to="/aauth/capabilities">Capabilities</Link>, per-agent{" "}
          <code>(op, entity_type)</code> allow-lists via{" "}
          <code>agent_grant</code> entities.
        </li>
      </ul>

      <p className="text-[14px] leading-6 text-muted-foreground">
        See{" "}
        <Link to="/api" className="text-foreground underline underline-offset-2 hover:no-underline">
          REST API reference
        </Link>
        {" "}for HTTP endpoints,{" "}
        <Link to="/mcp" className="text-foreground underline underline-offset-2 hover:no-underline">
          MCP reference
        </Link>
        {" "}for agent-native transport, and{" "}
        <Link to="/cli" className="text-foreground underline underline-offset-2 hover:no-underline">
          CLI reference
        </Link>
        {" "}for keygen and session inspection commands.
      </p>
    </DetailPage>
  );
}

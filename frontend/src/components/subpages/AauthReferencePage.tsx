import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";

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
        to (<code>hardware</code>, <code>operator_attested</code>,{" "}
        <code>software</code>, <code>unverified_client</code>,{" "}
        <code>anonymous</code>) plus the signing algorithm and last-seen
        activity.
      </p>

      <p className="text-[15px] leading-7 mb-4">
        See the{" "}
        <Link
          to="/inspector/agents"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Inspector agents view
        </Link>{" "}
        for a live table of all signing identities, trust tiers, and write
        counts.
      </p>
      <p className="text-[15px] leading-7 mb-4">
        See{" "}
        <Link
          to="/aauth/spec"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          AAuth wire format and verification
        </Link>{" "}
        for signature components, headers, the{" "}
        <code>aa-agent+jwt</code> token contract, and the trust-tier
        verification cascade.
      </p>
      <p className="text-[15px] leading-7 mb-4">
        See{" "}
        <Link
          to="/aauth/integration"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Integration guide
        </Link>{" "}
        for per-request precedence rules, preflight checks, and the
        diagnostic surface (<code>GET /session</code>,{" "}
        <code>attribution.decision</code>).
      </p>
      <p className="text-[15px] leading-7 mb-4">
        See{" "}
        <Link
          to="/aauth/attestation"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Attestation
        </Link>{" "}
        for hardware attestation envelope formats (Apple Secure Enclave,
        WebAuthn-packed, TPM 2.0), per-format verifiers, and revocation
        policy.
      </p>
      <p className="text-[15px] leading-7 mb-4">
        Operators control attribution requirements through environment
        variables and the{" "}
        <Link
          to="/inspector/settings/attribution-policy"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Inspector attribution policy panel
        </Link>
        : global mode (<code>allow</code> / <code>warn</code> /{" "}
        <code>reject</code>), minimum tier, and per-path overrides. See{" "}
        <Link
          to="/aauth/integration"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Integration
        </Link>{" "}
        for the full contract.
      </p>
      <p className="text-[15px] leading-7 mb-4">
        See{" "}
        <Link
          to="/aauth/cli-keys"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          CLI keys and hardware backends
        </Link>{" "}
        for keygen commands, on-disk key layout, and per-platform hardware
        support.
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

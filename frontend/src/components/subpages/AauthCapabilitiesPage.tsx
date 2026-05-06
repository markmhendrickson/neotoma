import { Link } from "react-router-dom";
import { DetailPage } from "../DetailPage";

export function AauthCapabilitiesPage() {
  return (
    <DetailPage title="Agent capability scoping">
      <p className="text-[15px] leading-7 mb-4">
        The per-agent capability registry sits above the tier-based
        attribution policy. Where the{" "}
        <Link to="/aauth/integration">attribution policy</Link> asks "is
        this write attributable at all?", the capability registry asks "is{" "}
        <em>this</em> specific agent allowed to touch <em>this</em>{" "}
        specific <code>entity_type</code> via <em>this</em> operation?".
      </p>
      <p className="text-[15px] leading-7 mb-6">
        Capabilities are modelled as first-class <code>agent_grant</code>{" "}
        entities, one per (user, agent identity) pair, managed in the
        Inspector under <strong className="text-foreground">Agents → Agent grants</strong>.
        The previous environment-variable registry (
        <code>NEOTOMA_AGENT_CAPABILITIES_JSON</code>,{" "}
        <code>NEOTOMA_AGENT_CAPABILITIES_FILE</code>,{" "}
        <code>NEOTOMA_AGENT_CAPABILITIES_ENFORCE</code>,{" "}
        <code>config/agent_capabilities.default.json</code>) has been
        removed.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        When does this apply?
      </h2>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">User-authenticated callers</strong>{" "}
          (Bearer / OAuth / local Inspector session), not enforced; full
          access to their own user_id's data, modulo attribution policy.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            AAuth-verified agent matched to an <code>active</code> grant
          </strong>{" "}
         , enforced; restricted to declared <code>(op, entity_type)</code>{" "}
          pairs on the grant.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            AAuth-verified agent with no matching grant
          </strong>{" "}
         , falls through to attribution-only behaviour (no admission, must
          use Bearer/OAuth).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">
            Anonymous / unverified-client tier
          </strong>{" "}
         , no admission; subject to attribution policy.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        The canonical use is pinning the Netlify forwarder (
        <code>sub: agent-site@neotoma.io</code>) to the{" "}
        <code>neotoma_feedback</code> entity type, so a compromised
        forwarder key cannot be used to write observations for unrelated
        entities.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Grant shape
      </h2>
      <p className="text-[15px] leading-7 mb-3">
        An <code>agent_grant</code> is a normal Neotoma entity,
        observation history doubles as the audit log. Canonical fields:
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`{
  "entity_type": "agent_grant",
  "owner_user_id": "usr_…",
  "label": "Cursor on macbook-pro",
  "match_sub": "agent-cursor@example.com",   // AAuth sub claim
  "match_iss": "https://agent.example.com",  // optional; both must match when set
  "match_thumbprint": "abcd…",               // optional RFC 7638 JWK thumbprint
  "capabilities": [
    { "op": "store",               "entity_types": ["neotoma_feedback"] },
    { "op": "create_relationship", "entity_types": ["neotoma_feedback"] },
    { "op": "correct",             "entity_types": ["neotoma_feedback"] },
    { "op": "retrieve",            "entity_types": ["neotoma_feedback"] }
  ],
  "status": "active",   // active | suspended | revoked
  "notes": "issued 2026-04",
  "last_used_at": "2026-04-26T09:54:00Z"
}`}</pre>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        Identity rule
      </h3>
      <p className="text-[15px] leading-7 mb-6">
        At least one of <code>match_sub</code> or{" "}
        <code>match_thumbprint</code> MUST be set; <code>match_iss</code>{" "}
        is optional but, when set, BOTH <code>match_sub</code> AND{" "}
        <code>match_iss</code> MUST match the verified identity for the
        grant to admit.
      </p>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        Capability ops
      </h3>
      <ul className="list-none pl-0 space-y-2 mb-4">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>store</code>, creating / observing entities
          (write path).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>create_relationship</code>, creating relationships between
          entities.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>correct</code>, correcting / updating existing observations
          / fields.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>retrieve</code>, reading entities and observations.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        <code>entity_types</code> is a string array of permitted entity
        types for that op. Use <code>["*"]</code> to widen to every type,
        only do this for trusted grants.
      </p>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        Matching order
      </h3>
      <p className="text-[15px] leading-7 mb-3">
        Admission resolves the verified identity to at most one grant:
      </p>
      <ol className="list-decimal pl-6 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          If the request carries a JWK thumbprint AND any of the user's
          grants has a matching <code>match_thumbprint</code>, that grant
          wins.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Otherwise, the first <code>active</code> grant whose{" "}
          <code>match_sub</code> equals the request's <code>sub</code> and
          (when set on the grant) whose <code>match_iss</code> equals the
          request's <code>iss</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Otherwise, no admission, the request stays attribution-only.
        </li>
      </ol>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Status lifecycle
      </h2>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`active  ⇄  suspended
   │           │
   ▼           ▼
       revoked (terminal in normal flow)
       │
       ▼  restore (within grace window)
     active`}</pre>
      <p className="text-[15px] leading-7 mb-6">
        Only the user who owns the grant (or an agent the user has
        authorised with the bootstrap{" "}
        <code>(store | correct, agent_grant)</code> capability)
        can flip status. Admission caches the resolved grant for a small
        TTL plus invalidates on observation events, so a revoke propagates
        to in-flight clients within seconds.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Protected entity types, the trust mechanism
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Writes to <code>agent_grant</code> (and any future protected type)
        are gated by the protected-entity-types guard:
      </p>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          User-authenticated callers (Bearer / OAuth / local Inspector
          session for the same user) pass through.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          AAuth-admitted callers must hold an explicit capability in their
          grant for the protected type. The bootstrap capability is{" "}
          <code>
            {`{ op: "store", entity_types: ["agent_grant"] }`}
          </code>{" "}
          (and <code>correct</code>).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Anonymous / unverified-client tier writes to protected types are
          rejected with <code>capability_denied</code>.
        </li>
      </ul>
      <p className="text-[15px] leading-7 mb-6">
        This is what lets a user safely delegate grant management to a
        trusted agent: only that one grant carries the bootstrap
        capability; every other grant remains locked out of{" "}
        <code>agent_grant</code> writes by the protected-types guard, even
        if it has otherwise broad capabilities.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Strict-require AAuth for claimed subjects
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Set <code>NEOTOMA_STRICT_AAUTH_SUBS</code> to a comma-separated
        list of agent subjects that MUST present a valid AAuth signature
        whenever the request claims that identity via the{" "}
        <code>X-Agent-Label</code> header. This is a second line of
        defence against a compromised tunnel / edge:
      </p>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>X-Agent-Label: agent-site@neotoma.io</code> + missing
          signature → 401.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>X-Agent-Label: agent-site@neotoma.io</code> + signature
          verified, but the <code>sub</code> claim is something else → 401.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Any label NOT listed in <code>NEOTOMA_STRICT_AAUTH_SUBS</code>{" "}
          behaves as before (best-effort attribution hint).
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Error surface
      </h2>
      <p className="text-[15px] leading-7 mb-3">
        A denial produces HTTP 403 with:
      </p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-6">{`{
  "error": {
    "code": "capability_denied",
    "message": "Agent \\"agent-site@neotoma.io\\" is not permitted to store entity_type \\"person\\".",
    "op": "store",
    "entity_type": "person",
    "agent_label": "agent-site@neotoma.io",
    "hint": "Agent \\"agent-site@neotoma.io\\" holds an active grant but no \\"store\\" capability for entity_type \\"person\\". Edit the grant in Inspector → Agents → Agent grants if intentional."
  }
}`}</pre>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Operator runbook
      </h2>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        Upgrading from the env-config era
      </h3>
      <p className="text-[15px] leading-7 mb-3">
        The previous release loaded capabilities from{" "}
        <code>NEOTOMA_AGENT_CAPABILITIES_JSON</code> / <code>_FILE</code> /{" "}
        <code>config/agent_capabilities.default.json</code>. After
        upgrading, starting the server with any of those variables set
        fails fast with a structured error linking to the import command.
      </p>
      <p className="text-[15px] leading-7 mb-3">Migrate once, per deployment:</p>
      <pre className="rounded-lg border code-block-palette p-4 overflow-x-auto font-mono text-[14px] whitespace-pre-wrap break-words mb-4">{`neotoma agents grants import --owner-user-id <usr_…> \\
  [--file path/to/agent_capabilities.json]`}</pre>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>--owner-user-id</code> decides which user account owns the
          imported operational grants. Pick the operator's own user
          account, or a dedicated account for infrastructure agents.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          The command is idempotent on{" "}
          <code>(match_sub, match_iss, match_thumbprint)</code>,
          re-running it after a partial migration upserts grants without
          duplicating.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Each created/updated grant is stamped with provenance{" "}
          <code>import_source: "env_config"</code> so the audit timeline
          clearly records the migration origin.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Once the import succeeds, unset the legacy variables and
          redeploy.
        </li>
      </ul>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        Grant a new scope
      </h3>
      <ol className="list-decimal pl-6 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          In Inspector, go to{" "}
          <strong className="text-foreground">
            Agents → Agent grants → New grant
          </strong>
          .
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Paste the agent's AAuth <code>sub</code> (and <code>iss</code>,
          or thumbprint) and a readable label.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Select capabilities by <code>(op, entity_type)</code>.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Save. Admission picks up the new grant within the cache TTL.
        </li>
      </ol>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        Revoke or suspend a scope
      </h3>
      <ol className="list-decimal pl-6 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          Open the grant in Inspector →{" "}
          <strong className="text-foreground">
            Agents → Agent grants → :id
          </strong>
          .
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          Click <strong className="text-foreground">Suspend</strong>{" "}
          (reversible) or <strong className="text-foreground">Revoke</strong>{" "}
          (terminal).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          The next request from that agent reverts to attribution-only
          after the admission cache TTL.
        </li>
      </ol>

      <h3 className="text-[15px] font-medium tracking-[-0.01em] mt-4 mb-2">
        Roll back a botched grant edit
      </h3>
      <p className="text-[15px] leading-7 mb-6">
        Grant edits are observations, open the grant detail view and use
        the audit timeline to see what changed. Apply a <code>correct</code>{" "}
        to restore the prior values (or use the{" "}
        <strong className="text-foreground">Restore</strong> action to roll
        back a recent revoke within the grace window).
      </p>

      <p className="text-[14px] leading-6 text-muted-foreground">
        Back to <Link to="/aauth">AAuth overview</Link>. See also{" "}
        <Link to="/aauth/integration">integration</Link>,{" "}
        <Link to="/aauth/spec">AAuth spec</Link>,{" "}
        <Link to="/aauth/attestation">attestation</Link>,{" "}
        <Link to="/aauth/cli-keys">CLI keys</Link>.
      </p>
    </DetailPage>
  );
}

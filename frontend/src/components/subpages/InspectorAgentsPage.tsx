import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import {
  InspectorPreview,
  InspectorSidebarMock,
  InspectorPageHeaderMock,
  MockPill,
  MockStatCard,
} from "./inspector/InspectorPreview";

export function InspectorAgentsPage() {
  return (
    <DetailPage title="Inspector, Agents, attribution & grants">
      <p className="text-[15px] leading-7 mb-4">
        Every write to Neotoma, observation, relationship, timeline event,
        source, interpretation, is attributed per row. Inspector exposes
        that attribution as a first-class concept so operators can answer
        questions like "which agents have written here?", "what tier did
        they sign in?", and "what is each agent permitted to do?". This is
        the surface for{" "}
        <Link
          to="/aauth"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          AAuth
        </Link>{" "}
        in the Inspector UI.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Agents list
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The agents view (<code>/agents</code>) lists every distinct writer
        Neotoma has seen, derived from AAuth thumbprints, JWT subjects, and{" "}
        <code>clientInfo.name</code> fallbacks. Each row shows the resolved{" "}
        <strong className="text-foreground">trust tier</strong> (
        <code>hardware</code>, <code>software</code>,{" "}
        <code>unverified_client</code>, <code>anonymous</code>), write
        counts, last-seen timestamp, and the active grant (if any).
      </p>

      <InspectorPreview
        path="/agents"
        caption="One row per distinct agent identity. Tier badges (hw / sw / unverified / anon) reflect the AAuth verification result."
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
                    <th className="px-3 py-2 text-left font-medium">Grant</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      n: "claude-code",
                      kid: "ed25519:Aa…7Lk",
                      tier: "software",
                      tone: "info" as const,
                      alg: "EdDSA",
                      w: 4120,
                      ls: "12:41",
                      g: "default-write",
                    },
                    {
                      n: "cursor-agent",
                      kid: "es256:Bp…4Zq",
                      tier: "hardware",
                      tone: "success" as const,
                      alg: "ES256",
                      w: 2810,
                      ls: "12:30",
                      g: "default-write",
                    },
                    {
                      n: "ingest-pipeline",
                      kid: "ed25519:Cq…9Rt",
                      tier: "software",
                      tone: "info" as const,
                      alg: "EdDSA",
                      w: 980,
                      ls: "11:08",
                      g: "import-only",
                    },
                    {
                      n: "operator (mac · SE)",
                      kid: "es256:Dr…2Yj",
                      tier: "hardware",
                      tone: "success" as const,
                      alg: "ES256",
                      w: 412,
                      ls: "10:55",
                      g: "admin",
                    },
                    {
                      n: "custom-script@myco",
                      kid: "-",
                      tier: "unverified_client",
                      tone: "warning" as const,
                      alg: "-",
                      w: 18,
                      ls: "Apr 24",
                      g: "(none)",
                    },
                    {
                      n: "anonymous",
                      kid: "-",
                      tier: "anonymous",
                      tone: "muted" as const,
                      alg: "-",
                      w: 4,
                      ls: "Apr 22",
                      g: "(none)",
                    },
                  ].map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-3 py-2 text-foreground">
                        <div className="flex flex-col">
                          <span>{row.n}</span>
                          <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[180px]">
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
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[120px]">
                        {row.g}
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
        Agent detail
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Drill into an agent to see its public-key thumbprint, signing
        algorithm, JWT issuer/subject, capability grants, and a panel of
        recent writes scoped to that identity. The detail view is where
        operators decide whether to upgrade a tier (e.g. require hardware
        for write access) or revoke a key.
      </p>

      <InspectorPreview
        path="/agents/claude-code"
        caption="Per-agent identity card with thumbprint, alg, attestation, grants, and a recent-writes activity panel."
      >
        <div className="flex">
          <InspectorSidebarMock active="agents" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="claude-code"
              subtitle="EdDSA · software · 4,120 writes · last 30d"
              right={
                <>
                  <MockPill tone="info">software</MockPill>
                  <MockPill tone="muted">attestation: none</MockPill>
                </>
              }
            />
            <div className="px-4 py-3 grid grid-cols-3 gap-3 text-[12px]">
              <MockStatCard label="Observations" value="3,402" hint="last 30d" />
              <MockStatCard label="Relationships" value="612" hint="last 30d" />
              <MockStatCard label="Sources" value="106" hint="last 30d" />
            </div>
            <div className="px-4 pb-3 space-y-2 text-[12px]">
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="text-muted-foreground mb-1">Identity</div>
                <div className="font-mono text-[11px] leading-5 text-foreground">
                  thumbprint ed25519:Aa…7Lk
                  <br />
                  iss=https://anthropic.com sub=agent:claude-code
                  <br />
                  clientInfo.name=&quot;claude-code&quot; v=2.4.1
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="text-muted-foreground mb-1">Active grant</div>
                <div className="text-foreground">default-write</div>
                <div className="text-muted-foreground text-[11px] mt-1">
                  scope: store, retrieve, link · entity_types: any · expires:
                  2026-07-31
                </div>
              </div>
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Grants
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Capability grants are typed entities that bind an agent identity to
        a scoped set of actions (e.g. <code>store</code>,{" "}
        <code>retrieve</code>, <code>link</code>, <code>correct</code>,{" "}
        <code>merge</code>) on a set of entity types, optionally with an
        expiration. Inspector renders them as first-class records with a
        history (granted, modified, revoked) and a reverse map back to the
        agents they bind.
      </p>

      <InspectorPreview
        path="/grants"
        caption="Capability grants: scope, allowed entity types, expiry, and the agents bound to each grant."
      >
        <div className="flex">
          <InspectorSidebarMock active="grants" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Grants"
              subtitle="6 active · 2 expired"
              right={
                <span className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">
                  + New grant
                </span>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Scope</th>
                    <th className="px-3 py-2 text-left font-medium">Types</th>
                    <th className="px-3 py-2 text-left font-medium">Agents</th>
                    <th className="px-3 py-2 text-left font-medium">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      name: "default-write",
                      scope: "store, retrieve, link",
                      types: "any",
                      agents: "claude-code, cursor-agent",
                      exp: "2026-07-31",
                    },
                    {
                      name: "import-only",
                      scope: "store, link",
                      types: "transaction, receipt, file_asset",
                      agents: "ingest-pipeline",
                      exp: "-",
                    },
                    {
                      name: "admin",
                      scope: "all",
                      types: "any",
                      agents: "operator (mac · SE)",
                      exp: "-",
                    },
                    {
                      name: "read-only",
                      scope: "retrieve",
                      types: "any",
                      agents: "dashboard-bot",
                      exp: "-",
                    },
                  ].map((row) => (
                    <tr
                      key={row.name}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-3 py-2 text-foreground">{row.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.scope}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.types}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">
                        {row.agents}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {row.exp}
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
        Trust tiers
      </h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <MockPill tone="success">hardware</MockPill>{" "}
          <span className="ml-2">
            ES256 / EdDSA backed by a hardware key (Secure Enclave, TPM 2.0,
            YubiKey, Windows TBS). Highest trust, eligible for the strictest
            grants.
          </span>
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <MockPill tone="info">software</MockPill>{" "}
          <span className="ml-2">
            Verified AAuth signature with a software-backed key.
            Trustworthy for most writes but not eligible for hardware-only
            grants.
          </span>
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <MockPill tone="warning">unverified_client</MockPill>{" "}
          <span className="ml-2">
            No AAuth signature, but a meaningful{" "}
            <code>clientInfo.name</code>. Useful for triage; subject to
            stricter ACLs in future releases.
          </span>
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <MockPill tone="muted">anonymous</MockPill>{" "}
          <span className="ml-2">
            No signature, no usable client identity (or one of the
            blacklisted generic strings like <code>mcp</code>,{" "}
            <code>client</code>). Allowed for backwards compatibility but
            flagged in audit views.
          </span>
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Activity
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Each agent detail page exposes a recent-activity stream, the same
        rows you'd see in the{" "}
        <Link
          to="/inspector/timeline"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          timeline
        </Link>
        , scoped to that one identity. Filters narrow by event kind, target
        entity type, or trust tier so you can answer "what did this agent
        write yesterday?" without leaving the page.
      </p>

      <InspectorPreview
        path="/agents/claude-code/activity"
        caption="Activity feed scoped to a single agent identity, with the same kind / type / tier filters as the global timeline."
      >
        <div className="flex">
          <InspectorSidebarMock active="activity" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="claude-code · activity"
              subtitle="last 24h · 218 writes"
              right={
                <>
                  <MockPill tone="info">store (162)</MockPill>
                  <MockPill tone="violet">correct (12)</MockPill>
                  <MockPill tone="success">link (44)</MockPill>
                </>
              }
            />
            <div className="px-4 py-3 space-y-1.5 text-[12px]">
              {[
                {
                  t: "12:41",
                  k: "store",
                  e: "transaction · Subscription · Vercel",
                  tier: "info" as const,
                },
                {
                  t: "12:30",
                  k: "store",
                  e: "agent_message · turn 4 (assistant)",
                  tier: "info" as const,
                },
                {
                  t: "12:30",
                  k: "link",
                  e: "PART_OF · turn 4 → conversation Q2",
                  tier: "info" as const,
                },
                {
                  t: "11:08",
                  k: "store",
                  e: "receipt · vercel-2026-04",
                  tier: "info" as const,
                },
                {
                  t: "11:08",
                  k: "link",
                  e: "EMBEDS · receipt → file_asset (pdf)",
                  tier: "info" as const,
                },
              ].map((row, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md border border-border/60 bg-card px-2 py-1.5"
                >
                  <span className="w-12 tabular-nums text-muted-foreground">
                    {row.t}
                  </span>
                  <MockPill
                    tone={
                      row.k === "store"
                        ? "info"
                        : row.k === "link"
                          ? "success"
                          : "violet"
                    }
                  >
                    {row.k}
                  </MockPill>
                  <span className="flex-1 truncate text-foreground">
                    {row.e}
                  </span>
                  <MockPill tone={row.tier}>sw</MockPill>
                </div>
              ))}
            </div>
          </div>
        </div>
      </InspectorPreview>
    </DetailPage>
  );
}

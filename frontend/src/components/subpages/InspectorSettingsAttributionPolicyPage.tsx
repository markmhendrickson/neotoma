import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import {
  InspectorPreview,
  InspectorSidebarMock,
  MockPill,
  MockStatCard,
} from "./inspector/InspectorPreview";

export function InspectorSettingsAttributionPolicyPage() {
  return (
    <DetailPage title="Inspector, Settings · Attribution policy">
      <p className="text-[15px] leading-7 mb-4">
        Attribution policy controls how Neotoma reacts to writes from agents at
        different trust tiers. The Inspector renders the{" "}
        <Link
          to="/aauth"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          AAuth
        </Link>{" "}
        contract as a live operator console: pick a global mode, set a minimum
        tier, override per path, and watch the resolved decision update against
        the last 100 requests.
      </p>

      <InspectorPreview
        path="/settings#attribution"
        caption="Attribution policy panel, global mode, minimum tier, per-path overrides, and a decision summary that mirrors the env-var contract."
      >
        <div className="flex">
          <InspectorSidebarMock active="settings" />
          <div className="flex-1 min-w-0 p-4 space-y-4">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-[12px] font-semibold text-foreground mb-2">
                Global mode &amp; minimum tier
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
                <MockStatCard
                  label="Promoted (HW)"
                  value="12"
                  hint="attestation OK"
                />
                <MockStatCard
                  label="Rejected"
                  value="3"
                  hint="anonymous → /observations"
                />
              </div>
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Global mode
      </h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <MockPill tone="muted">allow</MockPill>{" "}
          <span className="ml-2">
            Accept writes at every tier, including <code>anonymous</code>.
            Suitable for personal-use mode and sandbox.
          </span>
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <MockPill tone="warning">warn</MockPill>{" "}
          <span className="ml-2">
            Accept writes but emit an{" "}
            <code>attribution_decision warn</code> log line whenever the
            request lands below the minimum tier. Useful while rolling AAuth
            out across an existing fleet of agents.
          </span>
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <MockPill tone="danger">reject</MockPill>{" "}
          <span className="ml-2">
            Refuse writes below the minimum tier with a structured 401 error.
            The recommended setting for shared/server installs once your
            agents are signing.
          </span>
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Minimum tier
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Requests above the configured floor are accepted (subject to global
        mode); requests below it are warned or rejected. The four tiers, in
        descending strength:
      </p>
      <ol className="list-decimal pl-6 space-y-1.5 mb-6 text-[15px] leading-7 text-muted-foreground">
        <li>
          <code>hardware</code>, verified AAuth signature with hardware-backed
          attestation (TPM 2.0, Apple Secure Enclave, Yubikey).
        </li>
        <li>
          <code>software</code>, verified AAuth signature without an attested
          hardware backing.
        </li>
        <li>
          <code>unverified_client</code>, recognisable <code>clientInfo</code>{" "}
          but no signature.
        </li>
        <li>
          <code>anonymous</code>, neither signature nor recognisable
          client.
        </li>
      </ol>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Per-path overrides
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Per-path overrides let you tighten policy on the highest-risk endpoints
        (typically <code>/observations</code> and <code>/relationships</code>)
        while leaving read paths permissive. A per-path <code>reject</code>{" "}
        always wins over a global <code>allow</code>; this is enforced both at
        the server and surfaced in the UI badge for the row.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Resolution &amp; environment variables
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Policy can be set three ways, in increasing precedence:
      </p>
      <ol className="list-decimal pl-6 space-y-1.5 mb-6 text-[15px] leading-7 text-muted-foreground">
        <li>
          Inspector UI (this panel), writes through to the local config.
        </li>
        <li>
          <code>NEOTOMA_ATTRIBUTION_POLICY</code> /{" "}
          <code>NEOTOMA_MIN_ATTRIBUTION_TIER</code> /{" "}
          <code>NEOTOMA_ATTRIBUTION_POLICY_JSON</code>, env vars at server
          start.
        </li>
        <li>
          Per-request override headers (signed admission tokens; see{" "}
          <Link
            to="/aauth"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            AAuth
          </Link>
          ).
        </li>
      </ol>
      <p className="text-[15px] leading-7 mb-4">
        The decision summary at the top of the panel reports which source won,
        so an env-var override on a server is never silently in effect.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Per-agent grants
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Tier-based policy is the wide net. For fine-grained{" "}
        <code>(operation, entity_type)</code> allow-lists per signing identity,
        use{" "}
        <Link
          to="/inspector/agents"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Agents &amp; grants
        </Link>{" "}
       , those layer on top of the global policy and apply to a single
        thumbprint.
      </p>
    </DetailPage>
  );
}

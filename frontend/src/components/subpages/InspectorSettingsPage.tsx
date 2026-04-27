import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import {
  InspectorPreview,
  InspectorSidebarMock,
  InspectorPageHeaderMock,
  MockPill,
} from "./inspector/InspectorPreview";

export function InspectorSettingsPage() {
  return (
    <DetailPage title="Inspector, Settings">
      <p className="text-[15px] leading-7 mb-4">
        Settings is the Inspector route at <code>/settings</code>: connection to
        the Neotoma API, attribution policy on agent writes, retention, and
        appearance. The product{" "}
        <Link
          to="/inspector/feedback"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Feedback
        </Link>{" "}
        flow is a separate top-level route at <code>/feedback</code> in the app
        (documented on its own page). Defaults match what an operator gets
        after running <code>neotoma api start</code> for the first time; many
        values are editable from the UI and persisted to local Neotoma config.
      </p>

      <InspectorPreview
        path="/settings"
        caption="Settings docs grouping, four topics below map to dedicated pages; live /settings in the app is connection- and attribution-centric."
      >
        <div className="flex">
          <InspectorSidebarMock active="settings" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Settings"
              subtitle="Per-instance configuration"
              right={
                <>
                  <MockPill tone="success">connected</MockPill>
                  <MockPill tone="muted">v0.12.0</MockPill>
                </>
              }
            />
            <div className="px-4 py-3 grid grid-cols-2 gap-3 text-[12px]">
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="text-muted-foreground mb-2">Connection</div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">API base URL</span>
                    <span className="font-mono text-muted-foreground">
                      http://127.0.0.1:3080
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">Environment</span>
                    <MockPill tone="info">prod</MockPill>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">DB</span>
                    <span className="font-mono text-muted-foreground">
                      neotoma.sqlite
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="text-muted-foreground mb-2">
                  Attribution policy
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">
                      Allow anonymous writes
                    </span>
                    <MockPill tone="warning">on</MockPill>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">Require AAuth</span>
                    <MockPill tone="muted">off</MockPill>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">Hardware-only grants</span>
                    <MockPill tone="info">admin</MockPill>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="text-muted-foreground mb-2">Retention</div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">Observations</span>
                    <span className="font-mono text-muted-foreground">
                      keep all
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">Source files</span>
                    <span className="font-mono text-muted-foreground">
                      keep all
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">Timeline events</span>
                    <span className="font-mono text-muted-foreground">
                      keep all
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="text-muted-foreground mb-2">
                  Theme &amp; accessibility
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">Colour scheme</span>
                    <MockPill tone="muted">system</MockPill>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">Density</span>
                    <MockPill tone="info">comfortable</MockPill>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">Motion</span>
                    <MockPill tone="success">reduce</MockPill>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Sections
      </h2>
      <ul className="list-none pl-0 space-y-3 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link
            to="/inspector/settings/connection"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Connection
          </Link>{" "}
         , API base URL, environment, SQLite database path, and the{" "}
          <code>/health</code> + <code>/session</code> probe that runs on save.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link
            to="/inspector/settings/attribution-policy"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Attribution policy
          </Link>{" "}
         , global mode (<code>allow</code>/<code>warn</code>/<code>reject</code>),
          minimum trust tier, and per-path overrides; the operator face of the{" "}
          <Link
            to="/aauth"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            AAuth
          </Link>{" "}
          contract.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link
            to="/inspector/settings/retention"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Retention
          </Link>{" "}
         , defaults are keep-everything; tier rarely-touched sources to cold
          storage or expire them after a window without dropping derived
          snapshots.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <Link
            to="/inspector/settings/theme"
            className="text-foreground underline underline-offset-2 hover:no-underline"
            {...detailPageCtaLinkProps}
          >
            Theme &amp; accessibility
          </Link>{" "}
         , how Inspector handles appearance today (no separate theme panel in
          the Inspector app; docs site theme is separate).
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Where these values live
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Most settings are persisted to the local Neotoma config (the same one
        the CLI reads), so changes made in Inspector flow through to{" "}
        <code>neotoma api start</code>, MCP, and CLI on the next request.
        Attribution policy, in particular, can also be set via environment
        variables (<code>NEOTOMA_ATTRIBUTION_POLICY</code>,{" "}
        <code>NEOTOMA_MIN_ATTRIBUTION_TIER</code>,{" "}
        <code>NEOTOMA_ATTRIBUTION_POLICY_JSON</code>), the Inspector reads the
        resolved value and surfaces which source won.
      </p>
    </DetailPage>
  );
}

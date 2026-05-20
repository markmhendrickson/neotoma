import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import {
  InspectorPreview,
  InspectorSidebarMock,
  InspectorPageHeaderMock,
  MockPill,
} from "./inspector/InspectorPreview";

export function InspectorPeersPage() {
  return (
    <DetailPage title="Inspector, Peers & cross-instance sync">
      <p className="text-[15px] leading-7 mb-4">
        <strong className="text-foreground">Peers</strong> are other Neotoma
        instances you register so this database can replicate structured state
        with them. Each row is a configuration: remote base URL, sync
        direction, which entity types participate, authentication (AAuth or
        shared secret), and how conflicts resolve. Secrets never render in full;
        the API redacts <code>shared_secret</code> on list and status reads.
      </p>
      <p className="text-[15px] leading-7 mb-6">
        Operators use this view to confirm which remotes are trusted, whether
        push/pull/bidirectional rules match expectations, and when the last sync
        attempt completed. Programmatic parity lives on{" "}
        <code>GET /peers</code>, <code>POST /peers</code>,{" "}
        <code>GET /peers/:peer_id</code>, and <code>DELETE /peers/:peer_id</code>
        , the same surface exposed as MCP <code>list_peers</code>,{" "}
        <code>add_peer</code>, <code>get_peer_status</code>, and{" "}
        <code>remove_peer</code>. Inbound replication uses signed{" "}
        <code>POST /sync/webhook</code> on the receiver; see{" "}
        <Link
          to="/api"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          REST API
        </Link>{" "}
        for the full contract.
      </p>

      <InspectorPreview
        path="/peers"
        caption="One row per configured peer: URL, direction, scoped entity types, auth method, conflict strategy, active flag, and last sync metadata."
      >
        <div className="flex">
          <InspectorSidebarMock active="peers" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Peers"
              subtitle="3 configured · 2 active · last probe 12:44"
              right={
                <>
                  <MockPill tone="success">webhook OK</MockPill>
                  <MockPill tone="muted">GET /peers</MockPill>
                </>
              }
            />
            <div className="overflow-x-auto p-2">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Peer ID</th>
                    <th className="px-3 py-2 text-left font-medium">URL</th>
                    <th className="px-3 py-2 text-left font-medium">Direction</th>
                    <th className="px-3 py-2 text-left font-medium">Types</th>
                    <th className="px-3 py-2 text-left font-medium">Auth</th>
                    <th className="px-3 py-2 text-left font-medium">Conflict</th>
                    <th className="px-3 py-2 text-left font-medium">Active</th>
                    <th className="px-3 py-2 text-left font-medium">Last sync</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      name: "Prod mirror",
                      id: "prod-eu-1",
                      url: "https://neotoma.example…",
                      dir: "bidirectional",
                      types: "task, contact, event",
                      auth: "aauth",
                      conflict: "source_priority",
                      active: true,
                      sync: "12:40",
                    },
                    {
                      name: "Staging ingest",
                      id: "staging-us",
                      url: "https://staging…/api",
                      dir: "pull",
                      types: "note, file_asset",
                      auth: "shared_secret",
                      conflict: "manual",
                      active: true,
                      sync: "11:02",
                    },
                    {
                      name: "Archived laptop",
                      id: "legacy-mac",
                      url: "http://127.0.0.1:3180",
                      dir: "push",
                      types: "all seeded types",
                      auth: "shared_secret",
                      conflict: "last_write_wins",
                      active: false,
                      sync: "none",
                    },
                  ].map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/60 text-foreground"
                    >
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">
                        {row.id}
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-[140px]">
                        {row.url}
                      </td>
                      <td className="px-3 py-2">
                        <MockPill tone="info">{row.dir}</MockPill>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[120px]">
                        {row.types}
                      </td>
                      <td className="px-3 py-2">
                        <MockPill
                          tone={row.auth === "aauth" ? "success" : "muted"}
                        >
                          {row.auth}
                        </MockPill>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.conflict}
                      </td>
                      <td className="px-3 py-2">
                        {row.active ? (
                          <MockPill tone="success">yes</MockPill>
                        ) : (
                          <MockPill tone="muted">no</MockPill>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {row.sync}
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
        Columns
      </h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Name</strong> and{" "}
          <strong className="text-foreground">Peer ID</strong>, human label plus
          stable identifier used in webhook payloads (<code>sender_peer_id</code>
          ) and subscription loop prevention (<code>sync_peer_id</code>).
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">URL</strong>, the remote Neotoma
          base used for sync and discovery; must match TLS expectations in
          production.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Direction</strong>,{" "}
          <code>push</code>, <code>pull</code>, or <code>bidirectional</code>,
          defining which side may originate replication traffic for scoped
          types.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Types</strong>, allowlisted{" "}
          <code>entity_types</code> array; empty interpretations in the API are
          rejected, so operators always see an explicit scope.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Auth</strong>,{" "}
          <code>aauth</code> vs <code>shared_secret</code>; when the secret is
          generated server-side, the create response is the only place it appears
          in full.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Conflict</strong>, reducer-facing
          default when both sides emit observations for the same entity field;
          <code>manual</code> pairs with operator <code>correct</code> flows.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <strong className="text-foreground">Active</strong> and{" "}
          <strong className="text-foreground">Last sync</strong>, operator
          toggles and telemetry from the most recent successful or failed sync
          pass (when implemented end-to-end on the instance).
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Related surfaces
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Peers interact with{" "}
        <Link
          to="/inspector/settings/connection"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Connection
        </Link>{" "}
        (which API this Inspector is pinned to) and with substrate
        subscriptions that opt into <code>sync_peer_id</code> for webhook loop
        prevention. When debugging replication, start here, then confirm
        delivery on the receiving instance logs for{" "}
        <code>/sync/webhook</code>.
      </p>
    </DetailPage>
  );
}

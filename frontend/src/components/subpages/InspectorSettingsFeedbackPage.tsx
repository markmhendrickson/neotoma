import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import { InspectorPreview, InspectorSidebarMock, MockPill } from "./inspector/InspectorPreview";

export function InspectorSettingsFeedbackPage() {
  return (
    <DetailPage title="Inspector, Issues">
      <p className="text-[15px] leading-7 mb-4">
        In the Inspector app, <strong>Issues</strong> is a top-level sidebar destination at{" "}
        <code>/issues</code>, alongside Dashboard and Conversations. It is the in-product channel
        for reporting and tracking friction with Neotoma: failing tool calls, opaque errors, missing
        surfaces, doc gaps. Issues are backed by GitHub Issues and synced to local Neotoma as{" "}
        <code>issue</code> entities with conversation threads.
      </p>

      <InspectorPreview
        path="/issues"
        caption="Issues route, primary nav highlights Issues; open issues with labels, status, and GitHub links fill the main pane."
      >
        <div className="flex">
          <InspectorSidebarMock active="issues" />
          <div className="flex-1 min-w-0 p-4 space-y-3">
            <div className="rounded-lg border border-border bg-card p-3 text-[12px]">
              <div className="font-semibold text-foreground mb-2">Configuration</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-muted-foreground mb-1">Mode</div>
                  <div className="flex gap-1">
                    <MockPill tone="info">proactive</MockPill>
                    <MockPill tone="muted">consent</MockPill>
                    <MockPill tone="muted">off</MockPill>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Auth</div>
                  <div className="flex gap-1">
                    <MockPill tone="success">gh cli</MockPill>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Repository</div>
                  <div className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-foreground truncate">
                    markmhendrickson/neotoma
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Sync staleness</div>
                  <div className="font-mono text-muted-foreground">5 min</div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 text-[12px]">
              <div className="font-semibold text-foreground mb-2">Open issues</div>
              <table className="w-full">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-medium py-1">#</th>
                    <th className="text-left font-medium py-1">Title</th>
                    <th className="text-left font-medium py-1">Labels</th>
                    <th className="text-left font-medium py-1">Status</th>
                    <th className="text-right font-medium py-1">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      n: "42",
                      t: "store 502 on >50 entities",
                      l: "bug",
                      st: "open",
                      tone: "info" as const,
                      u: "Apr 23",
                    },
                    {
                      n: "41",
                      t: "Inspector graph: cycle layout warning",
                      l: "ux",
                      st: "open",
                      tone: "info" as const,
                      u: "Apr 25",
                    },
                    {
                      n: "40",
                      t: "Docs: clarify HEURISTIC_MERGE warnings",
                      l: "docs",
                      st: "open",
                      tone: "info" as const,
                      u: "Apr 26",
                    },
                    {
                      n: "38",
                      t: "Sandbox: redaction missing for emails",
                      l: "security",
                      st: "closed",
                      tone: "success" as const,
                      u: "Apr 27",
                    },
                  ].map((row) => (
                    <tr key={row.n} className="border-b border-border/40 last:border-0">
                      <td className="py-1.5 font-mono text-muted-foreground">#{row.n}</td>
                      <td className="py-1.5 text-foreground truncate max-w-[220px]">{row.t}</td>
                      <td className="py-1.5 font-mono text-muted-foreground">{row.l}</td>
                      <td className="py-1.5">
                        <MockPill tone={row.tone}>{row.st}</MockPill>
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                        {row.u}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Reporting modes</h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <MockPill tone="info">proactive</MockPill>{" "}
          <span className="ml-2">
            Default. Agents file issues on friction without asking each time.
          </span>
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <MockPill tone="muted">consent</MockPill>{" "}
          <span className="ml-2">
            Ask for consent on every submission, including agent-initiated ones.
          </span>
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <MockPill tone="muted">off</MockPill>{" "}
          <span className="ml-2">
            Do not file issues automatically. Agents must be told explicitly to submit.
          </span>
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        GitHub authentication
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Issues are filed via the GitHub API using credentials resolved from the GitHub CLI (
        <code>gh</code>). On first use, agents prompt the user to authenticate with{" "}
        <code>gh auth login</code>. Tokens are resolved at runtime via{" "}
        <code>gh auth token</code> and never stored in Neotoma config. For CI or scripts, set{" "}
        <code>NEOTOMA_ISSUES_GITHUB_TOKEN</code> as an explicit override.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        PII &amp; security advisories
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        For public issues, PII should be redacted before submission. For reports containing
        sensitive information, use <code>visibility: &quot;advisory&quot;</code> to file via GitHub
        Security Advisories, which are private and only visible to maintainers.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Sync &amp; conversation threads
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Each issue maps to a local <code>issue</code> entity linked to a{" "}
        <code>conversation</code> entity. GitHub comments become{" "}
        <code>conversation_message</code> entities. Reading an issue triggers a sync from GitHub
        when local data is stale (default: 5 minutes). Use{" "}
        <code>neotoma issues sync</code> for a full refresh. Browse issue conversations at{" "}
        <Link
          to="/inspector/issues"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Issues
        </Link>{" "}
        in the Inspector.
      </p>
    </DetailPage>
  );
}

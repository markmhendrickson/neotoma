import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import { InspectorPreview, InspectorSidebarMock, MockPill } from "./inspector/InspectorPreview";

export function InspectorSettingsFeedbackPage() {
  return (
    <DetailPage title="Inspector, Feedback">
      <p className="text-[15px] leading-7 mb-4">
        In the Inspector app, <strong>Feedback</strong> is a top-level sidebar destination at{" "}
        <code>/feedback</code>, alongside Dashboard and Conversations, not under{" "}
        <code>/settings</code>. It is the in-product channel for reporting friction with Neotoma:
        failing tool calls, opaque errors, missing surfaces, doc gaps. The UI exposes the same{" "}
        <code>submit_feedback</code> + <code>get_feedback_status</code> primitives that agents use
        over MCP, with redaction previews and a status feed.
      </p>

      <InspectorPreview
        path="/feedback"
        caption="Feedback route, primary nav highlights Feedback; submission preferences and recent submissions fill the main pane."
      >
        <div className="flex">
          <InspectorSidebarMock active="feedback" />
          <div className="flex-1 min-w-0 p-4 space-y-3">
            <div className="rounded-lg border border-border bg-card p-3 text-[12px]">
              <div className="font-semibold text-foreground mb-2">Admin unlock</div>
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5">
                <span className="text-muted-foreground">State</span>
                <MockPill tone="warning">locked · anonymous</MockPill>
                <span className="text-muted-foreground">Required</span>
                <span className="font-mono text-foreground">hardware / software / operator_attested</span>
                <span className="text-muted-foreground">Command</span>
                <span className="font-mono text-foreground truncate">
                  neotoma inspector admin unlock --challenge …
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 text-[12px]">
              <div className="font-semibold text-foreground mb-2">Submission preferences</div>
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
                  <div className="text-muted-foreground mb-1">PII redaction</div>
                  <div className="flex gap-1">
                    <MockPill tone="success">on</MockPill>
                    <MockPill tone="muted">off</MockPill>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Endpoint</div>
                  <div className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-foreground truncate">
                    https://api.neotoma.io/feedback
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Submitter</div>
                  <div className="font-mono text-muted-foreground">operator (mac · SE)</div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 text-[12px]">
              <div className="font-semibold text-foreground mb-2">Recent submissions</div>
              <table className="w-full">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-medium py-1">Title</th>
                    <th className="text-left font-medium py-1">Kind</th>
                    <th className="text-left font-medium py-1">Status</th>
                    <th className="text-right font-medium py-1">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      t: "store 502 on >50 entities",
                      k: "bug",
                      st: "fixed · v0.12.1",
                      tone: "success" as const,
                      u: "Apr 23",
                    },
                    {
                      t: "Inspector graph: cycle layout warning",
                      k: "ux",
                      st: "investigating",
                      tone: "info" as const,
                      u: "Apr 25",
                    },
                    {
                      t: "Docs: clarify HEURISTIC_MERGE warnings",
                      k: "docs",
                      st: "in progress",
                      tone: "info" as const,
                      u: "Apr 26",
                    },
                    {
                      t: "Sandbox: redaction missing for emails",
                      k: "security",
                      st: "shipping (verify)",
                      tone: "warning" as const,
                      u: "Apr 27",
                    },
                  ].map((row) => (
                    <tr key={row.t} className="border-b border-border/40 last:border-0">
                      <td className="py-1.5 text-foreground truncate max-w-[260px]">{row.t}</td>
                      <td className="py-1.5 font-mono text-muted-foreground">{row.k}</td>
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

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">Submission modes</h2>
      <ul className="list-none pl-0 space-y-2 mb-6">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <MockPill tone="info">proactive</MockPill>{" "}
          <span className="ml-2">
            Default. Agents submit feedback on friction without asking each time; the Inspector will
            still ask before submitting on behalf of the operator from this UI.
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
            Do not submit feedback automatically. Agents must be told explicitly to submit.
          </span>
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Admin unlock
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The feedback admin queue starts by calling <code>/admin/feedback/preflight</code> with{" "}
        <code>credentials: "include"</code>. If preflight reports no active admin session, the
        Inspector requests a one-time challenge and shows{" "}
        <code>neotoma inspector admin unlock --challenge ...</code> (or run <code>unlock</code> without
        a challenge). The CLI redeems with its AAuth signer and prints a URL to the Inspector{" "}
        <code>/feedback/admin-unlock</code> page, which calls <code>/admin/feedback/auth/session</code>{" "}
        to set the short-lived httpOnly cookie.
      </p>
      <p className="text-[15px] leading-7 mb-4">
        Admin routes accept only direct <code>hardware</code>, <code>software</code>, or{" "}
        <code>operator_attested</code> AAuth requests, or the local session minted from one of those
        tiers. Bearer tokens, OAuth cookies, and generic <code>clientInfo</code> do not unlock the
        queue.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">PII redaction</h2>
      <p className="text-[15px] leading-7 mb-4">
        Feedback submissions go through a redaction pass before they leave the instance. Emails,
        phone numbers, API tokens, UUIDs, and home-directory path fragments are replaced with{" "}
        <code>&lt;LABEL:hash&gt;</code> placeholders. The endpoint applies a backstop redaction pass
        on top and returns a <code>redaction_preview</code>, which the Inspector renders as a diff
        before final submit so you can audit what actually leaves your machine.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Required environment metadata
      </h2>
      <p className="text-[15px] leading-7 mb-4">Every submission carries:</p>
      <ul className="list-none pl-0 space-y-1.5 mb-4">
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>neotoma_version</code>, <code>client_name</code>, <code>os</code>, the minimum
          environment fingerprint.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>tool_name</code>, <code>invocation_shape</code>, what was being tried.
        </li>
        <li className="text-[15px] leading-7 text-muted-foreground">
          <code>error_message</code>, <code>error_class</code>, <code>hit_count</code>, the failure
          mode and recurrence.
        </li>
      </ul>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Status feed &amp; verification
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Submitted items return an <code>access_token</code> + a suggested next-check time. The
        Inspector polls <code>get_feedback_status</code> in the background and updates the
        recent-submissions table when status changes. When a submission is marked{" "}
        <code>shipping (verify)</code>, the panel surfaces an <code>upgrade_guidance</code> block
        with the install commands and a verification step; submitting that step closes the loop with
        a <code>fix_verification</code> follow-up.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Where the access token lives
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Tokens are stored in Neotoma as <code>product_feedback</code> entities and never echoed back
        into chat or logs. Browse them under{" "}
        <Link
          to="/inspector/entities"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          Entities → product_feedback
        </Link>{" "}
        if you need to reconcile what was submitted from this instance.
      </p>
    </DetailPage>
  );
}

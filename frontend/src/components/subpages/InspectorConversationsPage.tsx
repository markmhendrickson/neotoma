import { Link } from "react-router-dom";
import { DetailPage, detailPageCtaLinkProps } from "../DetailPage";
import {
  InspectorPreview,
  InspectorSidebarMock,
  InspectorPageHeaderMock,
  MockPill,
} from "./inspector/InspectorPreview";

export function InspectorConversationsPage() {
  return (
    <DetailPage title="Inspector, Conversations & turns">
      <p className="text-[15px] leading-7 mb-4">
        Conversations and turns reconstruct the chat history Neotoma has
        captured. Every turn is stored as a{" "}
        <code>conversation_message</code> entity (alias{" "}
        <code>agent_message</code>) with role, sender kind, content,
        attachments, and a stable <code>turn_key</code>; the parent{" "}
        <code>conversation</code> entity glues them together with a topic
        title and participant kind.
      </p>
      <p className="text-[15px] leading-7 mb-6">
        Inspector renders these rows back into a familiar transcript-style
        view, then layers the underlying graph on top, so you can see not
        just <em>what was said</em>, but every entity each turn produced or
        cited, and the agent that wrote it.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Conversation list
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The list view groups all <code>conversation</code> entities with
        their turn count, last activity, primary participants, and{" "}
        <code>thread_kind</code> (<code>human_agent</code>,{" "}
        <code>agent_agent</code>, <code>multi_party</code>). It supports
        filters by thread kind, agent identity, and time range, and
        deep-links into individual turns.
      </p>

      <InspectorPreview
        path="/conversations"
        caption="Per-conversation summary: title, turn count, last activity, primary agents, and thread kind."
      >
        <div className="flex">
          <InspectorSidebarMock active="conversations" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Conversations"
              subtitle="312 threads · 8,240 turns"
              right={
                <>
                  <MockPill tone="info">human_agent (260)</MockPill>
                  <MockPill tone="violet">agent_agent (38)</MockPill>
                  <MockPill tone="muted">multi_party (14)</MockPill>
                </>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Title</th>
                    <th className="px-3 py-2 text-left font-medium">
                      Thread kind
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Turns</th>
                    <th className="px-3 py-2 text-left font-medium">Agents</th>
                    <th className="px-3 py-2 text-left font-medium">
                      Last activity
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      title: "Q2 budget review",
                      kind: "human_agent",
                      turns: 24,
                      agents: "claude-code",
                      last: "12:41",
                    },
                    {
                      title: "Vercel migration plan",
                      kind: "human_agent",
                      turns: 18,
                      agents: "cursor-agent",
                      last: "11:08",
                    },
                    {
                      title: "Receipt triage (April)",
                      kind: "human_agent",
                      turns: 9,
                      agents: "ingest-pipeline",
                      last: "10:55",
                    },
                    {
                      title: "Planner ↔ Executor sync",
                      kind: "agent_agent",
                      turns: 42,
                      agents: "planner, executor",
                      last: "Apr 26",
                    },
                    {
                      title: "Customer interview · Sarah P.",
                      kind: "multi_party",
                      turns: 31,
                      agents: "user, claude-code, gpt-5.5",
                      last: "Apr 24",
                    },
                  ].map((row) => (
                    <tr
                      key={row.title}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-3 py-2 text-foreground truncate max-w-[220px]">
                        {row.title}
                      </td>
                      <td className="px-3 py-2">
                        <MockPill
                          tone={
                            row.kind === "human_agent"
                              ? "info"
                              : row.kind === "agent_agent"
                                ? "violet"
                                : "muted"
                          }
                        >
                          {row.kind}
                        </MockPill>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {row.turns}
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-[200px]">
                        {row.agents}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {row.last}
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
        Conversation transcript
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Open a conversation and Inspector reconstructs the transcript by
        ordering its <code>conversation_message</code> children by{" "}
        <code>turn_key</code>. Each turn shows role (
        <code>user</code> / <code>assistant</code> / <code>agent</code> /{" "}
        <code>system</code> / <code>tool</code>), <code>sender_kind</code>,
        the verbatim <code>content</code>, attached files via{" "}
        <code>EMBEDS</code>, and the entities the turn{" "}
        <code>REFERS_TO</code>.
      </p>

      <InspectorPreview
        path="/conversations/conv_3a2"
        caption="Per-turn transcript with role, agent, content, embedded files, and the entities each turn referred to."
      >
        <div className="flex">
          <InspectorSidebarMock active="turns" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Q2 budget review"
              subtitle="conversation · 24 turns · human_agent"
              right={
                <>
                  <MockPill tone="info">claude-code · sw</MockPill>
                  <MockPill tone="muted">apr 24 → apr 27</MockPill>
                </>
              }
            />
            <div className="px-4 py-3 space-y-2.5 text-[12px]">
              {[
                {
                  role: "user",
                  who: "operator",
                  body: "What did we spend on subscriptions this quarter?",
                  refs: ["transaction (3)"],
                  emb: 0,
                  ts: "12:30",
                  tier: "info",
                },
                {
                  role: "assistant",
                  who: "claude-code",
                  body: "Top categories: Vercel ($420), Linear ($96), Notion ($60). I cited 124 transactions.",
                  refs: ["report · Q2 spend pattern", "transaction (124)"],
                  emb: 0,
                  ts: "12:30",
                  tier: "info",
                },
                {
                  role: "user",
                  who: "operator",
                  body: "Here's the Vercel invoice, confirm the period.",
                  refs: ["receipt · vercel-2026-04"],
                  emb: 1,
                  ts: "11:08",
                  tier: "info",
                },
                {
                  role: "assistant",
                  who: "claude-code",
                  body: "Period 2026-04-01 → 2026-04-30. Stored as receipt; matched to transaction tx_4b1.",
                  refs: ["transaction · tx_4b1"],
                  emb: 0,
                  ts: "11:08",
                  tier: "info",
                },
              ].map((row, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border bg-card p-2.5"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <MockPill
                      tone={row.role === "user" ? "muted" : "info"}
                    >
                      {row.role}
                    </MockPill>
                    <span className="font-mono text-muted-foreground truncate">
                      {row.who}
                    </span>
                    {row.emb ? <MockPill tone="violet">EMBEDS · 1</MockPill> : null}
                    <span className="ml-auto text-muted-foreground tabular-nums">
                      {row.ts}
                    </span>
                  </div>
                  <p className="text-foreground leading-6 mb-1.5">{row.body}</p>
                  <div className="flex flex-wrap gap-1">
                    {row.refs.map((r) => (
                      <span
                        key={r}
                        className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                      >
                        REFERS_TO · {r}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </InspectorPreview>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Sender kind and agent-to-agent
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Every <code>conversation_message</code> carries{" "}
        <code>sender_kind</code> alongside the legacy <code>role</code>{" "}
        field. For agent-to-agent traffic the sender is <code>agent</code>{" "}
        with a stable <code>sender_agent_id</code> (and optional{" "}
        <code>recipient_agent_id</code>) so multi-agent chains can be
        reconstructed exactly. The transcript view colour-codes turns by
        sender kind and surfaces the agent identifier inline.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Embedded files and references
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        Files attached to a turn (PDFs, screenshots, CSVs) become{" "}
        <code>file_asset</code> entities linked to the message via{" "}
        <code>EMBEDS</code>. Inspector renders an inline preview where it
        can and a "View source" link via{" "}
        <code>GET /sources/:id/content</code> when it can't. Entities each
        turn cited or produced are listed inline as{" "}
        <code>REFERS_TO</code> chips, each clickable to the entity detail.
      </p>

      <h2 className="text-[18px] font-medium tracking-[-0.01em] mt-8 mb-3">
        Compliance view
      </h2>
      <p className="text-[15px] leading-7 mb-4">
        The Compliance tab on a conversation re-renders the same turns with
        per-row trust tier, signing key thumbprint, and "did the assistant
        store its reply?" indicators, so you can audit whether agents are
        following the per-turn persistence contract described in the{" "}
        <Link
          to="/agent-instructions"
          className="text-foreground underline underline-offset-2 hover:no-underline"
          {...detailPageCtaLinkProps}
        >
          agent instructions
        </Link>
        . Missing assistant turns or anonymous-tier writes show up in red.
      </p>

      <InspectorPreview
        path="/conversations/conv_3a2/compliance"
        caption="Per-turn compliance view: trust tier, signed-by, and whether the agent persisted its reply."
      >
        <div className="flex">
          <InspectorSidebarMock active="compliance" />
          <div className="flex-1 min-w-0">
            <InspectorPageHeaderMock
              title="Compliance · Q2 budget review"
              subtitle="24 turns · 0 anonymous · 2 missing assistant stores"
              right={
                <>
                  <MockPill tone="success">22 / 24 ok</MockPill>
                  <MockPill tone="warning">2 missing</MockPill>
                </>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Turn</th>
                    <th className="px-3 py-2 text-left font-medium">Role</th>
                    <th className="px-3 py-2 text-left font-medium">Tier</th>
                    <th className="px-3 py-2 text-left font-medium">
                      Signed by
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      Reply stored
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      n: 4,
                      r: "user",
                      t: "info",
                      tone: "info" as const,
                      sb: "operator (sw)",
                      stored: "ok",
                    },
                    {
                      n: 4,
                      r: "assistant",
                      t: "software",
                      tone: "info" as const,
                      sb: "claude-code (sw · ed25519)",
                      stored: "ok",
                    },
                    {
                      n: 5,
                      r: "user",
                      t: "info",
                      tone: "info" as const,
                      sb: "operator (sw)",
                      stored: "ok",
                    },
                    {
                      n: 5,
                      r: "assistant",
                      t: "software",
                      tone: "warning" as const,
                      sb: "claude-code (sw · ed25519)",
                      stored: "missing",
                    },
                  ].map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">
                        #{row.n}
                      </td>
                      <td className="px-3 py-2">
                        <MockPill tone="muted">{row.r}</MockPill>
                      </td>
                      <td className="px-3 py-2">
                        <MockPill tone={row.tone}>{row.t}</MockPill>
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-[200px]">
                        {row.sb}
                      </td>
                      <td className="px-3 py-2">
                        <MockPill
                          tone={row.stored === "ok" ? "success" : "warning"}
                        >
                          {row.stored}
                        </MockPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </InspectorPreview>
    </DetailPage>
  );
}

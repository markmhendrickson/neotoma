import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useEntitiesQuery, useEntityById, useEntityRelationships } from "@/hooks/use_entities";
import { PageShell } from "@/components/layout/page_shell";
import { ListSkeleton } from "@/components/shared/query_status";
import { issueEntityMatchesSegment } from "@/utils/issue_navigation";
import type { EntitySnapshot, RelatedEntityExpansion } from "@/types/api";
import { bulkCloseIssues, bulkRemoveIssues, issuesAddMessage } from "@/api/endpoints/issues";
import { IssueAuthorLine } from "@/components/shared/issue_author_attribution";
import { formatDate } from "@/lib/utils";
import { querySettledWithoutData, showInitialQuerySkeleton } from "@/lib/query_loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyableCodeBlock } from "@/components/ui/copyable_code_block";
import { Textarea } from "@/components/ui/textarea";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/shared/segmented_control";

type RelRow = {
  relationship_type: string;
  source_entity_id: string;
  target_entity_id: string;
  target_entity_type?: string | null;
  source_entity_type?: string | null;
};

/** URL segment is a Neotoma entity id (not a GitHub issue number). */
function isNeotomaEntityIdSegment(seg: string | undefined): boolean {
  return typeof seg === "string" && /^ent_[0-9a-f]+$/i.test(seg);
}

function normRelType(t: string | undefined): string {
  return (t ?? "").toUpperCase().replace(/-/g, "_");
}

function entityIdOf(e: EntitySnapshot | undefined): string | undefined {
  const id = e?.entity_id ?? e?.id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function issueSnapshotField(entity: EntitySnapshot | undefined, key: string): unknown {
  if (!entity) return undefined;
  const s = entity.snapshot?.[key];
  if (s !== undefined && s !== null) return s;
  return entity.raw_fragments?.[key];
}

/** Guest-scoped token on the issue row (canonical `guest_access_token` or legacy `access_token`). */
function issueGuestAccessTokenField(entity: EntitySnapshot | undefined): string | undefined {
  if (!entity) return undefined;
  const guest = issueSnapshotField(entity, "guest_access_token");
  if (typeof guest === "string" && guest.trim()) return guest.trim();
  const legacy = issueSnapshotField(entity, "access_token");
  if (typeof legacy === "string" && legacy.trim()) return legacy.trim();
  return undefined;
}

function IssueAccessTokenPanel({ token }: { token: string }) {
  return (
    <div className="mb-4 space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Issue access token
      </div>
      <CopyableCodeBlock
        code={token}
        variant="code"
        copyAriaLabel="Copy issue access token"
        preClassName="text-xs leading-relaxed"
        footer={
          <p className="text-xs text-muted-foreground">
            For guest-scoped issue APIs (e.g. <code className="text-[11px]">/entities/…</code>). Treat like a
            secret.
          </p>
        }
      />
    </div>
  );
}

function findLinkedConversationId(
  issueId: string,
  rels: RelRow[],
  related: Record<string, RelatedEntityExpansion | Record<string, unknown>>,
): string | undefined {
  for (const r of rels) {
    if (normRelType(r.relationship_type) !== "REFERS_TO") continue;
    if (r.source_entity_id === issueId) {
      const tt =
        r.target_entity_type ??
        (related[r.target_entity_id] as { entity_type?: string } | undefined)?.entity_type ??
        null;
      if (tt === "conversation") return r.target_entity_id;
    }
    if (r.target_entity_id === issueId) {
      const st =
        r.source_entity_type ??
        (related[r.source_entity_id] as { entity_type?: string } | undefined)?.entity_type ??
        null;
      if (st === "conversation") return r.source_entity_id;
    }
  }
  return undefined;
}

function isChatMessageEntityType(t: string | null | undefined): boolean {
  return t === "conversation_message" || t === "agent_message" || t === "chat_message";
}

function githubIssueUrl(snapshot: Record<string, unknown> | undefined): string | undefined {
  if (!snapshot) return undefined;
  const url = snapshot.github_url;
  if (typeof url === "string" && url.trim()) return url.trim();
  const repo = snapshot.repo;
  const num = snapshot.github_number;
  const repoStr = typeof repo === "string" && repo.trim() ? repo.trim() : undefined;
  const n =
    typeof num === "number" && Number.isFinite(num) && num > 0
      ? num
      : typeof num === "string" && /^\d+$/.test(num)
        ? parseInt(num, 10)
        : undefined;
  if (repoStr && n !== undefined) {
    return `https://github.com/${repoStr}/issues/${n}`;
  }
  return undefined;
}

function snapshotFromExpansion(
  exp: RelatedEntityExpansion | Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!exp || typeof exp !== "object") return {};
  const raw = (exp as { snapshot?: unknown }).snapshot;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

/** Snapshot key, then optional `raw_fragments` on expanded related entities. */
function expansionField(
  exp: RelatedEntityExpansion | Record<string, unknown> | undefined,
  key: string,
): unknown {
  if (!exp || typeof exp !== "object") return undefined;
  const ex = exp as RelatedEntityExpansion & { raw_fragments?: Record<string, unknown> };
  const s = ex.snapshot?.[key];
  if (s !== undefined && s !== null) return s;
  return ex.raw_fragments?.[key];
}

function messageDisplayAuthor(
  exp: RelatedEntityExpansion | Record<string, unknown> | undefined,
  snap: Record<string, unknown>,
  issueLevelAuthor: string,
): string {
  const a = expansionField(exp, "author");
  if (typeof a === "string" && a.trim() && a !== "unknown") return a.trim();
  const sAuthor = snap.author;
  if (typeof sAuthor === "string" && sAuthor.trim() && sAuthor !== "unknown") return sAuthor.trim();
  const sk = expansionField(exp, "sender_kind") ?? snap.sender_kind;
  if (sk === "assistant") return "Assistant";
  if (sk === "agent") return "Agent";
  if (sk === "user" || sk === "tool" || sk === "system") {
    if (issueLevelAuthor && issueLevelAuthor !== "unknown") return issueLevelAuthor;
    if (typeof sk === "string") return sk.charAt(0).toUpperCase() + sk.slice(1);
    return "User";
  }
  const role = expansionField(exp, "role") ?? snap.role;
  if (role === "assistant") return "Assistant";
  if (issueLevelAuthor && issueLevelAuthor !== "unknown") return issueLevelAuthor;
  return "unknown";
}

/** Snapshot `author` / expansion login for tooltip (may differ from role label like `User`). */
function messageTooltipSnapshotAuthor(
  exp: RelatedEntityExpansion | Record<string, unknown> | undefined,
  snap: Record<string, unknown>,
  issueLevelAuthor: string,
  displayAuthor: string,
): string {
  const a = expansionField(exp, "author");
  if (typeof a === "string" && a.trim() && a !== "unknown") return a.trim();
  const sAuthor = snap.author;
  if (typeof sAuthor === "string" && sAuthor.trim() && sAuthor !== "unknown") return sAuthor.trim();
  if (issueLevelAuthor !== "unknown" && issueLevelAuthor.trim()) return issueLevelAuthor.trim();
  return displayAuthor;
}

function messageEntityProvenance(
  exp: RelatedEntityExpansion | Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!exp || typeof exp !== "object") return null;
  const p = (exp as RelatedEntityExpansion).provenance;
  return p && typeof p === "object" ? p : null;
}

type ThreadMsg = {
  messageId: string;
  author: string;
  content: string;
  created_at: string;
  provenance?: Record<string, unknown> | null;
  tooltipSnapshotAuthor?: string;
};

/** GitHub login from first thread message when issue snapshot has no `author`. */
function firstGithubAuthorFromThreadRows(
  rows: ThreadMsg[],
  convRelated: Record<string, RelatedEntityExpansion | Record<string, unknown>>,
): string | undefined {
  for (const row of rows) {
    if (!row.messageId || row.messageId.startsWith("__")) continue;
    const exp = convRelated[row.messageId];
    const snap = snapshotFromExpansion(exp);
    const a = expansionField(exp, "author") ?? snap.author;
    if (typeof a === "string" && a.trim() && a.trim() !== "unknown") return a.trim();
  }
  return undefined;
}

/** Same logical message can appear twice (duplicate PART_OF / sync rows). */
function dedupeThreadMessages(rows: ThreadMsg[]): ThreadMsg[] {
  const byId = new Map<string, ThreadMsg>();
  for (const row of rows) {
    if (!byId.has(row.messageId)) byId.set(row.messageId, row);
  }
  const idUnique = Array.from(byId.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const collapsed: ThreadMsg[] = [];
  for (const row of idUnique) {
    const prev = collapsed[collapsed.length - 1];
    if (
      prev &&
      prev.content.trim() === row.content.trim() &&
      prev.author === row.author
    ) {
      continue;
    }
    collapsed.push(row);
  }
  return collapsed;
}

type ConversationBodyView = "formatted" | "raw";

function ConversationMessageBody({
  content,
  viewMode,
}: {
  content: string;
  viewMode: ConversationBodyView;
}) {
  if (viewMode === "raw") {
    return (
      <pre className="mb-0 max-w-none overflow-x-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap">
        {content}
      </pre>
    );
  }
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-muted/40 prose-pre:border prose-pre:border-border prose-a:text-primary prose-code:rounded prose-code:border prose-code:border-border prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.875em] prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => (
            <a href={href ?? "#"} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default function IssueDetailPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [actionBusy, setActionBusy] = useState<"close" | "remove" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [composeBody, setComposeBody] = useState("");
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [conversationBodyView, setConversationBodyView] = useState<ConversationBodyView>("formatted");

  /** GitHub issue number, `entity_id`, or other stable segment from the list link. */
  const { number: rawSegment } = useParams<{ number: string }>();
  const segment = rawSegment ? decodeURIComponent(rawSegment) : undefined;

  const issuesQuery = useEntitiesQuery({
    entity_type: "issue",
    limit: 100,
    offset: 0,
  });

  const loadByEntityId = isNeotomaEntityIdSegment(segment);
  const entityByIdQuery = useEntityById(loadByEntityId ? segment : undefined);

  const issueEntityFromList = (issuesQuery.data?.entities ?? []).find((e) =>
    issueEntityMatchesSegment(e, segment),
  );

  const issueEntity: EntitySnapshot | undefined =
    loadByEntityId && entityByIdQuery.data?.entity_type === "issue"
      ? entityByIdQuery.data
      : issueEntityFromList;

  const issueRowId = entityIdOf(issueEntity);
  const issueSnapshotAuthor = String(issueSnapshotField(issueEntity, "author") ?? "unknown");

  const relQuery = useEntityRelationships(issueRowId, {
    expand_entities: true,
  });

  const issueRelData = relQuery.data;
  const issueRelated = issueRelData?.related_entities ?? {};
  const issueRels: RelRow[] = (issueRelData?.relationships ?? []) as RelRow[];

  const conversationId =
    issueRowId !== undefined ? findLinkedConversationId(issueRowId, issueRels, issueRelated) : undefined;

  const conversationRelQuery = useEntityRelationships(conversationId, {
    expand_entities: true,
  });

  const convRelData = conversationRelQuery.data;
  const convRelated = convRelData?.related_entities ?? {};
  const convIncoming: RelRow[] = (convRelData?.incoming ?? []) as RelRow[];
  const convMerged: RelRow[] = (convRelData?.relationships ?? []) as RelRow[];

  /** Prefer `incoming` (target = conversation); fall back to merged list if empty. */
  const convRowsForThread =
    !conversationId
      ? []
      : convIncoming.length > 0
        ? convIncoming
        : convMerged.filter((r) => r.target_entity_id === conversationId);

  /** message PART_OF conversation ⇒ incoming to conversation with source = message. */
  const threadMessages: ThreadMsg[] = dedupeThreadMessages(
    convRowsForThread
      .filter((r) => {
        if (normRelType(r.relationship_type) !== "PART_OF") return false;
        const srcType =
          r.source_entity_type ?? convRelated[r.source_entity_id]?.entity_type ?? null;
        if (isChatMessageEntityType(srcType)) return true;
        const snap = snapshotFromExpansion(convRelated[r.source_entity_id]);
        return (
          typeof snap.content === "string" &&
          snap.content.length > 0 &&
          (snap.sender_kind !== undefined || snap.role !== undefined)
        );
      })
      .map((r) => {
        const messageId = r.source_entity_id;
        const exp = convRelated[messageId];
        const snap = snapshotFromExpansion(exp);
        const createdRaw = expansionField(exp, "created_at") ?? snap.created_at ?? "";
        const displayAuthor = messageDisplayAuthor(exp, snap, issueSnapshotAuthor);
        return {
          messageId,
          author: displayAuthor,
          content: String(snap.content ?? ""),
          created_at: String(createdRaw ?? ""),
          provenance: messageEntityProvenance(exp),
          tooltipSnapshotAuthor: messageTooltipSnapshotAuthor(exp, snap, issueSnapshotAuthor, displayAuthor),
        };
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  );

  const fromThreadAuthor = firstGithubAuthorFromThreadRows(threadMessages, convRelated);
  const issueHeaderAuthor =
    issueSnapshotAuthor.trim() && issueSnapshotAuthor !== "unknown"
      ? issueSnapshotAuthor
      : (fromThreadAuthor ?? issueSnapshotAuthor);

  const bodyField = issueSnapshotField(issueEntity, "body");
  const authorField = issueSnapshotField(issueEntity, "author");
  const createdField = issueSnapshotField(issueEntity, "created_at");
  const bodyTrim = typeof bodyField === "string" ? bodyField.trim() : "";
  const threadCoversIssueBody =
    bodyTrim.length > 0 &&
    threadMessages.some((m) => m.content.trim() === bodyTrim);
  const issueBodyFallback: ThreadMsg[] =
    bodyTrim.length > 0 && !threadCoversIssueBody
      ? [
          {
            messageId: "__issue_body_fallback__",
            author:
              issueSnapshotAuthor !== "unknown" ? issueSnapshotAuthor : String(authorField ?? "unknown"),
            content: String(bodyField),
            created_at: String(typeof createdField === "string" ? createdField : ""),
            provenance: issueEntity?.provenance ?? null,
            tooltipSnapshotAuthor: messageTooltipSnapshotAuthor(
              undefined,
              typeof authorField === "string" ? { author: authorField } : {},
              issueSnapshotAuthor,
              issueSnapshotAuthor !== "unknown"
                ? issueSnapshotAuthor
                : String(authorField ?? "unknown"),
            ),
          },
        ]
      : [];

  /** Prefer thread messages; if sync never linked the body row, show issue snapshot body once. */
  const messages: ThreadMsg[] =
    threadMessages.length > 0 ? threadMessages : issueBodyFallback.length > 0 ? issueBodyFallback : [];

  const issueForUrl: Record<string, unknown> = {
    ...(issueEntity?.snapshot ?? {}),
    ...(issueEntity?.raw_fragments ?? {}),
  };
  const issueGithubUrl = githubIssueUrl(issueForUrl);
  const loading =
    showInitialQuerySkeleton(issuesQuery) ||
    (loadByEntityId && showInitialQuerySkeleton(entityByIdQuery));

  if (loading) {
    return (
      <PageShell title={`Issue ${segment ?? ""}`}>
        <ListSkeleton />
      </PageShell>
    );
  }

  const notFoundAfterLoad =
    !loading &&
    !issueEntity &&
    (!loadByEntityId ||
      querySettledWithoutData(entityByIdQuery) ||
      entityByIdQuery.isError ||
      entityByIdQuery.data?.entity_type !== "issue") &&
    !issueEntityFromList;

  if (notFoundAfterLoad) {
    return (
      <PageShell title={`Issue ${segment ?? ""}`}>
        <p className="text-muted-foreground">Issue {segment ?? ""} not found locally.</p>
        <Link to="/issues" className="text-primary hover:underline mt-2 inline-block">
          Back to Issues
        </Link>
      </PageShell>
    );
  }

  if (!issueEntity) {
    return (
      <PageShell title={`Issue ${segment ?? ""}`}>
        <ListSkeleton />
      </PageShell>
    );
  }

  const ghRaw = issueSnapshotField(issueEntity, "github_number");
  const headerGithubNum =
    typeof ghRaw === "number" && Number.isFinite(ghRaw) && ghRaw > 0
      ? Math.floor(ghRaw)
      : typeof ghRaw === "string" && /^\d+$/.test(ghRaw.trim())
        ? parseInt(ghRaw.trim(), 10)
        : undefined;
  const issueTitle = String(issueSnapshotField(issueEntity, "title") ?? "");
  const breadcrumbRefLabel =
    headerGithubNum !== undefined
      ? `#${headerGithubNum}${issueRowId ? ` (${issueRowId})` : ""}`
      : (issueRowId ?? segment ?? "");
  const issueStatus = String(issueSnapshotField(issueEntity, "status") ?? "");
  const issueCreatedAt = issueSnapshotField(issueEntity, "created_at");
  const issueLabelsRaw = issueSnapshotField(issueEntity, "labels");
  const issueAccessToken = issueGuestAccessTokenField(issueEntity);

  return (
    <PageShell title={issueTitle}>
      <div className="flex items-center gap-2 mb-4 text-sm">
        <Link to="/issues" className="text-muted-foreground hover:text-foreground">
          Issues
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-mono">{breadcrumbRefLabel}</span>
      </div>

      {issueAccessToken ? <IssueAccessTokenPanel token={issueAccessToken} /> : null}

      <div className="mb-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Badge
            variant={issueStatus === "open" ? "default" : "secondary"}
            className="font-normal"
          >
            {issueStatus}
          </Badge>
          <IssueAuthorLine
            author={issueHeaderAuthor}
            provenance={issueEntity.provenance}
            tooltipSnapshotAuthor={
              issueSnapshotAuthor !== "unknown" && issueSnapshotAuthor !== issueHeaderAuthor
                ? issueSnapshotAuthor
                : undefined
            }
          />
          {typeof issueCreatedAt === "string" && issueCreatedAt ? (
            <span>Submitted {formatDate(issueCreatedAt)}</span>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <p className="text-sm text-destructive mb-4" role="alert">
          {actionError}
        </p>
      ) : null}

      {Array.isArray(issueLabelsRaw) && (issueLabelsRaw as string[]).length > 0 ? (
        <div className="flex gap-2 flex-wrap mb-4">
          {(issueLabelsRaw as string[]).map((label) => (
            <Badge key={label} variant="outline" className="font-normal">
              {label}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 mb-6">
        {issueGithubUrl ? (
          <a
            href={issueGithubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline whitespace-nowrap"
          >
            View on GitHub
          </a>
        ) : null}
        {issueRowId ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={actionBusy !== null || issueStatus === "closed"}
              onClick={async () => {
                setActionError(null);
                setActionBusy("close");
                try {
                  const res = await bulkCloseIssues([issueRowId]);
                  const row = res.results[0];
                  if (!row?.ok) {
                    setActionError(row?.error ?? "Close failed");
                    return;
                  }
                  await queryClient.invalidateQueries({ queryKey: ["entities"] });
                  await queryClient.invalidateQueries({ queryKey: ["entity", issueRowId] });
                  await queryClient.invalidateQueries({
                    queryKey: ["entity-relationships", issueRowId],
                  });
                } catch (e) {
                  setActionError(e instanceof Error ? e.message : String(e));
                } finally {
                  setActionBusy(null);
                }
              }}
            >
              {actionBusy === "close" ? "Closing…" : "Close"}
            </Button>
            <ConfirmDialog
              trigger={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  disabled={actionBusy !== null}
                >
                  {actionBusy === "remove" ? "Removing…" : "Remove"}
                </Button>
              }
              title="Remove this issue?"
              description="If it is linked to GitHub and still open, it will be closed there first, then removed from this list."
              confirmLabel="Remove"
              variant="destructive"
              onConfirm={() => {
                void (async () => {
                  setActionError(null);
                  setActionBusy("remove");
                  try {
                    const res = await bulkRemoveIssues([issueRowId]);
                    const row = res.results[0];
                    if (!row?.ok) {
                      setActionError(row?.error ?? "Remove failed");
                      return;
                    }
                    await queryClient.invalidateQueries({ queryKey: ["entities"] });
                    navigate("/issues");
                  } catch (e) {
                    setActionError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setActionBusy(null);
                  }
                })();
              }}
            />
          </>
        ) : null}
      </div>

      <div className="border-t pt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Conversation</h2>
          {messages.length > 0 ? (
            <SegmentedControl
              type="single"
              size="sm"
              value={conversationBodyView}
              onValueChange={(v) => {
                if (v === "formatted" || v === "raw") setConversationBodyView(v);
              }}
              aria-label="Message body display mode"
            >
              <SegmentedControlItem value="formatted" aria-label="Formatted">
                Formatted
              </SegmentedControlItem>
              <SegmentedControlItem value="raw" aria-label="Raw">
                Raw
              </SegmentedControlItem>
            </SegmentedControl>
          ) : null}
        </div>
        {messages.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No messages synced yet. Run <code>neotoma issues sync</code> to pull messages.
            {issueGithubUrl ? (
              <>
                {" "}
                <a
                  href={issueGithubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  View on GitHub
                </a>
                .
              </>
            ) : null}
          </p>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.messageId} className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                  <IssueAuthorLine
                    author={msg.author}
                    provenance={msg.provenance}
                    context="message"
                    tooltipSnapshotAuthor={msg.tooltipSnapshotAuthor}
                    triggerClassName="font-medium text-foreground cursor-help border-b border-dotted border-muted-foreground/40 hover:border-muted-foreground/70"
                  />
                  {msg.created_at && Number.isFinite(Date.parse(msg.created_at)) ? (
                    <span>{formatDate(msg.created_at)}</span>
                  ) : null}
                </div>
                <ConversationMessageBody content={msg.content} viewMode={conversationBodyView} />
              </div>
            ))}
          </div>
        )}

        {issueRowId ? (
          <div className="mt-8 border-t border-border pt-6">
            <h3 className="text-sm font-semibold text-foreground mb-2">Add reply</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Markdown supported. Posts to the issue thread (and GitHub when linked), same as{" "}
              <code className="text-[11px]">add_issue_message</code>.
            </p>
            <Textarea
              value={composeBody}
              onChange={(e) => {
                setComposeBody(e.target.value);
                if (composeError) setComposeError(null);
              }}
              disabled={composeBusy || issueStatus === "closed"}
              rows={5}
              placeholder="Write a message…"
            />
            {composeError ? (
              <p className="text-sm text-destructive mt-2" role="alert">
                {composeError}
              </p>
            ) : null}
            {issueStatus === "closed" ? (
              <p className="text-xs text-muted-foreground mt-2">Reopen the issue before adding replies from here.</p>
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                disabled={composeBusy || !composeBody.trim() || issueStatus === "closed"}
                onClick={async () => {
                  const body = composeBody.trim();
                  if (!body || !issueRowId) return;
                  setComposeError(null);
                  setComposeBusy(true);
                  try {
                    await issuesAddMessage({ entity_id: issueRowId, body });
                    setComposeBody("");
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: ["entity-relationships", issueRowId] }),
                      conversationId
                        ? queryClient.invalidateQueries({ queryKey: ["entity-relationships", conversationId] })
                        : Promise.resolve(),
                      queryClient.invalidateQueries({ queryKey: ["entity", issueRowId] }),
                      queryClient.invalidateQueries({ queryKey: ["entities"] }),
                    ]);
                  } catch (e) {
                    setComposeError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setComposeBusy(false);
                  }
                }}
              >
                {composeBusy ? "Sending…" : "Send message"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}

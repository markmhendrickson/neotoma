import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { useSourceById, useSourceRelationships } from "@/hooks/use_sources";
import { useInterpretations } from "@/hooks/use_interpretations";
import { PageShell } from "@/components/layout/page_shell";
import {
  DetailPageSkeleton,
  InlineSkeleton,
  ListSkeleton,
  QueryErrorAlert,
} from "@/components/shared/query_status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JsonViewer } from "@/components/shared/json_viewer";
import { AttributionCard } from "@/components/shared/attribution_card";
import { RelationshipPanel } from "@/components/shared/relationship_panel";
import { useAgentAttributionFilter } from "@/components/shared/agent_filter";
import {
  buildDirectedRelationshipRowsFromSourceList,
  inferHubEntityIdByRelationshipType,
} from "@/lib/relationship_panel_groups";
import { entityRelationshipSubpageHref } from "@/lib/entity_relationship_routes";
import { formatDate } from "@/lib/utils";
import {
  querySettledWithoutData,
  showBackgroundQueryRefresh,
  showInitialQuerySkeleton,
  showRouteDetailSkeleton,
} from "@/lib/query_loading";
import { SourceDetailActionsMenu } from "@/components/shared/source_detail_actions_menu";
import { getFileUrl, getSourceContentBlob, getSourceContentText, getSourceContentUrl } from "@/api/endpoints/sources";
import { PdfJsInlinePreview } from "@/components/shared/pdf_js_inline_preview";
import {
  inferSourcePreviewKind,
  sourceDisplaySummary,
  sourceDisplayTitle,
  sourceFileSizeLabel,
  sourceMetadataRows,
  sourcePreviewChips,
  type SourcePreviewKind,
} from "@/lib/source_display";
import { toast } from "sonner";
import { INLINE_SOURCE_PREVIEW_MAX_BYTES, tryParseJsonDocument } from "@/lib/source_content";
import type { Source } from "@/types/api";

/** Above this size, buffering the whole file in JS (Blob) is unreliable; prefer signed storage URLs for media. */
const INLINE_BLOB_MAX_BYTES = INLINE_SOURCE_PREVIEW_MAX_BYTES;

/**
 * Local adapter returns `file://…` from /get_file_url. Media elements on http(s) pages cannot load those URLs;
 * use the authenticated HTTP content route instead (same base as the rest of the inspector API).
 */
function embeddableBinaryUrl(signedOrHttpUrl: string, sourceId: string): string {
  if (signedOrHttpUrl.startsWith("file://")) {
    return getSourceContentUrl(sourceId);
  }
  return signedOrHttpUrl;
}

function guessAudioMimeType(filename?: string | null, storedMime?: string | null): string | undefined {
  const mime = (storedMime || "").toLowerCase();
  if (mime.startsWith("audio/")) return storedMime || undefined;
  const n = (filename || "").toLowerCase();
  if (n.endsWith(".wav")) return "audio/wav";
  if (n.endsWith(".mp3")) return "audio/mpeg";
  if (n.endsWith(".m4a") || n.endsWith(".mp4")) return "audio/mp4";
  if (n.endsWith(".aac")) return "audio/aac";
  if (n.endsWith(".ogg") || n.endsWith(".oga")) return "audio/ogg";
  if (n.endsWith(".flac")) return "audio/flac";
  if (mime && mime !== "application/octet-stream") return storedMime || undefined;
  return undefined;
}

const ATTRIBUTION_KEYS = new Set([
  "agent_public_key",
  "agent_thumbprint",
  "agent_algorithm",
  "agent_sub",
  "agent_iss",
  "client_name",
  "client_version",
  "connection_id",
  "attribution_tier",
  "attributed_at",
]);

/**
 * True when a provenance blob carries keys beyond the {@link AgentAttribution}
 * block. Used to decide whether to render the raw-provenance JSON viewer
 * alongside the structured attribution card: we only want the JSON fallback
 * when the blob contains something the card is not already surfacing.
 */
function hasNonAttributionKeys(
  provenance: Record<string, unknown> | null | undefined
): boolean {
  if (!provenance) return false;
  return Object.keys(provenance).some((key) => !ATTRIBUTION_KEYS.has(key));
}

type SourceContentPreviewBodyProps = {
  source: Source;
  isTextPreview: boolean;
  isLargeFile: boolean;
  previewKind: SourcePreviewKind;
  useSignedStorageUrl: boolean;
  parsedJsonContent: unknown;
  rawText: UseQueryResult<string, Error>;
  signedFileUrl: UseQueryResult<{ url: string }, Error>;
  rawBlob: UseQueryResult<Blob, Error>;
  blobUrl: string | null;
};

function SourceContentPreviewBody({
  source: s,
  isTextPreview,
  isLargeFile,
  previewKind,
  useSignedStorageUrl,
  parsedJsonContent,
  rawText,
  signedFileUrl,
  rawBlob,
  blobUrl,
}: SourceContentPreviewBodyProps) {
  return isTextPreview ? (
    isLargeFile ? (
      <p className="text-sm text-muted-foreground">
        This file is about {sourceFileSizeLabel(s.file_size)}. Inline text preview is disabled to avoid loading the
        entire body in the browser. Use Download from the actions menu.
      </p>
    ) : showInitialQuerySkeleton(rawText) ? (
      <InlineSkeleton className="h-32 w-full max-w-2xl" />
    ) : rawText.error ? (
      <QueryErrorAlert title="Could not load raw content">
        {String(rawText.error instanceof Error ? rawText.error.message : rawText.error)}
      </QueryErrorAlert>
    ) : parsedJsonContent != null ? (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Parsed as JSON (structured view).</p>
        <div className="max-h-[480px] overflow-auto rounded-md border bg-muted/30 p-3">
          <JsonViewer data={parsedJsonContent} expandAll />
        </div>
      </div>
    ) : (
      <pre className="max-h-[480px] overflow-auto rounded-md bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap">
        {rawText.data || "No raw text content returned."}
      </pre>
    )
  ) : previewKind === "image" ? (
    isLargeFile && !s.storage_url ? (
      <p className="text-sm text-muted-foreground">
        Inline preview is disabled for files over {sourceFileSizeLabel(INLINE_BLOB_MAX_BYTES)} when no storage URL is
        available. Use Download from the actions menu.
      </p>
    ) : useSignedStorageUrl ? (
      showInitialQuerySkeleton(signedFileUrl) ? (
        <InlineSkeleton className="h-48 w-full max-w-md" />
      ) : signedFileUrl.error ? (
        <QueryErrorAlert title="Could not resolve image URL">
          {String(signedFileUrl.error instanceof Error ? signedFileUrl.error.message : signedFileUrl.error)}
        </QueryErrorAlert>
      ) : signedFileUrl.data?.url ? (
        <img
          src={embeddableBinaryUrl(signedFileUrl.data.url, s.id)}
          alt={s.original_filename || s.id}
          className="max-h-[640px] w-full rounded-md object-contain bg-muted/30"
        />
      ) : (
        <p className="text-sm text-muted-foreground">Image preview unavailable.</p>
      )
    ) : showInitialQuerySkeleton(rawBlob) ? (
      <InlineSkeleton className="h-48 w-full max-w-md" />
    ) : rawBlob.error ? (
      <QueryErrorAlert title="Could not load image preview">
        {String(rawBlob.error instanceof Error ? rawBlob.error.message : rawBlob.error)}
      </QueryErrorAlert>
    ) : blobUrl ? (
      <img src={blobUrl} alt={s.original_filename || s.id} className="max-h-[640px] w-full rounded-md object-contain bg-muted/30" />
    ) : (
      <p className="text-sm text-muted-foreground">Image preview unavailable.</p>
    )
  ) : previewKind === "audio" ? (
    useSignedStorageUrl ? (
      showInitialQuerySkeleton(signedFileUrl) ? (
        <InlineSkeleton className="h-12 w-full max-w-md" />
      ) : signedFileUrl.error ? (
        <QueryErrorAlert title="Could not resolve audio URL">
          {String(signedFileUrl.error instanceof Error ? signedFileUrl.error.message : signedFileUrl.error)}
        </QueryErrorAlert>
      ) : signedFileUrl.data?.url ? (
        <audio controls preload="metadata" className="w-full" src={embeddableBinaryUrl(signedFileUrl.data.url, s.id)} />
      ) : (
        <p className="text-sm text-muted-foreground">Audio preview unavailable.</p>
      )
    ) : isLargeFile ? (
      <p className="text-sm text-muted-foreground">
        This file is about {sourceFileSizeLabel(s.file_size)} with no direct storage path for streaming. Use Download
        from the actions menu.
      </p>
    ) : showInitialQuerySkeleton(rawBlob) ? (
      <InlineSkeleton className="h-12 w-full max-w-md" />
    ) : rawBlob.error ? (
      <QueryErrorAlert title="Could not load audio preview">
        {String(rawBlob.error instanceof Error ? rawBlob.error.message : rawBlob.error)}
      </QueryErrorAlert>
    ) : blobUrl ? (
      <audio controls preload="metadata" className="w-full">
        <source src={blobUrl} type={guessAudioMimeType(s.original_filename, s.mime_type)} />
      </audio>
    ) : (
      <p className="text-sm text-muted-foreground">Audio preview unavailable.</p>
    )
  ) : previewKind === "video" ? (
    useSignedStorageUrl ? (
      showInitialQuerySkeleton(signedFileUrl) ? (
        <InlineSkeleton className="h-48 w-full max-w-2xl" />
      ) : signedFileUrl.error ? (
        <QueryErrorAlert title="Could not resolve video URL">
          {String(signedFileUrl.error instanceof Error ? signedFileUrl.error.message : signedFileUrl.error)}
        </QueryErrorAlert>
      ) : signedFileUrl.data?.url ? (
        <video
          controls
          preload="metadata"
          className="max-h-[640px] w-full rounded-md bg-muted/30"
          src={embeddableBinaryUrl(signedFileUrl.data.url, s.id)}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Video preview unavailable.</p>
      )
    ) : isLargeFile ? (
      <p className="text-sm text-muted-foreground">
        This file is about {sourceFileSizeLabel(s.file_size)} with no direct storage path for streaming. Use Download
        from the actions menu.
      </p>
    ) : showInitialQuerySkeleton(rawBlob) ? (
      <InlineSkeleton className="h-48 w-full max-w-2xl" />
    ) : rawBlob.error ? (
      <QueryErrorAlert title="Could not load video preview">
        {String(rawBlob.error instanceof Error ? rawBlob.error.message : String(rawBlob.error))}
      </QueryErrorAlert>
    ) : blobUrl ? (
      <video controls preload="metadata" className="max-h-[640px] w-full rounded-md bg-muted/30" src={blobUrl} />
    ) : (
      <p className="text-sm text-muted-foreground">Video preview unavailable.</p>
    )
  ) : previewKind === "pdf" ? (
    isLargeFile && !s.storage_url ? (
      <p className="text-sm text-muted-foreground">
        Inline preview is disabled for files over {sourceFileSizeLabel(INLINE_BLOB_MAX_BYTES)} when no storage URL is
        available. Use Download from the actions menu.
      </p>
    ) : useSignedStorageUrl ? (
      showInitialQuerySkeleton(signedFileUrl) ? (
        <InlineSkeleton className="h-64 w-full" />
      ) : signedFileUrl.error ? (
        <QueryErrorAlert title="Could not resolve PDF URL">
          {String(signedFileUrl.error instanceof Error ? signedFileUrl.error.message : signedFileUrl.error)}
        </QueryErrorAlert>
      ) : signedFileUrl.data?.url ? (
        <PdfJsInlinePreview documentUrl={embeddableBinaryUrl(signedFileUrl.data.url, s.id)} />
      ) : (
        <p className="text-sm text-muted-foreground">PDF preview unavailable.</p>
      )
    ) : showInitialQuerySkeleton(rawBlob) ? (
      <InlineSkeleton className="h-64 w-full" />
    ) : rawBlob.error ? (
      <QueryErrorAlert title="Could not load PDF preview">
        {String(rawBlob.error instanceof Error ? rawBlob.error.message : rawBlob.error)}
      </QueryErrorAlert>
    ) : rawBlob.data ? (
      <PdfJsInlinePreview documentData={rawBlob.data} />
    ) : (
      <p className="text-sm text-muted-foreground">PDF preview unavailable.</p>
    )
  ) : (
    <p className="text-sm text-muted-foreground">
      Inline preview is not available for this file type. Use Download from the actions menu to inspect the raw bytes
      directly.
    </p>
  );
}

function SourceRelationshipsSection({
  query,
}: {
  query: ReturnType<typeof useSourceRelationships>;
}) {
  const rawRelationships = query.data?.relationships ?? [];
  const { filterRows, AgentFilterControl } = useAgentAttributionFilter(rawRelationships);
  const filteredRelationships = filterRows(rawRelationships);

  const filteredData = useMemo(
    () =>
      query.data
        ? { ...query.data, relationships: filteredRelationships }
        : undefined,
    [query.data, filteredRelationships],
  );

  const directedRows = useMemo(
    () => buildDirectedRelationshipRowsFromSourceList(filteredData),
    [filteredData],
  );

  const hubByRelationshipType = useMemo(
    () => inferHubEntityIdByRelationshipType(filteredRelationships),
    [filteredRelationships],
  );

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Relationships</h2>
      {showInitialQuerySkeleton(query) ? (
        <ListSkeleton rows={4} />
      ) : query.error ? (
        <QueryErrorAlert title="Could not load relationships">
          {query.error instanceof Error ? query.error.message : String(query.error)}
        </QueryErrorAlert>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-4 text-xs text-muted-foreground">
              Edges stamped with this source or touching entities observed from this source.
            </p>
            {filteredRelationships.length === 0 ? (
              <p className="text-sm text-muted-foreground">No relationships linked to this source.</p>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-end gap-3">
                  <AgentFilterControl />
                </div>
                <RelationshipPanel
                  rows={directedRows}
                  getSubpageHref={(relationshipType, relatedEntityType) => {
                    const hubId = hubByRelationshipType.get(relationshipType);
                    if (!hubId) return null;
                    return entityRelationshipSubpageHref(
                      hubId,
                      relationshipType,
                      relatedEntityType,
                    );
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

export default function SourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const source = useSourceById(id);
  const sourceRelationships = useSourceRelationships(id);
  const interpretations = useInterpretations({ source_id: id });
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const s = source.data;
  const previewKind = useMemo<SourcePreviewKind>(
    () => inferSourcePreviewKind({ mime_type: s?.mime_type, original_filename: s?.original_filename }),
    [s?.mime_type, s?.original_filename],
  );
  const isTextPreview = previewKind === "text" || previewKind === "json";
  const isLargeFile = (s?.file_size ?? 0) > INLINE_BLOB_MAX_BYTES;

  const useSignedStorageUrl =
    !!s?.storage_url &&
    (previewKind === "audio" ||
      previewKind === "video" ||
      ((previewKind === "image" || previewKind === "pdf") && isLargeFile));

  const rawText = useQuery({
    queryKey: ["source-content-text", id],
    queryFn: ({ signal }) => getSourceContentText(id!, { signal }),
    enabled: isApiUrlConfigured() && !!id && isTextPreview && !isLargeFile,
  });

  const parsedJsonContent = useMemo(() => {
    const body = rawText.data;
    if (typeof body !== "string") return null;
    return tryParseJsonDocument(body);
  }, [rawText.data]);

  const signedFileUrl = useQuery({
    queryKey: ["source-signed-file-url", s?.storage_url, previewKind],
    queryFn: ({ signal }) => getFileUrl(s!.storage_url!, undefined, { signal }),
    enabled: isApiUrlConfigured() && !!id && useSignedStorageUrl,
  });

  const rawBlob = useQuery({
    queryKey: ["source-content-blob", id, previewKind],
    queryFn: ({ signal }) => getSourceContentBlob(id!, { signal }),
    enabled:
      isApiUrlConfigured() &&
      !!id &&
      ((previewKind === "image" && !isLargeFile) ||
        (previewKind === "pdf" && !isLargeFile) ||
        (previewKind === "audio" && !s?.storage_url && !isLargeFile) ||
        (previewKind === "video" && !s?.storage_url && !isLargeFile)),
  });

  useEffect(() => {
    if (!rawBlob.data) {
      setBlobUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(rawBlob.data);
    setBlobUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [rawBlob.data]);

  function safeDownloadFilename(name: string): string {
    const trimmed = name.trim().replace(/[/\\]/g, "_");
    return trimmed.length > 0 ? trimmed : "download";
  }

  /** Save bytes in-browser; required when `file://` URLs from `/get_file_url` cannot be opened from http(s) (same as {@link embeddableBinaryUrl}). */
  function triggerBlobDownload(blob: Blob, filename: string) {
    const safe = safeDownloadFilename(filename);
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = safe;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  }

  async function handleDownload() {
    if (!id) return;
    try {
      const filename = s?.original_filename || s?.id || "download";
      if (s?.storage_url) {
        const { url } = await getFileUrl(s.storage_url);
        if (!url.startsWith("file://")) {
          window.open(url, "_blank");
          return;
        }
      }
      const blob = await getSourceContentBlob(id);
      triggerBlobDownload(blob, filename);
    } catch (err) {
      toast.error(`Download failed: ${err}`);
    }
  }

  if (showRouteDetailSkeleton(source, (row) => row.id === id))
    return (
      <PageShell title="Loading…">
        <DetailPageSkeleton />
      </PageShell>
    );
  if (source.error)
    return (
      <PageShell title="Error">
        <QueryErrorAlert title="Could not load source">{source.error.message}</QueryErrorAlert>
      </PageShell>
    );
  if (!s && querySettledWithoutData(source))
    return <PageShell title="Not Found"><div className="text-muted-foreground">Source not found.</div></PageShell>;
  if (!s)
    return (
      <PageShell title="Loading…">
        <DetailPageSkeleton />
      </PageShell>
    );

  const sourceDetailRefreshing =
    showBackgroundQueryRefresh(source) ||
    showBackgroundQueryRefresh(sourceRelationships) ||
    showBackgroundQueryRefresh(interpretations) ||
    showBackgroundQueryRefresh(rawText) ||
    showBackgroundQueryRefresh(signedFileUrl) ||
    showBackgroundQueryRefresh(rawBlob);

  return (
    <PageShell
      title={sourceDisplayTitle(s)}
      description={sourceDisplaySummary(s)}
      actions={
        <SourceDetailActionsMenu
          source={s}
          title={sourceDisplayTitle(s)}
          subtitle={sourceDisplaySummary(s)}
          showRefresh={sourceDetailRefreshing}
          onDownload={handleDownload}
        />
      }
    >
      <section className="space-y-4" id="content-preview">
        <h2 className="text-lg font-semibold">Content preview</h2>
        <Card>
          <CardContent className="pt-6">
            <p className="mb-4 text-xs text-muted-foreground">
              Preview the stored bytes when the browser can render them, or open the raw content from the actions
              menu.
            </p>
            <SourceContentPreviewBody
              source={s}
              isTextPreview={isTextPreview}
              isLargeFile={isLargeFile}
              previewKind={previewKind}
              useSignedStorageUrl={useSignedStorageUrl}
              parsedJsonContent={parsedJsonContent}
              rawText={rawText}
              signedFileUrl={signedFileUrl}
              rawBlob={rawBlob}
              blobUrl={blobUrl}
            />
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Source summary</CardTitle>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {sourcePreviewChips(s).slice(0, 5).map((chip) => (
                <Badge key={chip} variant="secondary" className="font-normal text-muted-foreground">
                  {chip}
                </Badge>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {sourceMetadataRows(s).map(({ label, value }) => (
              <div key={label} className="flex justify-between gap-4">
                <span className="shrink-0 text-muted-foreground">{label}</span>
                <span className={label === "Source ID" || label === "Content hash" ? "break-all text-right font-mono text-xs" : "text-right"}>
                  {value}
                </span>
              </div>
            ))}
            {s.filesystem_absolute_path ? (
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <span className="text-muted-foreground shrink-0">Filesystem path</span>
                <span className="font-mono text-xs break-all text-right sm:max-w-[min(100%,520px)]">{s.filesystem_absolute_path}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <AttributionCard
          provenance={s.provenance ?? null}
          title="Agent attribution"
          description="Which agent uploaded or synthesised this source."
        />
      </div>

      <SourceRelationshipsSection query={sourceRelationships} />

      {s.provenance && hasNonAttributionKeys(s.provenance) ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Raw provenance</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonViewer data={s.provenance} defaultExpanded />
          </CardContent>
        </Card>
      ) : null}


      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base">Interpretations</CardTitle></CardHeader>
        <CardContent>
          {showInitialQuerySkeleton(interpretations) ? (
            <ListSkeleton rows={3} />
          ) : interpretations.data?.interpretations?.length ? (
            <div className="space-y-2">
              {interpretations.data.interpretations.map((interp) => (
                <div key={interp.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <div>
                    <span className="font-medium">{interp.status || "unknown"}</span>
                    <span className="ml-2 text-muted-foreground">Observations: {interp.observations_created ?? "—"}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(interp.completed_at || interp.created_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No interpretations found.</p>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}

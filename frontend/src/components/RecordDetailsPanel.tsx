import type { NeotomaRecord } from '@/types/record';
import { getFileUrl } from '@/lib/api';
import { useSettings } from '@/hooks/useSettings';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { formatRelativeTime } from '@/utils/time';
import { Button } from '@/components/ui/button';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { createLocalFileObjectUrl, isLocalFilePath } from '@/utils/local_files';
import { humanizePropertyKey } from '@/utils/property_keys';
import { Fragment } from 'react';
function PropertiesList({
  data,
  level = 0,
}: {
  data: Record<string, unknown>;
  level?: number;
}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return <div className="text-sm text-muted-foreground">—</div>;
  }

  const entries = Object.entries(data).sort(([a], [b]) =>
    humanizePropertyKey(a).localeCompare(humanizePropertyKey(b), undefined, { sensitivity: 'base' })
  );

  if (entries.length === 0) {
    return <div className="text-sm text-muted-foreground">—</div>;
  }

  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => (
        <PropertyEntry key={`${level}-${key}`} label={humanizePropertyKey(key)} value={value} level={level} />
      ))}
    </div>
  );
}

function PropertyEntry({
  label,
  value,
  level,
}: {
  label: string;
  value: unknown;
  level: number;
}) {
  const paddingLeft = level * 16;
  const isObject = value && typeof value === 'object' && !Array.isArray(value);

  return (
    <div className="space-y-1" style={{ paddingLeft }}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {renderPropertyValue(value, level)}
      {isObject && (
        <div className="border-l border-border/50 pl-4 mt-2">
          <PropertiesList data={value as Record<string, unknown>} level={level + 1} />
        </div>
      )}
    </div>
  );
}

function renderPropertyValue(value: unknown, level: number): JSX.Element {
  if (value === null || value === undefined) {
    return <div className="text-sm text-muted-foreground">—</div>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <div className="text-sm text-muted-foreground">[]</div>;
    }

    return (
      <div className="space-y-1">
        {value.map((item, idx) => (
          <Fragment key={`${level}-arr-${idx}`}>
            {typeof item === 'object' && item !== null ? (
              <div className="border-l border-border/50 pl-4">
                <PropertiesList
                  data={item as Record<string, unknown>}
                  level={level + 1}
                />
              </div>
            ) : (
              <div className="text-sm">{String(item)}</div>
            )}
          </Fragment>
        ))}
      </div>
    );
  }

  if (typeof value === 'object') {
    return <div className="text-sm text-muted-foreground">—</div>;
  }

  return <div className="text-sm break-words">{String(value)}</div>;
}
import { ApiAccessError, getApiAccessDisabledMessage } from '@/utils/api_access';

const ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

function isAbsoluteUrl(value: string): boolean {
  return ABSOLUTE_URL_PATTERN.test(value);
}

interface RecordDetailsPanelProps {
  record: NeotomaRecord | null;
  onClose: () => void;
}

const clampPanelWidth = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const getStoredPanelWidth = (
  key: string,
  fallback: number,
  min: number,
  max: number
) => {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = Number.parseFloat(stored);
    if (!Number.isNaN(parsed)) {
      return clampPanelWidth(parsed, min, max);
    }
    return fallback;
  } catch (error) {
    console.warn('[RecordDetailsPanel] Failed to read stored width:', error);
    return fallback;
  }
};

export function RecordDetailsPanel({ record, onClose }: RecordDetailsPanelProps) {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  const RECORD_PANEL_WIDTH_KEY = 'recordDetailsPanelWidth';
  const DEFAULT_RECORD_PANEL_WIDTH = 460;
  const MIN_RECORD_PANEL_WIDTH = 320;
  const MAX_RECORD_PANEL_WIDTH = 720;
  const [panelWidth, setPanelWidth] = useState(() =>
    getStoredPanelWidth(
      RECORD_PANEL_WIDTH_KEY,
      DEFAULT_RECORD_PANEL_WIDTH,
      MIN_RECORD_PANEL_WIDTH,
      MAX_RECORD_PANEL_WIDTH
    )
  );
  const [isResizing, setIsResizing] = useState(false);
  const resizingRef = useRef(false);
  const [openingFile, setOpeningFile] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState<{ path: string; url: string; mimeType?: string; isLocal?: boolean } | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewCleanupRef = useRef<(() => void) | null>(null);
  const { apiBase, bearerToken } = settings;
  const apiDisabledFilesMessage = getApiAccessDisabledMessage('Opening stored files');

  useEffect(() => {
    let cancelled = false;
    if (!record || !record.file_urls || record.file_urls.length === 0) {
      setFileUrls({});
      return;
    }

    const fetchUrls = async () => {
      const urls: Record<string, string> = {};
      const allowRemoteFetch = Boolean(settings.cloudStorageEnabled && apiBase && bearerToken);
      await Promise.all(
        record.file_urls.map(async (filePath) => {
          if (isAbsoluteUrl(filePath) || isLocalFilePath(filePath)) {
            urls[filePath] = filePath;
            return;
          }
          if (!allowRemoteFetch) {
            return;
          }
          try {
            const url = await getFileUrl(apiBase, bearerToken, filePath);
            if (url) {
              urls[filePath] = url;
            }
          } catch (error) {
            console.error('Failed to fetch file URL:', error);
          }
        })
      );
      if (!cancelled) {
        setFileUrls(urls);
      }
    };

    setFileUrls({});
    fetchUrls();
    return () => {
      cancelled = true;
    };
  }, [record, apiBase, bearerToken, settings.cloudStorageEnabled]);

  const status = record?._status || 'Ready';
  const statusDisplay = status === 'Uploading' ? 'Uploading…' : status;
  const createdMeta = getDateMeta(record?.created_at);
  const updatedMeta = getDateMeta(record?.updated_at);
  const hasRemoteFiles = Boolean(
    record?.file_urls?.some((filePath) => !isAbsoluteUrl(filePath) && !isLocalFilePath(filePath))
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(RECORD_PANEL_WIDTH_KEY, String(panelWidth));
    } catch (error) {
      console.warn('[RecordDetailsPanel] Failed to persist width:', error);
    }
  }, [panelWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleMouseMove = (event: MouseEvent) => {
      if (!resizingRef.current) return;
      const viewportWidth = window.innerWidth;
      const nextWidth = clampPanelWidth(
        viewportWidth - event.clientX,
        MIN_RECORD_PANEL_WIDTH,
        MAX_RECORD_PANEL_WIDTH
      );
      setPanelWidth(nextWidth);
    };

    const stopResizing = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.classList.remove('select-none');
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResizing);
    window.addEventListener('mouseleave', stopResizing);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('mouseleave', stopResizing);
    };
  }, []);

  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.classList.remove('select-none');
      resizingRef.current = false;
    };
  }, []);

  const handleResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!record) return;
    resizingRef.current = true;
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('select-none');
  };

  const cacheFileUrl = useCallback((filePath: string, url: string) => {
    setFileUrls((prev) => (prev[filePath] === url ? prev : { ...prev, [filePath]: url }));
  }, []);

  const applyPreviewSource = useCallback((filePath: string, source: FileSource) => {
    if (previewCleanupRef.current) {
      previewCleanupRef.current();
    }
    previewCleanupRef.current = source.revoke ?? null;
    setPreviewSource({ path: filePath, url: source.url, mimeType: source.mimeType, isLocal: source.isLocal });
  }, []);

  const clearPreview = useCallback(() => {
    if (previewCleanupRef.current) {
      previewCleanupRef.current();
      previewCleanupRef.current = null;
    }
    setPreviewSource(null);
    setPreviewError(null);
    setPreviewLoading(null);
  }, []);

  useEffect(() => {
    return () => {
      clearPreview();
    };
  }, [clearPreview]);

  useEffect(() => {
    clearPreview();
  }, [record, clearPreview]);

  const handleOpenFile = useCallback(
    async (filePath: string) => {
      if (!record) return;
      setOpeningFile(filePath);
      try {
        const source = await resolveFileSource({
          filePath,
          record,
          apiBase,
          bearerToken,
          fileUrls,
          cacheFileUrl,
          cloudStorageEnabled: settings.cloudStorageEnabled,
        });

        if (typeof window === 'undefined') {
          source.revoke?.();
          return;
        }

        const opened = window.open(source.url, '_blank', 'noopener,noreferrer');
        if (!opened) {
          source.revoke?.();
          toast({
            title: 'Pop-up blocked',
            description: 'Allow pop-ups in your browser to open files.',
            variant: 'destructive',
          });
          return;
        }

        if (source.revoke) {
          window.setTimeout(() => {
            source.revoke?.();
          }, 60_000);
        }
      } catch (error) {
        toast({
          title: 'Unable to open file',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setOpeningFile(null);
      }
    },
    [record, apiBase, bearerToken, fileUrls, cacheFileUrl, toast]
  );

  const handlePreviewFile = useCallback(
    async (filePath: string) => {
      if (!record) return;
      setPreviewError(null);
      setPreviewLoading(filePath);
      try {
        const source = await resolveFileSource({
          filePath,
          record,
          apiBase,
          bearerToken,
          fileUrls,
          cacheFileUrl,
          cloudStorageEnabled: settings.cloudStorageEnabled,
        });
        applyPreviewSource(filePath, source);
      } catch (error) {
        setPreviewError(error instanceof Error ? error.message : 'Unable to load preview.');
      } finally {
        setPreviewLoading(null);
      }
    },
    [record, apiBase, bearerToken, fileUrls, cacheFileUrl, applyPreviewSource]
  );

  return (
    <Sheet open={!!record} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex flex-col p-0"
        style={{ width: panelWidth, maxWidth: panelWidth }}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize record details panel"
          className="absolute left-0 top-0 z-10 h-full w-2 cursor-col-resize"
          onMouseDown={handleResizeStart}
        >
          <div
            className={`absolute inset-y-1/3 left-0 w-[3px] rounded-full transition-colors ${
              isResizing ? 'bg-primary' : 'bg-border/70 hover:bg-primary/60'
            }`}
          />
        </div>
        <SheetHeader className="p-4 border-b shrink-0">
          <SheetTitle>Record Details</SheetTitle>
          {record && (
            <SheetDescription className="text-xs text-muted-foreground">
              View details for record {record.id}
            </SheetDescription>
          )}
        </SheetHeader>
        {record && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-1 font-semibold">ID</div>
              <div className="text-sm break-words">{record.id}</div>
            </div>
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-1 font-semibold">Type</div>
              <div className="text-sm">{record.type || '—'}</div>
            </div>
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-1 font-semibold">Summary</div>
              {record.summary ? (
                <div className="text-sm whitespace-pre-wrap break-words">{record.summary}</div>
              ) : (
                <div className="text-sm text-muted-foreground">No summary available yet.</div>
              )}
            </div>
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-1 font-semibold">Status</div>
              <div className="text-sm">{statusDisplay}</div>
            </div>
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-1 font-semibold">Created</div>
              <div className="text-sm" title={createdMeta.absolute ?? undefined}>
                {createdMeta.display}
              </div>
            </div>
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-1 font-semibold">Updated</div>
              <div className="text-sm" title={updatedMeta.absolute ?? undefined}>
                {updatedMeta.display}
              </div>
            </div>
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-1 font-semibold">File URLs</div>
              {record.file_urls && record.file_urls.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {record.file_urls.map((filePath, idx) => {
                    const displayValue = fileUrls[filePath] || filePath;
                    const isOpening = openingFile === filePath;
                    return (
                      <div
                        key={`${filePath}-${idx}`}
                        className="flex items-center gap-2 rounded border border-border/60 bg-muted/40 px-2 py-1.5 text-xs"
                      >
                        <span className="flex-1 break-all">{displayValue}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenFile(filePath)}
                            disabled={isOpening}
                            aria-label={`Open file ${filePath}`}
                            className="shrink-0 text-xs"
                          >
                            {isOpening ? (
                              <>
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                Opening…
                              </>
                            ) : (
                              <>
                                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                Open
                              </>
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handlePreviewFile(filePath)}
                            disabled={previewLoading === filePath}
                            aria-label={`Preview file ${filePath}`}
                            className="shrink-0 text-xs"
                          >
                            {previewLoading === filePath ? (
                              <>
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                Loading
                              </>
                            ) : (
                              'Preview'
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm">—</div>
              )}
              {!settings.cloudStorageEnabled && hasRemoteFiles && (
                <p className="mt-2 text-xs text-muted-foreground/80">{apiDisabledFilesMessage}</p>
              )}
            </div>
            {(previewLoading || previewSource || previewError) && (
              <div className="mb-4 rounded border border-border/70 bg-muted/40">
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-xs font-semibold">
                  <span>
                    {previewLoading
                      ? `Loading preview for ${previewLoading}`
                      : previewSource
                        ? `Previewing ${previewSource.path}`
                        : 'Preview'}
                  </span>
                  {previewSource && (
                    <Button variant="ghost" size="sm" onClick={clearPreview}>
                      Close preview
                    </Button>
                  )}
                </div>
                {previewError && (
                  <div className="border-b border-border/60 px-3 py-2 text-xs text-destructive">{previewError}</div>
                )}
                {previewSource && (
                  <div className="p-2">
                    {previewSource.isLocal ? (
                      <object
                        key={previewSource.url}
                        data={previewSource.url}
                        type={previewSource.mimeType || 'application/octet-stream'}
                        title={`File preview for ${previewSource.path}`}
                        className="h-96 w-full rounded border border-border bg-background"
                      >
                        <p className="p-4 text-xs text-muted-foreground">
                          Preview unavailable. Use the Open button to download the file.
                        </p>
                      </object>
                    ) : (
                      <iframe
                        key={previewSource.url}
                        src={previewSource.url}
                        title={`File preview for ${previewSource.path}`}
                        sandbox="allow-same-origin allow-scripts allow-downloads allow-forms allow-popups"
                        referrerPolicy="no-referrer"
                        className="h-96 w-full rounded border border-border bg-background"
                        loading="lazy"
                      />
                    )}
                  </div>
                )}
                {previewLoading && !previewSource && (
                  <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Preparing preview…
                  </div>
                )}
              </div>
            )}
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-1 font-semibold">Properties</div>
              <PropertiesList data={record.properties || {}} />
            </div>
            {record._error && (
              <div className="mb-4 border-l-3 border-destructive pl-2">
                <div className="text-xs text-muted-foreground mb-1 font-semibold">Error</div>
                <div className="text-sm text-destructive">{record._error}</div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function getDateMeta(value?: string | null): { display: string; absolute: string | null } {
  if (!value) return { display: '—', absolute: null };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { display: '—', absolute: null };
  }
  return {
    display: formatRelativeTime(date),
    absolute: date.toLocaleString(),
  };
}

type FileSource = { url: string; revoke?: () => void; mimeType?: string; isLocal?: boolean };

interface ResolveFileSourceParams {
  filePath: string;
  record: NeotomaRecord | null;
  apiBase: string;
  bearerToken: string;
  fileUrls: Record<string, string>;
  cacheFileUrl?: (filePath: string, url: string) => void;
  cloudStorageEnabled: boolean;
}

async function resolveFileSource(params: ResolveFileSourceParams): Promise<FileSource> {
  const { filePath } = params;
  if (isLocalFilePath(filePath)) {
    if (!params.record) {
      throw new Error('Record context missing for local file.');
    }
    return resolveLocalFileSource(params.record, filePath);
  }
  return resolveRemoteFileSource(params);
}

async function resolveLocalFileSource(record: NeotomaRecord, filePath: string): Promise<FileSource> {
  const objectUrlHandle = await createLocalFileObjectUrl(filePath, {
    mimeType: getRecordMimeType(record, filePath),
  });
  if (!objectUrlHandle) {
    throw new Error('Local file unavailable. Browser storage may have been cleared.');
  }
  return {
    url: objectUrlHandle.url,
    revoke: objectUrlHandle.revoke,
    mimeType: getRecordMimeType(record, filePath),
    isLocal: true,
  };
}

async function resolveRemoteFileSource(params: ResolveFileSourceParams): Promise<FileSource> {
  const { filePath, apiBase, bearerToken, fileUrls, cacheFileUrl } = params;
  if (isAbsoluteUrl(filePath)) {
    return { url: filePath };
  }
  const cached = fileUrls[filePath];
  if (cached) {
    return { url: cached };
  }
  if (!params.cloudStorageEnabled) {
    throw new ApiAccessError('Opening stored files');
  }
  if (!apiBase || !bearerToken) {
    throw new Error('Set API base URL and Bearer Token to open stored files.');
  }
  const signed = await getFileUrl(apiBase, bearerToken, filePath);
  if (!signed) {
    throw new Error('Server did not return a signed URL.');
  }
  cacheFileUrl?.(filePath, signed);
  return { url: signed, mimeType: getRecordMimeType(params.record, filePath), isLocal: false };
}

function getRecordMimeType(record: NeotomaRecord | null, filePath: string): string | undefined {
  if (!record) return undefined;
  const properties = record.properties || {};
  const directMime =
    (typeof (properties as Record<string, unknown>).mime_type === 'string'
      ? (properties as Record<string, string>).mime_type
      : undefined) ||
    (typeof (properties as Record<string, unknown>).mimeType === 'string'
      ? (properties as Record<string, string>).mimeType
      : undefined);
  if (directMime) {
    return directMime;
  }
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.json')) return 'application/json';
  return undefined;
}


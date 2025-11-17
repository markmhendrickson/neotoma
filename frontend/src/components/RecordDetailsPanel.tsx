import type { NeotomaRecord } from '@/types/record';
import { getFileUrl } from '@/lib/api';
import { useSettings } from '@/hooks/useSettings';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { formatRelativeTime } from '@/utils/time';

interface RecordDetailsPanelProps {
  record: NeotomaRecord | null;
  onClose: () => void;
}

export function RecordDetailsPanel({ record, onClose }: RecordDetailsPanelProps) {
  const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
  const { settings } = useSettings();
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  const RECORD_PANEL_WIDTH_KEY = 'recordDetailsPanelWidth';
  const DEFAULT_RECORD_PANEL_WIDTH = 460;
  const MIN_RECORD_PANEL_WIDTH = 320;
  const MAX_RECORD_PANEL_WIDTH = 720;
  const [panelWidth, setPanelWidth] = useState(DEFAULT_RECORD_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizingRef = useRef(false);

  useEffect(() => {
    if (!record || !record.file_urls || record.file_urls.length === 0) {
      setFileUrls({});
      return;
    }

    const fetchUrls = async () => {
      const urls: Record<string, string> = {};
      for (const filePath of record.file_urls) {
        try {
          const url = await getFileUrl(settings.apiBase, settings.bearerToken, filePath);
          if (url) {
            urls[filePath] = url;
          }
        } catch (error) {
          console.error('Failed to fetch file URL:', error);
        }
      }
      setFileUrls(urls);
    };

    fetchUrls();
  }, [record, settings]);

  const status = record?._status || 'Ready';
  const statusDisplay = status === 'Uploading' ? 'Uploading…' : status;
  const createdMeta = getDateMeta(record?.created_at);
  const updatedMeta = getDateMeta(record?.updated_at);

  useIsomorphicLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(RECORD_PANEL_WIDTH_KEY);
      if (!stored) return;
      const parsed = Number.parseInt(stored, 10);
      if (!Number.isNaN(parsed)) {
        setPanelWidth(Math.min(Math.max(parsed, MIN_RECORD_PANEL_WIDTH), MAX_RECORD_PANEL_WIDTH));
      }
    } catch (error) {
      console.warn('[RecordDetailsPanel] Failed to read stored width:', error);
    }
  }, []);

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
      const nextWidth = Math.min(
        Math.max(viewportWidth - event.clientX, MIN_RECORD_PANEL_WIDTH),
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
                <div className="flex flex-col gap-1">
                  {record.file_urls.map((filePath, idx) => (
                    <div key={idx} className="px-2 py-1.5 bg-muted rounded text-xs break-all">
                      {fileUrls[filePath] ? (
                        <a
                          href={fileUrls[filePath]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {fileUrls[filePath]}
                        </a>
                      ) : (
                        filePath
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm">—</div>
              )}
            </div>
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-1 font-semibold">Properties</div>
              <pre className="bg-muted p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap break-words">
                {JSON.stringify(record.properties || {}, null, 2)}
              </pre>
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


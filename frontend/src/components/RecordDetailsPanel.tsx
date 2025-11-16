import type { NeotomaRecord } from '@/types/record';
import { getFileUrl } from '@/lib/api';
import { useSettings } from '@/hooks/useSettings';
import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

interface RecordDetailsPanelProps {
  record: NeotomaRecord | null;
  onClose: () => void;
}

export function RecordDetailsPanel({ record, onClose }: RecordDetailsPanelProps) {
  const { settings } = useSettings();
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});

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
  const createdAt = record?.created_at ? new Date(record.created_at).toLocaleString() : '—';
  const updatedAt = record?.updated_at ? new Date(record.updated_at).toLocaleString() : '—';

  return (
    <Sheet open={!!record} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[400px] sm:max-w-[400px] flex flex-col p-0">
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
        {record.summary && (
          <div className="mb-4">
            <div className="text-xs text-muted-foreground mb-1 font-semibold">Summary</div>
            <div className="text-sm whitespace-pre-wrap break-words">{record.summary}</div>
          </div>
        )}
        <div className="mb-4">
          <div className="text-xs text-muted-foreground mb-1 font-semibold">Status</div>
          <div className="text-sm">{statusDisplay}</div>
        </div>
        <div className="mb-4">
          <div className="text-xs text-muted-foreground mb-1 font-semibold">Created At</div>
          <div className="text-sm">{createdAt}</div>
        </div>
        <div className="mb-4">
          <div className="text-xs text-muted-foreground mb-1 font-semibold">Updated At</div>
          <div className="text-sm">{updatedAt}</div>
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


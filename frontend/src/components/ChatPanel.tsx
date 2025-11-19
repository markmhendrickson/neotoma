import { useState, useEffect, useRef, useMemo, MutableRefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowUp, Plus } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { useKeys } from '@/hooks/useKeys';
import type { DatastoreAPI } from '@/hooks/useDatastore';
import { uploadFile, sendChatMessage } from '@/lib/api';
import { processFileLocally } from '@/utils/file_processing';
import { formatRelativeTime } from '@/utils/time';
import type { NeotomaRecord } from '@/types/record';
import type { LocalRecord } from '@/store/types';
import { toast as notify } from 'sonner';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  recordsQueried?: NeotomaRecord[];
  isError?: boolean;
  errorCount?: number;
  isIntro?: boolean;
}

const CHAT_MESSAGES_STORAGE_KEY = 'chatPanelMessages';
const RECENT_RECORDS_STORAGE_KEY = 'chatPersistedRecentRecords';
const MAX_RECENT_RECORDS = 200;
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const INTRO_MESSAGE_CONTENT =
  'Neotoma remembers your data for rapid and comprehensive analysis with AI agents.\n\nCreate some records and start asking questions about them here.\n\nRecords are stored entirely on your device unless you opt for cloud storage.';

const createIntroMessage = (): ChatMessage => ({
  role: 'assistant',
  content: INTRO_MESSAGE_CONTENT,
  timestamp: new Date(),
  isIntro: true,
});

const ensureIntroMessage = (messages: ChatMessage[]): ChatMessage[] => {
  const hasIntro = messages.some(
    (msg) => msg.isIntro || msg.content === INTRO_MESSAGE_CONTENT
  );
  if (hasIntro) {
    return messages;
  }
  return [createIntroMessage(), ...messages];
};

const hashPrivateKey = (key?: Uint8Array | null) => {
  if (!key || key.length === 0) return 'anonymous';
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key[i];
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const getChatStorageKey = (privateKey?: Uint8Array | null) =>
  `${CHAT_MESSAGES_STORAGE_KEY}:${hashPrivateKey(privateKey)}`;

const extractUUIDs = (text: string): string[] => {
  if (!text) return [];
  const matches = text.match(UUID_REGEX);
  if (!matches) return [];
  return Array.from(new Set(matches.map((match) => match.toLowerCase())));
};

const getStoredMessages = (storageKey: string): ChatMessage[] => {
  if (typeof window === 'undefined') return [createIntroMessage()];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const normalized = parsed
      .map((msg) => ({
        ...msg,
        timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
      }))
      .filter(
        (msg): msg is ChatMessage =>
          (msg.role === 'assistant' || msg.role === 'user') &&
          typeof msg.content === 'string' &&
          msg.timestamp instanceof Date && !Number.isNaN(msg.timestamp.valueOf())
      );
    return ensureIntroMessage(normalized);
  } catch (error) {
    console.warn('[ChatPanel] Failed to restore chat history:', error);
    return [createIntroMessage()];
  }
};

type RecentRecordPayload = Pick<
  LocalRecord,
  'id' | 'type' | 'summary' | 'properties' | 'file_urls' | 'created_at' | 'updated_at'
>;

type SessionRecentRecord = {
  id: string;
  persisted: boolean;
  payload?: RecentRecordPayload;
  createdAt: string;
};

const loadPersistedRecentRecords = (): SessionRecentRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_RECORDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const cleaned: SessionRecentRecord[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry.id !== 'string') continue;
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      cleaned.push({
        id: entry.id,
        persisted: entry.persisted === false ? false : true,
        payload:
          entry.payload && typeof entry.payload === 'object'
            ? (entry.payload as RecentRecordPayload)
            : undefined,
        createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
      });
    }
    return cleaned;
  } catch (error) {
    console.warn('[ChatPanel] Failed to load recent records:', error);
    return [];
  }
};

const serializeLocalRecord = (record: LocalRecord): RecentRecordPayload => ({
  id: record.id,
  type: record.type,
  summary: record.summary ?? null,
  properties: record.properties,
  file_urls: record.file_urls,
  created_at: record.created_at,
  updated_at: record.updated_at,
});

interface ChatPanelProps {
  datastore: DatastoreAPI;
  onFileUploaded?: () => void;
  onFileUploadRef?: React.MutableRefObject<((files: FileList | null) => Promise<void>) | null>;
  onErrorRef?: React.MutableRefObject<((error: string) => void) | null>;
}

const clampPanelWidth = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const getStoredPanelWidth = (key: string, fallback: number, min: number, max: number) => {
  if (typeof window === 'undefined') return fallback;
  try {
    const storedWidth = window.localStorage.getItem(key);
    if (!storedWidth) return fallback;
    const parsed = Number.parseFloat(storedWidth);
    if (!Number.isNaN(parsed)) {
      return clampPanelWidth(parsed, min, max);
    }
    return fallback;
  } catch (error) {
    console.warn('[ChatPanel] Failed to read stored width:', error);
    return fallback;
  }
};

export function ChatPanel({
  datastore,
  onFileUploaded,
  onFileUploadRef,
  onErrorRef,
}: ChatPanelProps) {
  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, ed25519 } = useKeys();
  // Use bearer token from keys hook if available, fallback to settings
  const bearerToken = keysBearerToken || settings.bearerToken;
  const apiSyncEnabled = settings.apiSyncEnabled ?? settings.cloudStorageEnabled;
  const chatStorageKey = useMemo(() => getChatStorageKey(ed25519?.privateKey ?? null), [ed25519?.privateKey]);
  const CHAT_PANEL_WIDTH_KEY = 'chatPanelWidth';
  const DEFAULT_CHAT_WIDTH = 420;
  const MIN_CHAT_WIDTH = 300;
  const MAX_CHAT_WIDTH = 680;
  const [messages, setMessages] = useState<ChatMessage[]>(() => getStoredMessages(chatStorageKey));
  const [panelWidth, setPanelWidth] = useState(() =>
    getStoredPanelWidth(CHAT_PANEL_WIDTH_KEY, DEFAULT_CHAT_WIDTH, MIN_CHAT_WIDTH, MAX_CHAT_WIDTH));
  const [isResizing, setIsResizing] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const handleFileUploadRef = useRef<typeof handleFileUpload | null>(null);
  const errorCountsRef = useRef<Map<string, number>>(new Map());
  const uploadToastIdsRef = useRef<Map<File, string | number>>(new Map());
  const datastoreWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const isResizingRef = useRef(false);
  const activeChatStorageKeyRef = useRef(chatStorageKey);
  const recentRecordsRef = useRef<SessionRecentRecord[]>(
    typeof window === 'undefined' ? [] : loadPersistedRecentRecords()
  );

  useEffect(() => {
    if (recentRecordsRef.current.length > MAX_RECENT_RECORDS) {
      recentRecordsRef.current = recentRecordsRef.current.slice(0, MAX_RECENT_RECORDS);
      persistRecentRecordsToStorage(recentRecordsRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

const persistRecentRecordsToStorage = (records: SessionRecentRecord[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_RECORDS_STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.warn('[ChatPanel] Failed to persist recent records:', error);
  }
};

const mergeRecentRecords = (
  recentRecordsRef: MutableRefObject<SessionRecentRecord[]>,
  incoming: SessionRecentRecord[]
) => {
  if (!incoming.length) {
    return;
  }

  const normalize = (entry: SessionRecentRecord): SessionRecentRecord => ({
    id: entry.id,
    persisted: entry.persisted,
    payload: entry.persisted ? undefined : entry.payload,
    createdAt: entry.createdAt || new Date().toISOString(),
  });

  const merged = new Map<string, SessionRecentRecord>();

  recentRecordsRef.current.forEach((entry) => {
    if (!entry?.id) return;
    merged.set(entry.id, normalize(entry));
  });

  incoming.forEach((entry) => {
    if (!entry?.id) return;
    const normalized = normalize(entry);
    const existing = merged.get(entry.id);
    if (existing) {
      const createdAt =
        new Date(normalized.createdAt).getTime() >= new Date(existing.createdAt).getTime()
          ? normalized.createdAt
          : existing.createdAt;
      merged.set(entry.id, {
        id: entry.id,
        persisted: normalized.persisted,
        payload: normalized.persisted ? undefined : normalized.payload ?? existing.payload,
        createdAt,
      });
    } else {
      merged.set(entry.id, normalized);
    }
  });

  const ordered = Array.from(merged.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_RECENT_RECORDS);

  recentRecordsRef.current = ordered;
  persistRecentRecordsToStorage(ordered);
};

  const registerRecentRecord = (record: LocalRecord, persistedFlag: boolean) => {
    if (!record?.id) return;
    const payload = persistedFlag ? undefined : serializeLocalRecord(record);
    const newEntry: SessionRecentRecord = {
      id: record.id,
      persisted: persistedFlag,
      payload,
      createdAt: new Date().toISOString(),
    };
    mergeRecentRecords(recentRecordsRef, [newEntry]);
  };

  const registerInlineLocalRecords = (records: LocalRecord[]) => {
    if (!records.length) return;
    const entries = records
      .filter((record) => Boolean(record?.id))
      .map((record) => ({
        id: record.id,
        persisted: false,
        payload: serializeLocalRecord(record),
        createdAt: new Date().toISOString(),
      }));
    mergeRecentRecords(recentRecordsRef, entries);
  };

  const getRecentRecordsForRequest = () => {
    return recentRecordsRef.current.map((entry) => ({
      id: entry.id,
      persisted: entry.persisted,
      ...(entry.persisted ? {} : entry.payload ? { payload: entry.payload } : {}),
    }));
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(CHAT_PANEL_WIDTH_KEY, String(panelWidth));
    } catch (error) {
      console.warn('[ChatPanel] Failed to persist width:', error);
    }
  }, [panelWidth]);

  useEffect(() => {
    if (chatStorageKey === activeChatStorageKeyRef.current) {
      return;
    }
    const storedMessages = getStoredMessages(chatStorageKey);
    activeChatStorageKeyRef.current = chatStorageKey;
    errorCountsRef.current = new Map();
    setMessages(storedMessages);
  }, [chatStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const serializable = messages.map((msg) => ({
        ...msg,
        timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp,
      }));
      window.localStorage.setItem(activeChatStorageKeyRef.current, JSON.stringify(serializable));
    } catch (error) {
      console.warn('[ChatPanel] Failed to persist chat history:', error);
    }
  }, [messages]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingRef.current || !panelRef.current) return;
      const rect = panelRef.current.getBoundingClientRect();
      const nextWidth = clampPanelWidth(event.clientX - rect.left, MIN_CHAT_WIDTH, MAX_CHAT_WIDTH);
      setPanelWidth(nextWidth);
    };

    const stopResizing = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
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
      isResizingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (errorCountsRef.current.size > 0) return;
    const existingErrors = new Map<string, number>();
    messages.forEach((msg) => {
      if (msg.isError) {
        const key = msg.content.toLowerCase();
        existingErrors.set(key, msg.errorCount ?? 1);
      }
    });
    errorCountsRef.current = existingErrors;
  }, [messages]);

  const handleResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    isResizingRef.current = true;
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('select-none');
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle paste events for file uploads
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // Don't handle paste if user is typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        // Create a FileList-like object from the files array
        const dataTransfer = new DataTransfer();
        files.forEach(file => dataTransfer.items.add(file));
        handleFileUploadRef.current?.(dataTransfer.files);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, []); // handleFileUploadRef is stable, latest function is accessed via ref

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const formatMessage = (content: string) => {
    const safeContent = escapeHtml(content);
    return safeContent
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  };

  const isCsvFile = (file: File) => {
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    return type.includes('csv') || name.endsWith('.csv');
  };

  const autoResizeTextarea = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 320)}px`;
  };

  useEffect(() => {
    autoResizeTextarea();
  }, [input]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    if (!datastore.initialized) {
      const errorMsg = datastore.error 
        ? `Datastore initialization failed: ${datastore.error.message}. Please check the console for details.`
        : 'Datastore is initializing. Please wait a moment and try again.';
      console.warn('[File Upload] Datastore not ready:', {
        initialized: datastore.initialized,
        error: datastore.error,
      });
      addMessage('assistant', errorMsg);
      return;
    }

    const fileArray = Array.from(files);

    const processFile = async (file: File) => {
      const toastId = notify.loading(`Uploading ${file.name}`, {
        description: apiSyncEnabled
          ? 'Analyzing via API and saving to datastore'
          : 'Processing locally',
        duration: 60000,
      });
      uploadToastIdsRef.current.set(file, toastId);

      try {
        let localRecord: LocalRecord;
        let additionalLocalRecords: LocalRecord[] = [];
        
        // Try to sync via API when bearer token is available and cloud sync is enabled
        if (bearerToken && apiSyncEnabled) {
          try {
            // Full sync: upload and get analyzed record
            const csvRowPreference = isCsvFile(file) ? settings.csvRowRecordsEnabled : undefined;
            const uploadOptions =
              typeof csvRowPreference === 'boolean' ? { csvRowRecords: csvRowPreference } : undefined;
            const analyzedRecord = await uploadFile(settings.apiBase, bearerToken, file, uploadOptions);
            // Convert API record to local record format with AI-analyzed type and properties
            localRecord = {
              id: analyzedRecord.id,
              type: analyzedRecord.type,
              summary: analyzedRecord.summary ?? null,
              properties: analyzedRecord.properties,
              file_urls: analyzedRecord.file_urls,
              embedding: analyzedRecord.embedding || null,
              created_at: analyzedRecord.created_at,
              updated_at: analyzedRecord.updated_at,
            };
          } catch (error) {
            // If API analysis fails, fall back to local processing
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            // Only log if it's not a connection error (those are expected if backend is down)
            if (!errorMessage.includes('not available') && !errorMessage.includes('Failed to fetch')) {
              console.warn('[File Upload] API analysis failed, using local processing:', error);
            }
            const basicResult = await processFileLocally({
              file,
              csvRowRecordsEnabled: settings.csvRowRecordsEnabled,
            });
            localRecord = basicResult.primaryRecord;
            additionalLocalRecords = basicResult.additionalRecords;
          }
        } else {
          // Process file locally without API analysis
          const basicResult = await processFileLocally({
            file,
            csvRowRecordsEnabled: settings.csvRowRecordsEnabled,
          });
          localRecord = basicResult.primaryRecord;
          additionalLocalRecords = basicResult.additionalRecords;
        }
        
        const recordsToSave = [localRecord, ...additionalLocalRecords];
        // Store in local datastore (serialize writes to avoid OPFS handle conflicts)
        const enqueue = datastoreWriteQueueRef.current.then(async () => {
          for (const record of recordsToSave) {
            await datastore.putRecord(record);
          }
        });
        datastoreWriteQueueRef.current = enqueue.catch(() => {});
        try {
          await enqueue;
        } catch (putError) {
          const putErrorMessage = putError instanceof Error ? putError.message : 'Failed to save record';
          console.error('[File Upload] Failed to save record to datastore:', putError);
          throw new Error(`Failed to save record: ${putErrorMessage}`);
        }

        const recordPersisted = Boolean(apiSyncEnabled);
        recordsToSave.forEach((record) => registerRecentRecord(record, recordPersisted));

        const createdRowsMessage =
          additionalLocalRecords.length > 0
            ? ` Created ${additionalLocalRecords.length} row records.`
            : '';
        let localMessage = `File "${file.name}" saved locally`;
        if (localRecord.summary) {
          localMessage += `: ${localRecord.summary}`;
          if (!createdRowsMessage) {
            localMessage += '.';
          }
        } else {
          localMessage += '.';
        }
        if (createdRowsMessage && !localMessage.trim().endsWith('.')) {
          localMessage += '.';
        }
        const message = apiSyncEnabled
          ? `File "${file.name}" analyzed and saved locally with type "${localRecord.type}".${createdRowsMessage}`
          : `${localMessage}${createdRowsMessage}`;

        notify.success(`Saved ${file.name}`, {
          id: toastId,
          description: message.replace(`File "${file.name}" `, ''),
          duration: 4000,
        });
        uploadToastIdsRef.current.delete(file);

        addMessage('assistant', message);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[File Upload] Error processing file:', file.name, error);
        
        // Determine if it's a timeout or other error
        const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('Request timeout');
        const displayMessage = isTimeout
          ? `Failed to process "${file.name}": Datastore operation timed out. The file may still be processing.`
          : `Failed to process "${file.name}": ${errorMessage}`;
        
        notify.error(`Failed ${file.name}`, {
          id: toastId,
          description: displayMessage.replace(`Failed to process "${file.name}": `, ''),
          duration: 6000,
        });
        uploadToastIdsRef.current.delete(file);

        addMessage('assistant', `Error: ${displayMessage}`);
      }
    };

    await Promise.all(fileArray.map((file) => processFile(file)));

    if (onFileUploaded) {
      setTimeout(() => onFileUploaded(), 100);
    }
  };

  // Keep handleFileUpload ref up to date
  handleFileUploadRef.current = handleFileUpload;
  // Also expose to parent component if provided
  if (onFileUploadRef) {
    onFileUploadRef.current = handleFileUpload;
  }

  const addMessage = (role: 'user' | 'assistant', content: string, recordsQueried?: NeotomaRecord[]) => {
    const isError = role === 'assistant' && (
      content.toLowerCase().startsWith('error:') || 
      content.toLowerCase().startsWith('error ') ||
      content.toLowerCase().includes('error:') ||
      content.toLowerCase().includes('failed')
    );
    
    if (isError) {
      // Track error counts
      const errorKey = content.toLowerCase();
      const currentCount = errorCountsRef.current.get(errorKey) || 0;
      const newCount = currentCount + 1;
      errorCountsRef.current.set(errorKey, newCount);
      
      // Check if this error already exists in messages
      setMessages((prev) => {
        const errorIndex = prev.findIndex(
          (msg) => msg.isError && msg.content.toLowerCase() === errorKey
        );
        
        if (errorIndex >= 0) {
          // Update existing error message with new count
          const updated = [...prev];
          updated[errorIndex] = {
            ...updated[errorIndex],
            errorCount: newCount,
            timestamp: new Date(), // Update timestamp to show it's recent
          };
          return updated;
        } else {
          // Add new error message
          return [...prev, { 
            role, 
            content, 
            timestamp: new Date(), 
            recordsQueried,
            isError: true,
            errorCount: 1,
          }];
        }
      });
      
      console.error('[Chat Error]', content, newCount > 1 ? `(occurred ${newCount} times)` : '');
    } else {
      // Regular message
      setMessages((prev) => [...prev, { role, content, timestamp: new Date(), recordsQueried }]);
    }
  };

  // Expose error handler via ref
  const handleError = useRef<((error: string) => void) | null>(null);
  handleError.current = (error: string) => {
    console.error('[Error]', error);
    addMessage('assistant', `Error: ${error}`);
  };
  
  useEffect(() => {
    if (onErrorRef) {
      onErrorRef.current = handleError.current;
    }
  }, [onErrorRef]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    addMessage('user', userMessage);
    setIsLoading(true);

    if (!apiSyncEnabled) {
      setIsLoading(false);
      addMessage(
        'assistant',
        'Chat unavailable while API sync is disabled. Enable Cloud Storage in Settings to ask questions about your data.'
      );
      return;
    }

    if (!bearerToken) {
      setIsLoading(false);
      addMessage('assistant', 'Please set your Bearer Token in the settings above to use the chat feature.');
      return;
    }

    try {
      const messagesToSend = [
        ...messages
          .filter((m) => !m.isIntro)
          .map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: userMessage },
      ];

      const mentionedIds = extractUUIDs(userMessage);
      if (mentionedIds.length) {
        if (datastore.initialized) {
          const inlineRecords: LocalRecord[] = [];
          for (const id of mentionedIds) {
            try {
              const record = await datastore.getRecord(id);
              if (record) {
                inlineRecords.push(record);
              }
            } catch (error) {
              console.warn('[ChatPanel] Failed to load local record for chat', { id, error });
            }
          }
          if (inlineRecords.length > 0) {
            registerInlineLocalRecords(inlineRecords);
          }
        } else {
          console.warn('[ChatPanel] Datastore not initialized; cannot hydrate local records for IDs', {
            ids: mentionedIds,
          });
        }
      }

      const recentRecordsPayload = getRecentRecordsForRequest();
      const response = await sendChatMessage(settings.apiBase, bearerToken, {
        messages: messagesToSend,
        recentRecords: recentRecordsPayload,
      });
      addMessage('assistant', response.message?.content || 'No response received', response.records_queried || undefined);
    } catch (error) {
      addMessage('assistant', `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <aside
      ref={panelRef}
      className="relative shrink-0 bg-muted/30 border-r border-border/60 flex flex-col overflow-hidden overflow-x-hidden"
      style={{ width: panelWidth }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat panel"
        onMouseDown={handleResizeStart}
        className="absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize"
      >
        <div
          className={`absolute inset-y-1/3 right-0 w-[3px] rounded-full transition-colors ${
            isResizing ? 'bg-primary' : 'bg-border/70 hover:bg-primary/60'
          }`}
        />
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 flex flex-col gap-3">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col gap-1 max-w-[85%] ${
              msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'
            }`}
          >
            <div
              className={`px-3.5 py-2.5 rounded-xl text-sm shadow-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm shadow-none'
                  : msg.isError
                  ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-bl-sm'
                  : 'bg-card text-foreground border border-border/60 rounded-bl-sm'
              }`}
            >
              <div dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
              {msg.isError && msg.errorCount && msg.errorCount > 1 && (
                <div className="text-xs text-destructive/70 mt-1 font-medium">
                  (occurred {msg.errorCount} times)
                </div>
              )}
            </div>
            {msg.recordsQueried && msg.recordsQueried.length > 0 && (
              <div className="px-2.5 py-1.5 bg-accent text-accent-foreground rounded-md text-xs font-semibold mt-2">
                Found {msg.recordsQueried.length} record{msg.recordsQueried.length !== 1 ? 's' : ''}
              </div>
            )}
            <div
              className="text-xs text-muted-foreground px-1"
              title={msg.timestamp.toLocaleString()}
            >
              {formatRelativeTime(msg.timestamp)}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex flex-col gap-1 max-w-[85%] self-start items-start">
            <div className="px-3 py-2 rounded-xl rounded-bl-sm bg-muted text-foreground text-sm">
              <span className="inline-flex gap-1 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.4s]" />
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 shrink-0 bg-transparent">
        <div
          className="group/composer rounded-[28px] border border-border/70 bg-background shadow-sm px-4 py-3 space-y-3 shadow-[0_-20px_30px_-15px_rgba(241,245,249,0.9)] transform origin-bottom transition-all duration-300 focus-within:-translate-y-2"
        >
          <div className="transition-[min-height] duration-300 min-h-[72px] group-focus-within/composer:min-h-[144px]">
            <Textarea
              ref={textareaRef}
              placeholder="Message about records..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              className="min-h-[72px] max-h-[320px] resize-none border-none bg-transparent px-0 text-base text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground overflow-hidden"
              style={{ height: 'auto' }}
              onInput={autoResizeTextarea}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-9 w-9 rounded-full border border-border/70 bg-white text-muted-foreground shadow-none hover:bg-white"
                onClick={triggerFileDialog}
                disabled={isLoading}
              >
                <Plus className="h-4 w-4" />
                <span className="sr-only">Attach files</span>
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                size="icon"
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="h-9 w-9 rounded-full bg-[#8f8f8f] text-white shadow-none hover:bg-[#828282] disabled:bg-muted disabled:text-muted-foreground"
              >
                <ArrowUp className="h-4 w-4" />
                <span className="sr-only">Send message</span>
              </Button>
            </div>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            multiple
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
          />
        </div>
      </div>
    </aside>
  );
}


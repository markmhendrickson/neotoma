import { useState, useEffect, useRef, useCallback, useMemo, MutableRefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowUp } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { useKeys } from '@/hooks/useKeys';
import type { DatastoreAPI } from '@/hooks/useDatastore';
import { uploadFile, sendChatMessage, analyzeFile } from '@/lib/api';
import { processFileLocally } from '@/utils/file_processing';
import { formatRelativeTime } from '@/utils/time';
import { normalizeRecord, type NeotomaRecord } from '@/types/record';
import type { LocalRecord } from '@/store/types';
import { localToNeotoma } from '@/utils/record_conversion';
import { recordMatchesQuery, tokenizeQuery } from '@/utils/record_search';
import { toast as notify } from 'sonner';
import { encryptForStorage, decryptFromStorage, setEncryptionKeys } from '@/store/encryption';
import type { X25519KeyPair, Ed25519KeyPair } from '../../../src/crypto/types.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  recordsQueried?: NeotomaRecord[];
  recordsTotalCount?: number;
  isError?: boolean;
  errorCount?: number;
  isIntro?: boolean;
}

const CHAT_MESSAGES_STORAGE_KEY = 'chatPanelMessages';
const RECENT_RECORDS_STORAGE_KEY = 'chatPersistedRecentRecords';
const MAX_RECENT_RECORDS = 200;
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ENCRYPTED_PREFIX = 'encrypted:';
const COUNT_QUERY_STOP_WORDS = new Set([
  'how',
  'many',
  'record',
  'records',
  'with',
  'contain',
  'containing',
  'in',
  'any',
  'value',
  'values',
  'the',
  'a',
  'an',
  'are',
  'is',
  'there',
  'currently',
  'stored',
  'locally',
  'local',
  'do',
  'does',
  'of',
  'have',
  'has',
  'show',
  'please',
  'maybe',
  'help',
  'number',
  'total',
  'tell',
  'give',
]);

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
const SUMMARY_FIELD_PRIORITY = [
  'summary',
  'title',
  'name',
  'description',
  'note',
  'subject',
  'filename',
  'file_name',
  'label',
];
const MAX_SUMMARY_CHARS = 320;

const truncateSummary = (value: string) => {
  if (value.length <= MAX_SUMMARY_CHARS) return value;
  return `${value.slice(0, MAX_SUMMARY_CHARS - 3)}...`;
};

const extractKeywordQuery = (message: string): string => {
  const quoted = Array.from(message.matchAll(/"([^"]+)"/g))
    .map((match) => match[1]?.trim())
    .filter(Boolean);
  if (quoted.length > 0) {
    return quoted.join(' ');
  }
  const tokens = tokenizeQuery(message)
    .map((token) => token.replace(/[^a-z0-9-]/g, ''))  // Keep hyphens for compound words
    .filter(Boolean)
    .filter((token) => !COUNT_QUERY_STOP_WORDS.has(token));
  
  // Don't singularize - let fuzzy matching handle variations
  // The fuzzy matcher already handles "pullups" vs "pull-ups" via normalization
  return tokens.join(' ');
};

const getSummaryFromRecord = (record: LocalRecord): string | null => {
  if (typeof record.summary === 'string' && record.summary.trim().length > 0) {
    return truncateSummary(record.summary.trim());
  }
  const properties = record.properties || {};
  for (const field of SUMMARY_FIELD_PRIORITY) {
    const candidate = properties[field];
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return truncateSummary(candidate.trim());
    }
  }
  const firstStringValue = Object.values(properties).find(
    (value) => typeof value === 'string' && value.trim().length > 0
  );
  if (typeof firstStringValue === 'string') {
    return truncateSummary(firstStringValue.trim());
  }
  if (record.type) {
    return truncateSummary(`${record.type} record`);
  }
  return null;
};

const appendUploadDetails = (
  fileName: string,
  record: LocalRecord | null,
  additionalCount: number,
  destinationLabel: string
) => {
  if (!record) {
    if (additionalCount > 0) {
      return `File "${fileName}" was saved ${destinationLabel}: Created ${additionalCount} row records.`;
    }
    return `File "${fileName}" was saved ${destinationLabel}.`;
  }
  const summarySnippet = getSummaryFromRecord(record) ?? 'Summary unavailable.';
  const rowsMessage = additionalCount > 0 ? ` Created ${additionalCount} row records.` : '';
  return `File "${fileName}" was saved ${destinationLabel}: ${summarySnippet}${rowsMessage}`;
};

const getDestinationLabel = (cloudStorageEnabled: boolean) =>
  cloudStorageEnabled ? 'to Supabase (cloud storage)' : 'locally';

const extractUUIDs = (text: string): string[] => {
  if (!text) return [];
  const matches = text.match(UUID_REGEX);
  if (!matches) return [];
  return Array.from(new Set(matches.map((match) => match.toLowerCase())));
};

const getStoredMessages = async (x25519: X25519KeyPair | null, ed25519: Ed25519KeyPair | null): Promise<ChatMessage[]> => {
  if (typeof window === 'undefined') return [createIntroMessage()];
  try {
    const raw = window.localStorage.getItem(CHAT_MESSAGES_STORAGE_KEY);
    if (!raw) return [createIntroMessage()];

    let parsed: any;
    
    // Check if encrypted
    if (raw.startsWith(ENCRYPTED_PREFIX)) {
      if (!x25519 || !ed25519) {
        // Keys not available yet - return empty array, will retry when keys load
        return [];
      }
      
      try {
        // Initialize encryption keys
        await setEncryptionKeys(x25519, ed25519);
        
        // Decrypt: remove prefix, decode base64, decrypt
        const encryptedBase64 = raw.slice(ENCRYPTED_PREFIX.length);
        const binaryString = atob(encryptedBase64);
        const encryptedBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          encryptedBytes[i] = binaryString.charCodeAt(i);
        }
        const decryptedBytes = await decryptFromStorage(encryptedBytes);
        const decryptedText = new TextDecoder().decode(decryptedBytes);
        parsed = JSON.parse(decryptedText);
      } catch (error) {
        console.warn('[ChatPanel] Failed to decrypt chat history:', error);
        return [createIntroMessage()];
      }
    } else {
      // Legacy unencrypted format
      parsed = JSON.parse(raw);
    }
    
    if (!Array.isArray(parsed)) return [createIntroMessage()];

    const normalized = parsed
      .map((msg) => ({
        ...msg,
        timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
      }))
      .filter(
        (msg): msg is ChatMessage =>
          (msg.role === 'assistant' || msg.role === 'user') &&
          typeof msg.content === 'string' &&
          msg.timestamp instanceof Date && !Number.isNaN(msg.timestamp.valueOf()) &&
          !msg.isError // Filter out error messages
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
  onFileUploaded?: (recordId: string) => void | Promise<void>;
  onFileUploadRef?: React.MutableRefObject<((files: FileList | null) => Promise<void>) | null>;
  onErrorRef?: React.MutableRefObject<((error: string) => void) | null>;
  activeSearchQuery?: string;
  activeTypeFilter?: string;
  allRecords?: NeotomaRecord[];
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
  activeSearchQuery,
  activeTypeFilter,
  allRecords,
}: ChatPanelProps) {
  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, x25519, ed25519, loading: keysLoading } = useKeys();
  // Use bearer token from keys hook if available, fallback to settings
  const bearerToken = keysBearerToken || settings.bearerToken;
  const keyIdentifier = useMemo(() => hashPrivateKey(ed25519?.privateKey ?? null), [ed25519?.privateKey]);
  const CHAT_PANEL_WIDTH_KEY = 'chatPanelWidth';
  const DEFAULT_CHAT_WIDTH = 420;
  const MIN_CHAT_WIDTH = 300;
  const MAX_CHAT_WIDTH = 680;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
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
  const errorToastIdsRef = useRef<Map<string, string | number>>(new Map());
  const uploadToastIdsRef = useRef<Map<File, string | number>>(new Map());
  const isResizingRef = useRef(false);
  const recentRecordsRef = useRef<SessionRecentRecord[]>(
    typeof window === 'undefined' ? [] : loadPersistedRecentRecords()
  );

  // Reset messagesLoaded when keys change to trigger reload
  useEffect(() => {
    setMessagesLoaded(false);
  }, [keyIdentifier]);

  // Load messages on mount or when keys become available
  useEffect(() => {
    if (messagesLoaded || keysLoading) return;
    
    async function loadMessages() {
      const loaded = await getStoredMessages(x25519 || null, ed25519 || null);
      setMessages(loaded);
      setMessagesLoaded(true);
    }
    
    loadMessages();
  }, [x25519, ed25519, messagesLoaded, keysLoading]);

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
    if (typeof window === 'undefined' || !messagesLoaded) return;
    
    async function persistMessages() {
      try {
        const serializable = messages.map((msg) => ({
          ...msg,
          timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp,
        }));
        const jsonString = JSON.stringify(serializable);
        
        // Encrypt if keys are available
        if (x25519 && ed25519) {
          try {
            await setEncryptionKeys(x25519, ed25519);
            const jsonBytes = new TextEncoder().encode(jsonString);
            const encryptedBytes = await encryptForStorage(jsonBytes);
            // Convert Uint8Array to base64 string (chunked to avoid stack overflow)
            let binaryString = '';
            const chunkSize = 8192;
            for (let i = 0; i < encryptedBytes.length; i += chunkSize) {
              const chunk = encryptedBytes.slice(i, i + chunkSize);
              binaryString += String.fromCharCode(...Array.from(chunk));
            }
            const encryptedBase64 = btoa(binaryString);
            window.localStorage.setItem(CHAT_MESSAGES_STORAGE_KEY, ENCRYPTED_PREFIX + encryptedBase64);
          } catch (error) {
            console.warn('[ChatPanel] Encryption failed, storing unencrypted:', error);
            window.localStorage.setItem(CHAT_MESSAGES_STORAGE_KEY, jsonString);
          }
        } else {
          // No keys available, store unencrypted
          window.localStorage.setItem(CHAT_MESSAGES_STORAGE_KEY, jsonString);
        }
      } catch (error) {
        console.warn('[ChatPanel] Failed to persist chat history:', error);
      }
    }
    
    persistMessages();
  }, [messages, x25519, ed25519, messagesLoaded]);

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

  const autoResizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // Reset height to auto to get accurate scrollHeight
    textarea.style.height = 'auto';
    // Set height based on content, capped at max-h-[320px] (320px)
    const newHeight = Math.min(textarea.scrollHeight, 320);
    textarea.style.height = `${newHeight}px`;
  }, []);

  useEffect(() => {
    autoResizeTextarea();
  }, [input, autoResizeTextarea]);

  // Also resize on mount
  useEffect(() => {
    autoResizeTextarea();
  }, [autoResizeTextarea]);

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
      const hasBearerToken = Boolean(bearerToken);
      const shouldUseCloudStorage = hasBearerToken && settings.cloudStorageEnabled;
      const canCallOpenApi = hasBearerToken;

      const toastId = notify.loading(`Uploading ${file.name}`, {
        description: shouldUseCloudStorage
          ? 'Uploading to API and awaiting analysis…'
          : canCallOpenApi
            ? 'Uploading for AI analysis (storing locally)…'
            : settings.cloudStorageEnabled
              ? 'Processing locally (Cloud storage requires a Bearer Token)…'
              : 'Processing locally',
        duration: 60000,
      });
      const updateUploadToast = (description: string) => {
        notify.loading(`Uploading ${file.name}`, {
          id: toastId,
          description,
          duration: 60000,
        });
      };
      uploadToastIdsRef.current.set(file, toastId);

      try {
        let localRecord: LocalRecord | null = null;
        let additionalLocalRecords: LocalRecord[] = [];

        const runLocalProcessing = async (overrides?: {
          type?: string;
          summary?: string | null;
          properties?: Record<string, unknown>;
        }) => {
          updateUploadToast(overrides ? 'Applying analysis locally…' : 'Analyzing file locally…');
          const basicResult = await processFileLocally({
            file,
            csvRowRecordsEnabled: settings.csvRowRecordsEnabled,
          });
          updateUploadToast('Preparing local records…');
          if (basicResult.primaryRecord) {
            localRecord = {
              ...basicResult.primaryRecord,
              ...(overrides?.type ? { type: overrides.type } : {}),
              ...(overrides
                ? { summary: overrides.summary ?? basicResult.primaryRecord.summary }
                : {}),
              ...(overrides?.properties
                ? {
                    properties: {
                      ...(basicResult.primaryRecord.properties || {}),
                      ...overrides.properties,
                    },
                  }
                : {}),
            };
          } else {
            localRecord = null;
          }
          additionalLocalRecords = basicResult.additionalRecords;
        };

        if (shouldUseCloudStorage) {
          try {
              const csvRowPreference = isCsvFile(file) ? settings.csvRowRecordsEnabled : undefined;
              const uploadOptions =
                typeof csvRowPreference === 'boolean' ? { csvRowRecords: csvRowPreference } : undefined;
              updateUploadToast('Uploading file to API and waiting for analysis…');
              const analyzedRecord = await uploadFile(settings.apiBase, bearerToken!, file, uploadOptions);
              updateUploadToast('Applying AI-analyzed results locally…');
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
              if (analyzedRecord.row_records && analyzedRecord.row_records.length > 0) {
                updateUploadToast(`Linking ${analyzedRecord.row_records.length} row records…`);
                additionalLocalRecords = analyzedRecord.row_records.map(row => ({
                  id: row.id,
                  type: row.type,
                  summary: row.summary,
                  properties: {
                    csv_origin: {
                      parent_record_id: analyzedRecord.id,
                      row_index: row.row_index,
                    },
                  },
                  file_urls: analyzedRecord.file_urls || [],
                  embedding: null,
                  created_at: analyzedRecord.created_at,
                  updated_at: analyzedRecord.updated_at,
                }));
              }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            if (!errorMessage.includes('not available') && !errorMessage.includes('Failed to fetch')) {
              console.warn('[File Upload] API upload failed, using local processing:', error);
            }
            updateUploadToast('API unavailable, processing locally…');
            await runLocalProcessing();
          }
        } else if (canCallOpenApi) {
          try {
            updateUploadToast('Uploading file for AI analysis…');
            const analysis = await analyzeFile(settings.apiBase, bearerToken!, file);
            await runLocalProcessing({
              type: analysis.type,
              summary: analysis.summary ?? null,
              properties: analysis.properties,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.warn('[File Upload] analyze_file failed, falling back to local processing:', errorMessage);
            updateUploadToast('API unavailable, processing locally…');
            await runLocalProcessing();
          }
        } else {
          updateUploadToast('Processing file locally…');
          await runLocalProcessing();
        }

        const recordsToSave = localRecord
          ? [localRecord, ...additionalLocalRecords]
          : additionalLocalRecords;
        if (recordsToSave.length === 0) {
          throw new Error('File processing did not produce any records.');
        }
        
        // Save records sequentially so they appear in the table one by one
        try {
          for (let index = 0; index < recordsToSave.length; index += 1) {
            const record = recordsToSave[index];
            if (recordsToSave.length > 1) {
              updateUploadToast(`Saving record ${index + 1} of ${recordsToSave.length} locally…`);
            } else {
              updateUploadToast('Saving record locally…');
            }
            await datastore.putRecord(record);
            
            // Notify parent to append this record to the table
            if (onFileUploaded) {
              await onFileUploaded(record.id);
            }
          }
        } catch (putError) {
          const putErrorMessage = putError instanceof Error ? putError.message : 'Failed to save record';
          console.error('[File Upload] Failed to save record to datastore:', putError);
          throw new Error(`Failed to save record: ${putErrorMessage}`);
        }

        const recordPersisted = shouldUseCloudStorage;
        recordsToSave.forEach((record) => registerRecentRecord(record, recordPersisted));

        updateUploadToast('Finalizing upload…');
        const destinationLabel = getDestinationLabel(shouldUseCloudStorage);
        const message = appendUploadDetails(
          file.name,
          localRecord,
          additionalLocalRecords.length,
          destinationLabel
        );

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

    // Process files in parallel, but each file saves records sequentially
    await Promise.all(fileArray.map((file) => processFile(file)));
  };

  // Keep handleFileUpload ref up to date
  handleFileUploadRef.current = handleFileUpload;
  // Also expose to parent component if provided
  if (onFileUploadRef) {
    onFileUploadRef.current = handleFileUpload;
  }

  const addMessage = (
    role: 'user' | 'assistant',
    content: string,
    recordsQueried?: NeotomaRecord[],
    recordsTotalCount?: number
  ) => {
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
      
      // Get or create toast ID for this error
      let toastId = errorToastIdsRef.current.get(errorKey);
      const errorMessage = newCount > 1 ? `${content} (occurred ${newCount} times)` : content;
      
      if (toastId) {
        // Update existing toast with new count
        notify.error(errorMessage, {
          id: toastId,
          duration: Infinity, // Keep displaying as long as occurrences are happening
        });
      } else {
        // Create new toast
        const newToastId = notify.error(errorMessage, {
          duration: Infinity, // Keep displaying as long as occurrences are happening
        });
        errorToastIdsRef.current.set(errorKey, newToastId);
      }
      
      console.error('[Chat Error]', content, newCount > 1 ? `(occurred ${newCount} times)` : '');
    } else {
      // Regular message
      setMessages((prev) => [
        ...prev,
        {
          role,
          content,
          timestamp: new Date(),
          recordsQueried,
          recordsTotalCount:
            typeof recordsTotalCount === 'number' ? recordsTotalCount : undefined,
        },
      ]);
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
    const keywordQuery = extractKeywordQuery(userMessage);
    const normalizedMessage = userMessage.toLowerCase();
    const trimmedSearch = activeSearchQuery?.trim() ?? '';
    const normalizedSearch = trimmedSearch.toLowerCase();
    const mentionsSearchTerm =
      normalizedSearch.length > 0 && normalizedMessage.includes(normalizedSearch);
    const mentionsHowMany = /how many\b/i.test(normalizedMessage);
    const mentionsHowAbout = /how about\b/i.test(normalizedMessage);
    const mentionsWhatAbout = /what about\b/i.test(normalizedMessage);
    const mentionsShowMe = /show me\b/i.test(normalizedMessage);
    const searchQueryForCount =
      keywordQuery.trim().length > 0
        ? keywordQuery.trim()
        : trimmedSearch.length > 0
        ? trimmedSearch
        : '';
    setInput('');
    addMessage('user', userMessage);
    setIsLoading(true);

    // Handle local record count queries scoped to the current filters
    // Recognize explicit count queries ("how many records", "records", etc.)
    // and implicit queries ("how about X", "what about X", "show me X", or just "X")
    const hasExplicitCountPattern =
      /how many\b[\s\S]*\brecords?/i.test(userMessage) ||
      /^records?$/i.test(userMessage.trim()) ||
      (mentionsHowMany && (mentionsSearchTerm || keywordQuery.length > 0));
    
    // Implicit count queries: simple queries with keywords that suggest looking up records
    const hasImplicitCountPattern =
      (mentionsHowAbout || mentionsWhatAbout || mentionsShowMe) && 
      keywordQuery.length > 0 &&
      /\brecords?\b/i.test(userMessage); // Must mention "record" or "records"
    
    // Short queries with keywords (likely asking about specific records)
    // But exclude queries about properties, details, etc.
    const isPropertyQuery = /\b(properties|details|property|info|information|show|tell|describe)\b/i.test(userMessage);
    const isShortKeywordQuery = 
      keywordQuery.length > 0 && 
      userMessage.trim().split(/\s+/).length <= 5 &&
      !isPropertyQuery;
    
    const isCountQuery = hasExplicitCountPattern || hasImplicitCountPattern || isShortKeywordQuery;
    if (isCountQuery && datastore.initialized) {
      try {
        const hasSearchFilter = searchQueryForCount.length > 0;
        const hasTypeFilter = Boolean(activeTypeFilter?.trim());
        const queryOptions = hasTypeFilter ? { type: activeTypeFilter } : undefined;
        const localRecords = await datastore.queryRecords(queryOptions);
        let recordsToEvaluate = localRecords.map((record) => normalizeRecord(localToNeotoma(record)));

        if (hasTypeFilter) {
          recordsToEvaluate = recordsToEvaluate.filter((record) => record.type === activeTypeFilter);
        }

        if (hasSearchFilter) {
          recordsToEvaluate = recordsToEvaluate.filter((record) =>
            recordMatchesQuery(record, searchQueryForCount)
          );
        }

        const localCount = recordsToEvaluate.length;
        const countMessage = `There are currently **${localCount} record${localCount === 1 ? '' : 's'}** stored locally. If you need more details about any specific records, feel free to ask!`;
        addMessage('assistant', countMessage, undefined, localCount);
        setIsLoading(false);
        return;
      } catch (error) {
        console.error('[ChatPanel] Failed to count local records', error);
        // Fall through to API call
      }
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
      
      // If cloud storage is disabled, fetch all local records to pass to chat endpoint
      let localRecordsPayload: NeotomaRecord[] | undefined = undefined;
      if (!settings.cloudStorageEnabled && datastore.initialized) {
        try {
          const localRecords = await datastore.queryRecords();
          localRecordsPayload = localRecords.map(localToNeotoma);
        } catch (error) {
          console.error('[ChatPanel] Failed to fetch local records for chat', error);
        }
      }

      const response = await sendChatMessage(settings.apiBase, bearerToken, {
        messages: messagesToSend,
        recentRecords: recentRecordsPayload,
        localRecords: localRecordsPayload,
      });
      addMessage(
        'assistant',
        response.message?.content || 'No response received',
        response.records_queried || undefined,
        response.records_total_count
      );
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
      className="relative shrink-0 bg-muted/30 border-r border-border/60 flex flex-col overflow-hidden"
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
      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-3">
        {messages.filter(msg => !msg.isError).map((msg, idx) => (
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
            {(msg.recordsQueried?.length || typeof msg.recordsTotalCount === 'number') && (
              <div className="px-2.5 py-1.5 bg-accent text-accent-foreground rounded-md text-xs font-semibold mt-2">
                {(() => {
                  const total =
                    typeof msg.recordsTotalCount === 'number'
                      ? msg.recordsTotalCount
                      : msg.recordsQueried?.length ?? 0;
                  return `Found ${total} record${total === 1 ? '' : 's'}`;
                })()}
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
        <div className="group/composer rounded-[28px] border border-border/70 bg-background shadow-sm px-4 py-3 space-y-3 shadow-[0_-20px_30px_-15px_rgba(241,245,249,0.9)] transform origin-bottom transition-all duration-300 focus-within:-translate-y-2">
          <div className="transition-[min-height] duration-300 min-h-[72px] group-focus-within/composer:min-h-[144px]">
            <Textarea
              ref={textareaRef}
              placeholder="Ask about records..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              className="min-h-[72px] max-h-[320px] resize-none border-none bg-transparent px-0 text-base text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground overflow-hidden"
              onInput={autoResizeTextarea}
            />
          </div>
          <div className="flex items-center justify-end">
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


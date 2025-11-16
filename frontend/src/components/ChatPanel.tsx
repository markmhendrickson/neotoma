import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowUp } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { useKeys } from '@/hooks/useKeys';
import { useDatastore } from '@/hooks/useDatastore';
import { uploadFile, sendChatMessage, analyzeFile } from '@/lib/api';
import { processFileLocally } from '@/utils/file_processing';
import type { NeotomaRecord } from '@/types/record';
import type { LocalRecord } from '@/store/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  recordsQueried?: NeotomaRecord[];
  isError?: boolean;
  errorCount?: number;
}

export function ChatPanel({ 
  onFileUploaded, 
  onFileUploadRef,
  onErrorRef,
}: { 
  onFileUploaded?: () => void;
  onFileUploadRef?: React.MutableRefObject<((files: FileList | null) => Promise<void>) | null>;
  onErrorRef?: React.MutableRefObject<((error: string) => void) | null>;
}) {
  const { settings } = useSettings();
  const { bearerToken: keysBearerToken, x25519, ed25519 } = useKeys();
  const datastore = useDatastore(x25519, ed25519);
  // Use bearer token from keys hook if available, fallback to settings
  const bearerToken = keysBearerToken || settings.bearerToken;
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Welcome to **Neotoma**—your personal operating system for ingesting files, structuring their contents, and recalling the things you have captured. Ask me questions like "Summarize my latest uploads" or "Show workout logs from last week." To add new information, drag files into the chat, drop them on the page, or paste them from your clipboard and I will import and categorize them for you.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<
    Array<{ file: File; status: 'pending' | 'success' | 'error'; name: string }>
  >([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileUploadRef = useRef<typeof handleFileUpload | null>(null);
  const errorCountsRef = useRef<Map<string, number>>(new Map());

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

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    if (!datastore.initialized) {
      const errorMsg = datastore.error 
        ? `Datastore initialization failed: ${datastore.error.message}. Please check the console for details.`
        : 'Datastore is initializing. Please wait a moment and try again.';
      console.warn('[File Upload] Datastore not ready:', {
        initialized: datastore.initialized,
        error: datastore.error,
        hasX25519: !!x25519,
        hasEd25519: !!ed25519,
      });
      addMessage('assistant', errorMsg);
      return;
    }

    const fileArray = Array.from(files);
    const newUploads = fileArray.map((file) => ({
      file,
      status: 'pending' as const,
      name: file.name,
    }));
    setUploadProgress((prev) => [...prev, ...newUploads]);

    for (const file of fileArray) {
      try {
        let localRecord: LocalRecord;
        
        // Try to get AI analysis from API if bearer token is available
        if (bearerToken) {
          try {
            if (settings.apiSyncEnabled) {
              // Full sync: upload and get analyzed record
              const analyzedRecord = await uploadFile(settings.apiBase, bearerToken, file);
              // Convert API record to local record format with AI-analyzed type and properties
              localRecord = {
                id: analyzedRecord.id,
                type: analyzedRecord.type,
                properties: analyzedRecord.properties,
                file_urls: analyzedRecord.file_urls,
                embedding: analyzedRecord.embedding || null,
                created_at: analyzedRecord.created_at,
                updated_at: analyzedRecord.updated_at,
              };
            } else {
              // Analysis only: get AI analysis without storing in API
              const analysis = await analyzeFile(settings.apiBase, bearerToken, file);
              // Process file locally and merge with AI analysis
              const basicRecord = await processFileLocally({ file });
              localRecord = {
                ...basicRecord,
                type: analysis.type,
                properties: {
                  ...basicRecord.properties,
                  ...analysis.properties,
                },
              };
            }
          } catch (error) {
            // If API analysis fails, fall back to local processing
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            // Only log if it's not a connection error (those are expected if backend is down)
            if (!errorMessage.includes('not available') && !errorMessage.includes('Failed to fetch')) {
              console.warn('[File Upload] API analysis failed, using local processing:', error);
            }
            localRecord = await processFileLocally({ file });
          }
        } else {
          // Process file locally without API analysis
          localRecord = await processFileLocally({ file });
        }
        
        // Store in local datastore
        try {
          await datastore.putRecord(localRecord);
        } catch (putError) {
          const putErrorMessage = putError instanceof Error ? putError.message : 'Failed to save record';
          console.error('[File Upload] Failed to save record to datastore:', putError);
          throw new Error(`Failed to save record: ${putErrorMessage}`);
        }
        
        setUploadProgress((prev) =>
          prev.map((u) => (u.file === file ? { ...u, status: 'success' as const } : u))
        );
        
        const message = settings.apiSyncEnabled
          ? `File "${file.name}" analyzed and saved locally with type "${localRecord.type}".`
          : `File "${file.name}" saved locally.`;
        addMessage('assistant', message);
        
        if (onFileUploaded) {
          setTimeout(() => onFileUploaded(), 100);
        }
        setTimeout(() => {
          setUploadProgress((prev) => prev.filter((u) => u.file !== file));
        }, 2000);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[File Upload] Error processing file:', file.name, error);
        
        setUploadProgress((prev) =>
          prev.map((u) => (u.file === file ? { ...u, status: 'error' as const } : u))
        );
        
        // Determine if it's a timeout or other error
        const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('Request timeout');
        const displayMessage = isTimeout
          ? `Failed to process "${file.name}": Datastore operation timed out. The file may still be processing.`
          : `Failed to process "${file.name}": ${errorMessage}`;
        
        addMessage('assistant', `Error: ${displayMessage}`);
        
        setTimeout(() => {
          setUploadProgress((prev) => prev.filter((u) => u.file !== file));
        }, 3000);
      }
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

    if (!bearerToken) {
      setIsLoading(false);
      addMessage('assistant', 'Please set your Bearer Token in the settings above to use the chat feature.');
      return;
    }

    try {
      const messagesToSend = messages
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await sendChatMessage(settings.apiBase, bearerToken, messagesToSend);
      addMessage('assistant', response.message?.content || 'No response received', response.records_queried || undefined);
    } catch (error) {
      addMessage('assistant', `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <aside className="w-[400px] shrink-0 bg-background border-r flex flex-col overflow-hidden">
      <div
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 relative"
      >
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col gap-1 max-w-[85%] ${
              msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'
            }`}
          >
            <div
              className={`px-3 py-2 rounded-xl text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : msg.isError
                  ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-bl-sm'
                  : 'bg-muted text-foreground rounded-bl-sm'
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
            <div className="text-xs text-muted-foreground px-1">
              {msg.timestamp.toLocaleTimeString()}
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
      <div className="flex gap-2 p-4 border-t shrink-0">
        <Input
          type="text"
          placeholder="Ask about your records..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="flex-1"
        />
        <input
          type="file"
          ref={fileInputRef}
          multiple
          className="hidden"
          onChange={(e) => handleFileUpload(e.target.files)}
        />
        <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
      {uploadProgress.length > 0 && (
        <div className="flex flex-col gap-1 p-4 border-t max-h-[150px] overflow-y-auto">
          {uploadProgress.map((upload, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-2 px-2 py-1 bg-muted rounded text-xs"
            >
              <span className="flex-1 truncate">{upload.name}</span>
              <Badge
                variant={
                  upload.status === 'success'
                    ? 'default'
                    : upload.status === 'error'
                    ? 'destructive'
                    : 'secondary'
                }
                className={
                  upload.status === 'pending'
                    ? 'bg-blue-500 hover:bg-blue-500 text-white border-blue-500'
                    : upload.status === 'success'
                    ? 'bg-green-500 hover:bg-green-500 text-white border-green-500'
                    : ''
                }
              >
                {upload.status === 'pending'
                  ? 'Uploading...'
                  : upload.status === 'success'
                  ? '✓'
                  : '✗'}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}


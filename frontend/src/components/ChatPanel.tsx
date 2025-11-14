import { useState, useEffect, useRef, type DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useSettings } from '@/hooks/useSettings';
import { uploadFile, sendChatMessage } from '@/lib/api';
import type { NeotomaRecord } from '@/types/record';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  recordsQueried?: NeotomaRecord[];
}

export function ChatPanel({ onFileUploaded }: { onFileUploaded?: () => void }) {
  const { settings } = useSettings();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Welcome to **Neotoma**—your personal operating system for ingesting files, structuring their contents, and recalling the things you have captured. Ask me questions like "Summarize my latest uploads" or "Show workout logs from last week." To add new information, drag files into the chat or drop them on the page and I will import and categorize them for you.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<
    Array<{ file: File; status: 'pending' | 'success' | 'error'; name: string }>
  >([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

    if (!settings.bearerToken) {
      addMessage('assistant', 'Please set your Bearer Token in the settings above to upload files.');
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
        await uploadFile(settings.apiBase, settings.bearerToken, file);
        setUploadProgress((prev) =>
          prev.map((u) => (u.file === file ? { ...u, status: 'success' as const } : u))
        );
        addMessage('assistant', `File "${file.name}" uploaded successfully.`);
        if (onFileUploaded) {
          setTimeout(() => onFileUploaded(), 500);
        }
        setTimeout(() => {
          setUploadProgress((prev) => prev.filter((u) => u.file !== file));
        }, 2000);
      } catch (error) {
        setUploadProgress((prev) =>
          prev.map((u) => (u.file === file ? { ...u, status: 'error' as const } : u))
        );
        addMessage(
          'assistant',
          `Failed to upload "${file.name}": ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        setTimeout(() => {
          setUploadProgress((prev) => prev.filter((u) => u.file !== file));
        }, 3000);
      }
    }
  };

  const addMessage = (role: 'user' | 'assistant', content: string, recordsQueried?: NeotomaRecord[]) => {
    setMessages((prev) => [...prev, { role, content, timestamp: new Date(), recordsQueried }]);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const related = e.relatedTarget as Node | null;
    if (!related || !e.currentTarget.contains(related)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    addMessage('user', userMessage);
    setIsLoading(true);

    if (!settings.bearerToken) {
      setIsLoading(false);
      addMessage('assistant', 'Please set your Bearer Token in the settings above to use the chat feature.');
      return;
    }

    try {
      const messagesToSend = messages
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await sendChatMessage(settings.apiBase, settings.bearerToken, messagesToSend);
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
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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
                  : 'bg-muted text-foreground rounded-bl-sm'
              }`}
              dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
            />
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
        <div
          className={`absolute inset-0 pointer-events-none border-2 border-dashed rounded-lg transition-colors ${
            isDragging ? 'border-primary bg-accent/10' : 'border-transparent'
          }`}
        />
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
          Send
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


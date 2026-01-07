import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface MarkdownContentProps {
  content: string;
}

function CodeBlock({
  language,
  value,
}: {
  language?: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: 'var(--doc-radius-default, 4px)',
          fontSize: '0.875rem',
          lineHeight: '1.4',
        }}
        PreTag="div"
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="markdown-content text-[hsl(var(--doc-foreground))]">
      <ReactMarkdown
        components={{
          // Headings
          h1: ({ children }) => (
            <h1 className="text-4xl font-bold mt-8 mb-4 text-[hsl(var(--doc-foreground))] first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-3xl font-semibold mt-6 mb-3 text-[hsl(var(--doc-foreground))]">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-2xl font-semibold mt-5 mb-2 text-[hsl(var(--doc-foreground))]">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xl font-medium mt-4 mb-2 text-[hsl(var(--doc-foreground))]">
              {children}
            </h4>
          ),

          // Paragraphs
          p: ({ children }) => (
            <p className="text-base leading-relaxed mb-4 text-[hsl(var(--doc-foreground))]">
              {children}
            </p>
          ),

          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-[hsl(var(--doc-primary))] hover:text-[hsl(var(--doc-primary-hover))] underline"
            >
              {children}
            </a>
          ),

          // Lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-4 space-y-2 text-[hsl(var(--doc-foreground))]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-4 space-y-2 text-[hsl(var(--doc-foreground))]">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-base leading-relaxed">{children}</li>
          ),

          // Code blocks
          code({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode }) {
            const match = /language-(\w+)/.exec(className || '');
            const value = String(children).replace(/\n$/, '');

            return !inline && match ? (
              <div className="my-4">
                <CodeBlock language={match[1]} value={value} />
              </div>
            ) : (
              <code
                className="font-mono text-sm bg-[hsl(var(--doc-code-bg))] px-1.5 py-0.5 rounded"
                style={{ borderRadius: 'var(--doc-radius-minimal, 2px)' }}
                {...props}
              >
                {children}
              </code>
            );
          },

          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-[hsl(var(--doc-primary))] pl-4 my-4 italic text-[hsl(var(--doc-secondary))]">
              {children}
            </blockquote>
          ),

          // Tables
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[hsl(var(--doc-code-bg))]">{children}</thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-[hsl(var(--doc-border))]">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-2 text-left font-semibold text-[hsl(var(--doc-foreground))]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2 text-[hsl(var(--doc-foreground))]">
              {children}
            </td>
          ),

          // Horizontal rule
          hr: () => (
            <hr className="my-8 border-t border-[hsl(var(--doc-border))]" />
          ),

          // Pre (for code blocks without language)
          pre: ({ children }) => (
            <pre className="bg-[hsl(var(--doc-code-bg))] p-4 rounded overflow-x-auto my-4 font-mono text-sm">
              {children}
            </pre>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}



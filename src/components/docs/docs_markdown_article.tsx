import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export const docsMarkdownProseClassName =
  "prose prose-base dark:prose-invert max-w-none text-foreground prose-headings:scroll-mt-6 prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-primary prose-a:underline-offset-4 prose-code:rounded-md prose-code:border prose-code:border-border prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.875em] prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none prose-pre:my-4 prose-pre:rounded-md prose-pre:border prose-pre:border-border prose-pre:bg-muted prose-pre:p-4 prose-pre:font-mono prose-pre:text-sm prose-pre:leading-relaxed prose-pre:text-foreground prose-pre:code:block prose-pre:code:border-0 prose-pre:code:bg-transparent prose-pre:code:p-0 prose-pre:code:text-inherit prose-pre:code:font-normal prose-pre:code:shadow-none prose-pre:code:before:content-none prose-pre:code:after:content-none prose-blockquote:border-l-primary/45 prose-blockquote:text-muted-foreground prose-th:border-border prose-td:border-border";

const fencedCodeClassName = "font-mono text-sm text-foreground";
const inlineCodeClassName =
  "rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.875em] text-foreground";
const fencedPreClassName =
  "my-4 max-h-[min(70vh,44rem)] overflow-auto rounded-md border border-border bg-muted p-4 font-mono text-sm leading-relaxed text-foreground [tab-size:2] [&>code]:block [&>code]:whitespace-pre [&>code]:border-0 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit [&>code]:shadow-none";

export function normalizeDocsHref(href: string | undefined): string {
  const raw = (href ?? "").trim();
  if (!raw) return "#";
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(raw)?.[1]?.toLowerCase();
  if (scheme) {
    return scheme === "http" || scheme === "https" || scheme === "mailto" ? raw : "#";
  }
  if (raw.startsWith("//")) return "#";
  if (raw.startsWith("#") || raw.startsWith("/")) return raw;
  if (raw.startsWith("docs/") && raw.endsWith(".md")) {
    return `/docs/${raw.slice("docs/".length).replace(/\.md$/, "")}`;
  }
  if (raw.endsWith(".md")) return raw.replace(/\.md$/, "");
  return raw;
}

export function DocsMarkdownArticle({ body, className }: { body: string; className?: string }) {
  return (
    <article className={cn(docsMarkdownProseClassName, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => {
            const safeHref = normalizeDocsHref(href);
            const external = /^https?:\/\//i.test(safeHref) || safeHref.startsWith("mailto:");
            return (
              <a
                href={safeHref}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                {...props}
              >
                {children}
              </a>
            );
          },
          code: ({ className, children, ...props }) => {
            const isFenced = Boolean(className?.includes("language-"));
            return (
              <code
                className={cn(isFenced ? fencedCodeClassName : inlineCodeClassName, className)}
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ className: preClassName, children, ...props }) => (
            <pre {...props} className={cn(fencedPreClassName, preClassName)}>
              {children}
            </pre>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </article>
  );
}

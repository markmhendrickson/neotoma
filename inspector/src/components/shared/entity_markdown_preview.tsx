import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export type MarkdownPreviewMode = "formatted" | "raw";

export type EntityMarkdownPreviewLayout = "card" | "panel";

/** Block `pre` uses custom component below (`not-prose`); keep prose-* off `pre` to avoid double boxes. */
const proseCard =
  "prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:scroll-mt-4 prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-a:text-primary prose-a:font-medium prose-a:underline-offset-2 hover:prose-a:text-primary/90 prose-code:rounded prose-code:border prose-code:border-border prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.875em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-blockquote:border-l-primary/50 prose-blockquote:text-muted-foreground prose-table:text-sm prose-th:border-border prose-td:border-border prose-hr:border-border";

const prosePanel =
  "prose prose-base dark:prose-invert max-w-none text-foreground prose-p:my-4 prose-p:leading-[1.65] prose-p:text-[0.9375rem] prose-headings:scroll-mt-6 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground prose-h1:mb-4 prose-h1:mt-2 prose-h1:border-b prose-h1:border-border/80 prose-h1:pb-3 prose-h1:text-2xl prose-h1:leading-tight prose-h2:mb-3 prose-h2:mt-10 prose-h2:text-xl prose-h2:leading-snug prose-h3:mb-2 prose-h3:mt-8 prose-h3:text-lg prose-h4:mt-6 prose-h4:text-base prose-li:my-1 prose-li:leading-relaxed prose-ul:my-4 prose-ol:my-4 prose-ul:pl-1 prose-ol:pl-1 prose-strong:font-semibold prose-strong:text-foreground prose-a:text-primary prose-a:font-medium prose-a:underline-offset-4 hover:prose-a:text-primary/90 prose-blockquote:my-5 prose-blockquote:border-l-[3px] prose-blockquote:border-l-primary/45 prose-blockquote:pl-4 prose-blockquote:py-1 prose-blockquote:not-italic prose-blockquote:text-muted-foreground prose-blockquote:bg-muted/25 prose-blockquote:rounded-r-md prose-code:rounded-md prose-code:border prose-code:border-border/80 prose-code:bg-muted/40 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.875em] prose-code:font-medium prose-code:before:content-none prose-code:after:content-none prose-table:my-6 prose-table:w-full prose-table:border-collapse prose-table:text-[0.875rem] prose-th:border prose-th:border-border prose-th:bg-muted/40 prose-th:px-3 prose-th:py-2 prose-th:font-semibold prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-img:rounded-lg prose-img:border prose-img:border-border prose-img:shadow-sm prose-hr:my-10 prose-hr:border-border";

export function EntityMarkdownPreview({
  content,
  viewMode,
  layout = "card",
}: {
  content: string;
  viewMode: MarkdownPreviewMode;
  layout?: EntityMarkdownPreviewLayout;
}) {
  const scrollShell = layout === "card" ? "max-h-[480px] overflow-auto" : "";

  if (viewMode === "raw") {
    return (
      <pre
        className={cn(
          "whitespace-pre-wrap rounded-lg border border-border/80 bg-muted/25 font-mono text-foreground/95 shadow-inner",
          layout === "card" ? "p-3 text-xs" : "p-4 text-[13px] leading-relaxed sm:p-5 sm:text-sm",
          scrollShell,
        )}
      >
        {content}
      </pre>
    );
  }

  const proseClass = layout === "panel" ? prosePanel : proseCard;

  const preBlockClass = cn(
    "not-prose my-4 w-full max-w-full overflow-x-auto overflow-y-auto rounded-xl border border-border/90 bg-muted/30 p-4 text-left shadow-inner [tab-size:2]",
    "max-h-[min(70vh,44rem)] font-mono text-[0.8rem] leading-relaxed text-foreground/95 sm:text-[0.8125rem]",
    "[&_code]:m-0 [&_code]:block [&_code]:whitespace-pre [&_code]:rounded-none [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:font-mono [&_code]:text-[inherit] [&_code]:leading-[inherit] [&_code]:shadow-none",
    layout === "panel" && "sm:my-6 sm:p-5",
  );

  return (
    <div
      className={cn(
        scrollShell,
        layout === "card" && "rounded-lg bg-muted/30 p-4",
        layout === "panel" && "min-h-0 px-0.5 pb-1 pt-0",
      )}
    >
      <article className={cn(proseClass, layout === "panel" && "max-w-[min(100%,52rem)]")}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children, ...props }) => (
              <a href={href ?? "#"} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            ),
            pre: ({ children, className, ...props }) => (
              <pre {...props} className={cn(preBlockClass, className)}>
                {children}
              </pre>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}

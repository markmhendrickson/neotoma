import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DetailPage } from "@/components/DetailPage";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";
import { INDEXABLE_SITE_PAGE_PATHS } from "@/site/seo_metadata";
import {
  buildAllSitePagesMarkdownBundle,
  buildSitePageMarkdown,
  isIndexableSitePagePath,
  normalizeSiteMarkdownPathParam,
  rawMarkdownTo,
} from "@/site/site_page_markdown";

export function SiteMarkdownHubPage() {
  const { locale, dict } = useLocale();
  const [searchParams] = useSearchParams();
  const pathParam = searchParams.get("path");
  const normalizedPath = useMemo(() => normalizeSiteMarkdownPathParam(pathParam), [pathParam]);
  const isValidPath = normalizedPath != null && isIndexableSitePagePath(normalizedPath);
  const singleMd = isValidPath && normalizedPath ? buildSitePageMarkdown(normalizedPath) : "";
  const allMd = useMemo(() => buildAllSitePagesMarkdownBundle(), []);
  const hubHref = localizePath("/site-markdown", locale);
  const sortedPaths = useMemo(
    () => [...INDEXABLE_SITE_PAGE_PATHS].sort((a, b) => a.localeCompare(b)),
    [],
  );
  const [copied, setCopied] = useState<"single" | "all" | null>(null);

  const copyText = useCallback(async (label: "single" | "all", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }, []);

  const downloadAll = useCallback(() => {
    const blob = new Blob([allMd], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "neotoma-site-pages.md";
    a.click();
    URL.revokeObjectURL(url);
  }, [allMd]);

  if (pathParam != null && normalizedPath != null && !isValidPath) {
    return (
      <DetailPage title="Site pages (Markdown)">
        <p className="text-[15px] leading-7 mb-4">
          Unknown or non-indexable path{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-[13px]">{pathParam}</code>. Choose a
          route from the{" "}
          <Link
            to={hubHref}
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            index
          </Link>
          .
        </p>
      </DetailPage>
    );
  }

  if (isValidPath && normalizedPath) {
    return (
      <DetailPage title={`Markdown: ${normalizedPath}`}>
        <p className="text-[15px] leading-7 mb-4 text-muted-foreground">
          Generated from SEO metadata for this route.{" "}
          <Link
            to={localizePath(normalizedPath, locale)}
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            Open HTML page
          </Link>
          {" · "}
          <Link
            to={hubHref}
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            {dict.allPagesMarkdown}
          </Link>
          {" · "}
          <Link
            to={rawMarkdownTo(normalizedPath, locale)}
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            {dict.rawMarkdownDirect}
          </Link>
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => copyText("single", singleMd)}>
            {copied === "single" ? "Copied" : "Copy Markdown"}
          </Button>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-4 text-[13px] leading-relaxed whitespace-pre-wrap font-mono">
          {singleMd}
        </pre>
      </DetailPage>
    );
  }

  return (
    <DetailPage title="Site pages (Markdown)">
      <p className="text-[15px] leading-7 mb-4">
        Every indexable site route (same set as the public sitemap for the default locale) as
        Markdown derived from title, description, canonical URL, and breadcrumbs. This is not a full
        HTML-to-Markdown conversion; use the linked HTML pages for complete copy.
      </p>
      <div className="mb-8 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => copyText("all", allMd)}>
          {copied === "all" ? "Copied bundle" : "Copy all pages"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={downloadAll}>
          Download neotoma-site-pages.md
        </Button>
      </div>
      <h2 className="text-[18px] font-medium tracking-[-0.01em] mb-3">Routes</h2>
      <ul className="list-none space-y-1.5 pl-0">
        {sortedPaths.map((p) => (
          <li key={p} className="text-[15px] leading-7">
            <Link
              to={`${hubHref}?path=${encodeURIComponent(p)}`}
              className="font-mono text-[13px] text-foreground underline underline-offset-2 hover:no-underline"
            >
              {p}
            </Link>
            <span className="text-muted-foreground"> · </span>
            <Link
              to={rawMarkdownTo(p, locale)}
              className="text-[13px] text-foreground underline underline-offset-2 hover:no-underline"
            >
              {dict.rawMarkdownDirect}
            </Link>
          </li>
        ))}
      </ul>
    </DetailPage>
  );
}

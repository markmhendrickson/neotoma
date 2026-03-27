import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SeoHead } from "@/components/SeoHead";
import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";
import {
  buildSitePageMarkdown,
  isIndexableSitePagePath,
  normalizeSiteMarkdownPathParam,
} from "@/site/site_page_markdown";

export function RawSiteMarkdownPage() {
  const [params] = useSearchParams();
  const { locale, dict } = useLocale();
  const pathParam = normalizeSiteMarkdownPathParam(params.get("path"));
  const valid = pathParam != null && isIndexableSitePagePath(pathParam);
  const md = valid && pathParam ? buildSitePageMarkdown(pathParam) : "";

  useEffect(() => {
    if (valid && pathParam) {
      const slug = pathParam === "/" ? "index" : pathParam.replace(/^\//, "").replace(/\//g, "-");
      document.title = `${slug}.md · Neotoma`;
    } else {
      document.title = `Markdown · ${dict.pageNotFound}`;
    }
  }, [valid, pathParam, dict.pageNotFound]);

  if (!valid || !pathParam) {
    return (
      <>
        <SeoHead routePath="/raw" />
        <div className="min-h-screen bg-background p-4 text-[15px] leading-7 text-foreground">
          <p className="mb-3">Missing or unknown path for raw Markdown.</p>
          <p>
            <Link
              to={localizePath("/site-markdown", locale)}
              className="text-foreground underline underline-offset-2 hover:no-underline"
            >
              Markdown index
            </Link>
          </p>
        </div>
      </>
    );
  }

  const htmlHref = localizePath(pathParam, locale);

  return (
    <>
      <SeoHead routePath="/raw" />
      <div className="min-h-screen bg-background text-foreground">
        <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-3 py-2 text-[13px] backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Link to={htmlHref} className="text-foreground underline underline-offset-2 hover:no-underline">
            ← {dict.backToHtmlPage}
          </Link>
          {" · "}
          <Link
            to={localizePath("/site-markdown", locale)}
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            {dict.allPagesMarkdown}
          </Link>
        </div>
        <pre className="whitespace-pre-wrap break-words p-4 font-mono text-[13px] leading-relaxed text-foreground">
          {md}
        </pre>
      </div>
    </>
  );
}

import { useEffect } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { SeoHead } from "@/components/SeoHead";
import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";
import {
  fullPageMarkdownPath,
  isIndexableSitePagePath,
  normalizeSiteMarkdownPathParam,
} from "@/site/site_page_markdown";

export function RawSiteMarkdownPage() {
  const [params] = useSearchParams();
  const { locale, dict } = useLocale();
  const pathParam = normalizeSiteMarkdownPathParam(params.get("path"));
  const valid = pathParam != null && isIndexableSitePagePath(pathParam);

  useEffect(() => {
    document.title = valid && pathParam ? `Redirect · Neotoma` : `Markdown · ${dict.pageNotFound}`;
  }, [valid, pathParam, dict.pageNotFound]);

  if (valid && pathParam) {
    return <Navigate to={fullPageMarkdownPath(pathParam, locale)} replace />;
  }

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

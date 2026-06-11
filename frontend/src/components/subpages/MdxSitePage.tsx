import { DetailPage } from "@/components/DetailPage";
import { SeoHead } from "@/components/SeoHead";
import { useLocale } from "@/i18n/LocaleContext";
import { NotFound } from "@/components/NotFound";
import { useEffectiveRoutePath } from "@/hooks/useEffectiveRoutePath";
import { localizePath } from "@/i18n/routing";
import { hasMdxSitePage, resolveMdxSitePage } from "@/site/mdx_site_registry";

export function MdxSitePage({
  canonicalPath,
  detailTitle,
  /** `bare`: MDX body owns full-bleed layout; SEO only (e.g. vertical landings). Default doc shell. */
  shell = "detail",
}: {
  canonicalPath: string;
  /** When set (e.g. i18n DetailPage title), overrides meta `page_title` for the shell only. */
  detailTitle?: string;
  shell?: "detail" | "bare";
}) {
  const { locale } = useLocale();
  const effectivePath = useEffectiveRoutePath();

  if (!hasMdxSitePage(canonicalPath)) {
    return <NotFound />;
  }

  try {
    const { bundle } = resolveMdxSitePage(canonicalPath, locale);
    const { meta, Component } = bundle;

    if (shell === "bare") {
      return (
        <>
          <SeoHead routePath={localizePath(effectivePath, locale)} />
          {/* Do not apply `.mdx-site-page-content` here: bare routes render full-bleed landings
              (e.g. `<SitePage />`) and doc typography utilities would cascade into marketing layout. */}
          <div className="min-h-0 bg-background text-foreground">
            <Component />
          </div>
        </>
      );
    }

    return (
      <DetailPage title={detailTitle ?? meta.page_title}>
        <div className="mdx-site-page-content post-prose">
          <Component />
        </div>
      </DetailPage>
    );
  } catch {
    return <NotFound />;
  }
}

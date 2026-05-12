import { DetailPage } from "@/components/DetailPage";
import { SeoHead } from "@/components/SeoHead";
import { useLocale } from "@/i18n/LocaleContext";
import { NotFound } from "@/components/NotFound";
import { useEffectiveRoutePath } from "@/hooks/useEffectiveRoutePath";
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
    const { bundle, usedFallbackFromLocale } = resolveMdxSitePage(canonicalPath, locale);
    const { meta, Component } = bundle;

    const fallbackBanner =
      usedFallbackFromLocale ? (
        <p className="text-[13px] leading-5 text-muted-foreground border border-border rounded-md px-3 py-2 mb-6">
          Translation for <span className="font-mono">{String(usedFallbackFromLocale)}</span> is not
          available yet; showing English source (
          <span className="font-mono">translated_from_revision={meta.translated_from_revision}</span>).
        </p>
      ) : null;

    if (shell === "bare") {
      return (
        <>
          <SeoHead routePath={effectivePath} />
          {/* Do not apply `.mdx-site-page-content` here: bare routes render full-bleed landings
              (e.g. `<SitePage />`) and doc typography utilities would cascade into marketing layout. */}
          <div className="min-h-0 bg-background text-foreground">
            {fallbackBanner ? (
              <div className="max-w-[52em] mx-auto px-4 pt-4">{fallbackBanner}</div>
            ) : null}
            <Component />
          </div>
        </>
      );
    }

    return (
      <DetailPage title={detailTitle ?? meta.page_title}>
        {fallbackBanner}
        <div className="mdx-site-page-content post-prose">
          <Component />
        </div>
      </DetailPage>
    );
  } catch {
    return <NotFound />;
  }
}

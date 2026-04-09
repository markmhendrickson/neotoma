import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { normalizeToDefaultRoute } from "@/i18n/routing";
import { resolveSeoMetadata, SEO_DEFAULTS } from "@/site/seo_metadata";

/** In dev, show default OG from Vite `public/` instead of fetching production. */
function devOgImagePreviewSrc(ogImageUrl: string): string {
  try {
    const resolved = new URL(ogImageUrl);
    const canonical = new URL(SEO_DEFAULTS.ogImageUrl);
    if (resolved.origin === canonical.origin && resolved.pathname === canonical.pathname) {
      return resolved.pathname;
    }
  } catch {
    /* non-absolute URL: use as-is */
  }
  return ogImageUrl;
}

/**
 * Dev-only panel showing resolved SEO metadata for the current route.
 * Helps verify title, description, OG/Twitter image, and JSON-LD without View Source.
 */
export function SeoDevMetaFooter() {
  if (!import.meta.env.DEV) {
    return null;
  }

  const { pathname } = useLocation();
  const normalized = normalizeToDefaultRoute(pathname);
  const meta = resolveSeoMetadata(pathname);
  const ogPreviewSrc = devOgImagePreviewSrc(meta.ogImageUrl);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [ogPreviewSrc, pathname]);
  const jsonLdTypes = meta.jsonLd
    .map((entry) => String((entry as { "@type"?: string })["@type"] ?? "?"))
    .join(", ");

  const rows: { label: string; value: string }[] = [
    { label: "path", value: `${pathname} (normalized: ${normalized})` },
    { label: "title", value: meta.title },
    { label: "description", value: meta.description },
    { label: "robots", value: meta.robots },
    { label: "canonical", value: meta.canonicalUrl },
    { label: "og:type", value: meta.ogType },
    { label: "og:locale", value: meta.ogLocale },
    { label: "og:image", value: meta.ogImageUrl },
    { label: "og:image:alt", value: meta.ogImageAlt },
    { label: "twitter:card", value: meta.twitterCard },
    { label: "keywords", value: meta.keywords },
    { label: "jsonLd @type", value: jsonLdTypes },
    { label: "alternates", value: String(meta.alternates.length) },
  ];

  return (
    <div
      role="region"
      className="relative shrink-0 border-t border-amber-500/40 bg-amber-950/90 text-amber-100/95 dark:bg-amber-950/95 dark:text-amber-50/95"
      data-testid="seo-dev-meta-footer"
      aria-label="Development SEO metadata"
    >
      <div className="mx-auto max-w-6xl px-4 py-3">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-400 [&::-webkit-details-marker]:hidden">
            <span className="inline-block shrink-0 text-amber-500 transition group-open:rotate-90">
              ▸
            </span>
            <span className="shrink-0">Dev only: page metadata</span>
            <span className="min-w-0 truncate font-normal normal-case text-amber-500/85 dark:text-amber-300/85">
              {pathname}
            </span>
          </summary>
          <div className="mt-3">
            <dl className="grid gap-x-6 gap-y-1 font-mono text-[11px] leading-snug sm:grid-cols-2 lg:grid-cols-3">
              {rows.map(({ label, value }) => (
                <div key={label} className="min-w-0">
                  <dt className="text-amber-500/90 dark:text-amber-300/90">{label}</dt>
                  <dd className="break-all text-amber-100/90 dark:text-amber-50/90">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 border-t border-amber-500/30 pt-3">
              <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                Social image preview
              </p>
              <p className="mb-2 font-mono text-[10px] leading-snug text-amber-500/80 dark:text-amber-300/80">
                Same asset as <span className="text-amber-400">og:image</span>,{" "}
                <span className="text-amber-400">twitter:image</span>, and JSON-LD{" "}
                <span className="text-amber-400">image</span>.
                {ogPreviewSrc !== meta.ogImageUrl ? (
                  <>
                    {" "}
                    Preview uses <span className="text-amber-400">{ogPreviewSrc}</span> from{" "}
                    <span className="text-amber-400">public/</span>; meta tags still use the canonical
                    URL above.
                  </>
                ) : null}
              </p>
              {imageFailed ? (
                <p className="font-mono text-[11px] text-amber-200/80">
                  Could not load image. URL:{" "}
                  <span className="break-all text-amber-100">{ogPreviewSrc}</span>
                </p>
              ) : (
                <figure className="max-w-2xl space-y-2">
                  {/*
                    Dark OG assets disappear on the amber panel without a light mat. Eager load: <details>
                    keeps the img offscreen until opened; lazy loading can delay or skip decode there.
                  */}
                  <div className="rounded-md border border-amber-500/50 bg-zinc-200 p-2 shadow-inner dark:border-zinc-600 dark:bg-zinc-300">
                    <img
                      src={ogPreviewSrc}
                      alt={meta.ogImageAlt}
                      width={1200}
                      height={630}
                      className="h-auto w-full rounded-sm object-contain"
                      loading="eager"
                      decoding="async"
                      data-testid="seo-dev-meta-footer-preview-image"
                      onError={() => setImageFailed(true)}
                    />
                  </div>
                  <figcaption className="font-mono text-[10px] leading-snug text-amber-400/90">
                    {meta.ogImageAlt}
                  </figcaption>
                </figure>
              )}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

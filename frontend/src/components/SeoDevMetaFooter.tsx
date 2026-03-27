import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { normalizeToDefaultRoute } from "@/i18n/routing";
import { resolveSeoMetadata } from "@/site/seo_metadata";

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
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [meta.ogImageUrl, pathname]);
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
    <footer
      className="border-t border-amber-500/40 bg-amber-950/90 text-amber-100/95 dark:bg-amber-950/95 dark:text-amber-50/95"
      data-testid="seo-dev-meta-footer"
      aria-label="Development SEO metadata"
    >
      <div className="mx-auto max-w-6xl px-4 py-3">
        <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-400">
          Dev only: page metadata
        </p>
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
          </p>
          {imageFailed ? (
            <p className="font-mono text-[11px] text-amber-200/80">
              Could not load image. URL:{" "}
              <span className="break-all text-amber-100">{meta.ogImageUrl}</span>
            </p>
          ) : (
            <figure className="max-w-md space-y-1">
              <img
                src={meta.ogImageUrl}
                alt={meta.ogImageAlt}
                className="h-auto w-full rounded border border-amber-500/40 bg-amber-900/40 object-contain shadow-sm"
                loading="lazy"
                decoding="async"
                data-testid="seo-dev-meta-footer-preview-image"
                onError={() => setImageFailed(true)}
              />
              <figcaption className="font-mono text-[10px] leading-snug text-amber-400/90">
                {meta.ogImageAlt}
              </figcaption>
            </figure>
          )}
        </div>
      </div>
    </footer>
  );
}

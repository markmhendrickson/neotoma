import * as ReactHelmetAsync from "react-helmet-async";
import { SEO_DEFAULTS, resolveSeoMetadata } from "@/site/seo_metadata";

interface SeoHeadProps {
  routePath?: string;
}

export function SeoHead({ routePath }: SeoHeadProps) {
  const { Helmet } = ReactHelmetAsync;
  const pathname =
    routePath ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  const metadata = resolveSeoMetadata(pathname);

  return (
    <Helmet>
      <title>{metadata.title}</title>
      <link rel="icon" href="/favicon.ico" sizes="any" />
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png" />
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      <link rel="manifest" href="/site.webmanifest" />
      <meta name="description" content={metadata.description} />
      <meta name="author" content={SEO_DEFAULTS.author} />
      <meta name="application-name" content={SEO_DEFAULTS.siteName} />
      <meta name="robots" content={metadata.robots} />
      <meta name="theme-color" content="#130918" />
      <link rel="canonical" href={metadata.canonicalUrl} />
      <meta property="og:type" content={metadata.ogType} />
      <meta property="og:site_name" content={SEO_DEFAULTS.siteName} />
      <meta property="og:locale" content={metadata.ogLocale} />
      <meta property="og:title" content={metadata.title} />
      <meta property="og:description" content={metadata.description} />
      <meta property="og:url" content={metadata.canonicalUrl} />
      <meta property="og:image" content={metadata.ogImageUrl} />
      <meta property="og:image:width" content={String(SEO_DEFAULTS.ogImageWidth)} />
      <meta property="og:image:height" content={String(SEO_DEFAULTS.ogImageHeight)} />
      <meta property="og:image:alt" content={metadata.ogImageAlt} />
      <meta name="keywords" content={metadata.keywords} />
      <meta name="twitter:card" content={metadata.twitterCard} />
      <meta name="twitter:site" content={SEO_DEFAULTS.twitterSite} />
      <meta name="twitter:title" content={metadata.title} />
      <meta name="twitter:description" content={metadata.description} />
      <meta name="twitter:image" content={metadata.ogImageUrl} />
      <meta name="twitter:image:width" content={String(SEO_DEFAULTS.ogImageWidth)} />
      <meta name="twitter:image:height" content={String(SEO_DEFAULTS.ogImageHeight)} />
      <meta name="twitter:image:alt" content={metadata.ogImageAlt} />
      {metadata.alternates.map((alternate) => (
        <link key={`${alternate.hrefLang}:${alternate.href}`} rel="alternate" hrefLang={alternate.hrefLang} href={alternate.href} />
      ))}
      {metadata.jsonLd.map((entry, i) => (
        <script key={i} type="application/ld+json">{JSON.stringify(entry)}</script>
      ))}
    </Helmet>
  );
}

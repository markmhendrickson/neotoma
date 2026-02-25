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
      <meta name="description" content={metadata.description} />
      <meta name="author" content={SEO_DEFAULTS.author} />
      <meta name="robots" content={metadata.robots} />
      <link rel="canonical" href={metadata.canonicalUrl} />
      <meta property="og:type" content={metadata.ogType} />
      <meta property="og:site_name" content={SEO_DEFAULTS.siteName} />
      <meta property="og:locale" content={SEO_DEFAULTS.locale} />
      <meta property="og:title" content={metadata.title} />
      <meta property="og:description" content={metadata.description} />
      <meta property="og:url" content={metadata.canonicalUrl} />
      <meta property="og:image" content={metadata.ogImageUrl} />
      <meta property="og:image:width" content={String(SEO_DEFAULTS.ogImageWidth)} />
      <meta property="og:image:height" content={String(SEO_DEFAULTS.ogImageHeight)} />
      <meta name="twitter:card" content={SEO_DEFAULTS.twitterCard} />
      <meta name="twitter:site" content={SEO_DEFAULTS.twitterSite} />
      <meta name="twitter:title" content={metadata.title} />
      <meta name="twitter:description" content={metadata.description} />
      <meta name="twitter:image" content={metadata.ogImageUrl} />
      <meta name="twitter:image:width" content={String(SEO_DEFAULTS.ogImageWidth)} />
      <meta name="twitter:image:height" content={String(SEO_DEFAULTS.ogImageHeight)} />
      <script type="application/ld+json">{JSON.stringify(metadata.jsonLd)}</script>
    </Helmet>
  );
}

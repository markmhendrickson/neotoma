/**
 * Curated bundled-doc shortcuts. Slugs must exist in the server's `/docs` index
 * (see `src/services/docs/bundled_nav.ts` `BUNDLED_DOCS_QUICK_LINKS` and
 * `BUNDLED_DOCS_FOOTER_COLUMNS`).
 */
export interface BundledDocsLink {
  label: string;
  /** In-app route under `/docs/...`. */
  to: string;
}

export interface BundledDocsExternalLink {
  label: string;
  href: string;
}

export type BundledDocsFooterLink = BundledDocsLink | BundledDocsExternalLink;

export function isExternalBundledDocsLink(
  link: BundledDocsFooterLink,
): link is BundledDocsExternalLink {
  return "href" in link;
}

export interface BundledDocsFooterColumn {
  title: string;
  links: readonly BundledDocsFooterLink[];
}

export const BUNDLED_DOCS_LINKS: readonly BundledDocsLink[] = [
  { label: "Documentation", to: "/docs" },
  { label: "Install", to: "/docs/developer/getting_started" },
  { label: "Architecture", to: "/docs/architecture/architecture" },
  { label: "REST API", to: "/docs/api/rest_api" },
  { label: "MCP Server", to: "/docs/developer/mcp/instructions" },
] as const;

/** Site-footer mirror; paths are bundled doc routes, not marketing-site URLs. */
export const BUNDLED_DOCS_FOOTER_COLUMNS: readonly BundledDocsFooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Install", to: "/docs/site/pages/en/install" },
      { label: "Architecture", to: "/docs/architecture/architecture" },
      { label: "Memory guarantees", to: "/docs/site/pages/en/memory-guarantees" },
      { label: "FAQ", to: "/faq" },
    ],
  },
  {
    title: "Documentation",
    links: [
      { label: "Documentation", to: "/docs" },
      { label: "API", to: "/docs/site/pages/en/api" },
      { label: "MCP", to: "/docs/site/pages/en/mcp" },
      { label: "CLI", to: "/docs/site/pages/en/cli" },
    ],
  },
  {
    title: "External",
    links: [
      { label: "GitHub", href: "https://github.com/markmhendrickson/neotoma" },
      { label: "npm", href: "https://www.npmjs.com/package/neotoma" },
      { label: "Blog", href: "https://markmhendrickson.com/posts" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", to: "/docs/site/pages/en/privacy" },
      { label: "Terms", to: "/docs/site/pages/en/terms" },
    ],
  },
] as const;

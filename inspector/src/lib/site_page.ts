/** Public site pages served by `GET /site-pages/<route-slug>` (canonical paths like `/faq`). */

export interface SitePageFrontmatter {
  path: string;
  locale: string;
  page_title: string;
  shell?: "detail" | "bare";
  description?: string | null;
}

export interface SitePagePayload {
  path: string;
  locale: string;
  frontmatter: SitePageFrontmatter;
  body: string;
  headings?: Array<{ level: number; text: string; id: string }>;
}

/** In-app FAQ route (matches marketing site `/faq`, not developer-docs slug). */
export const FAQ_SITE_PATH = "/faq";

export async function fetchSitePage(
  routeSlug: string,
  options?: { locale?: string },
): Promise<SitePagePayload> {
  const slug = routeSlug.replace(/^\//, "");
  const locale = options?.locale ?? "en";
  const res = await fetch(`/site-pages/${slug}?format=json&locale=${locale}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Request failed with ${res.status}`);
  }
  return res.json() as Promise<SitePagePayload>;
}

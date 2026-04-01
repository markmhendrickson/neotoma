import { INDEXABLE_SITE_PAGE_PATHS } from "@/site/seo_metadata";

const SOURCE_PATH_SET = new Set(INDEXABLE_SITE_PAGE_PATHS);

/** Default-locale paths that may be exported as full-page Markdown under `/markdown/...`. */
export function isFullPageMarkdownSourcePath(pathname: string): boolean {
  return SOURCE_PATH_SET.has(pathname);
}

/** React Router splat under `/markdown/*` → source pathname (e.g. `install` → `/install`). */
export function markdownSplatToSourcePath(splat: string | undefined): string {
  if (splat == null || splat === "") return "/";
  const trimmed = splat.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "/";
  return `/${trimmed}`;
}

/** Shared privacy boundary for the SPA and the optional static reader adapter. */
export type SiteEventName =
  | "cta_click"
  | "outbound_click"
  | "docs_nav_click"
  | "product_nav_click"
  | "funnel_evaluate_prompt_copy"
  | "funnel_install_prompt_copy"
  | "funnel_preflight_copy";

/** The collector requires a UUID website ID; a malformed config stays inactive. */
export function validUmamiWebsiteId(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value));
}

/** One URL contract for SPA and static readers, including a safe self-hosted subpath. */
export function canonicalUmamiBaseUrl(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw || !/^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?(?:\/[a-z0-9_-]+)*\/?$/i.test(raw))
    return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      return undefined;
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return undefined;
  }
}

export function safePublicPath(rawPath: string, knownPaths: ReadonlySet<string>): string {
  const pathname = rawPath.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  return knownPaths.has(pathname) ? pathname : "/other";
}

export function safeOutboundDestination(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol === "mailto:") return "email";
    if (url.protocol === "tel:" || url.protocol === "sms:") return "phone";
    if (url.hostname === "github.com") return "github";
    if (url.hostname === "www.npmjs.com" || url.hostname === "npmjs.com") return "npm";
    if (url.hostname === "markmhendrickson.com") return "author_site";
  } catch {
    // Invalid or user-controlled destinations use the restrictive fallback.
  }
  return "other";
}

/** Object-form Umami payload excludes default browser URL, referrer and document title. */
export function explicitUmamiPayload(
  website: string,
  rawPath: string,
  knownPaths: ReadonlySet<string>,
  name?: SiteEventName,
  data?: Record<string, string>
): Record<string, unknown> {
  return {
    website,
    // The collector otherwise attributes a path-only URL to localhost.
    hostname: "neotoma.io",
    url: safePublicPath(rawPath, knownPaths),
    title: "Neotoma",
    ...(name ? { name, data: data ?? {} } : {}),
  };
}

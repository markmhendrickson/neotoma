/**
 * rendered_page publish service.
 *
 * Turns a `rendered_page` entity into a ready-to-share guest URL in one call:
 *   1. Optionally create the rendered_page from { title, html_body, custom_css }.
 *   2. Mint a guest_access_token scoped to that entity.
 *   3. Return the absolute `…/entities/<id>/html?access_token=<token>` URL + TTL.
 *
 * Implements neotoma#1619.
 *
 * Idempotency note: guest tokens are persisted only as a SHA-256 hash (see
 * guest_access_token.ts) — the raw token is never stored and cannot be
 * recovered. A working share URL therefore requires a freshly minted raw
 * token, so each successful publish call mints a new scoped token rather than
 * re-returning a prior one. Repeated calls for the same entity are safe (each
 * returns a valid URL); they do not collapse to a single token string.
 */

import { config } from "../../config.js";
import { generateGuestAccessToken } from "../guest_access_token.js";
import { getEntityWithProvenance } from "../entity_queries.js";

export interface PublishRenderedPageParams {
  /** Existing rendered_page entity id to publish. Mutually exclusive with inline fields. */
  entityId?: string;
  /** Inline page content (creates a new rendered_page when entityId is omitted). */
  title?: string;
  htmlBody?: string;
  customCss?: string;
  metaDescription?: string;
  userId: string;
}

export interface PublishRenderedPageResult {
  entity_id: string;
  share_url: string;
  access_token: string;
  ttl_seconds: number;
  created: boolean;
}

/** Resolve the absolute base URL the share link should be built against. */
function resolveShareBaseUrl(): string {
  const base = (config.apiBase || `http://localhost:${config.httpPort}`).replace(/\/+$/, "");
  return base;
}

/**
 * Publish a rendered_page (existing or inline) and return a guest-accessible URL.
 *
 * @param create - injected creator so the MCP server can reuse its own
 *   store/append path (which preserves object structure and provenance) without
 *   this service importing the server. Returns the new entity id.
 */
export async function publishRenderedPage(
  params: PublishRenderedPageParams,
  create: (fields: {
    title: string;
    html_body: string;
    custom_css?: string;
    meta_description?: string;
    userId: string;
  }) => Promise<string>
): Promise<PublishRenderedPageResult> {
  let entityId = params.entityId;
  let created = false;

  if (!entityId) {
    if (!params.title && !params.htmlBody) {
      throw new Error(
        "publish_rendered_page requires either an existing entity_id or inline content (title and/or html_body)."
      );
    }
    entityId = await create({
      title: params.title ?? "Untitled",
      html_body: params.htmlBody ?? "",
      custom_css: params.customCss,
      meta_description: params.metaDescription,
      userId: params.userId,
    });
    created = true;
  } else {
    // Validate the target exists and is actually a rendered_page before minting
    // a token — mirrors the GET /entities/:id/html 404 contract so the publish
    // surface stays explicit.
    const current = await getEntityWithProvenance(entityId);
    if (!current) {
      throw new Error(`rendered_page not found: ${entityId}`);
    }
    if (current.entity_type !== "rendered_page") {
      throw new Error(
        `Entity ${entityId} is not a rendered_page (got ${current.entity_type}); only rendered_page entities can be published.`
      );
    }
  }

  const token = await generateGuestAccessToken({
    entityIds: [entityId],
    userId: params.userId,
  });

  const ttlSeconds = (() => {
    const configured = Number.parseInt(
      process.env.NEOTOMA_GUEST_TOKEN_TTL_SECONDS ?? "",
      10
    );
    return Number.isFinite(configured) && configured > 0 ? configured : 30 * 24 * 60 * 60;
  })();

  const base = resolveShareBaseUrl();
  const share_url = `${base}/entities/${encodeURIComponent(entityId)}/html?access_token=${token}`;

  return {
    entity_id: entityId,
    share_url,
    access_token: token,
    ttl_seconds: ttlSeconds,
    created,
  };
}

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
import { db } from "../../db.js";
import { generateGuestAccessToken } from "../guest_access_token.js";

export interface PublishRenderedPageParams {
  /** Existing rendered_page entity id to publish. Mutually exclusive with inline fields. */
  entityId?: string;
  /** Inline page content (creates a new rendered_page when entityId is omitted). */
  title?: string;
  htmlBody?: string;
  customCss?: string;
  metaDescription?: string;
  userId: string;
  /**
   * Idempotency key for the inline-create path (MUST #11). Same key + same
   * payload ⇒ the same `rendered_page` entity is reused instead of duplicated.
   * Ignored when publishing an existing `entityId`.
   */
  idempotencyKey?: string;
}

export interface PublishRenderedPageResult {
  entity_id: string;
  share_url: string;
  access_token: string;
  ttl_seconds: number;
  created: boolean;
}

/**
 * Carries a stable `code` (+ optional `hint`/`details`) so the MCP/HTTP layer
 * can build a structured error envelope instead of concatenating prose into
 * `message` (errors.md § structured hints).
 */
export class PublishRenderedPageError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly envelope: { hint?: string; details?: Record<string, unknown> } = {}
  ) {
    super(message);
    this.name = "PublishRenderedPageError";
  }
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
    idempotencyKey?: string;
  }) => Promise<string>
): Promise<PublishRenderedPageResult> {
  let entityId = params.entityId;
  let created = false;

  if (!entityId) {
    if (!params.title && !params.htmlBody) {
      throw new PublishRenderedPageError(
        "ERR_PUBLISH_INPUT_MISSING",
        "publish_rendered_page requires either an existing entity_id or inline content.",
        { hint: "Pass entity_id to publish an existing rendered_page, or title/html_body to create one." }
      );
    }
    entityId = await create({
      title: params.title ?? "Untitled",
      html_body: params.htmlBody ?? "",
      custom_css: params.customCss,
      meta_description: params.metaDescription,
      userId: params.userId,
      idempotencyKey: params.idempotencyKey,
    });
    created = true;
  } else {
    // Validate the target exists, is owned by the caller, and is a rendered_page
    // before minting a token. Owner-scoping is REQUIRED (tenant isolation,
    // GHSA-wrr4-782v-jhwh): without `.eq("user_id", userId)` a caller could mint
    // a guest token for another user's rendered_page. Mirrors the owner-scoped
    // lookup in GET /entities/:id/html (actions.ts).
    const { data: entity, error: entityError } = await db
      .from("entities")
      .select("id, user_id, entity_type")
      .eq("id", entityId)
      .eq("user_id", params.userId)
      .maybeSingle();
    if (entityError) {
      throw new PublishRenderedPageError(
        "ERR_PUBLISH_LOOKUP_FAILED",
        "Failed to load the target entity.",
        { details: { message: entityError.message } }
      );
    }
    if (!entity) {
      // Not found OR not owned by caller — same response, no existence leak.
      throw new PublishRenderedPageError(
        "ERR_PUBLISH_NOT_FOUND",
        `rendered_page not found: ${entityId}`,
        { hint: "The entity does not exist or is not owned by the authenticated user." }
      );
    }
    if (entity.entity_type !== "rendered_page") {
      throw new PublishRenderedPageError(
        "ERR_PUBLISH_WRONG_TYPE",
        `Entity ${entityId} is not a rendered_page (got ${entity.entity_type}).`,
        { hint: "Only rendered_page entities can be published." }
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

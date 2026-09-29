/**
 * Guest read access to the source assets a rendered_page embeds (neotoma#1696).
 *
 * A rendered_page guest token (#1619) is scoped to the page entity only, so
 * `<img>`/`<audio>`/`<video>` elements pointing at `/sources/:id/content`
 * could not load for a logged-out recipient. This grants the token READ access
 * to exactly the sources the page's CURRENT content references, and nothing
 * else (least privilege):
 *
 *  - the token must be valid (unexpired, unrevoked) and have a recorded owner;
 *  - the source must be referenced, as `/sources/<id>/content`, in the
 *    `html_body` or `custom_css` of a `rendered_page` that is in the token's
 *    `entity_ids` scope and owned by the token's owner;
 *  - the source must be owned by that same owner;
 *  - the reference is resolved at request time from the page's current
 *    snapshot (no scope-list snapshot at mint time), so removing an asset from
 *    the page revokes access to it and tokens never go stale-broad;
 *  - it authorizes reading one source's content only. No listing, metadata,
 *    relationships, writes, or other entities.
 */

import { db } from "../../db.js";
import { getGuestTokenOwnerUserId, validateGuestAccessToken } from "../guest_access_token.js";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when `text` contains a `/sources/<sourceId>/content` reference. The id
 * must match as a whole path segment (preceded by `/sources/`, followed by
 * `/content` and then a non-path character), so a longer id that merely starts
 * with `sourceId` does not match.
 */
export function textReferencesSourceContent(text: string, sourceId: string): boolean {
  if (!text || !sourceId) return false;
  const re = new RegExp(
    `/sources/${escapeRegExp(encodeURIComponent(sourceId))}/content(?![A-Za-z0-9_\\-/])`
  );
  return re.test(text) || re.test(text.replace(/&amp;/g, "&"));
}

/**
 * Returns the owning user id when `token` may read `sourceId`'s content, else
 * null. Fails closed on every lookup error.
 */
export async function resolveGuestSourceReadGrant(
  token: string,
  sourceId: string
): Promise<{ userId: string } | null> {
  try {
    const grant = await validateGuestAccessToken(token);
    if (!grant || grant.entity_ids.length === 0) return null;
    const ownerId = await getGuestTokenOwnerUserId(token);
    if (!ownerId) return null;

    const { data: source } = await db
      .from("sources")
      .select("id")
      .eq("id", sourceId)
      .eq("user_id", ownerId)
      .maybeSingle();
    if (!source) return null;

    const { getEntityWithProvenance } = await import("../entity_queries.js");
    for (const pageId of grant.entity_ids) {
      const { data: page } = await db
        .from("entities")
        .select("id, entity_type, user_id")
        .eq("id", pageId)
        .eq("user_id", ownerId)
        .maybeSingle();
      if (!page || (page as { entity_type?: string }).entity_type !== "rendered_page") continue;
      const current = await getEntityWithProvenance(pageId, false, ownerId);
      const snap = (current?.snapshot ?? {}) as Record<string, unknown>;
      const html = typeof snap.html_body === "string" ? snap.html_body : "";
      const css = typeof snap.custom_css === "string" ? snap.custom_css : "";
      if (textReferencesSourceContent(html, sourceId) || textReferencesSourceContent(css, sourceId)) {
        return { userId: ownerId };
      }
    }
    return null;
  } catch {
    return null;
  }
}

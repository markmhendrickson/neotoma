/** Stable Inspector routes for entity relationship slices (by relationship + related type). */

export function entityRelationshipSubpageHref(
  entityId: string,
  relationshipType: string,
  relatedEntityType: string,
): string {
  return `/entities/${encodeURIComponent(entityId)}/relationships/${encodeURIComponent(relationshipType)}/${encodeURIComponent(relatedEntityType)}`;
}

export type EntityRelationshipSubpageParams = {
  entityId: string;
  relationshipType: string;
  relatedEntityType: string;
};

export function parseEntityRelationshipSubpageRoute(
  pathname: string,
): EntityRelationshipSubpageParams | null {
  const match = pathname.match(/^\/entities\/([^/]+)\/relationships\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  return {
    entityId: decodeURIComponent(match[1]!),
    relationshipType: decodeURIComponent(match[2]!),
    relatedEntityType: decodeURIComponent(match[3]!),
  };
}

/**
 * Neotoma deterministic entity ids match {@link generateEntityId} in
 * `entity_resolution.ts`: `ent_` plus the first 24 hex chars of a SHA-256 digest.
 */
export const NEOTOMA_ENTITY_ID_REGEX = /^ent_[0-9a-f]{24}$/;

export function isNeotomaEntityId(value: string | undefined | null): boolean {
  if (value === undefined || value === null) return false;
  return NEOTOMA_ENTITY_ID_REGEX.test(value.trim());
}

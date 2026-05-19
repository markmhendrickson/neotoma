/** Matches backend `src/shared/neotoma_entity_id.ts` — `ent_` plus 24 lowercase hex digits. */
export const NEOTOMA_ENTITY_ID_REGEX = /^ent_[0-9a-f]{24}$/;

export function isNeotomaEntityId(value: string | undefined | null): boolean {
  if (value === undefined || value === null) return false;
  return NEOTOMA_ENTITY_ID_REGEX.test(value.trim());
}

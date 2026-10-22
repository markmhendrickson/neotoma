/**
 * Deterministic structural serialization used as a content-hash / diff
 * primitive across correction surfaces: `batch_correction.ts`'s whole-
 * snapshot diff (`diffSnapshotFields`) and `array_item_patch.ts`'s per-item
 * `expected_item_version` token both need "are these two values the same"
 * with object key order ignored, so this lives in one place rather than
 * being redefined per caller.
 */
export function stableSerialize(v: unknown): string {
  if (v === undefined) return "__undefined__";
  if (v === null) return "null";
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return JSON.stringify(v.map(stableSerialize));
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableSerialize(obj[k])}`);
  return `{${parts.join(",")}}`;
}

/** Portable key domain shared by the public patch contract and reducer. */
export type PortableScalarKey = string | number | boolean;

export function isPortableScalarKey(value: unknown): value is PortableScalarKey {
  if (typeof value === "string" || typeof value === "boolean") return true;
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= Number.MAX_SAFE_INTEGER
  );
}

/**
 * Cross-language key representation: a type tag followed by stable JSON.
 * The tag keeps `"1"`, `1`, and `true` distinct. JSON intentionally gives
 * `-0` and `0` the same identity.
 */
export function canonicalizePortableScalarKey(value: unknown): string | null {
  if (!isPortableScalarKey(value)) return null;
  return `${typeof value}:${stableSerialize(value)}`;
}

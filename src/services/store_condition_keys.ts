/**
 * Native transaction primitives for the admitted conditional-store contract.
 * Callers must finish their existing zero-persistence refusal gates BEFORE
 * entering these primitives. They do not turn the legacy store into a transaction.
 */
import { createHash } from "node:crypto";
import type { DbConnection, DbDatabase } from "../repositories/db/driver.js";

export class StoreConditionError extends Error {
  readonly hint =
    "Retry the exact original request to determine its outcome; do not change its mode or payload under this key.";
  constructor(
    readonly code:
      | "STORE_KEY_MODE_CONFLICT"
      | "STORE_RECEIPT_UNCERTAIN"
      | "IDEMPOTENCY_CONFLICT"
      | "VALIDATION_ERROR",
    message: string
  ) {
    super(message);
  }
}

export function canonicalStoreRequest(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStoreRequest).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalStoreRequest((value as Record<string, unknown>)[key])}`
      )
      .join(",")}}`;
  throw new StoreConditionError(
    "VALIDATION_ERROR",
    "A conditional store requires finite JSON values."
  );
}

export function storeConditionKeyHash(key: string): string {
  // Existing store accepts every nonempty string. Do not trim or add a new bound.
  if (typeof key !== "string" || key.length === 0)
    throw new StoreConditionError("VALIDATION_ERROR", "A nonempty store key is required.");
  return createHash("sha256").update(key, "utf8").digest("hex");
}
export function storeConditionRequestHash(request: unknown): string {
  return createHash("sha256").update(canonicalStoreRequest(request)).digest("hex");
}
function assertOwner(owner: string) {
  if (typeof owner !== "string" || !owner)
    throw new StoreConditionError("VALIDATION_ERROR", "An authenticated store owner is required.");
}
interface KeyRow {
  mode: "legacy" | "conditional";
  request_hash: string | null;
  conditional_receipt: string | null;
}
async function keyRow(
  tx: DbConnection,
  owner: string,
  keyHash: string
): Promise<KeyRow | undefined> {
  const row = (await tx
    .prepare(
      "SELECT mode, request_hash, conditional_receipt FROM store_condition_keys WHERE user_id = ? AND key_hash = ?"
    )
    .get(owner, keyHash)) as KeyRow | undefined;
  if (row && row.mode !== "legacy" && row.mode !== "conditional")
    throw new StoreConditionError("STORE_RECEIPT_UNCERTAIN", "Store mode metadata is invalid.");
  return row;
}

/** Claim all real source-key domains together, before either leg uploads bytes. */
export async function reserveLegacyStoreKeys(
  database: DbDatabase,
  owner: string,
  keys: string[]
): Promise<void> {
  assertOwner(owner);
  const hashes = [...new Set(keys.map(storeConditionKeyHash))].sort();
  if (!hashes.length) return;
  await database.transaction(async (tx) => {
    for (const hash of hashes) {
      const existing = await keyRow(tx, owner, hash);
      if (existing?.mode === "conditional")
        throw new StoreConditionError(
          "STORE_KEY_MODE_CONFLICT",
          "This owner/key belongs to a conditional store."
        );
      if (existing && (existing.request_hash !== null || existing.conditional_receipt !== null))
        throw new StoreConditionError(
          "STORE_RECEIPT_UNCERTAIN",
          "Legacy mode metadata is invalid."
        );
      if (!existing)
        await tx
          .prepare(
            "INSERT INTO store_condition_keys (user_id,key_hash,mode,request_hash,created_at,conditional_receipt) VALUES (?,?,'legacy',NULL,?,NULL)"
          )
          .run(owner, hash, new Date().toISOString());
    }
  });
}

export interface ConditionalOperationReceipt {
  version: 1;
  status: "applied" | "replayed";
  request_fingerprint: string;
  source_id: string;
  entity_id: string;
  entity_type: string;
  observation_id: string;
  schema_identity_digest: string;
  unknown_fields_count: number;
  diagnostics: Record<string, unknown>;
}
function receipt(value: unknown, fingerprint: string): ConditionalOperationReceipt {
  const v = value as ConditionalOperationReceipt | null;
  if (
    !v ||
    v.version !== 1 ||
    v.status !== "applied" ||
    v.request_fingerprint !== fingerprint ||
    ![v.source_id, v.entity_id, v.entity_type, v.observation_id, v.schema_identity_digest].every(
      (x) => typeof x === "string" && x.length > 0
    ) ||
    !Number.isSafeInteger(v.unknown_fields_count) ||
    v.unknown_fields_count < 0 ||
    !v.diagnostics ||
    typeof v.diagnostics !== "object" ||
    Array.isArray(v.diagnostics)
  )
    throw new StoreConditionError(
      "STORE_RECEIPT_UNCERTAIN",
      "The original conditional receipt cannot be verified."
    );
  return v;
}

/**
 * The driver acquires the native write lock before reading mode/presence. apply
 * must write the entire source/entity/observation/snapshot and return its exact
 * marked original receipt. verify must bind that receipt to immutable native
 * observations (a current snapshot is not an original receipt). No replay calls apply.
 * No notifications or byte cleanup are performed by this primitive.
 */
export async function commitConditionalStoreKey(
  database: DbDatabase,
  options: {
    owner: string;
    key: string;
    request: unknown;
    apply: (tx: DbConnection, fingerprint: string) => Promise<ConditionalOperationReceipt>;
    verify: (tx: DbConnection, original: ConditionalOperationReceipt) => Promise<void>;
  }
): Promise<ConditionalOperationReceipt> {
  assertOwner(options.owner);
  const keyHash = storeConditionKeyHash(options.key);
  const fingerprint = storeConditionRequestHash(options.request);
  return database.transaction(async (tx) => {
    const prior = await keyRow(tx, options.owner, keyHash);
    if (prior?.mode === "legacy")
      throw new StoreConditionError(
        "STORE_KEY_MODE_CONFLICT",
        "This owner/key belongs to a legacy store."
      );
    if (prior) {
      if (prior.request_hash !== fingerprint)
        throw new StoreConditionError(
          "IDEMPOTENCY_CONFLICT",
          "The original conditional request differs."
        );
      let parsed: unknown;
      try {
        parsed = JSON.parse(prior.conditional_receipt ?? "");
      } catch {
        throw new StoreConditionError(
          "STORE_RECEIPT_UNCERTAIN",
          "The original conditional receipt is missing or malformed."
        );
      }
      const original = receipt(parsed, fingerprint);
      await options.verify(tx, original);
      return { ...original, status: "replayed" };
    }
    // A pre-migration source is already legacy even if it has no mode row.
    const oldSource = await tx
      .prepare("SELECT id FROM sources WHERE user_id = ? AND idempotency_key = ? LIMIT 1")
      .get(options.owner, options.key);
    if (oldSource)
      throw new StoreConditionError(
        "STORE_KEY_MODE_CONFLICT",
        "This owner/key has an existing legacy source."
      );
    await tx
      .prepare(
        "INSERT INTO store_condition_keys (user_id,key_hash,mode,request_hash,created_at,conditional_receipt) VALUES (?,?,'conditional',?,?,NULL)"
      )
      .run(options.owner, keyHash, fingerprint, new Date().toISOString());
    const original = receipt(await options.apply(tx, fingerprint), fingerprint);
    await options.verify(tx, original);
    const write = await tx
      .prepare(
        "UPDATE store_condition_keys SET conditional_receipt = ? WHERE user_id = ? AND key_hash = ? AND mode = 'conditional' AND request_hash = ? AND conditional_receipt IS NULL"
      )
      .run(canonicalStoreRequest(original), options.owner, keyHash, fingerprint);
    if (write.changes !== 1)
      throw new StoreConditionError(
        "STORE_RECEIPT_UNCERTAIN",
        "The conditional receipt could not be committed."
      );
    return original;
  });
}

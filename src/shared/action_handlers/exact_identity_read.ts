import { peekCachedDb } from "../../repositories/db/connection.js";
import { WorkerFileDatabase } from "../../repositories/worker/worker_file_database.js";
import {
  isBoundedIdentityValue,
  readBoundedIdentityInView,
} from "../../services/bounded_identity_read.js";
import { predicateValue } from "../entity_read_contract.js";
import type { components } from "../openapi_types.js";

type ExactIdentityRead = components["schemas"]["ExactIdentityRead"];
const mode = "exact_identity";

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function exactIdentityRequested(input: unknown): input is Record<string, unknown> {
  if (!object(input)) return false;
  const value = input.read_mode;
  return value === mode || (Array.isArray(value) && value.includes(mode));
}

export const EXACT_IDENTITY_REQUEST_MESSAGE =
  "Exact identity requires one entity type and one string equality, with no other options. Identifiers must be 1–64 lowercase ASCII letters/digits/underscore, starting with a letter; values must be 1–256 Unicode characters without C0/C1 controls.";

/** The owner is resolved by the existing transport auth before calling this executor. */
export async function readExactIdentity(
  raw: Record<string, unknown>,
  owner: string
): Promise<ExactIdentityRead | undefined> {
  if (
    raw.read_mode !== mode ||
    Object.keys(raw).length !== 3 ||
    typeof raw.entity_type !== "string" ||
    !/^[a-z][a-z0-9_]{0,63}$/.test(raw.entity_type) ||
    !object(raw.snapshot_filters)
  )
    return undefined;
  const entries = Object.entries(raw.snapshot_filters);
  if (entries.length !== 1) return undefined;
  const [field, filter] = entries[0];
  if (
    !/^[a-z][a-z0-9_]{0,63}$/.test(field) ||
    !object(filter) ||
    Object.keys(filter).length !== 2 ||
    filter.op !== "eq" ||
    !isBoundedIdentityValue(filter.value)
  )
    return undefined;

  const { entity_type } = raw;
  const { value } = filter;
  const requested_scope = {
    owner: "authenticated" as const,
    entity_type,
    field,
    value_sha256: predicateValue(value).value,
  };
  const unproved = {
    version: "1",
    state: "unproved",
    common_view: false,
    requested_scope,
  } as const;
  const db = peekCachedDb();
  if (!(db instanceof WorkerFileDatabase)) return unproved;
  try {
    const result = await db.withPinnedReadView((view) =>
      readBoundedIdentityInView(view, owner, entity_type, field, value)
    );
    if (result.state === "unproved") return unproved;
    return {
      version: "1",
      state: result.state,
      common_view: true,
      requested_scope,
      ...(result.state === "singleton" ? { entity: result.entity } : {}),
    };
  } catch {
    return unproved;
  }
}

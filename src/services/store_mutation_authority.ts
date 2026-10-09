/** Server-owned scope for lower storage calls inside a conditional transaction. */
import { AsyncLocalStorage } from "node:async_hooks";
import { getDb } from "../repositories/db/connection.js";
import type { DbConnection } from "../repositories/db/driver.js";
import {
  reserveLegacyStoreKeys,
  storeConditionKeyIdentity,
  StoreConditionError,
} from "./store_condition_keys.js";
interface Authority {
  owner: string;
  key: string;
  active: boolean;
  verify: () => Promise<void>;
}
const conditionalMutation = new AsyncLocalStorage<Authority>();
export async function withConditionalStoreMutation<T>(
  tx: DbConnection,
  owner: string,
  key: string,
  fingerprint: string,
  apply: () => Promise<T>
): Promise<T> {
  const identity = await storeConditionKeyIdentity(tx, key);
  const authority: Authority = {
    owner,
    key,
    active: true,
    verify: async () => {
      const row = (await tx
        .prepare(
          "SELECT mode,request_hash,key_identity_hash,conditional_receipt FROM store_condition_keys WHERE user_id=? AND key_hash=?"
        )
        .get(owner, identity.keyHash)) as Record<string, unknown> | undefined;
      if (
        !authority.active ||
        row?.mode !== "conditional" ||
        row.request_hash !== fingerprint ||
        row.key_identity_hash !== identity.identityHash ||
        row.conditional_receipt !== null
      )
        throw new StoreConditionError(
          "STORE_RECEIPT_UNCERTAIN",
          "The transaction-owned conditional mutation claim is unavailable."
        );
    },
  };
  await authority.verify();
  try {
    return await conditionalMutation.run(authority, apply);
  } finally {
    authority.active = false;
  }
}
export async function claimRawStoreKey(owner: string, key?: string): Promise<void> {
  if (!key) return;
  const authority = conditionalMutation.getStore();
  if (authority?.owner === owner && authority.key === key) {
    await authority.verify();
    return;
  }
  await reserveLegacyStoreKeys(await getDb(), owner, [key]);
}

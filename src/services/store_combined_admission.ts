/** Claim the actual combined key domains only after both legs' pure admission. */
import fs from "node:fs";
import path from "node:path";
import {
  preflightStructuredStoreAdmission,
  type StructuredStoreApiParams,
} from "./store_admission.js";
import { assertStorePolicyAllows } from "./instance_policy.js";
import { schemaRegistry } from "./schema_registry.js";
import { enforceAttributionPolicy } from "./attribution_policy.js";
import { getCurrentAgentIdentity } from "./request_context.js";
import {
  decodeFileContent,
  isFilesystemLocalToCaller,
  buildFilePathServerLocalError,
} from "./file_input_diagnostics.js";
import { reserveLegacyStoreKeys } from "./store_condition_keys.js";
import { getDb } from "../repositories/db/connection.js";
export async function claimCombinedStoreKeys(
  params: StructuredStoreApiParams,
  file: {
    key?: string;
    content?: string;
    filePath?: string;
  }
): Promise<void> {
  if (params.commit === false) return;
  // Read/decode is pure; an invalid file cannot leave an arbitration claim.
  if (file.filePath) {
    if (!isFilesystemLocalToCaller()) throw buildFilePathServerLocalError(file.filePath);
    const resolved = path.resolve(file.filePath);
    fs.readFileSync(resolved);
  } else if (file.content !== undefined) decodeFileContent(file.content);
  await preflightStructuredStoreAdmission(params);
  await assertStorePolicyAllows(
    params.entities.map((entity) => {
      const fields = { ...entity };
      delete fields.entity_type;
      delete fields.type;
      return {
        entity_type: (entity.entity_type as string) || (entity.type as string) || "generic",
        fields,
      };
    }),
    async (entityType) =>
      (await schemaRegistry.loadActiveSchema(entityType, params.userId))?.schema_definition ?? null
  );
  enforceAttributionPolicy("sources", getCurrentAgentIdentity());
  enforceAttributionPolicy("observations", getCurrentAgentIdentity());
  await reserveLegacyStoreKeys(await getDb(), params.userId, [
    params.idempotencyKey,
    ...(file.key ? [file.key] : []),
  ]);
}

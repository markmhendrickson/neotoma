/** Internal lifecycle storage. Not a public store/correct/import parameter. */
import { createHash } from "node:crypto";
import type { DbConnection, DbDatabase } from "../repositories/db/driver.js";
import {
  ENTITY_LIFECYCLE_CUTOVER_ID,
  ENTITY_LEGACY_SELECTOR_VERSION,
  EntityLifecycleAcquisitionError,
  hasEntityLifecycleAuthority,
  legacyMembershipDigest,
  selectLegacyEntityVisibility,
  type LifecycleObservation,
  type LifecycleTarget,
} from "./entity_lifecycle_authority.js";
function refuse(): never {
  throw new EntityLifecycleAcquisitionError();
}
interface EntityRow extends LifecycleTarget {
  merged_to_entity_id?: string | null;
}
function observation(raw: Record<string, unknown>): LifecycleObservation {
  const fields = typeof raw.fields === "string" ? JSON.parse(raw.fields) : raw.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) refuse();
  return { ...raw, fields } as LifecycleObservation;
}
/** Schema only: deliberately does not initiate a compatibility migration. */
export async function installEntityLifecycleStorage(tx: DbConnection): Promise<void> {
  const columns = (await tx.prepare("PRAGMA table_info(observations)").all()) as { name: string }[];
  for (const [name, type] of [
    ["entity_lifecycle_kind", "TEXT"],
    ["entity_lifecycle_sequence", "INTEGER"],
    ["entity_lifecycle_target_id", "TEXT"],
  ]) {
    if (!columns.some((c) => c.name === name))
      await tx.exec(`ALTER TABLE observations ADD COLUMN ${name} ${type}`);
  }
  await tx.exec(`
    CREATE TABLE IF NOT EXISTS entity_lifecycle_cutovers (
      cutover_id TEXT PRIMARY KEY CHECK(cutover_id = 'entity_lifecycle_authority_v1'),
      selector_version TEXT NOT NULL CHECK(selector_version = 'entity_visibility_legacy_v1'),
      recorded_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entity_lifecycle_legacy_membership (
      cutover_id TEXT NOT NULL REFERENCES entity_lifecycle_cutovers(cutover_id),
      owner_id TEXT NOT NULL,
      observation_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      PRIMARY KEY(cutover_id, owner_id, observation_id)
    );
    CREATE INDEX IF NOT EXISTS idx_entity_lifecycle_membership_target
      ON entity_lifecycle_legacy_membership(cutover_id, owner_id, target_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_lifecycle_sequence
      ON observations(user_id, entity_lifecycle_target_id, entity_lifecycle_sequence)
      WHERE entity_lifecycle_kind IS NOT NULL;
    CREATE TRIGGER IF NOT EXISTS entity_lifecycle_tuple_insert BEFORE INSERT ON observations
    WHEN COALESCE((
      (NEW.entity_lifecycle_kind IS NULL AND NEW.entity_lifecycle_sequence IS NULL AND NEW.entity_lifecycle_target_id IS NULL) OR
      (NEW.entity_lifecycle_kind IN ('delete','restore','legacy_visible','legacy_hidden') AND
       typeof(NEW.entity_lifecycle_sequence) = 'integer' AND NEW.entity_lifecycle_sequence BETWEEN 0 AND 9007199254740991 AND
       ((NEW.entity_lifecycle_kind IN ('legacy_visible','legacy_hidden') AND NEW.entity_lifecycle_sequence = 0) OR
        (NEW.entity_lifecycle_kind IN ('delete','restore') AND NEW.entity_lifecycle_sequence > 0)) AND
       typeof(NEW.entity_lifecycle_target_id) = 'text' AND length(NEW.entity_lifecycle_target_id) > 0 AND
       NEW.user_id IS NOT NULL)), 0) = 0
    BEGIN SELECT RAISE(ABORT, 'Invalid entity lifecycle authority tuple'); END;
    CREATE TRIGGER IF NOT EXISTS entity_lifecycle_tuple_immutable BEFORE UPDATE ON observations
    WHEN NEW.entity_lifecycle_kind IS NOT OLD.entity_lifecycle_kind OR
         NEW.entity_lifecycle_sequence IS NOT OLD.entity_lifecycle_sequence OR
         NEW.entity_lifecycle_target_id IS NOT OLD.entity_lifecycle_target_id OR
         (OLD.entity_lifecycle_kind IS NOT NULL AND (NEW.user_id IS NOT OLD.user_id OR NEW.entity_type IS NOT OLD.entity_type))
    BEGIN SELECT RAISE(ABORT, 'Entity lifecycle authority is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS entity_lifecycle_cutover_immutable_update BEFORE UPDATE ON entity_lifecycle_cutovers
    BEGIN SELECT RAISE(ABORT, 'Entity lifecycle cutover is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS entity_lifecycle_cutover_immutable_delete BEFORE DELETE ON entity_lifecycle_cutovers
    BEGIN SELECT RAISE(ABORT, 'Entity lifecycle cutover is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS entity_lifecycle_membership_immutable_update BEFORE UPDATE ON entity_lifecycle_legacy_membership
    BEGIN SELECT RAISE(ABORT, 'Entity lifecycle membership is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS entity_lifecycle_membership_immutable_delete BEFORE DELETE ON entity_lifecycle_legacy_membership
    BEGIN SELECT RAISE(ABORT, 'Entity lifecycle membership is immutable'); END;
  `);
}
async function entity(tx: DbConnection, id: string, owner: string): Promise<EntityRow> {
  const row = (await tx
    .prepare("SELECT * FROM entities WHERE id = ? AND user_id = ?")
    .get(id, owner)) as EntityRow | undefined;
  if (!row || !row.entity_type) refuse();
  return row;
}
async function validateRecordedCutover(
  tx: DbConnection
): Promise<{ baselines: number; members: number }> {
  const registry = (await tx.prepare("SELECT * FROM entity_lifecycle_cutovers").all()) as {
    cutover_id: string;
    selector_version: string;
    recorded_at: string;
  }[];
  if (
    registry.length !== 1 ||
    registry[0].cutover_id !== ENTITY_LIFECYCLE_CUTOVER_ID ||
    registry[0].selector_version !== ENTITY_LEGACY_SELECTOR_VERSION ||
    !Number.isFinite(Date.parse(registry[0].recorded_at))
  )
    refuse();
  const baselines = (await tx
    .prepare("SELECT * FROM observations WHERE entity_lifecycle_sequence = 0")
    .all()) as Record<string, unknown>[];
  let members = 0;
  const targets = new Set<string>();
  for (const raw of baselines) {
    const row = observation(raw);
    if (!hasEntityLifecycleAuthority(row)) refuse();
    const target = await entity(tx, row.entity_lifecycle_target_id!, row.user_id);
    if (target.entity_type !== row.entity_type) refuse();
    const key = JSON.stringify([row.user_id, row.entity_lifecycle_target_id]);
    if (targets.has(key)) refuse();
    targets.add(key);
    const recorded = (await tx
      .prepare(
        "SELECT observation_id FROM entity_lifecycle_legacy_membership WHERE cutover_id = ? AND owner_id = ? AND target_id = ? ORDER BY observation_id"
      )
      .all(ENTITY_LIFECYCLE_CUTOVER_ID, row.user_id, target.id)) as { observation_id: string }[];
    const ids = recorded.map((r) => r.observation_id);
    const fields = row.fields;
    if (
      fields.selector_version !== ENTITY_LEGACY_SELECTOR_VERSION ||
      fields.legacy_membership_count !== ids.length ||
      fields.legacy_membership_sha256 !== legacyMembershipDigest(ids)
    )
      refuse();
    for (const id of ids) {
      const original = (await tx
        .prepare("SELECT user_id, entity_type FROM observations WHERE id = ?")
        .get(id)) as { user_id: string; entity_type: string } | undefined;
      if (!original || original.user_id !== row.user_id || original.entity_type !== row.entity_type)
        refuse();
    }
    members += ids.length;
  }
  const total = (await tx
    .prepare("SELECT COUNT(*) AS n FROM entity_lifecycle_legacy_membership")
    .get()) as { n: number };
  if (total.n !== members) refuse();
  return { baselines: baselines.length, members };
}
/**
 * One serialized compatibility transition over a supplied local database.
 * No caller in startup/HTTP/MCP invokes it yet: adoption is a separate gate.
 * Original observations are never updated; replay validates the frozen capture.
 */
export async function migrateEntityLifecycleAuthority(
  database: DbDatabase
): Promise<{ baselines: number; members: number; replay: boolean }> {
  return database.transaction(async (tx) => {
    await installEntityLifecycleStorage(tx);
    const existing = await tx.prepare("SELECT cutover_id FROM entity_lifecycle_cutovers").get();
    if (existing) return { ...(await validateRecordedCutover(tx)), replay: true };
    const populated = (await tx
      .prepare(
        "SELECT COUNT(*) AS n FROM observations WHERE entity_lifecycle_kind IS NOT NULL OR entity_lifecycle_sequence IS NOT NULL OR entity_lifecycle_target_id IS NOT NULL"
      )
      .get()) as { n: number };
    if (populated.n !== 0) refuse();
    const recordedAt = new Date().toISOString();
    await tx
      .prepare(
        "INSERT INTO entity_lifecycle_cutovers(cutover_id, selector_version, recorded_at) VALUES (?, ?, ?)"
      )
      .run(ENTITY_LIFECYCLE_CUTOVER_ID, ENTITY_LEGACY_SELECTOR_VERSION, recordedAt);
    let lastId = "";
    let baselines = 0;
    let members = 0;
    for (;;) {
      // Complete keyset scan, bounded acquisition batches with no truncation.
      const rows = (await tx
        .prepare("SELECT * FROM entities WHERE id > ? ORDER BY id LIMIT 250")
        .all(lastId)) as EntityRow[];
      if (rows.length === 0) break;
      for (const target of rows) {
        lastId = target.id;
        if (!target.user_id || !target.entity_type) refuse();
        if (target.merged_to_entity_id) {
          let current = target;
          const visited = new Set<string>();
          while (current.merged_to_entity_id) {
            if (visited.has(current.id) || visited.size >= 32) refuse();
            visited.add(current.id);
            current = await entity(tx, current.merged_to_entity_id, target.user_id);
            if (current.entity_type !== target.entity_type) refuse();
          }
          continue;
        }
        const raw = (await tx
          .prepare(
            "SELECT * FROM observations WHERE entity_id = ? ORDER BY observed_at DESC, id ASC"
          )
          .all(target.id)) as Record<string, unknown>[];
        const observations = raw.map(observation);
        if (
          observations.some(
            (r) => r.user_id !== target.user_id || r.entity_type !== target.entity_type
          )
        )
          refuse();
        const selected = selectLegacyEntityVisibility(observations);
        const ids = observations.map((r) => r.id);
        const digest = legacyMembershipDigest(ids);
        const id = createHash("sha256")
          .update(
            JSON.stringify([
              ENTITY_LIFECYCLE_CUTOVER_ID,
              target.user_id,
              target.id,
              ENTITY_LEGACY_SELECTOR_VERSION,
            ])
          )
          .digest("hex");
        const fields = {
          selector_version: ENTITY_LEGACY_SELECTOR_VERSION,
          selected_legacy_observation_id: selected.selected_observation_id,
          legacy_deleted: selected.hidden,
          legacy_membership_count: ids.length,
          legacy_membership_sha256: digest,
        };
        await tx
          .prepare(
            "INSERT INTO observations(id, entity_id, entity_type, schema_version, observed_at, created_at, source_priority, fields, user_id, entity_lifecycle_kind, entity_lifecycle_sequence, entity_lifecycle_target_id) VALUES (?, ?, ?, '1.0', ?, ?, 0, ?, ?, ?, 0, ?)"
          )
          .run(
            id,
            target.id,
            target.entity_type,
            recordedAt,
            recordedAt,
            JSON.stringify(fields),
            target.user_id,
            selected.hidden ? "legacy_hidden" : "legacy_visible",
            target.id
          );
        for (const originalId of ids)
          await tx
            .prepare(
              "INSERT INTO entity_lifecycle_legacy_membership(cutover_id, owner_id, observation_id, target_id) VALUES (?, ?, ?, ?)"
            )
            .run(ENTITY_LIFECYCLE_CUTOVER_ID, target.user_id, originalId, target.id);
        baselines++;
        members += ids.length;
      }
    }
    const validated = await validateRecordedCutover(tx);
    if (validated.baselines !== baselines || validated.members !== members) refuse();
    return { baselines, members, replay: false };
  });
}

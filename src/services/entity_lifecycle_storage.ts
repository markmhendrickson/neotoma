/** Internal lifecycle storage. Not a public store/correct/import parameter. */
import { createHash } from "node:crypto";
import { fromDbRow, toDbValue } from "../repositories/sqlite/local_db_adapter.js";
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
  type EntityLifecycleContext,
  type LegacyMembershipCertificate,
} from "./entity_lifecycle_authority.js";
function refuse(): never {
  throw new EntityLifecycleAcquisitionError();
}
interface EntityRow extends LifecycleTarget {
  merged_to_entity_id?: string | null;
}
function observation(raw: Record<string, unknown>): LifecycleObservation {
  const fields = fromDbRow("observations", raw).fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) refuse();
  return { ...raw, fields } as LifecycleObservation;
}
/** Explicit installed cutover state; never learn it from a marker payload. */
export async function hasRecordedEntityLifecycleCutover(tx: DbConnection): Promise<boolean> {
  const columns = (await tx.prepare("PRAGMA table_info(observations)").all()) as { name: string }[];
  const names = [
    "entity_lifecycle_kind",
    "entity_lifecycle_sequence",
    "entity_lifecycle_target_id",
  ];
  const found = names.filter((name) => columns.some((c) => c.name === name));
  if (found.length && found.length !== names.length) refuse();
  const table = await tx
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='entity_lifecycle_cutovers'"
    )
    .get();
  const rows = table
    ? ((await tx.prepare("SELECT * FROM entity_lifecycle_cutovers").all()) as Record<
        string,
        unknown
      >[])
    : [];
  if (!rows.length) {
    if (
      found.length &&
      (await tx
        .prepare(
          `SELECT id FROM observations WHERE ${names.map((n) => `${n} IS NOT NULL`).join(" OR ")} LIMIT 1`
        )
        .get())
    )
      refuse();
    return false;
  }
  if (
    found.length !== names.length ||
    rows.length !== 1 ||
    rows[0].cutover_id !== ENTITY_LIFECYCLE_CUTOVER_ID ||
    rows[0].selector_version !== ENTITY_LEGACY_SELECTOR_VERSION ||
    !Number.isFinite(Date.parse(rows[0].recorded_at as string))
  )
    refuse();
  return true;
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
  database: DbDatabase,
  materialize?: (tx: DbConnection, targets: readonly LifecycleTarget[]) => Promise<void>,
  validation?: {
    before(tx: DbConnection): Promise<void>;
    after(
      tx: DbConnection,
      outcome: { baselines: number; members: number; replay: boolean }
    ): Promise<void>;
  }
): Promise<{ baselines: number; members: number; replay: boolean }> {
  if (
    validation &&
    (typeof validation.before !== "function" || typeof validation.after !== "function")
  )
    refuse();
  return database.transaction(async (tx) => {
    if (validation) await validation.before(tx);
    await installEntityLifecycleStorage(tx);
    const existing = await tx.prepare("SELECT cutover_id FROM entity_lifecycle_cutovers").get();
    if (existing) {
      const outcome = { ...(await validateRecordedCutover(tx)), replay: true };
      if (validation) await validation.after(tx, outcome);
      return outcome;
    }
    const populated = (await tx
      .prepare(
        "SELECT COUNT(*) AS n FROM observations WHERE entity_lifecycle_kind IS NOT NULL OR entity_lifecycle_sequence IS NOT NULL OR entity_lifecycle_target_id IS NOT NULL"
      )
      .get()) as { n: number };
    if (populated.n !== 0) refuse();
    const hasSnapshots = await tx
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entity_snapshots'")
      .get();
    if (hasSnapshots && !materialize) refuse(); // no half-cutover over a materialized store
    const capturedTargets: LifecycleTarget[] = [];
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
            toDbValue("observations", "fields", fields),
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
        capturedTargets.push(target);
        baselines++;
        members += ids.length;
      }
    }
    const validated = await validateRecordedCutover(tx);
    if (validated.baselines !== baselines || validated.members !== members) refuse();
    if (materialize) await materialize(tx, capturedTargets);
    const outcome = { baselines, members, replay: false };
    if (validation) await validation.after(tx, outcome);
    return outcome;
  });
}

/** Current/native acquisition is verified against the complete physical attachment set.
 * Temporal callers supply all rows and explicit bounds; filtered arrays cannot
 * silently become a current authority proof. Missing metadata is never inferred.
 */
export async function acquireEntityLifecycleContext(
  tx: DbConnection,
  target: LifecycleTarget,
  rows: readonly LifecycleObservation[],
  temporal?: { at?: string; at_ingested?: string }
): Promise<EntityLifecycleContext> {
  const tables = await tx
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entity_lifecycle_cutovers'"
    )
    .all();
  if (tables.length === 0) {
    if (rows.some(hasEntityLifecycleAuthority)) refuse();
    return { acquisition: "complete", target, mode: "pre_migration" };
  }
  const registry = (await tx.prepare("SELECT * FROM entity_lifecycle_cutovers").all()) as {
    cutover_id: string;
    selector_version: string;
    recorded_at: string;
  }[];
  if (registry.length === 0) {
    const invalid = await tx
      .prepare(
        "SELECT id FROM observations WHERE entity_lifecycle_kind IS NOT NULL OR entity_lifecycle_sequence IS NOT NULL OR entity_lifecycle_target_id IS NOT NULL LIMIT 1"
      )
      .get();
    if (invalid || rows.some(hasEntityLifecycleAuthority)) refuse();
    return { acquisition: "complete", target, mode: "pre_migration" };
  }
  if (
    registry.length !== 1 ||
    registry[0].cutover_id !== ENTITY_LIFECYCLE_CUTOVER_ID ||
    registry[0].selector_version !== ENTITY_LEGACY_SELECTOR_VERSION ||
    !Number.isFinite(Date.parse(registry[0].recorded_at))
  )
    refuse();
  const physicalTarget = await entity(tx, target.id, target.user_id);
  if (physicalTarget.entity_type !== target.entity_type || physicalTarget.merged_to_entity_id)
    refuse();
  const physical = (await tx
    .prepare("SELECT id FROM observations WHERE entity_id = ? AND user_id = ? ORDER BY id")
    .all(target.id, target.user_id)) as { id: string }[];
  const suppliedIds = rows.map((r) => r.id).sort();
  if (
    new Set(suppliedIds).size !== suppliedIds.length ||
    JSON.stringify(physical.map((r) => r.id)) !== JSON.stringify(suppliedIds)
  )
    refuse();
  const targetIds = new Set([target.id]);
  for (const row of rows)
    if (hasEntityLifecycleAuthority(row)) targetIds.add(row.entity_lifecycle_target_id!);
  const attachedMemberships = (await tx
    .prepare(
      "SELECT m.target_id FROM entity_lifecycle_legacy_membership m JOIN observations o ON o.id=m.observation_id WHERE o.entity_id=? AND m.owner_id=? GROUP BY m.target_id"
    )
    .all(target.id, target.user_id)) as { target_id: string }[];
  for (const row of attachedMemberships) targetIds.add(row.target_id);
  const targets: LifecycleTarget[] = [];
  const certificates: LegacyMembershipCertificate[] = [];
  for (const id of targetIds) {
    const ownerTarget = await entity(tx, id, target.user_id);
    if (ownerTarget.entity_type !== target.entity_type) refuse();
    targets.push(ownerTarget);
    const baselines = (await tx
      .prepare(
        "SELECT * FROM observations WHERE user_id=? AND entity_lifecycle_target_id=? AND entity_lifecycle_sequence=0"
      )
      .all(target.user_id, id)) as Record<string, unknown>[];
    if (baselines.length > 1) refuse();
    const members = (await tx
      .prepare(
        "SELECT observation_id FROM entity_lifecycle_legacy_membership WHERE cutover_id=? AND owner_id=? AND target_id=? ORDER BY observation_id"
      )
      .all(ENTITY_LIFECYCLE_CUTOVER_ID, target.user_id, id)) as { observation_id: string }[];
    if (!baselines.length) {
      if (members.length) refuse();
      continue;
    }
    const baseline = observation(baselines[0]);
    if (
      !hasEntityLifecycleAuthority(baseline) ||
      baseline.entity_type !== target.entity_type ||
      baseline.fields.selector_version !== ENTITY_LEGACY_SELECTOR_VERSION
    )
      refuse();
    const ids = members.map((m) => m.observation_id);
    if (
      baseline.fields.legacy_membership_count !== ids.length ||
      baseline.fields.legacy_membership_sha256 !== legacyMembershipDigest(ids)
    )
      refuse();
    // Verify captured identity ownership even if merge changed attachment.
    for (const memberId of ids) {
      const original = (await tx
        .prepare("SELECT user_id,entity_type FROM observations WHERE id=?")
        .get(memberId)) as { user_id: string; entity_type: string } | undefined;
      if (
        !original ||
        original.user_id !== target.user_id ||
        original.entity_type !== target.entity_type
      )
        refuse();
    }
    certificates.push({
      target: ownerTarget,
      observation_ids: ids,
      count: ids.length,
      sha256: legacyMembershipDigest(ids),
    });
  }
  return {
    acquisition: "complete",
    target,
    mode: temporal ? "historical" : "current",
    cutover_id: ENTITY_LIFECYCLE_CUTOVER_ID,
    selector_version: ENTITY_LEGACY_SELECTOR_VERSION,
    recorded_at: registry[0].recorded_at,
    legacy_memberships: certificates,
    authority_targets: targets,
    ...temporal,
  };
}

/** Private SQL authority append: called only by the owned lifecycle transaction. */
export async function appendEntityLifecycleAction(
  tx: DbConnection,
  target: LifecycleTarget,
  kind: "delete" | "restore",
  fields: Record<string, unknown>,
  observedAt: string
): Promise<string> {
  if (!Number.isFinite(Date.parse(observedAt))) refuse();
  const registry = await tx
    .prepare("SELECT cutover_id FROM entity_lifecycle_cutovers WHERE cutover_id=?")
    .get(ENTITY_LIFECYCLE_CUTOVER_ID);
  if (!registry) refuse();
  const physical = await entity(tx, target.id, target.user_id);
  if (physical.entity_type !== target.entity_type || physical.merged_to_entity_id) refuse();
  const maximum = (await tx
    .prepare(
      "SELECT MAX(entity_lifecycle_sequence) AS n FROM observations WHERE user_id=? AND entity_lifecycle_target_id=?"
    )
    .get(target.user_id, target.id)) as { n: number | null };
  const next = (maximum.n ?? 0) + 1;
  if (!Number.isSafeInteger(next) || next < 1) refuse();
  const createdAt = new Date().toISOString();
  const id = createHash("sha256")
    .update(JSON.stringify(["entity_lifecycle_action_v1", target.user_id, target.id, next]))
    .digest("hex");
  await tx
    .prepare(
      "INSERT INTO observations(id,entity_id,entity_type,schema_version,source_id,observed_at,created_at,source_priority,fields,user_id,entity_lifecycle_kind,entity_lifecycle_sequence,entity_lifecycle_target_id) VALUES (?,?,?,'1.0',NULL,?,?,0,?,?,?,?,?)"
    )
    .run(
      id,
      target.id,
      target.entity_type,
      observedAt,
      createdAt,
      toDbValue("observations", "fields", fields),
      target.user_id,
      kind,
      next,
      target.id
    );
  return id;
}

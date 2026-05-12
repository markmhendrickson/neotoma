import { db } from "../../db.js";
import { logger } from "../../utils/logger.js";
import { SUBSCRIPTION_ENTITY_TYPE } from "./seed_schema.js";
import { parseSubscriptionSnapshot, type SubscriptionRecord } from "./subscription_types.js";

/** user_id → active subscription rows (parsed snapshots). */
const subscriptionsByUser = new Map<string, SubscriptionRecord[]>();

export function getSubscriptionsForUser(userId: string): SubscriptionRecord[] {
  return subscriptionsByUser.get(userId) ?? [];
}

export function listAllSubscriptions(): SubscriptionRecord[] {
  return [...subscriptionsByUser.values()].flat();
}

export async function rebuildSubscriptionIndex(): Promise<void> {
  const { data: snaps, error } = await db
    .from("entity_snapshots")
    .select("entity_id, snapshot")
    .eq("entity_type", SUBSCRIPTION_ENTITY_TYPE);

  if (error) {
    logger.warn(`[subscriptions] index rebuild failed: ${error.message}`);
    return;
  }

  const entityIds = (snaps ?? []).map((r: { entity_id: string }) => r.entity_id);
  if (entityIds.length === 0) {
    subscriptionsByUser.clear();
    return;
  }

  const { data: entities, error: entErr } = await db
    .from("entities")
    .select("id, user_id")
    .in("id", entityIds);

  if (entErr) {
    logger.warn(`[subscriptions] index entities fetch failed: ${entErr.message}`);
    return;
  }

  const userByEntity = new Map<string, string>();
  for (const e of entities ?? []) {
    userByEntity.set((e as { id: string }).id, (e as { user_id: string }).user_id);
  }

  const next = new Map<string, SubscriptionRecord[]>();
  for (const row of snaps ?? []) {
    const entityId = (row as { entity_id: string }).entity_id;
    const snap = (row as { snapshot: unknown }).snapshot as Record<string, unknown>;
    const userId = userByEntity.get(entityId);
    if (!userId) continue;
    const parsed = parseSubscriptionSnapshot(entityId, userId, snap);
    if (!parsed || !parsed.active) continue;
    const list = next.get(userId) ?? [];
    list.push(parsed);
    next.set(userId, list);
  }
  subscriptionsByUser.clear();
  for (const [uid, list] of next) {
    subscriptionsByUser.set(uid, list);
  }
}

/** Refresh one subscription row after a write (best-effort). */
export async function countActiveSubscriptionsForUser(userId: string): Promise<number> {
  const { data: snaps, error } = await db
    .from("entity_snapshots")
    .select("entity_id, snapshot")
    .eq("entity_type", SUBSCRIPTION_ENTITY_TYPE);
  if (error || !snaps?.length) return 0;
  const entityIds = snaps.map((r: { entity_id: string }) => r.entity_id);
  const { data: ents } = await db.from("entities").select("id").eq("user_id", userId).in("id", entityIds);
  const allowed = new Set((ents ?? []).map((e: { id: string }) => e.id));
  let n = 0;
  for (const row of snaps) {
    const id = (row as { entity_id: string }).entity_id;
    if (!allowed.has(id)) continue;
    const snap = (row as { snapshot: Record<string, unknown> }).snapshot;
    if (snap && snap.active === true) n += 1;
  }
  return n;
}

export async function refreshSubscriptionInIndex(entityId: string): Promise<void> {
  const { data: ent } = await db.from("entities").select("user_id").eq("id", entityId).maybeSingle();
  if (!ent?.user_id) return;
  const userId = ent.user_id as string;
  const { data: snap } = await db
    .from("entity_snapshots")
    .select("snapshot")
    .eq("entity_id", entityId)
    .maybeSingle();
  if (!snap?.snapshot) {
    const list = (subscriptionsByUser.get(userId) ?? []).filter((s) => s.entity_id !== entityId);
    subscriptionsByUser.set(userId, list);
    return;
  }
  const parsed = parseSubscriptionSnapshot(
    entityId,
    userId,
    snap.snapshot as Record<string, unknown>,
  );
  const list = (subscriptionsByUser.get(userId) ?? []).filter((s) => s.entity_id !== entityId);
  if (parsed?.active) {
    list.push(parsed);
  }
  subscriptionsByUser.set(userId, list);
}

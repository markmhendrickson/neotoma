import { queryEntities } from "@/api/endpoints/entities";
import { store } from "@/api/endpoints/sources";
import { coercePinnedPrimitives, type PinnedPrimitive } from "@/lib/pinned_primitives";
import type { EntitySnapshot, StoreResponse } from "@/types/api";

const PINNED_PRIMITIVES_STATE_ENTITY_TYPE = "ui_state";
const PINNED_PRIMITIVES_STATE_TITLE = "Inspector pinned primitives";
const PINNED_PRIMITIVES_STATE_AREA = "inspector";
const PINNED_PRIMITIVES_STATE_PAGE = "sidebar";
const PINNED_PRIMITIVES_STATE_VERSION = 1;

type StoredPinnedPrimitivesState = {
  version: number;
  pins: unknown;
};

export type PinnedPrimitivesRemoteState = {
  entityId?: string;
  pins: PinnedPrimitive[];
};

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isPinnedPrimitivesState(row: EntitySnapshot): boolean {
  const snapshot = row.snapshot ?? {};
  return (
    row.entity_type === PINNED_PRIMITIVES_STATE_ENTITY_TYPE &&
    snapshot.title === PINNED_PRIMITIVES_STATE_TITLE &&
    snapshot.area === PINNED_PRIMITIVES_STATE_AREA &&
    snapshot.page === PINNED_PRIMITIVES_STATE_PAGE
  );
}

function parsePinnedPrimitivesState(row: EntitySnapshot): PinnedPrimitivesRemoteState | null {
  if (!isPinnedPrimitivesState(row)) return null;
  const raw = row.snapshot.content;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as StoredPinnedPrimitivesState;
    if (parsed.version !== PINNED_PRIMITIVES_STATE_VERSION) return null;
    return {
      entityId: row.entity_id ?? row.id,
      pins: coercePinnedPrimitives(parsed.pins),
    };
  } catch {
    return null;
  }
}

export async function loadPinnedPrimitivesFromNeotoma({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<PinnedPrimitivesRemoteState | null> {
  const res = await queryEntities({
    entity_type: PINNED_PRIMITIVES_STATE_ENTITY_TYPE,
    limit: 100,
    sort_by: "last_observation_at",
    sort_order: "desc",
  }, { signal });

  for (const row of res.entities) {
    const parsed = parsePinnedPrimitivesState(row);
    if (parsed) return parsed;
  }
  return null;
}

function extractStoredEntityId(res: StoreResponse): string | undefined {
  const entities = res.structured?.entities ?? res.entities;
  const row = entities?.find((entity) => entity.entity_type === PINNED_PRIMITIVES_STATE_ENTITY_TYPE);
  return row?.entity_id;
}

export async function savePinnedPrimitivesToNeotoma({
  pins,
  targetEntityId,
}: {
  pins: PinnedPrimitive[];
  targetEntityId?: string;
}): Promise<PinnedPrimitivesRemoteState> {
  const content = JSON.stringify({
    version: PINNED_PRIMITIVES_STATE_VERSION,
    pins,
  });
  const res = await store({
    entities: [
      {
        entity_type: PINNED_PRIMITIVES_STATE_ENTITY_TYPE,
        ...(targetEntityId ? { target_id: targetEntityId } : {}),
        title: PINNED_PRIMITIVES_STATE_TITLE,
        area: PINNED_PRIMITIVES_STATE_AREA,
        page: PINNED_PRIMITIVES_STATE_PAGE,
        status: "active",
        content,
      },
    ],
    idempotency_key: `inspector-pinned-primitives-${stableHash(content)}`,
  });

  return {
    entityId: extractStoredEntityId(res) ?? targetEntityId,
    pins,
  };
}

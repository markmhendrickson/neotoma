import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { batchCorrect } from "@/api/endpoints/corrections";
import { useQueryClient } from "@tanstack/react-query";
import { TypeBadge } from "@/components/shared/type_badge";
import { FieldValue } from "@/components/shared/field_value";
import { Columns3 } from "lucide-react";
import { humanizeKey } from "@/lib/humanize";
import { truncateId } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty_state";
import type { EntitySnapshot, EntitySchema } from "@/types/api";

interface EntityBoardViewProps {
  entities: EntitySnapshot[];
  groupField: string;
  schema: EntitySchema | null | undefined;
}

function getEntityId(e: EntitySnapshot): string {
  return e.entity_id ?? e.id ?? "";
}

function getFieldValue(entity: EntitySnapshot, field: string): string {
  const snap = entity.snapshot && typeof entity.snapshot === "object" ? entity.snapshot : {};
  const val = (snap as Record<string, unknown>)[field];
  if (val === null || val === undefined) return "(none)";
  return String(val);
}

function DroppableColumn({
  columnValue,
  children,
}: {
  columnValue: string;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: columnValue });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[200px] w-72 shrink-0 flex-col rounded-lg border p-3 transition-colors ${
        isOver ? "border-primary bg-accent/30" : "bg-muted/30"
      }`}
    >
      {children}
    </div>
  );
}

function DraggableCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  );
}

function EntityCard({ entity, groupField }: { entity: EntitySnapshot; groupField: string }) {
  const eid = getEntityId(entity);
  const snap = (entity.snapshot ?? {}) as Record<string, unknown>;
  const displayFields = Object.entries(snap)
    .filter(([k]) => k !== groupField && k !== "entity_type")
    .slice(0, 3);

  return (
    <div className="cursor-grab rounded-md border bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing">
      <Link
        to={`/entities/${encodeURIComponent(eid)}`}
        className="block font-medium text-sm text-foreground underline-offset-4 hover:text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {String(entity.canonical_name || snap.name || snap.title || truncateId(eid))}
      </Link>
      <div className="mt-1 flex items-center gap-1">
        <TypeBadge type={entity.entity_type} humanize className="text-[10px]" />
        <span className="font-mono text-[10px] text-muted-foreground">{truncateId(eid, 8)}</span>
      </div>
      {displayFields.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {displayFields.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-1 text-xs">
              <span className="shrink-0 text-muted-foreground">{humanizeKey(k)}:</span>
              <span className="truncate"><FieldValue value={v} /></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EntityBoardView({ entities, groupField }: EntityBoardViewProps) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const columns = useMemo(() => {
    const buckets = new Map<string, EntitySnapshot[]>();
    for (const entity of entities) {
      const val = getFieldValue(entity, groupField);
      if (!buckets.has(val)) buckets.set(val, []);
      buckets.get(val)!.push(entity);
    }
    return buckets;
  }, [entities, groupField]);

  const activeEntity = activeId ? entities.find((e) => getEntityId(e) === activeId) : null;

  if (entities.length === 0) {
    return (
      <EmptyState
        icon={Columns3}
        title="No entities to display on the board"
        description={`Entities grouped by "${humanizeKey(groupField)}" will appear as columns here. Try a different filter, or add entities of this type.`}
      />
    );
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const targetColumn = String(over.id);
    const draggedEntityId = String(active.id);
    const entity = entities.find((e) => getEntityId(e) === draggedEntityId);
    if (!entity) return;

    const currentValue = getFieldValue(entity, groupField);
    if (currentValue === targetColumn) return;

    try {
      let parsed: unknown = targetColumn;
      if (targetColumn === "(none)") parsed = null;
      else {
        try { parsed = JSON.parse(targetColumn); } catch { /* string */ }
      }

      await batchCorrect(draggedEntityId, {
        changes: [{ field: groupField, value: parsed }],
        overwrite: true,
        idempotency_prefix: `board-${draggedEntityId}-${Date.now()}`,
      });

      toast.success(`Moved to ${targetColumn}`);
      qc.invalidateQueries({ queryKey: ["entities"] });
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from(columns.entries()).map(([colValue, colEntities]) => (
          <DroppableColumn key={colValue} columnValue={colValue}>
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
              {humanizeKey(colValue)} ({colEntities.length})
            </h3>
            <div className="flex flex-col gap-2">
              {colEntities.map((entity) => {
                const eid = getEntityId(entity);
                return (
                  <DraggableCard key={eid} id={eid}>
                    <EntityCard entity={entity} groupField={groupField} />
                  </DraggableCard>
                );
              })}
            </div>
          </DroppableColumn>
        ))}
      </div>
      <DragOverlay>
        {activeEntity ? (
          <div className="opacity-80">
            <EntityCard entity={activeEntity} groupField={groupField} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

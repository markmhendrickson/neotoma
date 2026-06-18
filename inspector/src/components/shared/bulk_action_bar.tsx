import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeleteEntity } from "@/hooks/use_mutations";
import { batchCorrect } from "@/api/endpoints/corrections";
import { humanizeKey } from "@/lib/humanize";
import type { EntitySchema, EntitySnapshot } from "@/types/api";
import { Trash2, Edit, X } from "lucide-react";

interface BulkActionBarProps {
  selectedEntities: EntitySnapshot[];
  schema: EntitySchema | null | undefined;
  onClearSelection: () => void;
}

export function BulkActionBar({ selectedEntities, schema, onClearSelection }: BulkActionBarProps) {
  const [mode, setMode] = useState<"idle" | "set-field" | "delete">("idle");
  const [fieldName, setFieldName] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  const deleteEntity = useDeleteEntity();
  const qc = useQueryClient();

  const schemaFields = schema?.field_names ?? Object.keys(schema?.schema_definition?.fields ?? {});

  async function handleBulkSetField() {
    if (!fieldName || fieldValue === "") return;
    let parsed: unknown = fieldValue;
    try {
      parsed = JSON.parse(fieldValue);
    } catch {
      // keep as string
    }

    let success = 0;
    let failed = 0;
    for (const entity of selectedEntities) {
      const entityId = entity.entity_id ?? entity.id ?? "";
      try {
        await batchCorrect(entityId, {
          changes: [{ field: fieldName, value: parsed }],
          overwrite: true,
          idempotency_prefix: `bulk-${entityId}-${Date.now()}`,
        });
        success++;
      } catch {
        failed++;
      }
    }

    if (success > 0) toast.success(`Updated ${success} entity(s)`);
    if (failed > 0) toast.error(`Failed to update ${failed} entity(s)`);
    qc.invalidateQueries({ queryKey: ["entities"] });
    setMode("idle");
    onClearSelection();
  }

  async function handleBulkDelete() {
    let success = 0;
    let failed = 0;
    for (const entity of selectedEntities) {
      const entityId = entity.entity_id ?? entity.id ?? "";
      try {
        await deleteEntity.mutateAsync({ id: entityId, type: entity.entity_type });
        success++;
      } catch {
        failed++;
      }
    }
    if (success > 0) toast.success(`Deleted ${success} entity(s)`);
    if (failed > 0) toast.error(`Failed to delete ${failed} entity(s)`);
    setMode("idle");
    onClearSelection();
  }

  if (selectedEntities.length === 0) return null;

  return (
    <div className="sticky bottom-4 z-50 mx-auto flex w-fit items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg">
      <span className="text-sm font-medium">
        {selectedEntities.length} selected
      </span>

      {mode === "idle" && (
        <>
          <Button variant="outline" size="sm" onClick={() => setMode("set-field")}>
            <Edit className="mr-1 h-3 w-3" /> Set field
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setMode("delete")}>
            <Trash2 className="mr-1 h-3 w-3" /> Delete
          </Button>
        </>
      )}

      {mode === "set-field" && (
        <>
          <Select value={fieldName} onValueChange={setFieldName}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Field" />
            </SelectTrigger>
            <SelectContent>
              {schemaFields.map((f) => (
                <SelectItem key={f} value={f}>
                  {humanizeKey(f)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={fieldValue}
            onChange={(e) => setFieldValue(e.target.value)}
            placeholder="New value"
            className="w-[140px]"
            onKeyDown={(e) => { if (e.key === "Enter") handleBulkSetField(); }}
          />
          <Button size="sm" onClick={handleBulkSetField} disabled={!fieldName}>
            Apply
          </Button>
        </>
      )}

      {mode === "delete" && (
        <>
          <span className="text-sm text-destructive">
            Delete {selectedEntities.length} entities?
          </span>
          <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
            Confirm
          </Button>
        </>
      )}

      <Button variant="ghost" size="icon" onClick={() => { setMode("idle"); onClearSelection(); }} className="h-7 w-7">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

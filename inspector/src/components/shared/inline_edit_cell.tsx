import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FieldValue } from "@/components/shared/field_value";
import { batchCorrect } from "@/api/endpoints/corrections";
import { useQueryClient } from "@tanstack/react-query";

interface InlineEditCellProps {
  entityId: string;
  entityType: string;
  field: string;
  value: unknown;
  typeHint?: string;
  lastObservationAt?: string | null;
}

export function InlineEditCell({
  entityId,
  entityType,
  field,
  value,
  typeHint,
  lastObservationAt,
}: InlineEditCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function startEdit() {
    setDraft(value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value));
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      let parsed: unknown = draft;
      if (typeHint === "boolean") parsed = draft === "true";
      else if (typeHint === "number") parsed = Number(draft);
      else {
        try { parsed = JSON.parse(draft); } catch { /* keep as string */ }
      }

      if (JSON.stringify(parsed) === JSON.stringify(value)) {
        setEditing(false);
        setSaving(false);
        return;
      }

      const res = await batchCorrect(entityId, {
        changes: [{ field, value: parsed }],
        expected_last_observation_at: lastObservationAt,
        overwrite: false,
        idempotency_prefix: `inline-${entityId}-${field}-${Date.now()}`,
      });

      if (res.status === "conflict") {
        toast.warning("Entity was modified. Retrying with overwrite...");
        await batchCorrect(entityId, {
          changes: [{ field, value: parsed }],
          overwrite: true,
          idempotency_prefix: `inline-overwrite-${entityId}-${field}-${Date.now()}`,
        });
      }

      toast.success(`Updated ${field}`);
      qc.invalidateQueries({ queryKey: ["entities"] });
      qc.invalidateQueries({ queryKey: ["entity", entityId] });
    } catch (err) {
      toast.error(`Failed to update: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setEditing(false);
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditing(false);
  }

  if (!editing) {
    return (
      <div
        className="cursor-pointer rounded px-1 py-0.5 hover:bg-muted/60"
        onClick={startEdit}
        title="Click to edit"
      >
        <FieldValue value={value} typeHint={typeHint} />
      </div>
    );
  }

  if (typeHint === "boolean") {
    const checked = draft === "true";
    return (
      <Switch
        checked={checked}
        disabled={saving}
        onCheckedChange={(v) => {
          setDraft(v ? "true" : "false");
          setTimeout(async () => {
            setSaving(true);
            try {
              await batchCorrect(entityId, {
                changes: [{ field, value: v }],
                overwrite: true,
                idempotency_prefix: `inline-${entityId}-${field}-${Date.now()}`,
              });
              toast.success(`Updated ${field}`);
              qc.invalidateQueries({ queryKey: ["entities"] });
            } catch (err) {
              toast.error(`Failed: ${err instanceof Error ? err.message : "error"}`);
            } finally {
              setEditing(false);
              setSaving(false);
            }
          }, 0);
        }}
      />
    );
  }

  return (
    <Input
      ref={inputRef}
      type={typeHint === "number" ? "number" : typeHint === "date" ? "date" : "text"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") saveEdit();
        if (e.key === "Escape") cancelEdit();
      }}
      onBlur={saveEdit}
      disabled={saving}
      className="h-7 w-full min-w-[80px] text-xs"
    />
  );
}

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EntityTypeSelect } from "@/components/shared/entity_type_select";
import { useSchemaByType } from "@/hooks/use_schemas";
import { useStore } from "@/hooks/use_mutations";
import { humanizeKey } from "@/lib/humanize";

interface CreateEntityDialogProps {
  entityType?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateEntityDialog({
  entityType: initialType,
  open,
  onOpenChange,
}: CreateEntityDialogProps) {
  const [selectedType, setSelectedType] = useState(initialType ?? "");
  const entityType = initialType ?? selectedType;

  const schemaQuery = useSchemaByType(entityType || undefined);
  const schema = schemaQuery.data ?? null;
  const storeMut = useStore();

  const [draft, setDraft] = useState<Record<string, string>>({});

  const fields = useMemo(() => {
    if (!schema) return [];
    const defs = schema.schema_definition?.fields ?? {};
    const summary = schema.field_summary ?? {};
    const allKeys = new Set([...Object.keys(defs), ...Object.keys(summary)]);
    return Array.from(allKeys).sort();
  }, [schema]);

  const resetForm = useCallback(() => {
    setDraft({});
    if (!initialType) setSelectedType("");
  }, [initialType]);

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function parseValue(raw: string, type: string): unknown {
    if (!raw && type !== "boolean") return undefined;
    if (type === "boolean") return raw === "true";
    if (type === "number") {
      const n = Number(raw);
      return isNaN(n) ? raw : n;
    }
    if (type === "array" || type === "object") {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    return raw;
  }

  function resolveFieldType(field: string): string {
    const fieldDef = schema?.schema_definition?.fields?.[field] as
      | { type?: string; description?: string }
      | undefined;
    const summary = schema?.field_summary?.[field] as
      | { type?: string }
      | undefined;
    return fieldDef?.type ?? summary?.type ?? "string";
  }

  function handleSubmit() {
    if (!entityType) {
      toast.error("Select an entity type");
      return;
    }

    const entity: Record<string, unknown> = { entity_type: entityType };
    for (const field of fields) {
      const raw = draft[field];
      if (raw === undefined || raw === "") continue;
      const type = resolveFieldType(field);
      const parsed = parseValue(raw, type);
      if (parsed !== undefined) {
        entity[field] = parsed;
      }
    }

    storeMut.mutate(
      { entities: [entity] },
      {
        onSuccess: () => {
          toast.success("Entity created");
          resetForm();
          onOpenChange(false);
        },
        onError: (err) => toast.error(`Failed to create entity: ${err.message}`),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create entity</DialogTitle>
          <DialogDescription>
            Add a new entity to Neotoma. Fill in the fields below and click
            Create.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!initialType && (
            <div className="grid gap-1.5">
              <Label>Entity type</Label>
              <EntityTypeSelect
                value={selectedType}
                onValueChange={setSelectedType}
                className="w-full"
                triggerClassName="w-full"
              />
            </div>
          )}

          {entityType && schemaQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading schema…</p>
          )}

          {entityType && !schemaQuery.isLoading && fields.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No schema registered for <code>{entityType}</code>. The entity
              will be stored with the type only.
            </p>
          )}

          {fields.map((field) => (
            <CreateField
              key={field}
              field={field}
              value={draft[field] ?? ""}
              schema={schema}
              onChange={(next) =>
                setDraft((prev) => ({ ...prev, [field]: next }))
              }
            />
          ))}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={storeMut.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!entityType || storeMut.isPending}
          >
            {storeMut.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateField({
  field,
  value,
  schema,
  onChange,
}: {
  field: string;
  value: string;
  schema: ReturnType<typeof useSchemaByType>["data"] | null;
  onChange: (next: string) => void;
}) {
  const fieldDef = schema?.schema_definition?.fields?.[field] as
    | { type?: string; description?: string }
    | undefined;
  const summary = schema?.field_summary?.[field] as
    | { type?: string }
    | undefined;
  const type = fieldDef?.type ?? summary?.type ?? "string";
  const label = humanizeKey(field);
  const helper = fieldDef?.description;

  if (type === "boolean") {
    const checked = value === "true";
    return (
      <div className="grid gap-1">
        <Label htmlFor={`create-${field}`}>{label}</Label>
        <Switch
          id={`create-${field}`}
          checked={checked}
          onCheckedChange={(v) => onChange(v ? "true" : "false")}
        />
        {helper && (
          <p className="text-xs text-muted-foreground">{helper}</p>
        )}
      </div>
    );
  }

  if (type === "date") {
    return (
      <div className="grid gap-1">
        <Label htmlFor={`create-${field}`}>{label}</Label>
        <Input
          id={`create-${field}`}
          type="date"
          value={value}
          onChange={(ev) => onChange(ev.target.value)}
        />
        {helper && (
          <p className="text-xs text-muted-foreground">{helper}</p>
        )}
      </div>
    );
  }

  if (type === "number") {
    return (
      <div className="grid gap-1">
        <Label htmlFor={`create-${field}`}>{label}</Label>
        <Input
          id={`create-${field}`}
          type="number"
          value={value}
          onChange={(ev) => onChange(ev.target.value)}
        />
        {helper && (
          <p className="text-xs text-muted-foreground">{helper}</p>
        )}
      </div>
    );
  }

  if (type === "array" || type === "object") {
    return (
      <div className="grid gap-1">
        <Label htmlFor={`create-${field}`} className="flex items-center gap-2">
          {label}
          <span className="text-[11px] font-normal uppercase tracking-wide text-muted-foreground">
            (JSON)
          </span>
        </Label>
        <textarea
          id={`create-${field}`}
          value={value}
          onChange={(ev) => onChange(ev.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-sm"
          placeholder={type === "array" ? "[…]" : "{…}"}
        />
        {helper ? (
          <p className="text-xs text-muted-foreground">{helper}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            JSON {type}. Invalid JSON is stored as the raw string.
          </p>
        )}
      </div>
    );
  }

  const isLongText =
    helper?.toLowerCase().includes("long") ||
    helper?.toLowerCase().includes("description") ||
    helper?.toLowerCase().includes("content") ||
    helper?.toLowerCase().includes("body") ||
    helper?.toLowerCase().includes("notes") ||
    field.includes("content") ||
    field.includes("description") ||
    field.includes("body") ||
    field.includes("notes") ||
    field.includes("summary");

  return (
    <div className="grid gap-1">
      <Label htmlFor={`create-${field}`}>{label}</Label>
      {isLongText ? (
        <textarea
          id={`create-${field}`}
          value={value}
          onChange={(ev) => onChange(ev.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
          placeholder={helper}
        />
      ) : (
        <Input
          id={`create-${field}`}
          value={value}
          onChange={(ev) => onChange(ev.target.value)}
          placeholder={helper}
        />
      )}
      {helper && (
        <p className="text-xs text-muted-foreground">{helper}</p>
      )}
    </div>
  );
}

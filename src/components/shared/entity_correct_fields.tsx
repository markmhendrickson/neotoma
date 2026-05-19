import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FieldValue } from "@/components/shared/field_value";
import { useBatchCorrect } from "@/hooks/use_entity_markdown";
import { useSchemaByType } from "@/hooks/use_schemas";
import { humanizeKey } from "@/lib/humanize";

export function EntityCorrectFieldsCard({
  entityId,
  entityType,
  snapshot,
  lastObservationAt,
}: {
  entityId: string;
  entityType: string;
  snapshot: Record<string, unknown>;
  lastObservationAt: string | null;
}) {
  const schemaQuery = useSchemaByType(entityType);
  const schema = schemaQuery.data ?? null;
  const batchCorrectMut = useBatchCorrect(entityId);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [expectedLastObservationAt, setExpectedLastObservationAt] = useState<string | null>(
    lastObservationAt,
  );

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(snapshot)) {
      next[k] = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
    }
    setDraft(next);
    setExpectedLastObservationAt(lastObservationAt);
  }, [snapshot, lastObservationAt]);

  function parseDraftValue(raw: string, previous: unknown): unknown {
    if (typeof previous === "string" || previous === null || previous === undefined) {
      return raw;
    }
    if (typeof previous === "boolean") {
      if (raw === "true") return true;
      if (raw === "false") return false;
      return raw;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  function handleSaveEdit(overwrite = false) {
    const changes: Array<{ field: string; value: unknown }> = [];
    for (const [field, raw] of Object.entries(draft)) {
      const next = parseDraftValue(raw, snapshot[field]);
      const prev = snapshot[field];
      if (JSON.stringify(next) !== JSON.stringify(prev)) {
        changes.push({ field, value: next });
      }
    }
    if (changes.length === 0) {
      toast.info("No changes to save");
      return;
    }
    batchCorrectMut.mutate(
      {
        changes,
        expected_last_observation_at: expectedLastObservationAt,
        overwrite,
        idempotency_prefix: `edit-${entityId}-${Date.now()}`,
      },
      {
        onSuccess: (res) => {
          if (res.status === "conflict") {
            toast.warning(
              "Entity changed while you were editing. Choose Overwrite to apply anyway.",
              { duration: 8000 },
            );
          } else if (res.status === "validation_error") {
            const msg = (res.validation_errors ?? [])
              .map((v) => `${v.field}: ${v.message}`)
              .join("; ");
            toast.error(`Validation failed: ${msg}`);
          } else {
            toast.success(`Applied ${res.applied.length} correction(s)`);
            if (res.last_observation_at) {
              setExpectedLastObservationAt(res.last_observation_at);
            }
          }
        },
        onError: (err) => toast.error(`Batch correction failed: ${err.message}`),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Correct fields</CardTitle>
        <p className="text-xs text-muted-foreground">
          Each saved change becomes a <code>correct()</code> observation with the highest priority.
          Changes are applied atomically and go through the same validation as the CLI{" "}
          <code>neotoma edit</code>.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Object.keys(draft).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No editable fields yet. Snapshot is empty.
            </p>
          ) : (
            Object.entries(draft).map(([field, value]) => (
              <EditField
                key={field}
                field={field}
                value={value}
                previous={snapshot[field]}
                schema={schema}
                onChange={(next) => setDraft((prev) => ({ ...prev, [field]: next }))}
              />
            ))
          )}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => handleSaveEdit(false)}
            disabled={batchCorrectMut.isPending}
          >
            {batchCorrectMut.isPending ? "Saving…" : "Save changes"}
          </Button>
          {batchCorrectMut.data?.status === "conflict" ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleSaveEdit(true)}
              disabled={batchCorrectMut.isPending}
            >
              Overwrite
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function EditField({
  field,
  value,
  previous,
  schema,
  onChange,
}: {
  field: string;
  value: string;
  previous: unknown;
  schema: ReturnType<typeof useSchemaByType>["data"] | null;
  onChange: (next: string) => void;
}) {
  const fieldDef = schema?.schema_definition?.fields?.[field] as
    | { type?: string; description?: string }
    | undefined;
  const summary = schema?.field_summary?.[field] as { type?: string } | undefined;
  const type = fieldDef?.type ?? summary?.type ?? inferTypeFromValue(previous);
  const label = humanizeKey(field);
  const helper = fieldDef?.description;

  if (type === "boolean") {
    const parsed =
      value === "true" ? true : value === "false" ? false : Boolean(previous);
    return (
      <div className="grid gap-1">
        <Label htmlFor={`edit-${field}`}>{label}</Label>
        <div className="flex items-center gap-2">
          <Switch
            id={`edit-${field}`}
            checked={parsed}
            onCheckedChange={(v) => onChange(v ? "true" : "false")}
          />
          <span className="text-xs text-muted-foreground">
            Current: <FieldValue value={previous} />
          </span>
        </div>
        {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      </div>
    );
  }

  if (type === "date") {
    return (
      <div className="grid gap-1">
        <Label htmlFor={`edit-${field}`}>{label}</Label>
        <Input
          id={`edit-${field}`}
          type="date"
          value={toDateInputValue(value)}
          onChange={(ev) => onChange(ev.target.value)}
        />
        {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      </div>
    );
  }

  if (type === "number") {
    return (
      <div className="grid gap-1">
        <Label htmlFor={`edit-${field}`}>{label}</Label>
        <Input
          id={`edit-${field}`}
          type="number"
          value={value}
          onChange={(ev) => onChange(ev.target.value)}
        />
        {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      </div>
    );
  }

  if (type === "array" || type === "object") {
    return (
      <div className="grid gap-1">
        <Label htmlFor={`edit-${field}`} className="flex items-center gap-2">
          {label}
          <span className="text-[11px] font-normal uppercase tracking-wide text-muted-foreground">
            (advanced)
          </span>
        </Label>
        <textarea
          id={`edit-${field}`}
          value={value}
          onChange={(ev) => onChange(ev.target.value)}
          rows={4}
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

  const isLong = value.length > 80 || value.includes("\n");
  return (
    <div className="grid gap-1">
      <Label htmlFor={`edit-${field}`}>{label}</Label>
      {isLong ? (
        <textarea
          id={`edit-${field}`}
          value={value}
          onChange={(ev) => onChange(ev.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
          placeholder={helper}
        />
      ) : (
        <Input
          id={`edit-${field}`}
          value={value}
          onChange={(ev) => onChange(ev.target.value)}
          placeholder={helper}
        />
      )}
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function inferTypeFromValue(v: unknown): string {
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return "number";
  if (Array.isArray(v)) return "array";
  if (v !== null && typeof v === "object") return "object";
  return "string";
}

function toDateInputValue(raw: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

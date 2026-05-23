import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { humanizeKey } from "@/lib/humanize";
import type { EntitySchema, SnapshotFilter } from "@/types/api";
import { X, Plus } from "lucide-react";

interface EntityFieldFilterBarProps {
  schema: EntitySchema | null | undefined;
  filters: Record<string, SnapshotFilter>;
  onFiltersChange: (filters: Record<string, SnapshotFilter>) => void;
}

interface FilterRowState {
  field: string;
  op: SnapshotFilter["op"];
  value: string;
}

function fieldType(schema: EntitySchema | null | undefined, field: string): string {
  const def = schema?.schema_definition?.fields?.[field] as { type?: string } | undefined;
  const summary = schema?.field_summary?.[field] as { type?: string } | undefined;
  return def?.type ?? summary?.type ?? "string";
}

function availableFields(schema: EntitySchema | null | undefined): string[] {
  const fields = new Set<string>();
  if (schema?.schema_definition?.fields) {
    for (const k of Object.keys(schema.schema_definition.fields)) {
      fields.add(k);
    }
  }
  if (schema?.field_names) {
    for (const k of schema.field_names) {
      fields.add(k);
    }
  }
  return Array.from(fields).sort();
}

function opsForType(type: string): { value: SnapshotFilter["op"]; label: string }[] {
  switch (type) {
    case "boolean":
      return [{ value: "eq", label: "is" }];
    case "number":
    case "date":
      return [
        { value: "eq", label: "=" },
        { value: "gt", label: ">" },
        { value: "lt", label: "<" },
        { value: "gte", label: ">=" },
        { value: "lte", label: "<=" },
      ];
    default:
      return [
        { value: "eq", label: "is" },
        { value: "contains", label: "contains" },
      ];
  }
}

export function EntityFieldFilterBar({ schema, filters, onFiltersChange }: EntityFieldFilterBarProps) {
  const fields = useMemo(() => availableFields(schema), [schema]);
  const [rows, setRows] = useState<FilterRowState[]>(() =>
    Object.entries(filters).map(([field, f]) => ({
      field,
      op: f.op,
      value: String(f.value ?? ""),
    })),
  );

  if (fields.length === 0) return null;

  function addRow() {
    const unused = fields.find((f) => !rows.some((r) => r.field === f));
    if (!unused) return;
    setRows((prev) => [...prev, { field: unused, op: "eq", value: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      applyFilters(next);
      return next;
    });
  }

  function updateRow(index: number, patch: Partial<FilterRowState>) {
    setRows((prev) => {
      const next = prev.map((r, i) => (i === index ? { ...r, ...patch } : r));
      return next;
    });
  }

  function applyFilters(source?: FilterRowState[]) {
    const active = source ?? rows;
    const next: Record<string, SnapshotFilter> = {};
    for (const row of active) {
      if (!row.field || row.value === "") continue;
      const type = fieldType(schema, row.field);
      let parsed: unknown = row.value;
      if (type === "boolean") parsed = row.value === "true";
      else if (type === "number") parsed = Number(row.value);
      next[row.field] = { op: row.op, value: parsed };
    }
    onFiltersChange(next);
  }

  return (
    <div className="space-y-2">
      {rows.map((row, index) => {
        const type = fieldType(schema, row.field);
        const ops = opsForType(type);
        return (
          <div key={index} className="flex items-center gap-2">
            <Select
              value={row.field}
              onValueChange={(v) => updateRow(index, { field: v, op: "eq", value: "" })}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fields.map((f) => (
                  <SelectItem key={f} value={f}>
                    {humanizeKey(f)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={row.op}
              onValueChange={(v) => updateRow(index, { op: v as SnapshotFilter["op"] })}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ops.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {type === "boolean" ? (
              <Select value={row.value || "true"} onValueChange={(v) => updateRow(index, { value: v })}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">True</SelectItem>
                  <SelectItem value="false">False</SelectItem>
                </SelectContent>
              </Select>
            ) : type === "date" ? (
              <Input
                type="date"
                value={row.value}
                onChange={(e) => updateRow(index, { value: e.target.value })}
                className="w-[160px]"
              />
            ) : type === "number" ? (
              <Input
                type="number"
                value={row.value}
                onChange={(e) => updateRow(index, { value: e.target.value })}
                className="w-[120px]"
              />
            ) : (
              <Input
                value={row.value}
                onChange={(e) => updateRow(index, { value: e.target.value })}
                placeholder="Value"
                className="w-[180px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters();
                }}
              />
            )}

            <Button variant="ghost" size="icon" onClick={() => removeRow(index)} className="h-8 w-8 shrink-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={addRow} disabled={rows.length >= fields.length}>
          <Plus className="mr-1 h-3 w-3" /> Add filter
        </Button>
        {rows.length > 0 && (
          <Button size="sm" onClick={() => applyFilters()}>
            Apply
          </Button>
        )}
      </div>
    </div>
  );
}

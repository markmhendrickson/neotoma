import { useMemo, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStats } from "@/hooks/use_stats";
import { cn } from "@/lib/utils";
import {
  SelectSearchInput,
  selectContentSearchFocusProps,
} from "@/components/shared/select_search_input";

const ALL_TYPES_VALUE = "__all__";

export function EntityTypeSelect({
  value,
  onValueChange,
  className,
  triggerClassName,
}: {
  /** Selected entity_type, or empty string for all types. */
  value: string;
  onValueChange: (entityType: string) => void;
  className?: string;
  triggerClassName?: string;
}) {
  const stats = useStats();
  const [typeSelectQuery, setTypeSelectQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const entityTypes = stats.data ? Object.keys(stats.data.entities_by_type).sort() : [];

  const filteredEntityTypes = useMemo(() => {
    const q = typeSelectQuery.trim().toLowerCase();
    const list = !q ? entityTypes : entityTypes.filter((t) => t.toLowerCase().includes(q));
    if (value && entityTypes.includes(value) && !list.includes(value)) {
      return [value, ...list];
    }
    return list;
  }, [entityTypes, typeSelectQuery, value]);

  return (
    <Select
      value={value || ALL_TYPES_VALUE}
      onValueChange={(v) => onValueChange(v === ALL_TYPES_VALUE ? "" : v)}
      onOpenChange={(open) => {
        if (!open) setTypeSelectQuery("");
      }}
    >
      <SelectTrigger className={cn("w-[180px]", triggerClassName, className)}>
        <SelectValue placeholder="All types" />
      </SelectTrigger>
      <SelectContent
        className="max-h-80 min-w-[var(--radix-select-trigger-width)] sm:min-w-[16rem]"
        {...selectContentSearchFocusProps(searchInputRef)}
      >
        <SelectSearchInput
          ref={searchInputRef}
          placeholder="Search types…"
          value={typeSelectQuery}
          onValueChange={setTypeSelectQuery}
        />
        <SelectItem value={ALL_TYPES_VALUE}>All types</SelectItem>
        {filteredEntityTypes.map((t) => (
          <SelectItem key={t} value={t}>
            {t}
          </SelectItem>
        ))}
        {filteredEntityTypes.length === 0 && typeSelectQuery.trim() !== "" ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No matching types
          </div>
        ) : null}
      </SelectContent>
    </Select>
  );
}

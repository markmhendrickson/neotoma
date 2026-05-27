import type { VisibilityState } from "@tanstack/react-table";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ENTITY_TABLE_COLUMN_LABELS } from "@/lib/entity_table_columns";

export function EntityTableColumnToggle({
  columnIds,
  columnVisibility,
  onColumnVisibilityChange,
  columnLabels = ENTITY_TABLE_COLUMN_LABELS,
}: {
  columnIds: readonly string[];
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: (next: VisibilityState) => void;
  columnLabels?: Record<string, string>;
}) {
  function toggleColumn(columnId: string, checked: boolean) {
    onColumnVisibilityChange({
      ...columnVisibility,
      [columnId]: checked,
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label="Toggle columns"
        >
          <Columns3 className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[min(24rem,70vh)] w-52 overflow-y-auto">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columnIds.map((columnId) => (
          <DropdownMenuCheckboxItem
            key={columnId}
            checked={columnVisibility[columnId] !== false}
            onCheckedChange={(checked) => toggleColumn(columnId, checked === true)}
            onSelect={(event) => event.preventDefault()}
          >
            {columnLabels[columnId] ?? humanizeFallbackLabel(columnId)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function humanizeFallbackLabel(columnId: string): string {
  if (columnId.startsWith("snapshot:")) {
    return columnId.slice("snapshot:".length).replace(/_/g, " ");
  }
  return columnId;
}

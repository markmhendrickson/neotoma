import { useState } from "react";
import { Filter, ListFilter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface MobileFilterOption<TValue extends string> {
  value: TValue;
  label: string;
  /** Optional helper copy rendered under the label. */
  description?: string;
}

interface MobileFilterPopoverProps<TValue extends string> {
  /** Trigger button label (e.g. "Types", "Status"). */
  triggerLabel: string;
  /** Heading rendered inside the popover (e.g. "Included record types"). */
  heading?: string;
  /** Available options. */
  options: MobileFilterOption<TValue>[];
  /** Currently selected values. */
  selected: TValue[];
  /** Called when a single option's checkbox is toggled. */
  onToggle: (value: TValue, checked: boolean) => void;
  /**
   * Optional "Select all" action shown at the bottom of the popover. When
   * omitted, the action button is hidden.
   */
  onSelectAll?: () => void;
  selectAllLabel?: string;
  /**
   * Optional badge label that summarises how many filters are selected
   * (e.g. "All" or "3/6"). When omitted, the badge is hidden.
   */
  badgeLabel?: string;
  /** Tooltip on the trigger button. Defaults to "Open filters". */
  tooltip?: string;
  className?: string;
}

/**
 * Mobile-friendly popover for multi-select filters. Renders a trigger
 * button with an optional counter badge; the popover body lists checkbox
 * rows with optional helper descriptions and an optional "Select all"
 * action. Mirrors the Activity page's narrow-viewport filter pattern.
 */
export function MobileFilterPopover<TValue extends string>({
  triggerLabel,
  heading,
  options,
  selected,
  onToggle,
  onSelectAll,
  selectAllLabel = "Select all",
  badgeLabel,
  tooltip = "Open filters",
  className,
}: MobileFilterPopoverProps<TValue>) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(selected);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className={cn("gap-2", className)}>
              <ListFilter className="h-4 w-4 shrink-0" aria-hidden />
              <span>{triggerLabel}</span>
              {badgeLabel ? (
                <Badge variant="secondary" className="font-normal tabular-nums">
                  {badgeLabel}
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltip}</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          {heading ? (
            <div className="flex items-center gap-2 text-sm font-medium">
              <Filter className="h-4 w-4 text-muted-foreground" aria-hidden />
              {heading}
            </div>
          ) : null}
          <div className="space-y-2">
            {options.map((option) => (
              <Label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm leading-snug hover:bg-muted/60"
              >
                <Checkbox
                  checked={selectedSet.has(option.value)}
                  onCheckedChange={(v) => onToggle(option.value, v === true)}
                />
                <span className="grid gap-0.5">
                  <span>{option.label}</span>
                  {option.description ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {option.description}
                    </span>
                  ) : null}
                </span>
              </Label>
            ))}
          </div>
          {onSelectAll ? (
            <Button type="button" variant="secondary" size="sm" className="w-full" onClick={onSelectAll}>
              {selectAllLabel}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

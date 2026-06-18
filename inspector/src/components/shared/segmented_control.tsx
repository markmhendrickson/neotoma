import {
  ToggleGroup,
  ToggleGroupItem,
  type ToggleGroupProps,
} from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const SEGMENTED_CONTROL_CLASS = [
  "gap-0",
  "[&>button]:rounded-none",
  "[&>button:first-child]:rounded-l-md",
  "[&>button:last-child]:rounded-r-md",
  "[&>button+button]:border-l-0",
  "[&>button[data-state=on]]:relative",
  "[&>button[data-state=on]]:z-10",
  "[&>button[data-state=on]]:border-primary",
  "[&>button[data-state=on]]:bg-primary",
  "[&>button[data-state=on]]:font-semibold",
  "[&>button[data-state=on]]:text-primary-foreground",
  "[&>button[data-state=on]]:ring-2",
  "[&>button[data-state=on]]:ring-primary/45",
  "[&>button[data-state=on]]:ring-offset-1",
  "[&>button[data-state=on]]:ring-offset-background",
  "[&>button[data-state=on]]:shadow-[inset_0_0_0_1px_hsl(var(--primary-foreground)/0.35),0_2px_8px_hsl(var(--primary)/0.28)]",
  "[&>button[data-state=on]:hover]:bg-primary/90",
  "[&>button[data-state=on]:hover]:text-primary-foreground",
].join(" ");

function SegmentedControl({
  className,
  variant = "outline",
  ...props
}: ToggleGroupProps) {
  return (
    <ToggleGroup
      variant={variant}
      className={cn(SEGMENTED_CONTROL_CLASS, className)}
      {...props}
    />
  );
}

export { SegmentedControl, ToggleGroupItem as SegmentedControlItem };

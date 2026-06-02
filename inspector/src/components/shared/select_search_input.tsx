import { forwardRef, type RefObject } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SelectSearchInputProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
};

/** Sticky search field for Radix Select dropdowns; pair with `selectContentSearchFocusProps`. */
export const SelectSearchInput = forwardRef<HTMLInputElement, SelectSearchInputProps>(
  function SelectSearchInput(
    { value, onValueChange, placeholder = "Search…", className, inputClassName },
    ref,
  ) {
    return (
      <div
        className={cn("sticky top-0 z-10 border-b bg-popover p-2", className)}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Input
          ref={ref}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className={cn("h-8", inputClassName)}
          autoComplete="off"
        />
      </div>
    );
  },
);

/** Prevent Select from focusing the first item; focus the search input instead. */
export function selectContentSearchFocusProps(inputRef: RefObject<HTMLInputElement | null>) {
  return {
    onOpenAutoFocus: (event: Event) => {
      event.preventDefault();
      inputRef.current?.focus();
    },
  };
}

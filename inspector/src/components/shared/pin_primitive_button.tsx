import { Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePinnedPrimitives } from "@/hooks/use_pinned_primitives";
import { normalizePinHref, type PinnedPrimitiveKind } from "@/lib/pinned_primitives";
import { toast } from "sonner";

export function PinPrimitiveButton({
  kind,
  href,
  label,
  entity_type,
  subtitle,
  size = "sm",
}: {
  kind: PinnedPrimitiveKind;
  href: string;
  label: string;
  entity_type?: string;
  subtitle?: string;
  size?: "sm" | "default" | "icon";
}) {
  const { isPinned, toggle } = usePinnedPrimitives();
  const normalizedHref = normalizePinHref(href);
  const pinned = isPinned(normalizedHref);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={pinned ? "secondary" : "outline"}
          size={size}
          aria-pressed={pinned}
          aria-label={pinned ? "Unpin from sidebar" : "Pin to sidebar"}
          onClick={() => {
            toggle({
              href: normalizedHref,
              kind,
              label: label.trim() || normalizedHref,
              entity_type: entity_type?.trim() || undefined,
              subtitle: subtitle?.trim() || undefined,
            });
            toast.success(pinned ? "Unpinned from sidebar" : "Pinned to sidebar");
          }}
        >
          {pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          {size !== "icon" ? (
            <span className="ml-1">{pinned ? "Unpin" : "Pin"}</span>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {pinned ? "Remove from pinned primitives in the sidebar" : "Show in pinned primitives in the sidebar"}
      </TooltipContent>
    </Tooltip>
  );
}

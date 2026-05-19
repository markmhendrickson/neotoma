import { Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePinnedPrimitives } from "@/hooks/use_pinned_primitives";
import { normalizePinHref, type PinnedPrimitiveKind } from "@/lib/pinned_primitives";

type SubpagePinButtonProps = {
  href: string;
  kind: PinnedPrimitiveKind;
  label: string;
  entity_type?: string;
  related_entity_type?: string;
  subtitle?: string;
};

export function SubpagePinButton({
  href,
  kind,
  label,
  entity_type,
  related_entity_type,
  subtitle,
}: SubpagePinButtonProps) {
  const { isPinned, toggle } = usePinnedPrimitives();
  const pinHref = normalizePinHref(href);
  const pinned = isPinned(pinHref);

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2"
      onClick={() => {
        toggle({
          href: pinHref,
          kind,
          label: label.trim() || pinHref,
          entity_type: entity_type?.trim() || undefined,
          related_entity_type: related_entity_type?.trim() || undefined,
          subtitle: subtitle?.trim() || undefined,
        });
        toast.success(pinned ? "Unpinned from sidebar" : "Pinned to sidebar");
      }}
    >
      {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
      {pinned ? "Unpin" : "Pin"}
    </Button>
  );
}

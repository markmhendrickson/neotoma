import { useState } from "react";
import { Link } from "react-router-dom";
import { GitMerge, MoreHorizontal, PenLine, Pin, PinOff, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { usePinnedPrimitives } from "@/hooks/use_pinned_primitives";
import { normalizePinHref } from "@/lib/pinned_primitives";
import type { UseMutationResult } from "@tanstack/react-query";

type EntityDetailActionsMenuProps = {
  entityId: string;
  entityType: string;
  displayName: string;
  showRefresh?: boolean;
  deleteMut: UseMutationResult<
    unknown,
    Error,
    { id: string; type: string; reason?: string },
    unknown
  >;
  restoreMut: UseMutationResult<
    unknown,
    Error,
    { id: string; type: string; reason?: string },
    unknown
  >;
  mergeMut: UseMutationResult<unknown, Error, { from: string; to: string }, unknown>;
};

export function EntityDetailActionsMenu({
  entityId,
  entityType,
  displayName,
  showRefresh = false,
  deleteMut,
  restoreMut,
  mergeMut,
}: EntityDetailActionsMenuProps) {
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const { isPinned, toggle } = usePinnedPrimitives();
  const pinHref = normalizePinHref(`/entities/${encodeURIComponent(entityId)}`);
  const pinned = isPinned(pinHref);

  return (
    <div className="flex items-center gap-2">
      {showRefresh ? <QueryRefreshIndicator /> : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label="Entity actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            className="gap-2"
            onSelect={() => {
              toggle({
                href: pinHref,
                kind: "entity",
                label: displayName.trim() || pinHref,
                entity_type: entityType.trim() || undefined,
              });
              toast.success(pinned ? "Unpinned from sidebar" : "Pinned to sidebar");
            }}
          >
            {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            {pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              to={`/entities/${encodeURIComponent(entityId)}/correct`}
              className="flex cursor-pointer items-center gap-2"
            >
              <PenLine className="h-4 w-4" />
              Correct fields
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onSelect={(event) => {
              event.preventDefault();
              setMergeOpen(true);
            }}
          >
            <GitMerge className="h-4 w-4" />
            Merge
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ConfirmDialog
            trigger={
              <DropdownMenuItem
                onSelect={(event) => event.preventDefault()}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            }
            title="Delete Entity"
            description={`Soft-delete "${displayName}"? This is reversible.`}
            confirmLabel="Delete"
            variant="destructive"
            showReason
            onConfirm={(reason) =>
              deleteMut.mutate(
                { id: entityId, type: entityType, reason },
                { onSuccess: () => toast.success("Entity deleted") },
              )
            }
          />
          <ConfirmDialog
            trigger={
              <DropdownMenuItem className="gap-2" onSelect={(event) => event.preventDefault()}>
                <RotateCcw className="h-4 w-4" />
                Restore
              </DropdownMenuItem>
            }
            title="Restore Entity"
            description={`Restore "${displayName}"?`}
            confirmLabel="Restore"
            showReason
            onConfirm={(reason) =>
              restoreMut.mutate(
                { id: entityId, type: entityType, reason },
                { onSuccess: () => toast.success("Entity restored") },
              )
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Entity</DialogTitle>
            <DialogDescription>Merge this entity into another (target).</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Target Entity ID</Label>
            <Input
              value={mergeTarget}
              onChange={(ev) => setMergeTarget(ev.target.value)}
              placeholder="target entity ID"
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!mergeTarget) return;
                mergeMut.mutate(
                  { from: entityId, to: mergeTarget },
                  {
                    onSuccess: () => {
                      toast.success("Merged successfully");
                      setMergeOpen(false);
                      setMergeTarget("");
                    },
                  },
                );
              }}
            >
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

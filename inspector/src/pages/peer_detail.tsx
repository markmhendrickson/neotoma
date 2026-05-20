import { Link, useNavigate, useParams } from "react-router-dom";
import { usePeerDetail, useRemovePeerMutation, useSyncPeerMutation } from "@/hooks/use_peers";
import { PageShell } from "@/components/layout/page_shell";
import { DetailPageSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { showBackgroundQueryRefresh, showInitialQuerySkeleton } from "@/lib/query_loading";
import { QueryRefreshIndicator } from "@/components/shared/query_refresh_indicator";
import { CopyIdButton } from "@/components/shared/copy_id_button";
import { toast } from "sonner";

export default function PeerDetailPage() {
  const navigate = useNavigate();
  const { peerId } = useParams<{ peerId: string }>();
  const decodedId = peerId ? decodeURIComponent(peerId) : "";
  const query = usePeerDetail(decodedId || undefined);
  const removeMut = useRemovePeerMutation();
  const syncMut = useSyncPeerMutation();

  const peer = query.data?.peer;

  if (!decodedId) {
    return (
      <PageShell title="Peer">
        <p className="text-muted-foreground">Missing peer id.</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={peer?.peer_name ?? "Peer"}
      description={
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Link to="/peers" className="text-primary hover:underline">
            ← All peers
          </Link>
          {showBackgroundQueryRefresh(query) ? <QueryRefreshIndicator /> : null}
        </div>
      }
      actions={
        peer?.active ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={syncMut.isPending}
              onClick={() =>
                syncMut.mutate(decodedId, {
                  onSuccess: (res) => {
                    const msg = (res as { message?: string }).message ?? "Sync acknowledged";
                    toast.success(msg);
                  },
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              {syncMut.isPending ? "Syncing…" : "Manual sync"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={removeMut.isPending}
              onClick={() => {
                if (!window.confirm(`Remove peer ${peer.peer_name}?`)) return;
                removeMut.mutate(decodedId, {
                  onSuccess: () => {
                    toast.success("Peer removed");
                    navigate("/peers");
                  },
                  onError: (e) => toast.error(e.message),
                });
              }}
            >
              Remove peer
            </Button>
          </div>
        ) : undefined
      }
    >
      {showInitialQuerySkeleton(query) ? (
        <DetailPageSkeleton />
      ) : query.error ? (
        <QueryErrorAlert title="Could not load peer">{query.error.message}</QueryErrorAlert>
      ) : !peer ? (
        <p className="text-muted-foreground">Peer not found.</p>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                Configuration
                <Badge variant={peer.active ? "default" : "destructive"}>
                  {peer.active ? "active" : "inactive"}
                </Badge>
                <Badge variant="secondary">{peer.direction}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-muted-foreground">peer_id</span>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{peer.peer_id}</code>
                <CopyIdButton id={peer.peer_id} />
              </div>
              <div>
                <span className="text-muted-foreground">entity_id</span>{" "}
                <Link className="font-mono text-xs text-primary hover:underline" to={`/entities/${encodeURIComponent(peer.entity_id)}`}>
                  {peer.entity_id}
                </Link>
              </div>
              <div>
                <span className="text-muted-foreground">URL</span>
                <p className="font-mono text-xs break-all mt-1">{peer.peer_url}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Entity types</span>
                <p className="mt-1">{peer.entity_types?.join(", ") || "—"}</p>
              </div>
              <div className="flex flex-wrap gap-4">
                <div>
                  <span className="text-muted-foreground">sync_scope</span>
                  <p>{peer.sync_scope}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">auth_method</span>
                  <p>{peer.auth_method}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">conflict_strategy</span>
                  <p>{peer.conflict_strategy}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-muted-foreground">
                <span>last_sync_at: {peer.last_sync_at ?? "—"}</span>
                <span>consecutive_failures: {peer.consecutive_failures ?? 0}</span>
              </div>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Full batch <code>sync_peer</code> and <code>resolve_sync_conflict</code> may remain stubs; use{" "}
            <code>correct</code> for manual conflict repair when needed.
          </p>
        </div>
      )}
    </PageShell>
  );
}

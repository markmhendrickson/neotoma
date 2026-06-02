import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function SubscriptionNervousCard({ snapshot }: { snapshot: Record<string, unknown> }) {
  const active = Boolean(snapshot.active);
  const delivery = str(snapshot.delivery_method) || "—";
  const types = arr(snapshot.watch_entity_types);
  const ids = arr(snapshot.watch_entity_ids);
  const evts = arr(snapshot.watch_event_types);
  const url = str(snapshot.webhook_url);
  const syncPeer = str(snapshot.sync_peer_id);
  const subId = str(snapshot.subscription_id);

  return (
    <Card className="border-primary/30 bg-muted/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          Subscription
          <Badge variant={active ? "default" : "destructive"}>{active ? "active" : "inactive"}</Badge>
          <Badge variant="secondary">{delivery}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {subId ? (
          <p>
            <span className="text-muted-foreground">subscription_id</span>{" "}
            <code className="text-xs">{subId}</code>
          </p>
        ) : null}
        <p>
          <span className="text-muted-foreground">Watches</span>{" "}
          {types.length ? `${types.length} type(s): ${types.join(", ")}` : null}
          {ids.length ? ` · ${ids.length} entity id(s)` : null}
          {evts.length ? ` · ${evts.length} event type(s)` : null}
          {!types.length && !ids.length && !evts.length ? "—" : null}
        </p>
        {url ? (
          <p className="break-all">
            <span className="text-muted-foreground">webhook_url</span>{" "}
            <span className="font-mono text-xs">{url}</span>
          </p>
        ) : null}
        {syncPeer ? (
          <p>
            <span className="text-muted-foreground">sync_peer_id</span> (loop skip){" "}
            <code className="text-xs">{syncPeer}</code>
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Webhook deliveries skip events whose <code>source_peer_id</code> matches <code>sync_peer_id</code>.
        </p>
      </CardContent>
    </Card>
  );
}

export function PeerConfigNervousCard({ snapshot }: { snapshot: Record<string, unknown> }) {
  const peerId = str(snapshot.peer_id);
  const active = Boolean(snapshot.active);
  return (
    <Card className="border-primary/30 bg-muted/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          Peer configuration
          <Badge variant={active ? "default" : "destructive"}>{active ? "active" : "inactive"}</Badge>
          <Badge variant="secondary">{str(snapshot.direction) || "—"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {peerId ? (
          <p>
            <Link className="text-primary hover:underline font-medium" to={`/peers/${encodeURIComponent(peerId)}`}>
              Open peer status →
            </Link>
          </p>
        ) : null}
        <p className="break-all">
          <span className="text-muted-foreground">peer_url</span>{" "}
          <span className="font-mono text-xs">{str(snapshot.peer_url) || "—"}</span>
        </p>
        <p>
          <span className="text-muted-foreground">entity_types</span>{" "}
          {arr(snapshot.entity_types).join(", ") || "—"}
        </p>
        <div className="flex flex-wrap gap-3 text-muted-foreground text-xs">
          <span>sync_scope: {str(snapshot.sync_scope) || "—"}</span>
          <span>auth: {str(snapshot.auth_method) || "—"}</span>
          <span>conflict: {str(snapshot.conflict_strategy) || "—"}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function SubmissionConfigNervousCard({ snapshot }: { snapshot: Record<string, unknown> }) {
  const active = Boolean(snapshot.active);
  const policy = str(snapshot.access_policy) || "—";
  const target = str(snapshot.target_entity_type) || "—";
  const key = str(snapshot.config_key) || "—";
  const mirrors = Array.isArray(snapshot.external_mirrors) ? snapshot.external_mirrors.length : 0;

  return (
    <Card className="border-primary/30 bg-muted/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          Submission config
          <Badge variant={active ? "default" : "secondary"}>{active ? "active" : "inactive"}</Badge>
          <Badge variant="outline">{policy}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>
          <span className="text-muted-foreground">config_key</span> <code className="text-xs">{key}</code>
        </p>
        <p>
          <span className="text-muted-foreground">target_entity_type</span>{" "}
          <Link className="text-primary hover:underline" to={`/schemas/${encodeURIComponent(target)}`}>
            {target}
          </Link>
        </p>
        <p>
          <span className="text-muted-foreground">Guest access policy</span>{" "}
          <code className="text-xs">{policy}</code> (submission pipeline)
        </p>
        <p className="text-xs text-muted-foreground">
          Threading: {String(snapshot.enable_conversation_threading)} · guest read-back:{" "}
          {String(snapshot.enable_guest_read_back)} · external_mirrors: {mirrors}
        </p>
      </CardContent>
    </Card>
  );
}

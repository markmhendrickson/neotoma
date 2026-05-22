# Subscriptions

Subscriptions deliver real-time notifications when Neotoma data changes. You can receive notifications via webhooks (HTTP POST with HMAC signature) or Server-Sent Events (SSE).

## Creating a subscription

### Via MCP

```
subscribe({
  entity_types: ["task", "issue"],
  delivery_method: "webhook",
  webhook_url: "https://example.com/neotoma-hook"
})
```

### Via CLI

Subscriptions are managed through the MCP `subscribe` action or the HTTP API. The CLI does not have a dedicated `subscribe` command; use `neotoma request subscribe` or the MCP tool directly.

### Filters

Every subscription must specify at least one filter. There is no firehose mode.

- `entity_types` (array of strings): receive events for these entity types.
- `entity_ids` (array of strings): receive events for these specific entities.
- `event_types` (array of strings): receive only these event types.

## Webhook delivery

Webhook subscriptions receive an HTTP POST for each matching event:

- **Signing**: every request includes `X-Neotoma-Signature-256: sha256=<hex>` computed over the JSON body with the subscription's `webhook_secret`. Verify this to confirm authenticity.
- **Retries**: failed deliveries retry with exponential backoff (`1s, 5s, 30s, 5m`).
- **Circuit breaker**: after 10 consecutive failures (configurable via `max_failures`), the subscription is deactivated. Reactivate by updating the subscription.
- **HTTPS required**: webhook URLs must use HTTPS in production. `http://localhost` and `http://127.0.0.1` are allowed in development.

## SSE delivery

For real-time streaming without running a webhook server:

```
GET /events/stream?subscription_id=<id>
```

The stream uses standard SSE format (`id:`, `event:`, `data:` fields). Clients should send `Last-Event-ID` on reconnect to resume from where they left off. The server buffers up to 1000 events (configurable via `NEOTOMA_SSE_EVENT_BUFFER`).

## Managing subscriptions

### List active subscriptions

Via MCP: `list_subscriptions`

### Check subscription health

Via MCP: `get_subscription_status` returns delivery stats, failure count, and active state.

### Remove a subscription

Via MCP: `unsubscribe({ subscription_id: "<id>" })`

## Limits

- Maximum 50 active subscriptions per user (configurable via `NEOTOMA_MAX_SUBSCRIPTIONS_PER_USER`).
- SSE buffer holds 1000 events by default (range: 100 to 10000).
- Webhook timeout is 10 seconds per delivery attempt.

## Peer sync

Subscriptions power cross-instance replication. When a subscription is configured with a `sync_peer_id`, matching events are routed through the peer sync delivery path instead of the generic webhook queue. Events originating from that peer are skipped to prevent loops. See [`docs/subsystems/peer_sync.md`](../subsystems/peer_sync.md) for the peer sync workflow.

## Related

- [`docs/subsystems/subscriptions.md`](../subsystems/subscriptions.md) for internals.
- [`docs/subsystems/peer_sync.md`](../subsystems/peer_sync.md) for cross-instance replication.
- [`docs/subsystems/substrate_events.md`](../subsystems/substrate_events.md) for event semantics.

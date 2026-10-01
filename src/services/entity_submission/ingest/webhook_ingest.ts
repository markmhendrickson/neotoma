import type { ExternalActor } from "../../../crypto/agent_identity.js";

/**
 * Pluggable inbound webhook → store mapping.
 *
 * STATUS: contract only. No generic `POST /submissions/webhook/:provider`
 * route is registered, and none is planned until a second provider exists —
 * see `docs/subsystems/entity_submission.md` § Inbound webhook ingest.
 *
 * The one shipped inbound path is `POST /github/webhook`, registered in
 * `src/actions.ts`, which calls the functions in `github_handler.ts` directly
 * and stores via `storeStructuredForApi`. This interface exists so that a
 * second provider is written against a stated shape rather than by copying
 * the GitHub handler; `githubWebhookIngestHandler` in `github_handler.ts` is
 * the reference conformance check.
 */
export interface WebhookIngestHandler {
  readonly provider: string;
  verifySignature(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
    secret: string
  ): boolean;
  mapEventToStore(
    event: string,
    payload: Record<string, unknown>,
    deliveryId: string
  ): {
    entities: Record<string, unknown>[];
    relationships: Array<{ relationship_type: string; source_index: number; target_index: number }>;
    idempotency_key: string;
    external_actor: ExternalActor;
    observation_source: "sensor";
  } | null;
}

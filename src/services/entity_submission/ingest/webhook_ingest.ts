import type { ExternalActor } from "../../../crypto/agent_identity.js";

/** Pluggable inbound webhook → store mapping (GitHub implements this today). */
export interface WebhookIngestHandler {
  readonly provider: string;
  verifySignature(headers: Record<string, string | string[] | undefined>, rawBody: Buffer, secret: string): boolean;
  mapEventToStore(
    event: string,
    payload: Record<string, unknown>,
    deliveryId: string,
  ): {
    entities: Record<string, unknown>[];
    relationships: Array<{ relationship_type: string; source_index: number; target_index: number }>;
    idempotency_key: string;
    external_actor: ExternalActor;
    observation_source: "sensor";
  } | null;
}

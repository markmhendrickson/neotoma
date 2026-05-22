/**
 * @deprecated Import from `entity_submission/ingest/github_handler` for new code.
 * Re-exports preserved for `actions.ts` and external callers.
 */

export {
  verifyGithubSignature,
  mapGithubWebhookEventToStore,
  mapEventToStore,
  type WebhookStorePayload,
} from "./entity_submission/ingest/github_handler.js";

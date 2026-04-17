export { NeotomaClient } from "./client.js";
export type { NeotomaClientOptions } from "./client.js";

export { HttpTransport } from "./http.js";
export type { HttpTransportOptions } from "./http.js";

export { LocalTransport } from "./local.js";
export type { LocalTransportOptions, LocalOperations } from "./local.js";

export {
  NeotomaClientError,
  type CreateRelationshipInput,
  type ListObservationsInput,
  type ListTimelineEventsInput,
  type NeotomaTransport,
  type RetrieveEntitiesInput,
  type RetrieveEntityByIdentifierInput,
  type RetrieveRelatedEntitiesInput,
  type StoreEntityInput,
  type StoreInput,
  type StoreRelationshipInput,
  type StoreResult,
  type StoredEntityRef,
} from "./types.js";

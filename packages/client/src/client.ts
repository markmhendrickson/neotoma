/**
 * Unified client facade.
 *
 * `NeotomaClient` wraps a transport (HTTP or local) and exposes the same
 * typed methods hook plugins and SDK adapters need. Callers normally pick
 * a transport up-front and forget about it.
 */

import { HttpTransport, HttpTransportOptions } from "./http.js";
import { LocalTransport, LocalTransportOptions } from "./local.js";
import {
  CreateRelationshipsInput,
  CreateRelationshipInput,
  ListObservationsInput,
  ListTimelineEventsInput,
  NeotomaTransport,
  RetrieveEntitiesInput,
  RetrieveEntityByIdentifierInput,
  RetrieveRelatedEntitiesInput,
  StoreInput,
  StoreResult,
} from "./types.js";

export type NeotomaClientOptions =
  | ({ transport: "http" } & HttpTransportOptions)
  | ({ transport: "local" } & LocalTransportOptions)
  | { transport: NeotomaTransport };

export class NeotomaClient implements NeotomaTransport {
  private readonly transport: NeotomaTransport;

  constructor(options: NeotomaClientOptions = { transport: "http" }) {
    if ("transport" in options && typeof options.transport === "object") {
      this.transport = options.transport;
    } else if ("transport" in options && options.transport === "local") {
      const { transport: _t, ...rest } = options;
      this.transport = new LocalTransport(rest);
    } else {
      const { transport: _t, ...rest } = options as { transport: "http" } & HttpTransportOptions;
      this.transport = new HttpTransport(rest);
    }
  }

  store(input: StoreInput): Promise<StoreResult> {
    return this.transport.store(input);
  }
  retrieveEntities(input: RetrieveEntitiesInput): Promise<unknown> {
    return this.transport.retrieveEntities(input);
  }
  retrieveEntityByIdentifier(input: RetrieveEntityByIdentifierInput): Promise<unknown> {
    return this.transport.retrieveEntityByIdentifier(input);
  }
  retrieveEntitySnapshot(input: { entity_id: string }): Promise<unknown> {
    return this.transport.retrieveEntitySnapshot(input);
  }
  listObservations(input: ListObservationsInput): Promise<unknown> {
    return this.transport.listObservations(input);
  }
  listTimelineEvents(input: ListTimelineEventsInput): Promise<unknown> {
    return this.transport.listTimelineEvents(input);
  }
  retrieveRelatedEntities(input: RetrieveRelatedEntitiesInput): Promise<unknown> {
    return this.transport.retrieveRelatedEntities(input);
  }
  createRelationship(input: CreateRelationshipInput): Promise<unknown> {
    return this.transport.createRelationship(input);
  }
  createRelationships(input: CreateRelationshipsInput): Promise<unknown> {
    return this.transport.createRelationships(input);
  }
  correct(input: {
    entity_id: string;
    corrections: Record<string, unknown>;
  }): Promise<unknown> {
    return this.transport.correct(input);
  }
  listEntityTypes(input: { search?: string } = {}): Promise<unknown> {
    return this.transport.listEntityTypes(input);
  }
  getEntityTypeCounts(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.transport.getEntityTypeCounts(input);
  }
  executeTool(name: string, args: unknown): Promise<unknown> {
    return this.transport.executeTool(name, args);
  }
  dispose(): Promise<void> {
    return this.transport.dispose();
  }
}

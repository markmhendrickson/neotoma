/**
 * Local (in-process) transport for @neotoma/client.
 *
 * Imports `neotoma/core` directly and executes operations against an
 * embedded `NeotomaServer` instance. Use this when the hook plugin and the
 * Neotoma core are in the same Node process (e.g. a CLI tool bundling
 * both), and you want to avoid the HTTP roundtrip.
 *
 * `neotoma` is an **optional** peer dependency. If it is not installed,
 * importing this module will throw a helpful error pointing the caller
 * toward the HTTP transport.
 */

import {
  CreateRelationshipsInput,
  CreateRelationshipInput,
  ListObservationsInput,
  ListTimelineEventsInput,
  NeotomaClientError,
  NeotomaTransport,
  RetrieveEntitiesInput,
  RetrieveEntityByIdentifierInput,
  RetrieveRelatedEntitiesInput,
  StoreInput,
  StoreResult,
} from "./types.js";

export interface LocalTransportOptions {
  /**
   * Authenticated user id. For local dev, pass the local dev user id
   * returned by `ensureLocalDevUser()` in `neotoma/server`. For multi-user
   * in-process mode, pass the resolved user id per request (construct a
   * new client per user).
   */
  userId: string;
  /**
   * Optional pre-constructed `Operations` instance. If omitted, this
   * transport lazily imports `neotoma/core` and creates one on first use.
   */
  operations?: LocalOperations;
}

/**
 * Structural type for the core operations factory output. Matches the
 * shape of `createOperations()` from `neotoma/core/operations.ts`. We
 * declare it structurally to avoid a hard import on `neotoma` at module
 * evaluation time.
 */
export interface LocalOperations {
  store(input: StoreInput): Promise<StoreResult>;
  storeStructured(input: StoreInput): Promise<StoreResult>;
  storeUnstructured(input: StoreInput): Promise<StoreResult>;
  retrieveEntities(input: RetrieveEntitiesInput): Promise<unknown>;
  retrieveEntityByIdentifier(input: RetrieveEntityByIdentifierInput): Promise<unknown>;
  retrieveEntitySnapshot(input: { entity_id: string }): Promise<unknown>;
  listObservations(input: ListObservationsInput): Promise<unknown>;
  listTimelineEvents(input: ListTimelineEventsInput): Promise<unknown>;
  retrieveRelatedEntities(input: RetrieveRelatedEntitiesInput): Promise<unknown>;
  createRelationship(input: CreateRelationshipInput): Promise<unknown>;
  createRelationships(input: CreateRelationshipsInput): Promise<unknown>;
  correct(input: { entity_id: string; corrections: Record<string, unknown> }): Promise<unknown>;
  listEntityTypes(input?: { search?: string }): Promise<unknown>;
  getEntityTypeCounts(input?: Record<string, unknown>): Promise<unknown>;
  executeTool(name: string, args: unknown): Promise<unknown>;
  dispose(): Promise<void>;
}

export class LocalTransport implements NeotomaTransport {
  private readonly userId: string;
  private operations: LocalOperations | null;
  private operationsPromise: Promise<LocalOperations> | null = null;

  constructor(options: LocalTransportOptions) {
    this.userId = options.userId;
    this.operations = options.operations ?? null;
  }

  private async resolveOperations(): Promise<LocalOperations> {
    if (this.operations) return this.operations;
    if (this.operationsPromise) return this.operationsPromise;

    this.operationsPromise = (async () => {
      try {
        // Use an indirect specifier so TypeScript does not attempt to
        // resolve `neotoma/core` at compile time — it is an optional
        // peer dependency and may not be installed at build time.
        const specifier = "neotoma/core";
        const mod = (await import(specifier)) as {
          createOperations: (options: { userId: string }) => LocalOperations;
        };
        this.operations = mod.createOperations({ userId: this.userId });
        return this.operations;
      } catch (error) {
        throw new NeotomaClientError(
          "`neotoma` is not installed. Install it as a peer dependency to use the local transport, or switch to HttpTransport.",
          { cause: error }
        );
      }
    })();
    return this.operationsPromise;
  }

  async store(input: StoreInput): Promise<StoreResult> {
    const ops = await this.resolveOperations();
    return ops.store(input);
  }

  async retrieveEntities(input: RetrieveEntitiesInput): Promise<unknown> {
    const ops = await this.resolveOperations();
    return ops.retrieveEntities(input);
  }

  async retrieveEntityByIdentifier(input: RetrieveEntityByIdentifierInput): Promise<unknown> {
    const ops = await this.resolveOperations();
    return ops.retrieveEntityByIdentifier(input);
  }

  async retrieveEntitySnapshot(input: { entity_id: string }): Promise<unknown> {
    const ops = await this.resolveOperations();
    return ops.retrieveEntitySnapshot(input);
  }

  async listObservations(input: ListObservationsInput): Promise<unknown> {
    const ops = await this.resolveOperations();
    return ops.listObservations(input);
  }

  async listTimelineEvents(input: ListTimelineEventsInput): Promise<unknown> {
    const ops = await this.resolveOperations();
    return ops.listTimelineEvents(input);
  }

  async retrieveRelatedEntities(input: RetrieveRelatedEntitiesInput): Promise<unknown> {
    const ops = await this.resolveOperations();
    return ops.retrieveRelatedEntities(input);
  }

  async createRelationship(input: CreateRelationshipInput): Promise<unknown> {
    const ops = await this.resolveOperations();
    return ops.createRelationship(input);
  }

  async createRelationships(input: CreateRelationshipsInput): Promise<unknown> {
    const ops = await this.resolveOperations();
    return ops.createRelationships(input);
  }

  async correct(input: {
    entity_id: string;
    corrections: Record<string, unknown>;
  }): Promise<unknown> {
    const ops = await this.resolveOperations();
    return ops.correct(input);
  }

  async listEntityTypes(input: { search?: string } = {}): Promise<unknown> {
    const ops = await this.resolveOperations();
    return ops.listEntityTypes(input);
  }

  async getEntityTypeCounts(input: Record<string, unknown> = {}): Promise<unknown> {
    const ops = await this.resolveOperations();
    return ops.getEntityTypeCounts(input);
  }

  async executeTool(name: string, args: unknown): Promise<unknown> {
    const ops = await this.resolveOperations();
    return ops.executeTool(name, args);
  }

  async dispose(): Promise<void> {
    if (this.operations) {
      await this.operations.dispose();
      this.operations = null;
    }
    this.operationsPromise = null;
  }
}

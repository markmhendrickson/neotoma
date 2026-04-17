/**
 * HTTP transport for @neotoma/client.
 *
 * Talks to a Neotoma API server (defaults to http://127.0.0.1:3080) using
 * the REST endpoints defined in `openapi.yaml`. Authentication is via
 * bearer token (either an OAuth token or a local dev token).
 *
 * This transport is the recommended default for hook plugins because it
 * has minimal dependencies (only the built-in `fetch` in Node 18+) and
 * keeps the hook process decoupled from the Neotoma server lifecycle.
 */

import {
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

export interface HttpTransportOptions {
  /** Base URL of the Neotoma API server. Defaults to http://127.0.0.1:3080. */
  baseUrl?: string;
  /**
   * Bearer token. Optional for local dev (uses `Authorization: Bearer dev-local`).
   * For remote / production, pass an OAuth-issued token.
   */
  token?: string;
  /**
   * Custom fetch implementation, primarily for testing. Defaults to the
   * global `fetch` (Node 18+ and all modern runtimes).
   */
  fetch?: typeof fetch;
  /** Optional per-request timeout in ms. Defaults to 30s. */
  timeoutMs?: number;
  /** Optional extra headers merged on every request. */
  headers?: Record<string, string>;
}

const DEFAULT_BASE_URL = "http://127.0.0.1:3080";
const DEFAULT_TIMEOUT_MS = 30_000;

export class HttpTransport implements NeotomaTransport {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly extraHeaders: Record<string, string>;

  constructor(options: HttpTransportOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.token = options.token ?? "dev-local";
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.extraHeaders = options.headers ?? {};

    if (!this.fetchImpl) {
      throw new NeotomaClientError(
        "No fetch implementation available. Pass `fetch` via options or use Node 18+."
      );
    }
  }

  private async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
          ...this.extraHeaders,
        },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorBody: unknown;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text().catch(() => undefined);
        }
        throw new NeotomaClientError(
          `Neotoma API ${response.status} on POST ${path}`,
          { status: response.status, body: errorBody }
        );
      }

      if (response.status === 204) {
        return undefined as unknown as T;
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof NeotomaClientError) {
        throw error;
      }
      throw new NeotomaClientError(
        `Network error on POST ${path}: ${(error as Error).message}`,
        { cause: error }
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async store(input: StoreInput): Promise<StoreResult> {
    return this.post<StoreResult>("/store", input);
  }

  async retrieveEntities(input: RetrieveEntitiesInput): Promise<unknown> {
    return this.post("/entities/query", input);
  }

  async retrieveEntityByIdentifier(input: RetrieveEntityByIdentifierInput): Promise<unknown> {
    return this.post("/retrieve_entity_by_identifier", input);
  }

  async retrieveEntitySnapshot(input: { entity_id: string }): Promise<unknown> {
    return this.post("/get_entity_snapshot", input);
  }

  async listObservations(input: ListObservationsInput): Promise<unknown> {
    return this.post("/list_observations", input);
  }

  async listTimelineEvents(input: ListTimelineEventsInput): Promise<unknown> {
    return this.post("/timeline", input);
  }

  async retrieveRelatedEntities(input: RetrieveRelatedEntitiesInput): Promise<unknown> {
    return this.post("/retrieve_related_entities", input);
  }

  async createRelationship(input: CreateRelationshipInput): Promise<unknown> {
    return this.post("/create_relationship", input);
  }

  async correct(input: {
    entity_id: string;
    corrections: Record<string, unknown>;
  }): Promise<unknown> {
    return this.post("/correct", input);
  }

  async listEntityTypes(input: { search?: string } = {}): Promise<unknown> {
    return this.post("/schemas", input);
  }

  async getEntityTypeCounts(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.post("/stats", input);
  }

  /**
   * Escape hatch for hook plugins that need to call an MCP action not yet
   * exposed as a typed method. Maps tool names to REST endpoints using a
   * best-effort convention (tool name with underscores → `/tool_name`).
   */
  async executeTool(name: string, args: unknown): Promise<unknown> {
    const path = `/${name}`;
    return this.post(path, args);
  }

  async dispose(): Promise<void> {
    // No persistent connections to close for the fetch-based transport.
  }
}

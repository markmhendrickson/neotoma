import { setTimeout as delay } from 'node:timers/promises';
import type { ConnectorSecrets } from '../../services/connectors.js';
import type {
  FetchUpdatesInput,
  FetchUpdatesResult,
  ProviderClient,
  ProviderRecord,
  ProviderCapability,
} from './types.js';

export abstract class RestProviderClient implements ProviderClient {
  abstract readonly id: string;
  abstract readonly capabilities: readonly ProviderCapability[];
  abstract readonly defaultRecordType: string;

  protected requestTimeoutMs = 15000;
  protected maxRetries = 3;

  abstract fetchUpdates(input: FetchUpdatesInput): Promise<FetchUpdatesResult>;

  protected requireAccessToken(secrets: ConnectorSecrets | null, hint?: string): string {
    const token = secrets?.accessToken || secrets?.token || secrets?.bearer;
    if (!token || typeof token !== 'string') {
      throw new Error(
        hint
          ? `${this.id} connector token missing (${hint})`
          : `${this.id} connector token missing`
      );
    }
    return token;
  }

  protected requireField<T extends string | number | boolean>(
    value: T | null | undefined,
    label: string
  ): T {
    if (value === undefined || value === null || value === '') {
      throw new Error(`${this.id} connector missing ${label}`);
    }
    return value;
  }

  protected async fetchJson<T = any>(
    url: string,
    init: RequestInit & { retryCount?: number } = {}
  ): Promise<T> {
    const retries = init.retryCount ?? 0;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await safeJson(response);
        const error = new Error(
          `${this.id} request failed (${response.status} ${response.statusText})`
        );
        (error as any).response = body;
        throw error;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (retries < this.maxRetries) {
        await delay(250 * (retries + 1));
        return this.fetchJson<T>(url, { ...init, retryCount: retries + 1 });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  protected mapRecordsWithSource(records: ProviderRecord[]): ProviderRecord[] {
    return records.map((record) => ({
      ...record,
      externalSource: record.externalSource || this.id,
      type: record.type || this.defaultRecordType,
    }));
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}





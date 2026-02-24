import type { Settings } from '@/hooks/useSettings';

export class ApiAccessError extends Error {
  constructor(action?: string) {
    super(getApiAccessDisabledMessage(action));
    this.name = 'ApiAccessError';
  }
}

export function isApiAccessEnabled(settings: Settings | undefined | null): boolean {
  return Boolean(settings?.cloudStorageEnabled);
}

export function getApiAccessDisabledMessage(action?: string): string {
  const actionPrefix = action ? `${action} unavailable while Cloud Storage is disabled. ` : '';
  return `${actionPrefix}Enable "Cloud Storage" in Settings to access cloud-hosted files.`;
}

export function assertApiAccess(settings: Settings, action?: string): void {
  if (!isApiAccessEnabled(settings)) {
    throw new ApiAccessError(action);
  }
}


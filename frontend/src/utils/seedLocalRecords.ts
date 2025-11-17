import type { DatastoreAPI } from '@/hooks/useDatastore';
import { buildSampleRecords, SAMPLE_RECORD_STORAGE_KEY } from '@/sample-data/sample-records';

interface SeedOptions {
  force?: boolean;
}

function markSeeded(value: string) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(SAMPLE_RECORD_STORAGE_KEY, value);
  } catch (error) {
    console.warn('[SampleRecords] Failed to persist seed marker:', error);
  }
}

function wasSeeded(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(SAMPLE_RECORD_STORAGE_KEY) === 'true';
  } catch (error) {
    console.warn('[SampleRecords] Failed to read seed marker:', error);
    return false;
  }
}

export async function seedLocalRecords(datastore: DatastoreAPI, options: SeedOptions = {}): Promise<boolean> {
  if (!datastore.initialized) {
    throw new Error('Datastore not initialized');
  }

  if (!options.force && wasSeeded()) {
    return false;
  }

  const existing = await datastore.queryRecords({ limit: 1 });
  if (existing.length > 0 && !options.force) {
    markSeeded('skipped-nonempty');
    return false;
  }

  const records = buildSampleRecords();
  for (const record of records) {
    await datastore.putRecord(record);
  }

  markSeeded('true');
  return true;
}

export function resetSeedMarker() {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.removeItem(SAMPLE_RECORD_STORAGE_KEY);
  } catch (error) {
    console.warn('[SampleRecords] Failed to remove seed marker:', error);
  }
}



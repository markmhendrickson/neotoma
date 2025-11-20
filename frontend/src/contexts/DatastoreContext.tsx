/**
 * Context for providing datastore clearAll function
 * Used to clear database when keys are regenerated
 */

import { createContext, useContext } from 'react';
import type { DatastoreAPI } from '@/hooks/useDatastore';

export const DatastoreContext = createContext<DatastoreAPI | null>(null);

export function useDatastoreContext(): DatastoreAPI | null {
  return useContext(DatastoreContext);
}


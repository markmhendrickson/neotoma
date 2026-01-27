import { ensureLocalSupabase } from './utils/servers.js';

export default async function globalSetup(): Promise<void> {
  await ensureLocalSupabase();
}

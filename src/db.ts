import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.js';

export const supabase: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseKey
);

export interface NeotomaRecord {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  file_urls: string[];
  embedding?: number[] | null;
  created_at: string;
  updated_at: string;
}

export async function initDatabase(): Promise<void> {
  try {
    const { error } = await supabase.from('records').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
}




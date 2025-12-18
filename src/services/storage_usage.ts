import { supabase } from "../db.js";

const STORAGE_USAGE_FUNCTION = "increment_storage_usage";
const INTERPRETATION_COUNT_FUNCTION = "increment_interpretation_count";

export async function incrementStorageUsage(
  userId: string,
  bytes: number,
): Promise<void> {
  const { error } = await supabase.rpc(STORAGE_USAGE_FUNCTION, {
    p_user_id: userId,
    p_bytes: bytes,
  });

  if (error) {
    throw new Error(
      `increment_storage_usage failed: ${error.message ?? "unknown error"}`,
    );
  }
}

export async function incrementInterpretationCount(
  userId: string,
): Promise<void> {
  const { error } = await supabase.rpc(INTERPRETATION_COUNT_FUNCTION, {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(
      `increment_interpretation_count failed: ${
        error.message ?? "unknown error"
      }`,
    );
  }
}

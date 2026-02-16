/**
 * Canonical entity display name (shared: CLI and web app).
 * Priority: title → name → type-specific fields → canonical_name.
 */

export interface EntityDisplayInput {
  entity_type: string;
  canonical_name: string;
  snapshot?: Record<string, unknown> | null;
}

/**
 * Type-specific field mappings for display names (when title/name are not present).
 */
export const TYPE_SPECIFIC_DISPLAY_FIELDS: Record<string, string[]> = {
  invoice: ["invoice_number", "vendor_name", "customer_name"],
  receipt: ["merchant_name", "receipt_number"],
  purchase: ["item_name"],
  fixed_cost: ["expense_name", "merchant"],
  flow: ["flow_name"],
  email: ["subject", "from"],
  message: ["subject", "sender"],
  holding: ["asset_name", "asset_symbol"],
  income: ["source"],
  transaction: ["counterparty", "description"],
  account: ["wallet_name", "number"],
  crypto_transaction: ["tx_hash", "asset_symbol"],
  tax_event: ["asset_symbol", "description"],
  balance: ["account_name", "account_id"],
  address: ["street", "city"],
  relationship: ["relationship_type"],
  note: ["content"],
};

/**
 * Get display name for an entity (deterministic, schema-aware).
 * Priority: title → name → type-specific fields → canonical_name.
 */
export function getEntityDisplayName(input: EntityDisplayInput): string {
  const snapshot = input.snapshot ?? {};

  if (snapshot.title && typeof snapshot.title === "string" && snapshot.title.trim()) {
    return snapshot.title.trim();
  }
  if (snapshot.name && typeof snapshot.name === "string" && snapshot.name.trim()) {
    return snapshot.name.trim();
  }

  const typeSpecificFields = TYPE_SPECIFIC_DISPLAY_FIELDS[input.entity_type] ?? [];
  for (const field of typeSpecificFields) {
    const value = snapshot[field];
    if (value && typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];
      if (typeof first === "string" && first.trim()) {
        return first.trim();
      }
    }
  }

  return input.canonical_name?.trim() || "—";
}

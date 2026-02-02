/**
 * Entity Display Name Utility
 * 
 * Provides deterministic, schema-aware display name generation for entities.
 * Priority: title → name → type-specific fields → canonical_name
 */

import type { Entity } from "@/components/EntityList";

/**
 * Type-specific field mappings for display names
 * Maps entity types to arrays of field names (in priority order)
 * that can serve as display names when title/name are not available
 */
const TYPE_SPECIFIC_DISPLAY_FIELDS: Record<string, string[]> = {
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
  note: ["content"], // Only if title not present
};

/**
 * Get display name for an entity (deterministic, schema-aware)
 * 
 * Priority order:
 * 1. `title` field (if exists in snapshot)
 * 2. `name` field (if exists in snapshot)
 * 3. Type-specific descriptive fields (from TYPE_SPECIFIC_DISPLAY_FIELDS)
 * 4. `canonical_name` (always available, final fallback)
 * 
 * @param entity - Entity object with snapshot data
 * @returns Human-readable display name (always returns a string)
 */
export function getEntityDisplayName(entity: Entity): string {
  const snapshot = entity.snapshot || {};
  
  // Priority 1: Explicit title field
  if (snapshot.title && typeof snapshot.title === "string" && snapshot.title.trim()) {
    return snapshot.title.trim();
  }
  
  // Priority 2: Explicit name field
  if (snapshot.name && typeof snapshot.name === "string" && snapshot.name.trim()) {
    return snapshot.name.trim();
  }
  
  // Priority 3: Type-specific descriptive fields
  const typeSpecificFields = TYPE_SPECIFIC_DISPLAY_FIELDS[entity.entity_type] || [];
  for (const field of typeSpecificFields) {
    const value = snapshot[field];
    if (value && typeof value === "string" && value.trim()) {
      return value.trim();
    }
    // Handle array fields (e.g., parties in contracts)
    if (Array.isArray(value) && value.length > 0) {
      const firstItem = value[0];
      if (typeof firstItem === "string" && firstItem.trim()) {
        return firstItem.trim();
      }
    }
  }
  
  // Priority 4: Fallback to canonical_name (always available)
  return entity.canonical_name || "—";
}

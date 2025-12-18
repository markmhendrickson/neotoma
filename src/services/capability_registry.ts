/**
 * Capability Registry
 *
 * Manages capability definitions for payload submission.
 * Capabilities define how payloads are processed, including:
 * - Entity extraction rules
 * - Canonicalization rules
 * - Schema versioning
 */

export interface CanonicalizationRules {
  includedFields: string[]; // Fields to include in hash
  normalizeStrings?: boolean; // Trim and lowercase strings
  sortArrays?: boolean; // Sort array values for determinism
}

export interface EntityExtractionRule {
  source_field?: string; // Field in payload.body (if undefined, extract from payload itself)
  entity_type: string; // Entity type to create
  extraction_type: "field_value" | "payload_self" | "array_items";
}

export interface Capability {
  id: string; // Format: "neotoma:{intent}:{version}"
  intent: string; // "store_invoice", "store_transaction", etc.
  version: string; // "v1", "v2", etc.
  primary_entity_type: string; // Primary entity type (payload itself)
  schema_version: string; // Schema registry version
  canonicalization_rules: CanonicalizationRules;
  entity_extraction_rules: EntityExtractionRule[];
}

// Capability registry
const CAPABILITIES: Record<string, Capability> = {
  "neotoma:store_invoice:v1": {
    id: "neotoma:store_invoice:v1",
    intent: "store_invoice",
    version: "v1",
    primary_entity_type: "invoice",
    schema_version: "1.0",
    canonicalization_rules: {
      includedFields: [
        "invoice_number",
        "amount",
        "vendor_name",
        "customer_name",
        "date",
      ],
      normalizeStrings: true,
      sortArrays: true,
    },
    entity_extraction_rules: [
      { extraction_type: "payload_self", entity_type: "invoice" },
      {
        extraction_type: "field_value",
        source_field: "vendor_name",
        entity_type: "company",
      },
      {
        extraction_type: "field_value",
        source_field: "customer_name",
        entity_type: "company",
      },
    ],
  },
  "neotoma:store_transaction:v1": {
    id: "neotoma:store_transaction:v1",
    intent: "store_transaction",
    version: "v1",
    primary_entity_type: "transaction",
    schema_version: "1.0",
    canonicalization_rules: {
      includedFields: [
        "transaction_id",
        "amount",
        "merchant_name",
        "counterparty",
        "date",
      ],
      normalizeStrings: true,
      sortArrays: true,
    },
    entity_extraction_rules: [
      { extraction_type: "payload_self", entity_type: "transaction" },
      {
        extraction_type: "field_value",
        source_field: "merchant_name",
        entity_type: "company",
      },
      {
        extraction_type: "field_value",
        source_field: "counterparty",
        entity_type: "company",
      },
    ],
  },
  "neotoma:store_receipt:v1": {
    id: "neotoma:store_receipt:v1",
    intent: "store_receipt",
    version: "v1",
    primary_entity_type: "receipt",
    schema_version: "1.0",
    canonicalization_rules: {
      includedFields: ["receipt_number", "amount", "vendor_name", "date"],
      normalizeStrings: true,
      sortArrays: true,
    },
    entity_extraction_rules: [
      { extraction_type: "payload_self", entity_type: "receipt" },
      {
        extraction_type: "field_value",
        source_field: "vendor_name",
        entity_type: "company",
      },
    ],
  },
  "neotoma:store_contract:v1": {
    id: "neotoma:store_contract:v1",
    intent: "store_contract",
    version: "v1",
    primary_entity_type: "contract",
    schema_version: "1.0",
    canonicalization_rules: {
      includedFields: ["contract_number", "parties", "start_date", "end_date"],
      normalizeStrings: true,
      sortArrays: true,
    },
    entity_extraction_rules: [
      { extraction_type: "payload_self", entity_type: "contract" },
      {
        extraction_type: "array_items",
        source_field: "parties",
        entity_type: "company",
      },
    ],
  },
  "neotoma:store_note:v1": {
    id: "neotoma:store_note:v1",
    intent: "store_note",
    version: "v1",
    primary_entity_type: "note",
    schema_version: "1.0",
    canonicalization_rules: {
      includedFields: ["title", "content", "tasks"],
      normalizeStrings: true,
      sortArrays: true,
    },
    entity_extraction_rules: [
      { extraction_type: "payload_self", entity_type: "note" },
      {
        extraction_type: "array_items",
        source_field: "tasks",
        entity_type: "task",
      },
    ],
  },
};

/**
 * Get capability by ID
 */
export function getCapability(capabilityId: string): Capability | null {
  return CAPABILITIES[capabilityId] || null;
}

/**
 * List all available capabilities
 */
export function listCapabilities(): Capability[] {
  return Object.values(CAPABILITIES);
}

/**
 * Check if capability exists
 */
export function hasCapability(capabilityId: string): boolean {
  return capabilityId in CAPABILITIES;
}

/**
 * Get capabilities by intent (all versions)
 */
export function getCapabilitiesByIntent(intent: string): Capability[] {
  return Object.values(CAPABILITIES).filter((cap) => cap.intent === intent);
}

/**
 * Get latest capability version for an intent
 */
export function getLatestCapability(intent: string): Capability | null {
  const capabilities = getCapabilitiesByIntent(intent);
  if (capabilities.length === 0) return null;

  // Sort by version (assuming semantic versioning)
  const sorted = capabilities.sort((a, b) => {
    const aNum = parseInt(a.version.replace("v", ""));
    const bNum = parseInt(b.version.replace("v", ""));
    return bNum - aNum;
  });

  return sorted[0];
}

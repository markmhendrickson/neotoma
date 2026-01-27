/**
 * Fixture Validation
 *
 * Validates fixtures against schema definitions and privacy requirements.
 */

import type { FixtureType } from "./types.js";

/**
 * Check if fixture contains real PII (privacy validation)
 */
export function containsRealPII(fixture: Record<string, unknown>): boolean {
  const piiPatterns = [
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN
    /\b\d{9}\b/, // 9-digit numbers (potential SSN)
    /@gmail\.com|@yahoo\.com|@hotmail\.com/, // Common real email domains
    /\b\d{4}\s\d{4}\s\d{4}\s\d{4}\b/, // Credit card pattern
  ];

  const fixtureStr = JSON.stringify(fixture).toLowerCase();

  // Check for obviously fake data markers
  const fakeMarkers = [
    "example.com",
    "test",
    "john doe",
    "jane smith",
    "123 main st",
    "acme corp",
  ];

  const hasFakeMarkers = fakeMarkers.some((marker) =>
    fixtureStr.includes(marker),
  );

  // If has fake markers, likely safe
  if (hasFakeMarkers) {
    return false;
  }

  // Check for PII patterns
  return piiPatterns.some((pattern) => pattern.test(fixtureStr));
}

/**
 * Validate fixture has required schema_version field
 */
export function hasSchemaVersion(fixture: Record<string, unknown>): boolean {
  return fixture.schema_version === "1.0";
}

/**
 * Validate fixture structure matches expected type
 */
export function validateFixtureStructure(
  fixture: Record<string, unknown>,
  recordType: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!hasSchemaVersion(fixture)) {
    errors.push("Missing or invalid schema_version field");
  }

  // Type-specific validations
  switch (recordType) {
    case "holding":
      if (!fixture.snapshot_date)
        errors.push("Missing required field: snapshot_date");
      if (!fixture.asset_symbol)
        errors.push("Missing required field: asset_symbol");
      if (!fixture.current_value_usd)
        errors.push("Missing required field: current_value_usd");
      break;
    case "income":
      if (!fixture.income_date)
        errors.push("Missing required field: income_date");
      if (!fixture.source) errors.push("Missing required field: source");
      if (!fixture.amount_usd)
        errors.push("Missing required field: amount_usd");
      if (!fixture.tax_year) errors.push("Missing required field: tax_year");
      break;
    case "tax_event":
      if (!fixture.event_date)
        errors.push("Missing required field: event_date");
      if (!fixture.asset_symbol)
        errors.push("Missing required field: asset_symbol");
      if (fixture.gain_loss_usd === undefined)
        errors.push("Missing required field: gain_loss_usd");
      if (!fixture.tax_year) errors.push("Missing required field: tax_year");
      break;
    case "crypto_transaction":
      if (!fixture.transaction_date)
        errors.push("Missing required field: transaction_date");
      if (!fixture.tx_hash) errors.push("Missing required field: tx_hash");
      if (!fixture.asset_symbol)
        errors.push("Missing required field: asset_symbol");
      if (!fixture.value_usd) errors.push("Missing required field: value_usd");
      break;
    case "liability":
      if (!fixture.name) errors.push("Missing required field: name");
      if (!fixture.amount_usd)
        errors.push("Missing required field: amount_usd");
      if (!fixture.snapshot_date)
        errors.push("Missing required field: snapshot_date");
      break;
    case "flow":
      if (!fixture.flow_name) errors.push("Missing required field: flow_name");
      if (!fixture.flow_date) errors.push("Missing required field: flow_date");
      if (!fixture.amount_usd)
        errors.push("Missing required field: amount_usd");
      break;
    case "purchase":
      if (!fixture.item_name) errors.push("Missing required field: item_name");
      if (!fixture.status) errors.push("Missing required field: status");
      if (!fixture.created_date)
        errors.push("Missing required field: created_date");
      break;
    case "transfer":
      if (!fixture.name) errors.push("Missing required field: name");
      if (!fixture.origin_account)
        errors.push("Missing required field: origin_account");
      if (!fixture.destination_account)
        errors.push("Missing required field: destination_account");
      if (!fixture.created_time)
        errors.push("Missing required field: created_time");
      break;
    case "wallet":
      if (!fixture.name) errors.push("Missing required field: name");
      if (!fixture.status) errors.push("Missing required field: status");
      break;
    case "tax_filing":
      if (!fixture.name) errors.push("Missing required field: name");
      if (!fixture.jurisdiction)
        errors.push("Missing required field: jurisdiction");
      if (!fixture.year) errors.push("Missing required field: year");
      if (!fixture.status) errors.push("Missing required field: status");
      break;
    case "order":
      if (!fixture.name) errors.push("Missing required field: name");
      if (!fixture.order_type)
        errors.push("Missing required field: order_type");
      if (!fixture.date) errors.push("Missing required field: date");
      break;
    case "fixed_cost":
      if (!fixture.merchant) errors.push("Missing required field: merchant");
      if (!fixture.expense_name)
        errors.push("Missing required field: expense_name");
      if (!fixture.frequency_per_year)
        errors.push("Missing required field: frequency_per_year");
      if (!fixture.status) errors.push("Missing required field: status");
      break;
    case "property":
      if (!fixture.name) errors.push("Missing required field: name");
      if (!fixture.address) errors.push("Missing required field: address");
      if (!fixture.purchase_date)
        errors.push("Missing required field: purchase_date");
      break;
    case "balance":
      if (!fixture.snapshot_date)
        errors.push("Missing required field: snapshot_date");
      if (!fixture.account_id)
        errors.push("Missing required field: account_id");
      if (!fixture.balance_usd)
        errors.push("Missing required field: balance_usd");
      break;
    case "transaction":
      if (!fixture.amount) errors.push("Missing required field: amount");
      if (!fixture.currency) errors.push("Missing required field: currency");
      if (!fixture.date) errors.push("Missing required field: date");
      if (!fixture.merchant_name)
        errors.push("Missing required field: merchant_name");
      if (!fixture.status) errors.push("Missing required field: status");
      if (!fixture.account_id)
        errors.push("Missing required field: account_id");
      break;
    case "contact":
      if (!fixture.name) errors.push("Missing required field: name");
      break;
    case "contract":
      // Contract has optional required fields
      break;
    case "account":
      if (!fixture.external_id)
        errors.push("Missing required field: external_id");
      if (!fixture.institution)
        errors.push("Missing required field: institution");
      if (!fixture.currency) errors.push("Missing required field: currency");
      if (!fixture.status) errors.push("Missing required field: status");
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate update variant maintains referential integrity
 */
export function validateUpdateVariant(
  baseRecord: Record<string, unknown>,
  variant: Record<string, unknown>,
  idField: string = "external_id",
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const baseId = baseRecord[idField];
  const variantId = variant[idField];

  if (baseId && variantId && baseId !== variantId) {
    errors.push(
      `Update variant must maintain same ${idField}: ${baseId} !== ${variantId}`,
    );
  }

  // Check that updated_at is later than base record's timestamp
  const baseDate = baseRecord.updated_at || baseRecord.created_at;
  const variantDate = variant.updated_at || variant.created_at;

  if (
    baseDate &&
    variantDate &&
    typeof baseDate === "string" &&
    typeof variantDate === "string"
  ) {
    if (new Date(variantDate) <= new Date(baseDate)) {
      errors.push(
        `Update variant timestamp must be later than base record: ${variantDate} <= ${baseDate}`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate state transition is valid
 */
export function validateStateTransition(
  fromStatus: string,
  toStatus: string,
  recordType: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Define valid state transitions per record type
  const validTransitions: Record<string, Record<string, string[]>> = {
    purchase: {
      pending: ["in_progress", "cancelled"],
      in_progress: ["completed", "cancelled"],
      completed: [], // Terminal state
      cancelled: [], // Terminal state
    },
    transfer: {
      pending: ["completed", "failed"],
      completed: [], // Terminal state
      failed: [], // Terminal state
    },
    tax_filing: {
      pending: ["filed", "cancelled"],
      filed: [], // Terminal state
      cancelled: [], // Terminal state
    },
    order: {
      pending: ["filled", "cancelled"],
      filled: [], // Terminal state
      cancelled: [], // Terminal state
    },
    fixed_cost: {
      active: ["cancelled", "pending"],
      cancelled: [], // Terminal state
      pending: ["active", "cancelled"],
    },
  };

  const transitions = validTransitions[recordType];
  if (transitions) {
    const allowedNextStates = transitions[fromStatus];
    if (!allowedNextStates) {
      errors.push(`Unknown fromStatus for ${recordType}: ${fromStatus}`);
    } else if (!allowedNextStates.includes(toStatus)) {
      errors.push(
        `Invalid transition for ${recordType}: ${fromStatus} -> ${toStatus}. Allowed: ${allowedNextStates.join(
          ", ",
        )}`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate all fixtures in a file
 */
export function validateFixtureFile(
  fixtures: Record<string, unknown>[],
  recordType: string,
): { valid: boolean; errors: Array<{ index: number; errors: string[] }> } {
  const allErrors: Array<{ index: number; errors: string[] }> = [];

  fixtures.forEach((fixture, index) => {
    // Privacy check
    if (containsRealPII(fixture)) {
      allErrors.push({
        index,
        errors: ["Fixture contains potential real PII"],
      });
    }

    // Structure validation
    const structureValidation = validateFixtureStructure(fixture, recordType);
    if (!structureValidation.valid) {
      allErrors.push({
        index,
        errors: structureValidation.errors,
      });
    }
  });

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}

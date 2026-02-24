import { parseCsvRows } from "../utils/csv.js";

function normalizeKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function hasAllHeaders(headers: Set<string>, required: string[]): boolean {
  return required.every((header) => headers.has(header));
}

function inferEntityType(headers: Set<string>, fileName?: string): string {
  const lowerName = (fileName || "").toLowerCase();

  if (
    lowerName.includes("crypto") ||
    hasAllHeaders(headers, ["transaction_date", "asset_symbol", "value_usd", "tx_hash"])
  ) {
    return "crypto_transaction";
  }

  if (
    lowerName.includes("balance") ||
    hasAllHeaders(headers, ["snapshot_date", "account_id", "balance_usd"])
  ) {
    return "balance";
  }

  if (
    lowerName.includes("transaction") ||
    (headers.has("amount_usd") &&
      (headers.has("transaction_date") || headers.has("posting_date")))
  ) {
    return "transaction";
  }

  if (
    lowerName.includes("contact") ||
    headers.has("contact_type") ||
    headers.has("email") ||
    headers.has("phone")
  ) {
    return "contact";
  }

  if (
    lowerName.includes("income") ||
    hasAllHeaders(headers, ["income_date", "source", "amount_usd", "tax_year"])
  ) {
    return "income";
  }

  if (
    lowerName.includes("flow") ||
    hasAllHeaders(headers, ["flow_name", "flow_date", "amount_usd"])
  ) {
    return "flow";
  }

  if (
    lowerName.includes("holding") ||
    hasAllHeaders(headers, ["snapshot_date", "asset_symbol", "quantity", "current_value_usd"])
  ) {
    return "holding";
  }

  if (
    lowerName.includes("purchase") ||
    hasAllHeaders(headers, ["item_name", "status", "created_date"])
  ) {
    return "purchase";
  }

  if (
    lowerName.includes("transfer") ||
    hasAllHeaders(headers, ["origin_account", "destination_account", "created_time"])
  ) {
    return "transfer";
  }

  if (
    lowerName.includes("tax_event") ||
    hasAllHeaders(headers, ["event_date", "asset_symbol", "gain_loss_usd", "tax_year"])
  ) {
    return "tax_event";
  }

  return "dataset_row";
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) continue;
    normalized[normalizedKey] = value;
  }
  return normalized;
}

export function extractEntitiesFromCsvRows(
  fileBuffer: Buffer,
  fileName?: string
): Array<Record<string, unknown>> {
  const { rows } = parseCsvRows(fileBuffer);
  if (rows.length === 0) {
    return [];
  }

  const normalizedRows = rows.map((row) => normalizeRow(row));
  const headerSet = new Set(Object.keys(normalizedRows[0] ?? {}));
  const entityType = inferEntityType(headerSet, fileName);

  return normalizedRows.map((row, index) => ({
    entity_type: entityType,
    schema_version: "1.0",
    ...(fileName ? { import_source_file: fileName } : {}),
    ...(entityType === "dataset_row" ? { row_index: index + 1, source_file: fileName || "csv_upload" } : {}),
    ...row,
  }));
}

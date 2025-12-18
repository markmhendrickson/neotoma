#!/usr/bin/env tsx
/**
 * Finances Data Ingestion Script
 * 
 * Ingests data from finances repository CSV files into Neotoma using the store_record API.
 * Supports all record types defined in the finances repository.
 * 
 * Usage:
 *   tsx scripts/ingest_finances_data.ts <data_type> <csv_file> [--api-url <url>] [--dry-run]
 * 
 * Examples:
 *   tsx scripts/ingest_finances_data.ts transactions data/transactions/transactions.parquet.csv
 *   tsx scripts/ingest_finances_data.ts holdings data/holdings/holdings.parquet.csv --dry-run
 */

import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { mapFinancesRecordToNeotoma } from "../src/services/finances_field_mapping.js";

interface IngestionOptions {
  apiUrl?: string;
  dryRun?: boolean;
  batchSize?: number;
}

interface RecordTypeMapping {
  financesType: string;
  neotomaType: string;
}

const RECORD_TYPE_MAPPINGS: Record<string, RecordTypeMapping> = {
  transactions: { financesType: "transactions", neotomaType: "transaction" },
  holdings: { financesType: "holdings", neotomaType: "holding" },
  income: { financesType: "income", neotomaType: "income" },
  tax_events: { financesType: "tax_events", neotomaType: "tax_event" },
  crypto_transactions: { financesType: "crypto_transactions", neotomaType: "crypto_transaction" },
  liabilities: { financesType: "liabilities", neotomaType: "liability" },
  flows: { financesType: "flows", neotomaType: "flow" },
  purchases: { financesType: "purchases", neotomaType: "purchase" },
  transfers: { financesType: "transfers", neotomaType: "transfer" },
  wallets: { financesType: "wallets", neotomaType: "wallet" },
  tax_filings: { financesType: "tax_filings", neotomaType: "tax_filing" },
  orders: { financesType: "orders", neotomaType: "order" },
  fixed_costs: { financesType: "fixed_costs", neotomaType: "fixed_cost" },
  properties: { financesType: "properties", neotomaType: "property" },
  balances: { financesType: "balances", neotomaType: "balance" },
  contacts: { financesType: "contacts", neotomaType: "contact" },
  contracts: { financesType: "contracts", neotomaType: "contract" },
  accounts: { financesType: "accounts", neotomaType: "account" },
};

/**
 * Parse CSV file and return records
 */
function parseCSV(filePath: string): Record<string, unknown>[] {
  const content = readFileSync(filePath, "utf-8");
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  return records as Record<string, unknown>[];
}

/**
 * Convert date string to ISO 8601 format
 */
function normalizeDate(dateStr: unknown): string | undefined {
  if (!dateStr || typeof dateStr !== "string") {
    return undefined;
  }
  
  // Try to parse common date formats
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }
  
  return dateStr;
}

/**
 * Normalize record values (dates, numbers, booleans)
 */
function normalizeRecordValues(record: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(record)) {
    if (value === null || value === undefined || value === "") {
      continue; // Skip empty values
    }
    
    // Normalize dates
    if (key.includes("date") || key.includes("Date") || key.includes("time") || key.includes("Time")) {
      const normalizedDate = normalizeDate(value);
      if (normalizedDate) {
        normalized[key] = normalizedDate;
      }
    }
    // Normalize numbers
    else if (typeof value === "string" && /^-?\d+\.?\d*$/.test(value.replace(/[,$]/g, ""))) {
      const numValue = parseFloat(value.replace(/[,$]/g, ""));
      if (!isNaN(numValue)) {
        normalized[key] = numValue;
      } else {
        normalized[key] = value;
      }
    }
    // Normalize booleans
    else if (typeof value === "string" && (value.toLowerCase() === "true" || value.toLowerCase() === "false")) {
      normalized[key] = value.toLowerCase() === "true";
    }
    // Normalize "yes"/"no" to boolean
    else if (typeof value === "string" && (value.toLowerCase() === "yes" || value.toLowerCase() === "no")) {
      normalized[key] = value.toLowerCase() === "yes";
    }
    else {
      normalized[key] = value;
    }
  }
  
  return normalized;
}

/**
 * Store record via API
 */
async function storeRecord(
  apiUrl: string,
  recordType: string,
  properties: Record<string, unknown>,
  fileUrls: string[] = []
): Promise<{ id: string }> {
  const response = await fetch(`${apiUrl}/store_record`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: recordType,
      properties,
      file_urls: fileUrls,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to store record: ${JSON.stringify(error)}`);
  }

  return await response.json();
}

/**
 * Ingest CSV file
 */
async function ingestCSV(
  dataType: string,
  csvFilePath: string,
  options: IngestionOptions = {}
): Promise<void> {
  const { apiUrl = "http://localhost:3000", dryRun = false, batchSize = 10 } = options;
  
  const mapping = RECORD_TYPE_MAPPINGS[dataType];
  if (!mapping) {
    throw new Error(`Unknown data type: ${dataType}. Supported types: ${Object.keys(RECORD_TYPE_MAPPINGS).join(", ")}`);
  }

  console.log(`Reading CSV file: ${csvFilePath}`);
  const records = parseCSV(csvFilePath);
  console.log(`Found ${records.length} records`);

  if (dryRun) {
    console.log("\n=== DRY RUN MODE ===");
    console.log(`Would ingest ${records.length} records as type: ${mapping.neotomaType}`);
    if (records.length > 0) {
      console.log("\nSample record (first):");
      const sample = normalizeRecordValues(records[0]);
      const mapped = mapFinancesRecordToNeotoma(mapping.neotomaType, sample);
      console.log(JSON.stringify(mapped, null, 2));
    }
    return;
  }

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ record: number; error: string }> = [];

  // Process in batches
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1} (records ${i + 1}-${Math.min(i + batchSize, records.length)})`);

    for (const record of batch) {
      try {
        const normalized = normalizeRecordValues(record);
        const mapped = mapFinancesRecordToNeotoma(mapping.neotomaType, normalized);
        
        await storeRecord(apiUrl, mapping.neotomaType, mapped);
        successCount++;
        
        if (successCount % 10 === 0) {
          process.stdout.write(".");
        }
      } catch (error) {
        errorCount++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push({ record: i + batch.indexOf(record) + 1, error: errorMsg });
        console.error(`\nError processing record ${i + batch.indexOf(record) + 1}: ${errorMsg}`);
      }
    }
  }

  console.log(`\n\n=== Ingestion Complete ===");
  console.log(`Total records: ${records.length}`);
  console.log(`Successfully ingested: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  
  if (errors.length > 0) {
    console.log("\n=== Errors ===");
    errors.forEach(({ record, error }) => {
      console.log(`Record ${record}: ${error}`);
    });
  }
}

// CLI interface
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: tsx scripts/ingest_finances_data.ts <data_type> <csv_file> [--api-url <url>] [--dry-run]");
  console.error("\nSupported data types:");
  Object.keys(RECORD_TYPE_MAPPINGS).forEach(type => {
    console.error(`  - ${type}`);
  });
  process.exit(1);
}

const dataType = args[0];
const csvFile = args[1];
const apiUrlIndex = args.indexOf("--api-url");
const apiUrl = apiUrlIndex >= 0 && args[apiUrlIndex + 1] ? args[apiUrlIndex + 1] : undefined;
const dryRun = args.includes("--dry-run");

ingestCSV(dataType, csvFile, { apiUrl, dryRun })
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nFatal error:", error);
    process.exit(1);
  });




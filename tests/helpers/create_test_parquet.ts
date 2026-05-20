/**
 * Helper to create test parquet files with BigInt values.
 *
 * Uses apache-arrow + parquet-wasm for writing test parquet fixtures.
 */

import * as fs from "fs";
import * as path from "path";
import { tableFromArrays, tableToIPC } from "apache-arrow";
// Use the ESM-only build to avoid the CJS/ESM conflict in the node/ entry point
// (parquet-wasm declares "type": "module" but node/parquet_wasm.js uses module.exports)
import { Table as WasmTable, writeParquet, initSync } from "parquet-wasm/esm/parquet_wasm.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Initialize WASM synchronously once.  The ESM build requires explicit init.
const __wasmDir = dirname(fileURLToPath(import.meta.url));
const wasmPath = join(__wasmDir, "../../node_modules/parquet-wasm/esm/parquet_wasm_bg.wasm");
const wasmBytes = readFileSync(wasmPath);
initSync({ module: wasmBytes });

export interface TestParquetOptions {
  outputPath: string;
  rows?: Array<Record<string, unknown>>;
  includeBigInt?: boolean;
  customSchema?: Record<string, { type: string; optional?: boolean }>;
}

function coerceBySchemaType(value: unknown, schemaType?: string): unknown {
  if (value === undefined) {
    return null;
  }
  if (value === null || !schemaType) {
    return value;
  }
  const type = schemaType.toUpperCase();
  if (type === "INT64" || type === "INT_64") {
    return typeof value === "bigint" ? value : BigInt(value as number | string);
  }
  if (type === "INT32" || type === "DOUBLE" || type === "FLOAT" || type === "DECIMAL") {
    return typeof value === "number" ? value : Number(value);
  }
  if (type === "UTF8" || type === "STRING") {
    return String(value);
  }
  if (type === "BOOLEAN" || type === "BOOL") {
    return Boolean(value);
  }
  return value;
}

async function writeRowsToParquet(
  outputPath: string,
  rows: Array<Record<string, unknown>>,
  customSchema?: Record<string, { type: string; optional?: boolean }>
): Promise<void> {
  if (rows.length === 0) {
    throw new Error("Cannot write parquet file with zero rows");
  }

  const columnNames = customSchema
    ? Object.keys(customSchema)
    : Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  const columns: Record<string, unknown[]> = {};
  for (const columnName of columnNames) {
    const schemaType = customSchema?.[columnName]?.type;
    columns[columnName] = rows.map((row) => coerceBySchemaType(row[columnName], schemaType));
  }

  const arrowTable = tableFromArrays(columns);
  const wasmTable = WasmTable.fromIPCStream(tableToIPC(arrowTable, "stream"));
  // writeParquet consumes the table (takes ownership via __destroy_into_raw),
  // so we must NOT call wasmTable.free() afterwards.
  const parquetData = writeParquet(wasmTable);
  fs.writeFileSync(outputPath, parquetData);
}

/**
 * Create a test parquet file with sample data
 * If includeBigInt is true, adds Int64 fields that will be read as BigInt
 */
export async function createTestParquetFile(
  options: TestParquetOptions
): Promise<string> {
  const { outputPath, rows, includeBigInt = true, customSchema } = options;

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Default test data (use smaller BigInt values that fit in Int53 range)
  const defaultRows = rows || [
    {
      id: BigInt(123456789012),
      name: "Test Item 1",
      amount: 100.50,
      count: includeBigInt ? BigInt(999999999) : 42,
      timestamp: includeBigInt ? BigInt(1704067200) : 1704067200,
    },
    {
      id: BigInt(987654321098),
      name: "Test Item 2",
      amount: 200.75,
      count: includeBigInt ? BigInt(888888888) : 84,
      timestamp: includeBigInt ? BigInt(1704153600) : 1704153600,
    },
    {
      id: BigInt(111111111111),
      name: "Test Item 3",
      amount: 300.25,
      count: includeBigInt ? BigInt(777777777) : 126,
      timestamp: includeBigInt ? BigInt(1704240000) : 1704240000,
    },
  ];

  const effectiveSchema = customSchema || {
    id: { type: "INT64", optional: false },
    name: { type: "UTF8", optional: true },
    amount: { type: "DOUBLE", optional: true },
    count: includeBigInt ? { type: "INT64", optional: true } : { type: "INT32", optional: true },
    timestamp: includeBigInt ? { type: "INT64", optional: true } : { type: "INT32", optional: true },
  };
  await writeRowsToParquet(outputPath, defaultRows, effectiveSchema);

  return outputPath;
}

/**
 * Create a minimal test parquet file for quick tests
 */
export async function createMinimalTestParquet(
  outputPath: string
): Promise<string> {
  return createTestParquetFile({
    outputPath,
    rows: [
      {
        id: BigInt(1),
        name: "Minimal Test",
        amount: 10.0,
        count: BigInt(100),
        timestamp: BigInt(1000000),
      },
    ],
  });
}

/**
 * Create parquet file with fields matching a known schema
 * Useful for testing known schema behavior (some fields → observations, unknown fields → raw_fragments)
 */
export async function createParquetWithKnownSchema(
  outputPath: string,
  entityType: string = "test_task"
): Promise<string> {
  const schema = {
    id: { type: "INT64", optional: false },
    title: { type: "UTF8", optional: true },
    status: { type: "UTF8", optional: true },
    unknown_field_1: { type: "UTF8", optional: true },
    unknown_field_2: { type: "INT32", optional: true },
    unknown_field_3: { type: "UTF8", optional: true },
  };

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const rows: Array<Record<string, unknown>> = [];
  for (let i = 1; i <= 6; i++) {
    rows.push({
      id: BigInt(i),
      title: `Task ${i}`,
      status: i % 2 === 0 ? "completed" : "pending",
      unknown_field_1: `value_${i}`,
      unknown_field_2: i * 10,
      unknown_field_3: `extra_${i}`,
    });
  }
  await writeRowsToParquet(outputPath, rows, schema);
  return outputPath;
}

/**
 * Create parquet file with fields for an unknown entity type
 * Useful for testing no-schema behavior (all fields → observations, none → raw_fragments)
 */
export async function createParquetWithUnknownSchema(
  outputPath: string
): Promise<string> {
  const schema = {
    id: { type: "INT64", optional: false },
    field_a: { type: "UTF8", optional: true },
    field_b: { type: "INT32", optional: true },
    field_c: { type: "UTF8", optional: true },
  };

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const rows: Array<Record<string, unknown>> = [];
  for (let i = 1; i <= 5; i++) {
    rows.push({
      id: BigInt(i),
      field_a: `value_a_${i}`,
      field_b: i * 100,
      field_c: `value_c_${i}`,
    });
  }
  await writeRowsToParquet(outputPath, rows, schema);
  return outputPath;
}

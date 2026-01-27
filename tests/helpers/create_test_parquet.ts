/**
 * Helper to create test parquet files with BigInt values
 * 
 * Uses parquetjs (the older library) for writing since @dsnp/parquetjs is read-only
 */

import * as fs from "fs";
import * as path from "path";
import { ParquetSchema, ParquetWriter } from "parquetjs";

export interface TestParquetOptions {
  outputPath: string;
  rows?: Array<Record<string, unknown>>;
  includeBigInt?: boolean;
  customSchema?: Record<string, { type: string; optional?: boolean }>;
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

  // Use custom schema if provided, otherwise use default
  let schemaFields: Record<string, any>;
  
  if (customSchema) {
    schemaFields = {};
    for (const [fieldName, fieldDef] of Object.entries(customSchema)) {
      schemaFields[fieldName] = {
        type: fieldDef.type,
        optional: fieldDef.optional !== false,
      };
    }
  } else {
    // Default schema with Int64 fields (which will be read as BigInt)
    schemaFields = {
      id: { type: "INT64", optional: false },
      name: { type: "UTF8", optional: true },
      amount: { type: "DOUBLE", optional: true },
      count: includeBigInt ? { type: "INT64", optional: true } : { type: "INT32", optional: true },
      timestamp: includeBigInt ? { type: "INT64", optional: true } : { type: "INT32", optional: true },
    };
  }
  
  const schema = new ParquetSchema(schemaFields);

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

  // Write parquet file
  const writer = await ParquetWriter.openFile(schema, outputPath);

  for (const row of defaultRows) {
    await writer.appendRow(row);
  }

  await writer.close();

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
  // Create schema with mixed known and unknown fields
  const schema = new ParquetSchema({
    id: { type: "INT64", optional: false },
    title: { type: "UTF8", optional: true },          // Known field (common in task schema)
    status: { type: "UTF8", optional: true },         // Known field
    unknown_field_1: { type: "UTF8", optional: true }, // Unknown field
    unknown_field_2: { type: "INT32", optional: true }, // Unknown field
    unknown_field_3: { type: "UTF8", optional: true }, // Unknown field
  });

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const writer = await ParquetWriter.openFile(schema, outputPath);

  // Create multiple rows to test row diversity
  for (let i = 1; i <= 6; i++) {
    await writer.appendRow({
      id: BigInt(i),
      title: `Task ${i}`,
      status: i % 2 === 0 ? "completed" : "pending",
      unknown_field_1: `value_${i}`,
      unknown_field_2: i * 10,
      unknown_field_3: `extra_${i}`,
    });
  }

  await writer.close();
  return outputPath;
}

/**
 * Create parquet file with fields for an unknown entity type
 * Useful for testing no-schema behavior (all fields → observations, none → raw_fragments)
 */
export async function createParquetWithUnknownSchema(
  outputPath: string
): Promise<string> {
  const schema = new ParquetSchema({
    id: { type: "INT64", optional: false },
    field_a: { type: "UTF8", optional: true },
    field_b: { type: "INT32", optional: true },
    field_c: { type: "UTF8", optional: true },
  });

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const writer = await ParquetWriter.openFile(schema, outputPath);

  for (let i = 1; i <= 5; i++) {
    await writer.appendRow({
      id: BigInt(i),
      field_a: `value_a_${i}`,
      field_b: i * 100,
      field_c: `value_c_${i}`,
    });
  }

  await writer.close();
  return outputPath;
}

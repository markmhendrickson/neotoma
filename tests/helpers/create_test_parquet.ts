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
}

/**
 * Create a test parquet file with sample data
 * If includeBigInt is true, adds Int64 fields that will be read as BigInt
 */
export async function createTestParquetFile(
  options: TestParquetOptions
): Promise<string> {
  const { outputPath, rows, includeBigInt = true } = options;

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Define schema with Int64 fields (which will be read as BigInt)
  const schema = new ParquetSchema({
    id: { type: "INT64", optional: false },
    name: { type: "UTF8", optional: true },
    amount: { type: "DOUBLE", optional: true },
    count: includeBigInt ? { type: "INT64", optional: true } : { type: "INT32", optional: true },
    timestamp: includeBigInt ? { type: "INT64", optional: true } : { type: "INT32", optional: true },
  });

  // Default test data
  const defaultRows = rows || [
    {
      id: BigInt(12345678901234567890),
      name: "Test Item 1",
      amount: 100.50,
      count: includeBigInt ? BigInt(999999999999) : 42,
      timestamp: includeBigInt ? BigInt(1704067200000) : 1704067200,
    },
    {
      id: BigInt(98765432109876543210),
      name: "Test Item 2",
      amount: 200.75,
      count: includeBigInt ? BigInt(888888888888) : 84,
      timestamp: includeBigInt ? BigInt(1704153600000) : 1704153600,
    },
    {
      id: BigInt(11111111111111111111),
      name: "Test Item 3",
      amount: 300.25,
      count: includeBigInt ? BigInt(777777777777) : 126,
      timestamp: includeBigInt ? BigInt(1704240000000) : 1704240000,
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

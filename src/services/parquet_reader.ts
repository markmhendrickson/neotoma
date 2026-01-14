/**
 * Parquet File Reader Service
 * 
 * Reads parquet files and converts rows to entity objects for ingestion.
 */

import { logger } from "../utils/logger.js";

export interface ParquetReadResult {
  entities: Array<Record<string, unknown>>;
  metadata: {
    row_count: number;
    field_count: number;
    field_names: string[];
    entity_type: string;
  };
}

export interface ParquetReadOptions {
  batchSize?: number; // Process in batches (for memory optimization)
  onProgress?: (current: number, total: number) => void; // Progress callback
}

/**
 * Ensure file is available locally (handles iCloud Drive sync)
 * @internal
 */
async function ensureFileAvailable(filePath: string): Promise<void> {
  const fs = await import("fs");
  
  // Check if file is in iCloud Drive
  if (filePath.includes('Mobile Documents/com~apple~CloudDocs')) {
    logger.error(`[PARQUET] File is in iCloud Drive, checking availability...`);
    
    try {
      // Try to access file to trigger download if needed
      await fs.promises.access(filePath, fs.constants.R_OK);
      
      // Get file stats to ensure it's fully synced
      const stats = await fs.promises.stat(filePath);
      logger.error(`[PARQUET] File available locally (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      
      // Small delay to allow iCloud sync to stabilize
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(
          `File not available locally. iCloud Drive may be syncing. ` +
          `Please wait for sync to complete and try again. ` +
          `File: ${filePath}`
        );
      }
      throw error;
    }
  }
}

/**
 * Read a parquet file and convert rows to entity objects
 * 
 * @param filePath - Path to the parquet file
 * @param entityType - Entity type to assign to rows (optional, inferred from filename if not provided)
 * @param options - Optional configuration for batch processing and progress tracking
 * @returns Array of entity objects and metadata
 */
export async function readParquetFile(
  filePath: string,
  entityType?: string,
  options?: ParquetReadOptions
): Promise<ParquetReadResult> {
  try {
    // Wrap the entire function to catch BigInt serialization errors
    const result = await readParquetFileInternal(filePath, entityType, options);
    
    // Final safety check: try to serialize the result to catch any BigInt values
    try {
      JSON.stringify(result, (key, value) => {
        if (typeof value === 'bigint') {
          return Number(value);
        }
        return value;
      });
    } catch (serializeError: any) {
      throw new Error(
        `BigInt serialization error detected in parquet result. ` +
        `This indicates a field with INT64 type that wasn't properly converted. ` +
        `Please check the convertBigIntValues function. ` +
        `Original error: ${serializeError.message}`
      );
    }
    
    return result;
  } catch (error: any) {
    // If error is about BigInt serialization, provide more context
    if (error?.message?.includes('BigInt') || error?.message?.includes('serialize')) {
      throw new Error(
        `BigInt serialization error while reading parquet file. ` +
        `This may indicate a field with INT64 type that wasn't converted. ` +
        `Original error: ${error.message}`
      );
    }
    // Re-throw other errors (they'll be handled by internal function)
    throw error;
  }
}

/**
 * Internal implementation of readParquetFile
 * Separated to allow better error handling
 */
async function readParquetFileInternal(
  filePath: string,
  entityType?: string,
  options?: ParquetReadOptions
): Promise<ParquetReadResult> {
  try {
    // Ensure file is available (especially for iCloud Drive files)
    await ensureFileAvailable(filePath);
    
    // Dynamic import for CommonJS module
    const parquet = await import("@dsnp/parquetjs");
    const path = await import("path");
    
    // Infer entity type from filename if not provided
    // e.g., "transactions.parquet" -> "transaction"
    // e.g., "holdings.parquet" -> "holding"
    if (!entityType) {
      const basename = path.basename(filePath, ".parquet");
      entityType = inferEntityType(basename);
    }
    
    // Open parquet file
    const { ParquetReader } = parquet.default || parquet;
    const reader = await ParquetReader.openFile(filePath);
    
    // Get schema
    const schema = reader.getSchema();
    const fieldNames = Object.keys(schema.fields);
    const rawRowCount = reader.getRowCount();
    
    // Convert BigInt/Int64 to number (handle various formats)
    let rowCount: number;
    if (typeof rawRowCount === 'bigint') {
      rowCount = Number(rawRowCount);
    } else if ((rawRowCount as any)?.toNumber) {
      rowCount = (rawRowCount as any).toNumber();
    } else if (typeof rawRowCount === 'number') {
      rowCount = rawRowCount;
    } else {
      // Fallback: try to convert to number
      rowCount = Number(rawRowCount);
      if (isNaN(rowCount)) {
        throw new Error(`Invalid row count format: ${typeof rawRowCount}`);
      }
    }
    
    // Read all rows
    const entities: Array<Record<string, unknown>> = [];
    const cursor = reader.getCursor();
    
    // Progress tracking
    const PROGRESS_INTERVAL = options?.batchSize || 1000; // Log every N rows (default 1000)
    const startTime = Date.now();
    let lastLogTime = startTime;
    
    logger.error(`[PARQUET] Starting to read ${rowCount} rows from ${filePath}`);
    
    for (let i = 0; i < rowCount; i++) {
      const record = await cursor.next();
      if (record) {
        // Convert BigInt values to numbers for JSON serialization
        // Use a more aggressive conversion that handles all edge cases
        const convertedRecord = convertBigIntValues(record as Record<string, unknown>);
        
        // Double-check: ensure no BigInt values remain
        const finalRecord: Record<string, unknown> = {
          entity_type: entityType,
        };
        for (const [key, value] of Object.entries(convertedRecord)) {
          if (typeof value === 'bigint') {
            finalRecord[key] = Number(value);
          } else {
            finalRecord[key] = value;
          }
        }
        
        entities.push(finalRecord);
        
        // Progress callback
        if (options?.onProgress && ((i + 1) % PROGRESS_INTERVAL === 0 || i === rowCount - 1)) {
          options.onProgress(i + 1, rowCount);
        }
        
        // Progress logging
        if ((i + 1) % PROGRESS_INTERVAL === 0 || i === rowCount - 1) {
          const now = Date.now();
          const elapsed = (now - lastLogTime) / 1000; // seconds
          const rate = PROGRESS_INTERVAL / elapsed; // rows per second
          const remaining = rowCount - i - 1;
          const eta = remaining / rate;
          const progress = ((i + 1) / rowCount * 100).toFixed(1);
          
          logger.error(
            `[PARQUET] Progress: ${i + 1}/${rowCount} rows (${progress}%) - ` +
            `Rate: ${rate.toFixed(0)} rows/s - ETA: ${eta.toFixed(0)}s`
          );
          lastLogTime = now;
        }
      }
    }
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.error(`[PARQUET] Completed reading ${rowCount} rows in ${totalTime}s`);
    
    await reader.close();
    
    // Final pass: ensure no BigInt values remain in entities array
    const sanitizedEntities = entities.map(entity => {
      try {
        // Try to serialize and parse to catch any remaining BigInt values
        const jsonStr = JSON.stringify(entity, (key, value) => {
          if (typeof value === 'bigint') {
            return Number(value);
          }
          return value;
        });
        return JSON.parse(jsonStr);
      } catch (serializeError: any) {
        // If serialization fails, do a deep conversion
        const deepConverted: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(entity)) {
          deepConverted[key] = deepConvertBigInt(value);
        }
        return deepConverted;
      }
    });
    
    return {
      entities: sanitizedEntities,
      metadata: {
        row_count: rowCount,
        field_count: fieldNames.length,
        field_names: fieldNames,
        entity_type: entityType,
      },
    };
  } catch (error: any) {
    // Handle specific error types
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout') || error.message?.includes('ETIMEDOUT')) {
      throw new Error(
        `Parquet file read timed out. This may be due to:\n` +
        `- Large file size (use smaller files or batch processing)\n` +
        `- Network filesystem latency (iCloud Drive, network drives)\n` +
        `- File sync in progress\n\n` +
        `Original error: ${error.message}`
      );
    }
    
    if (error.code === 'ENOENT') {
      throw new Error(`Parquet file not found: ${filePath}`);
    }
    
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied reading parquet file: ${filePath}`);
    }
    
    throw new Error(`Failed to read parquet file: ${error.message}`);
  }
}

/**
 * Infer entity type from filename
 * 
 * Handles common pluralization patterns:
 * - "transactions" -> "transaction"
 * - "holdings" -> "holding"
 * - "companies" -> "company"
 * - "properties" -> "property"
 */
function inferEntityType(basename: string): string {
  const name = basename.toLowerCase();
  
  // Remove common suffixes
  if (name.endsWith("_missing_gid")) {
    return inferEntityType(name.replace("_missing_gid", ""));
  }
  
  // Handle pluralization patterns
  if (name.endsWith("ies")) {
    // companies -> company, properties -> property
    return name.slice(0, -3) + "y";
  } else if (name.endsWith("sses") || name.endsWith("xes") || name.endsWith("ches") || name.endsWith("shes")) {
    // addresses -> address, taxes -> tax
    return name.slice(0, -2);
  } else if (name.endsWith("s")) {
    // transactions -> transaction, tasks -> task
    return name.slice(0, -1);
  }
  
  return name;
}

/**
 * Deep convert BigInt values (handles any type)
 */
function deepConvertBigInt(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => deepConvertBigInt(item));
  }
  if (typeof value === 'object' && !(value instanceof Date)) {
    const converted: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      converted[key] = deepConvertBigInt(val);
    }
    return converted;
  }
  return value;
}

/**
 * Convert BigInt values in an object to numbers for JSON serialization
 * 
 * @internal - Exported for testing purposes
 */
export function convertBigIntValues(obj: Record<string, unknown>): Record<string, unknown> {
  const converted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'bigint') {
      converted[key] = Number(value);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      // Recursively convert nested objects
      converted[key] = convertBigIntValues(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      // Convert BigInt values in arrays (including nested objects)
      converted[key] = value.map(item => {
        if (typeof item === 'bigint') {
          return Number(item);
        } else if (item !== null && typeof item === 'object' && !(item instanceof Date) && !Array.isArray(item)) {
          // Recursively convert nested objects in arrays
          return convertBigIntValues(item as Record<string, unknown>);
        }
        return item;
      });
    } else {
      converted[key] = value;
    }
  }
  return converted;
}

/**
 * Check if a file is a parquet file based on extension
 */
export function isParquetFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".parquet");
}

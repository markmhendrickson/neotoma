#!/usr/bin/env node

/**
 * Spec Compliance Check Patterns
 *
 * Reusable validation patterns for spec compliance checking.
 * These patterns can be used to verify code existence, database schema,
 * imports, service calls, and validation logic.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Check if a function exists in the codebase
 * @param {string} functionName - Name of the function to check
 * @param {string} filePattern - Glob pattern for files to search (e.g., "src/**" + "/*.ts")
 * @returns {Promise<{exists: boolean, evidence: string[]}>}
 */
export async function checkFunctionExists(functionName, filePattern = "src/**/*.ts") {
  try {
    // Escape function name for regex (handle special characters)
    const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = `(?:function|const|export\\s+function|export\\s+const|async\\s+function)\\s+${escapedName}`;
    
    const { stdout } = await execAsync(`grep -r -E "${pattern}" ${filePattern} 2>/dev/null || true`);
    const matches = stdout.trim().split("\n").filter((line) => line.trim());
    
    return {
      exists: matches.length > 0,
      evidence: matches.map((line) => line.trim()),
    };
  } catch (error) {
    return {
      exists: false,
      evidence: [],
    };
  }
}

/**
 * Check if a database column exists in schema or migrations
 * @param {string} columnName - Name of the column
 * @param {string} tableName - Name of the table
 * @returns {Promise<{exists: boolean, evidence: string[]}>}
 */
export async function checkDatabaseColumn(columnName, tableName) {
  try {
    const searchPaths = [
      "docs/releases",
      "docs",
    ];
    
    const evidence = [];
    let found = false;
    
    for (const searchPath of searchPaths) {
      try {
        // Search for column definition (handles various SQL patterns)
        const pattern = `${columnName}\\s+[A-Z]+|${columnName}\\s+`;
        const { stdout } = await execAsync(
          `grep -r -i -E "${pattern}" ${searchPath} 2>/dev/null | grep -i "${tableName}" || true`
        );
        const matches = stdout.trim().split("\n").filter((line) => line.trim());
        if (matches.length > 0) {
          found = true;
          evidence.push(...matches.map((line) => line.trim()));
        }
      } catch (error) {
        // Continue to next path
      }
    }
    
    return {
      exists: found,
      evidence,
    };
  } catch (error) {
    return {
      exists: false,
      evidence: [],
    };
  }
}

/**
 * Check if a database table exists in schema or migrations
 * @param {string} tableName - Name of the table
 * @returns {Promise<{exists: boolean, evidence: string[]}>}
 */
export async function checkDatabaseTable(tableName) {
  try {
    const searchPaths = [
      "docs/releases",
      "docs",
    ];
    
    const evidence = [];
    let found = false;
    
    for (const searchPath of searchPaths) {
      try {
        // Search for CREATE TABLE statement
        const pattern = `CREATE\\s+TABLE.*${tableName}|CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS.*${tableName}`;
        const { stdout } = await execAsync(
          `grep -r -i -E "${pattern}" ${searchPath} 2>/dev/null || true`
        );
        const matches = stdout.trim().split("\n").filter((line) => line.trim());
        if (matches.length > 0) {
          found = true;
          evidence.push(...matches.map((line) => line.trim()));
        }
      } catch (error) {
        // Continue to next path
      }
    }
    
    return {
      exists: found,
      evidence,
    };
  } catch (error) {
    return {
      exists: false,
      evidence: [],
    };
  }
}

/**
 * Check if an import exists in the codebase
 * @param {string} moduleName - Name of the module to check
 * @param {string} filePattern - Glob pattern for files to search
 * @returns {Promise<{exists: boolean, evidence: string[]}>}
 */
export async function checkImportExists(moduleName, filePattern = "src/**/*.ts") {
  try {
    // Escape module name for regex
    const escapedModule = moduleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = `import.*from\\s+['"]${escapedModule}['"]|import.*['"]${escapedModule}['"]`;
    
    const { stdout } = await execAsync(`grep -r -E "${pattern}" ${filePattern} 2>/dev/null || true`);
    const matches = stdout.trim().split("\n").filter((line) => line.trim());
    
    return {
      exists: matches.length > 0,
      evidence: matches.map((line) => line.trim()),
    };
  } catch (error) {
    return {
      exists: false,
      evidence: [],
    };
  }
}

/**
 * Check if a service call exists (function call to a specific service/function)
 * @param {string} serviceName - Name of the service or module
 * @param {string} functionName - Name of the function being called
 * @param {string} callerPattern - Pattern for where it should be called (file pattern or function name)
 * @returns {Promise<{exists: boolean, evidence: string[]}>}
 */
export async function checkServiceCall(serviceName, functionName, callerPattern = "src/**/*.ts") {
  try {
    // Look for calls like: serviceName.functionName(...) or functionName(...) in context of service
    const escapedService = serviceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedFunction = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = `${escapedService}\\.${escapedFunction}|import.*${escapedService}.*\\n[\\s\\S]*?${escapedFunction}`;
    
    const { stdout } = await execAsync(`grep -r -E "${pattern}" ${callerPattern} 2>/dev/null || true`);
    const matches = stdout.trim().split("\n").filter((line) => line.trim());
    
    return {
      exists: matches.length > 0,
      evidence: matches.map((line) => line.trim()),
    };
  } catch (error) {
    // Try simpler pattern: just look for function name calls
    try {
      const escapedFunction = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const { stdout } = await execAsync(
        `grep -r -E "${escapedFunction}\\s*\\(" ${callerPattern} 2>/dev/null || true`
      );
      const matches = stdout.trim().split("\n").filter((line) => line.trim());
      return {
        exists: matches.length > 0,
        evidence: matches.map((line) => line.trim()),
      };
    } catch (innerError) {
      return {
        exists: false,
        evidence: [],
      };
    }
  }
}

/**
 * Check if validation logic exists for a specific validation type
 * @param {string} validationType - Type of validation (e.g., "field_partitioning", "required_fields")
 * @param {string} location - Where validation should occur (file pattern or function name)
 * @returns {Promise<{exists: boolean, evidence: string[]}>}
 */
export async function checkValidationLogic(validationType, location = "src/**/*.ts") {
  try {
    // Map validation types to search patterns
    const patterns = {
      field_partitioning: "partitionFields|partition.*field",
      required_fields: "validateRequired|required.*field|missing.*required",
      schema_validation: "getSchemaDefinition|schema.*validation|validateSchema",
      extraction_metadata: "extraction_metadata|unknown_fields",
    };
    
    const pattern = patterns[validationType] || validationType;
    const { stdout } = await execAsync(`grep -r -i -E "${pattern}" ${location} 2>/dev/null || true`);
    const matches = stdout.trim().split("\n").filter((line) => line.trim());
    
    return {
      exists: matches.length > 0,
      evidence: matches.map((line) => line.trim()),
    };
  } catch (error) {
    return {
      exists: false,
      evidence: [],
    };
  }
}

/**
 * Check if a pattern exists in files
 * @param {string} pattern - Regex pattern to search for
 * @param {string} filePattern - Glob pattern for files to search (e.g., "src/**" + "/*.ts")
 * @returns {Promise<{exists: boolean, evidence: string[]}>}
 */
export async function checkPatternExists(pattern, filePattern = "src/**/*.ts") {
  try {
    const { stdout } = await execAsync(`grep -r -E "${pattern}" ${filePattern} 2>/dev/null || true`);
    const matches = stdout.trim().split("\n").filter((line) => line.trim());
    
    return {
      exists: matches.length > 0,
      evidence: matches.map((line) => line.trim()),
    };
  } catch (error) {
    return {
      exists: false,
      evidence: [],
    };
  }
}


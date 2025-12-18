/**
 * Logger utility that respects MCP stdio mode
 *
 * In MCP stdio mode, stdout is used for JSON-RPC protocol communication.
 * stderr is typically safe for logging, but some MCP clients may capture it
 * and attempt to parse it, causing JSON parsing errors.
 *
 * This logger suppresses all console output in MCP mode to avoid interference.
 * Use NEOTOMA_MCP_ENABLE_LOGGING=1 to enable logging in MCP mode (for debugging).
 */

const isMCPMode = process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART === "1";
const enableLogging = process.env.NEOTOMA_MCP_ENABLE_LOGGING === "1";

const shouldLog = !isMCPMode || enableLogging;

/**
 * Logger that conditionally outputs based on execution mode
 */
export const logger = {
  /**
   * Log error messages
   * In MCP mode: suppressed by default (set NEOTOMA_MCP_ENABLE_LOGGING=1 to enable)
   * In HTTP mode: written to stderr
   */
  error(...args: unknown[]): void {
    if (shouldLog) {
      console.error(...args);
    }
    // In MCP mode, errors are suppressed to avoid protocol interference
    // Enable with NEOTOMA_MCP_ENABLE_LOGGING=1 for debugging
  },

  /**
   * Log warning messages
   * In MCP mode: suppressed by default
   * In HTTP mode: written to stderr
   */
  warn(...args: unknown[]): void {
    if (shouldLog) {
      console.warn(...args);
    }
  },

  /**
   * Log info messages
   * In MCP mode: suppressed by default
   * In HTTP mode: written to stdout
   */
  info(...args: unknown[]): void {
    if (shouldLog) {
      console.info(...args);
    }
  },

  /**
   * Log debug messages
   * In MCP mode: suppressed by default
   * In HTTP mode: written to stdout
   */
  debug(...args: unknown[]): void {
    if (shouldLog) {
      console.debug(...args);
    }
  },

  /**
   * Log general messages
   * In MCP mode: suppressed by default
   * In HTTP mode: written to stdout
   */
  log(...args: unknown[]): void {
    if (shouldLog) {
      console.log(...args);
    }
  },
};

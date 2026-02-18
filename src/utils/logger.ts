/**
 * Logger utility that respects MCP stdio mode
 *
 * In MCP stdio mode, stdout is used for JSON-RPC protocol communication.
 * stderr is typically safe for logging, but some MCP clients may capture it
 * and attempt to parse it, causing JSON parsing errors.
 *
 * This logger suppresses all console output in MCP mode to avoid interference.
 * Use NEOTOMA_MCP_ENABLE_LOGGING=1 to enable logging in MCP mode (for debugging).
 *
 * In HTTP mode, each level is prefixed with an emoji for quick scanning:
 * - error: ❌
 * - warn:  ⚠️
 * - info:  ℹ️
 * - debug: 🔍
 */

const isMCPMode = process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART === "1";
const enableLogging = process.env.NEOTOMA_MCP_ENABLE_LOGGING === "1";

const shouldLog = !isMCPMode || enableLogging;

const PREFIX = {
  error: "❌ ",
  warn: "⚠️  ",
  info: "ℹ️  ",
  debug: "🔍  ",
} as const;

function formatArgs(level: keyof typeof PREFIX, args: unknown[]): unknown[] {
  if (args.length === 0) return args;
  const first = args[0];
  if (typeof first === "string") {
    return [PREFIX[level] + first, ...args.slice(1)];
  }
  return [PREFIX[level], ...args];
}

/**
 * Logger that conditionally outputs based on execution mode
 */
export const logger = {
  /**
   * Log error messages
   * In MCP mode: suppressed by default (set NEOTOMA_MCP_ENABLE_LOGGING=1 to enable)
   * In HTTP mode: written to stderr with ❌ prefix
   */
  error(...args: unknown[]): void {
    if (shouldLog) {
      console.error(...formatArgs("error", args));
    }
  },

  /**
   * Log warning messages
   * In MCP mode: suppressed by default
   * In HTTP mode: written to stderr with ⚠️ prefix
   */
  warn(...args: unknown[]): void {
    if (shouldLog) {
      console.warn(...formatArgs("warn", args));
    }
  },

  /**
   * Log info messages
   * In MCP stdio mode: must use stderr (stdout is JSON-RPC). Uses stderr for all levels.
   */
  info(...args: unknown[]): void {
    if (shouldLog) {
      console.error(...formatArgs("info", args));
    }
  },

  /**
   * Log debug messages
   * Uses stderr to avoid polluting stdout (JSON-RPC in MCP mode).
   */
  debug(...args: unknown[]): void {
    if (shouldLog) {
      console.error(...formatArgs("debug", args));
    }
  },

  /**
   * Log general messages
   * Uses stderr to avoid polluting stdout (JSON-RPC in MCP mode).
   */
  log(...args: unknown[]): void {
    if (shouldLog) {
      console.error(...formatArgs("info", args));
    }
  },
};

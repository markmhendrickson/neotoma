// Disable HTTP server autostart for MCP mode
process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART = "1";

import { initDatabase } from "./db.js";
import { NeotomaServer } from "./server.js";
import { initServerKeys } from "./services/encryption_service.js";
import { logger } from "./utils/logger.js";

async function main() {
  try {
    // Suppress all logging in MCP stdio mode to avoid JSON-RPC protocol interference
    // Logs are suppressed unless NEOTOMA_MCP_ENABLE_LOGGING=1 is set
    await initDatabase();
    await initServerKeys(); // Initialize server encryption keys
    const server = new NeotomaServer();
    await server.run();
  } catch (error) {
    // Only log fatal errors, and only if logging is enabled
    // In MCP mode, errors should be communicated via JSON-RPC, not stderr
    logger.error("[Neotoma MCP] Failed to start server:", error);
    process.exit(1);
  }
}

main();

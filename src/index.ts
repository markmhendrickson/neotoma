// Disable HTTP server autostart for MCP mode
process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART = "1";

import { initDatabase } from "./db.js";
import { NeotomaServer } from "./server.js";
import { initServerKeys } from "./services/encryption_service.js";
import { logger } from "./utils/logger.js";

async function main() {
  try {
    logger.error("[Neotoma MCP] Initializing...");
    await initDatabase();
    logger.error("[Neotoma MCP] Database initialized");
    await initServerKeys(); // Initialize server encryption keys
    logger.error("[Neotoma MCP] Encryption keys initialized");
    const server = new NeotomaServer();
    await server.run();
    logger.error("[Neotoma MCP] Server started successfully");
  } catch (error) {
    logger.error("[Neotoma MCP] Failed to start server:", error);
    process.exit(1);
  }
}

main();

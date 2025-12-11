// Disable HTTP server autostart for MCP mode
process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART = "1";

import { initDatabase } from "./db.js";
import { NeotomaServer } from "./server.js";
import { initServerKeys } from "./services/encryption_service.js";

async function main() {
  try {
    console.error("[Neotoma MCP] Initializing...");
    await initDatabase();
    console.error("[Neotoma MCP] Database initialized");
    await initServerKeys(); // Initialize server encryption keys
    console.error("[Neotoma MCP] Encryption keys initialized");
    const server = new NeotomaServer();
    await server.run();
    console.error("[Neotoma MCP] Server started successfully");
  } catch (error) {
    console.error("[Neotoma MCP] Failed to start server:", error);
    process.exit(1);
  }
}

main();

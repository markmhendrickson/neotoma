// Disable HTTP server autostart for MCP mode
process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART = "1";

import { initDatabase } from "./db.js";
import { NeotomaServer } from "./server.js";
import { initServerKeys } from "./services/encryption_service.js";
import { installSubscriptionBridge } from "./services/subscriptions/install_subscription_bridge.js";
import { logger } from "./utils/logger.js";

async function main() {
  try {
    // Suppress all logging in MCP stdio mode to avoid JSON-RPC protocol interference
    // Logs are suppressed unless NEOTOMA_MCP_ENABLE_LOGGING=1 is set
    await initDatabase();
    await initServerKeys(); // Initialize server encryption keys
    // Register the listener that persists substrate events to the durable log
    // (the write-event record, docs/subsystems/write_events.md, and SSE
    // resume). Only the HTTP startup path in actions.ts registered it before,
    // so a stdio client's writes left no durable record. After initDatabase:
    // the bridge rebuilds the subscription index from SQLite. Idempotent.
    // Overlaps #2348, which makes the same call plus a startup assertion.
    installSubscriptionBridge();
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

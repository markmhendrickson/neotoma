// Disable HTTP server autostart for MCP mode
process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART = "1";

import { initDatabase } from "./db.js";
import { NeotomaServer } from "./server.js";
import { initServerKeys } from "./services/encryption_service.js";
import {
  assertSubstrateListenerInstalled,
  installSubscriptionBridge,
} from "./services/subscriptions/install_subscription_bridge.js";
import { logger } from "./utils/logger.js";

async function main() {
  try {
    // Suppress all logging in MCP stdio mode to avoid JSON-RPC protocol interference
    // Logs are suppressed unless NEOTOMA_MCP_ENABLE_LOGGING=1 is set
    await initDatabase();
    await initServerKeys(); // Initialize server encryption keys

    // Substrate-event persistence (#2326). This entrypoint never imports
    // `actions.ts`, where the only other `installSubscriptionBridge()` call
    // lives (inside the HTTP `tryListen` success branch). Without this call,
    // every substrate event emitted on the MCP store path is delivered to a
    // bus with no persisting listener and silently discarded, and subscription
    // resume has no durable log to resume from.
    //
    // Ordering: after `initDatabase()`, because the bridge fires
    // `rebuildSubscriptionIndex()`, which reads `entity_snapshots` and
    // `entities`. The installer is idempotent (module-level `installed` flag),
    // so a process running both HTTP and MCP installs once.
    //
    // Note this also covers `mcp_ws_bridge.ts` and `mcp_dev_shim.ts`: both
    // spawn this entrypoint as a child process rather than hosting the
    // substrate themselves, so they inherit the wiring.
    installSubscriptionBridge();
    assertSubstrateListenerInstalled();

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

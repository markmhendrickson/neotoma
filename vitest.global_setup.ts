import path from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Global Vitest setup.
 *
 * Starts the local HTTP Actions server once for the full test run so
 * cross-layer CLI→REST→DB tests have a reachable API. Uses the local
 * SQLite backend and a test-scoped data directory under `.vitest/`.
 */
export default async function globalSetup() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
  const testDataDir = path.join(projectRoot, ".vitest", "data");
  const testSourcesDir = path.join(testDataDir, "sources");
  mkdirSync(testSourcesDir, { recursive: true });

  // Ensure local test DB env is set before importing server code.
  process.env.NEOTOMA_SQLITE_PATH =
    process.env.NEOTOMA_SQLITE_PATH || path.join(projectRoot, ".vitest", "neotoma.db");
  process.env.NEOTOMA_DATA_DIR = process.env.NEOTOMA_DATA_DIR || testDataDir;
  process.env.NEOTOMA_RAW_STORAGE_DIR = process.env.NEOTOMA_RAW_STORAGE_DIR || testSourcesDir;
  process.env.NODE_ENV = "test";

  // Pick a stable base port for tests and let the server probe upward if in use.
  const httpPort = process.env.NEOTOMA_HTTP_PORT || process.env.HTTP_PORT || "18080";
  process.env.NEOTOMA_HTTP_PORT = httpPort;
  process.env.HTTP_PORT = httpPort;

  const { startHTTPServer } = await import("./src/actions.ts");
  const started = await startHTTPServer();
  if (started?.port) {
    process.env.NEOTOMA_SESSION_DEV_PORT = String(started.port);
    process.env.NEOTOMA_SESSION_ENV = "dev";
  }

  return async () => {
    await new Promise<void>((resolve) => {
      if (!started?.server) {
        resolve();
        return;
      }
      started.server.close(() => resolve());
    });
  };
}


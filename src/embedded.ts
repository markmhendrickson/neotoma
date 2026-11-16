/**
 * Embedded (in-process) entry point.
 *
 * ```ts
 * import { createEmbeddedNeotoma } from "neotoma/embedded";
 * const neotoma = await createEmbeddedNeotoma({ dataDir: "/abs/path/to/data" });
 * const ops = neotoma.createOperations({ userId: "host-user" });
 * ```
 *
 * Reads no env files or home-directory config, needs no running server or
 * daemon, and does not let the host process environment override the explicit
 * configuration. See docs/developer/embedded_configuration.md.
 *
 * Limits of this first slice: embedded mode applies to the central runtime
 * configuration (`src/config.ts`). It must be established before any other
 * Neotoma module in the process loads; otherwise a structured
 * `config_already_loaded` error is thrown. Optional feature switches read
 * directly from the process environment elsewhere (for example mirroring)
 * are out of scope here.
 */

import {
  EmbeddedConfigError,
  clearEmbeddedConfig,
  getEmbeddedConfig,
  resolveEmbeddedConfig,
  setEmbeddedConfig,
  type EmbeddedConfigOptions,
} from "./config_embedded.js";
import type { CreateOperationsOptions, Operations } from "./core/operations.js";

export { EmbeddedConfigError };
export type { EmbeddedConfigOptions };

export interface EmbeddedNeotoma {
  /** Resolved storage locations actually in effect. */
  readonly config: {
    readonly dataDir: string;
    readonly sqlitePath: string;
    readonly rawStorageDir: string;
    readonly logsDir: string;
    readonly eventLogPath: string;
    readonly environment: string;
  };
  /** Create a typed operations handle bound to a user id. */
  createOperations(options: CreateOperationsOptions): Operations;
}

let active: Promise<EmbeddedNeotoma> | undefined;
let activeKey: string | undefined;

export async function createEmbeddedNeotoma(
  options: EmbeddedConfigOptions
): Promise<EmbeddedNeotoma> {
  const resolved = resolveEmbeddedConfig(options);
  const key = JSON.stringify([resolved.options.dataDir, resolved.env.NEOTOMA_ENV]);
  if (active) {
    if (key !== activeKey) {
      throw new EmbeddedConfigError(
        "config_already_loaded",
        "Neotoma is already embedded in this process with a different configuration."
      );
    }
    return active;
  }
  if (getEmbeddedConfig() === undefined) setEmbeddedConfig(resolved);
  activeKey = key;
  active = (async () => {
    const { config } = await import("./config.js");
    if (!config.embedded) {
      clearEmbeddedConfig();
      active = undefined;
      activeKey = undefined;
      throw new EmbeddedConfigError(
        "config_already_loaded",
        "Neotoma configuration was already loaded in this process before embedding. Call createEmbeddedNeotoma before importing other Neotoma modules."
      );
    }
    const { initDatabase } = await import("./db.js");
    const { initServerKeys } = await import("./services/encryption_service.js");
    await initDatabase();
    await initServerKeys();
    const { createOperations } = await import("./core/operations.js");
    return {
      config: Object.freeze({
        dataDir: config.dataDir,
        sqlitePath: config.sqlitePath,
        rawStorageDir: config.rawStorageDir,
        logsDir: config.logsDir,
        eventLogPath: config.eventLogPath,
        environment: config.environment,
      }),
      createOperations,
    };
  })();
  active.catch(() => {
    active = undefined;
    activeKey = undefined;
  });
  return active;
}

/** Test hook: forget the in-process singleton. Module state of config.ts is not reset. */
export function resetEmbeddedForTests(): void {
  active = undefined;
  activeKey = undefined;
  clearEmbeddedConfig();
}

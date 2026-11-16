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
 * Scope: every runtime setting read by the code embedded operations run through
 * comes from the explicit configuration (`runtimeEnv()` in `config_embedded.ts`),
 * and the small user-level state files (`config.json`, `bundle_state.json`) live
 * under `dataDir` instead of a home directory. The CLI, proxy and maintenance
 * entry points are not part of the embedded path. It must be established before
 * any other Neotoma module in the process loads; otherwise a structured
 * `config_already_loaded` error is thrown. The configuration is read once, so a
 * second call with different options is refused.
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
let activeFingerprint: string | undefined;

const ALREADY_LOADED_ORDER_HINT =
  "Call createEmbeddedNeotoma before importing other Neotoma modules.";

export async function createEmbeddedNeotoma(
  options: EmbeddedConfigOptions
): Promise<EmbeddedNeotoma> {
  const resolved = resolveEmbeddedConfig(options);
  const requested = resolved.fingerprint;

  if (active) {
    // Same options return the same instance; any difference (env, openaiApiKey,
    // path overrides, environment, allowProcessEnv names, data directory) is refused.
    if (requested !== activeFingerprint) {
      throw new EmbeddedConfigError(
        "config_already_loaded",
        "Neotoma is already embedded in this process with different options. Options cannot change after the first call."
      );
    }
    return active;
  }

  // A previous attempt in this process may have declared embedded mode and then failed
  // after config.ts loaded (for example the database could not be initialised). That
  // configuration is cached in the loaded modules, so a retry must ask for the same
  // options; anything else would report the earlier call's locations.
  const declared = getEmbeddedConfig();
  if (declared !== undefined && declared.fingerprint !== requested) {
    throw new EmbeddedConfigError(
      "config_already_loaded",
      "Neotoma configuration was already loaded in this process with different options. Retry with the same options, or restart the process."
    );
  }
  if (declared === undefined) setEmbeddedConfig(resolved);
  activeFingerprint = requested;

  active = (async () => {
    const { config } = await import("./config.js");
    if (!config.embedded) {
      clearEmbeddedConfig();
      throw new EmbeddedConfigError(
        "config_already_loaded",
        `Neotoma configuration was already loaded in this process before embedding. ${ALREADY_LOADED_ORDER_HINT}`
      );
    }
    // Belt and braces: the loaded configuration must be the one requested.
    const expectedEnvironment = resolved.options.environment ?? "development";
    if (
      config.dataDir !== resolved.options.dataDir ||
      config.environment !== expectedEnvironment ||
      (resolved.options.sqlitePath !== undefined &&
        config.sqlitePath !== resolved.options.sqlitePath)
    ) {
      throw new EmbeddedConfigError(
        "config_already_loaded",
        "The Neotoma configuration loaded in this process does not match the requested options."
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
    // Allow a retry. Declared embedded state is kept on purpose (see above): the
    // loaded config.ts is cached, so only a retry with identical options is accepted.
    active = undefined;
    activeFingerprint = undefined;
  });
  return active;
}

/** Test hook: forget the in-process singleton. Module state of config.ts is not reset. */
export function resetEmbeddedForTests(): void {
  active = undefined;
  activeFingerprint = undefined;
  clearEmbeddedConfig();
}

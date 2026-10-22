import { isAbsolute, join } from "node:path";
import type { NeotomaConfiguration } from "../config.js";

/** Internal configuration foundation; no ambient resolver or runtime admission. */
export function createEmbeddedRuntimeConfiguration(options: {
  dataDirectory: string;
  packageRoot: string;
}): Readonly<NeotomaConfiguration> {
  if (!isAbsolute(options.dataDirectory) || !isAbsolute(options.packageRoot)) {
    throw new Error("EXPLICIT_RUNTIME_ABSOLUTE_PATH_REQUIRED");
  }
  const configuration: NeotomaConfiguration = {
    projectRoot: options.packageRoot,
    storageBackend: "local",
    dataDir: options.dataDirectory,
    dbBackend: "sqlite",
    dbUrl: "",
    dbAuthToken: "",
    sqlitePath: join(options.dataDirectory, "neotoma.db"),
    rawStorageDir: join(options.dataDirectory, "sources"),
    eventLogPath: join(options.dataDirectory, "logs", "events.log"),
    logsDir: join(options.dataDirectory, "logs"),
    eventLogMirrorEnabled: false,
    authServerUrl: "",
    authServiceKey: "",
    openaiApiKey: "",
    port: 0,
    httpPort: 0,
    environment: "embedded",
    tunnelAutoDiscoveryEnabled: false,
    apiBase: "",
    mcpTokenEncryptionKey: "",
    mcpCompactInstructions: false,
    mcpInstanceSkillHints: false,
    oauthClientId: "",
    oauthTrustedCallbackUrls: [],
    requireKeyForOauth: true,
    encryption: {
      enabled: false,
      keyFilePath: "",
      mnemonic: "",
      mnemonicPassphrase: "",
      logEncryptionEnabled: false,
    },
    iconGeneration: {
      enabled: false,
      confidenceThreshold: 0,
      model: "",
      cacheTTL: 0,
    },
  };
  Object.freeze(configuration.encryption);
  Object.freeze(configuration.iconGeneration);
  Object.freeze(configuration.oauthTrustedCallbackUrls);
  return Object.freeze(configuration);
}

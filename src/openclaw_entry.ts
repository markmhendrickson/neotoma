/**
 * OpenClaw native plugin entry point for Neotoma.
 *
 * Registers all Neotoma MCP tools as OpenClaw agent tools so that
 * `openclaw plugins install neotoma` makes Neotoma's structured memory
 * available in any OpenClaw session.
 *
 * The plugin declares `kind: "memory"` in its manifest, meaning users
 * can assign it to the memory slot via `plugins.slots.memory = "neotoma"`.
 */

import { buildToolDefinitions } from "./tool_definitions.js";
import { initDatabase } from "./db.js";
import { NeotomaServer } from "./server.js";

let serverInstance: NeotomaServer | null = null;
let initPromise: Promise<NeotomaServer> | null = null;

interface NeotomaPluginConfig {
  dataDir?: string;
  environment?: string;
  openaiApiKey?: string;
  encryptionEnabled?: boolean;
}

function applyConfig(cfg: NeotomaPluginConfig): void {
  if (cfg.dataDir) {
    process.env.NEOTOMA_DATA_DIR = cfg.dataDir;
  }
  if (cfg.environment) {
    process.env.NEOTOMA_ENV = cfg.environment;
  }
  if (cfg.openaiApiKey) {
    process.env.OPENAI_API_KEY = cfg.openaiApiKey;
  }
  if (cfg.encryptionEnabled !== undefined) {
    process.env.NEOTOMA_ENCRYPTION_ENABLED = cfg.encryptionEnabled ? "true" : "false";
  }
  process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART = "1";
}

async function ensureServer(cfg: NeotomaPluginConfig): Promise<NeotomaServer> {
  if (serverInstance) return serverInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    applyConfig(cfg);
    await initDatabase();
    const server = new NeotomaServer();
    serverInstance = server;
    return server;
  })();

  return initPromise;
}

interface PluginApi {
  config?: NeotomaPluginConfig;
  registerTool(def: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute(id: string, params: Record<string, unknown>): Promise<{
      content: Array<{ type: string; text: string }>;
    }>;
  }): void;
}

/**
 * Plugin entry object conforming to the OpenClaw plugin interface.
 *
 * When loaded by OpenClaw, the host wraps this with `definePluginEntry`
 * from `openclaw/plugin-sdk/plugin-entry`. The export shape (id, name,
 * description, register) satisfies the native plugin contract.
 */
const neotomaPlugin = {
  id: "neotoma",
  name: "Neotoma",
  description:
    "Structured personal data memory with append-only observations, schema evolution, and provenance tracking",

  register(api: PluginApi) {
    const pluginConfig: NeotomaPluginConfig = api.config ?? {};
    const tools = buildToolDefinitions();

    for (const tool of tools) {
      api.registerTool({
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,

        async execute(_id: string, params: Record<string, unknown>) {
          const server = await ensureServer(pluginConfig);
          const { ensureLocalDevUser } = await import("./services/local_auth.js");
          const localUser = ensureLocalDevUser();
          return server.executeToolForCli(tool.name, params, localUser.id);
        },
      });
    }
  },
};

export default neotomaPlugin;

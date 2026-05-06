import {
  applyCliInstructions,
  scanAgentInstructions,
  type CliInstructionsScope,
} from "./agent_instructions_scan.js";
import {
  offerInstall,
  scanForMcpConfigs,
  type McpTransportChoice,
} from "./mcp_config_scan.js";

export type HarnessInstallScope = "project" | "user" | "both";
export type HarnessMcpEnv = "dev" | "prod" | "both";

function envPort(name: string): number | undefined {
  const value = process.env[name];
  return value && /^\d+$/.test(value) ? parseInt(value, 10) : undefined;
}

export interface ConfigureMcpServersOptions {
  cwd: string;
  repoRoot?: string | null;
  includeUserLevel?: boolean;
  autoInstallScope?: HarnessInstallScope;
  autoInstallEnv?: HarnessMcpEnv;
  mcpTransport?: McpTransportChoice;
  assumeYes?: boolean;
  rewriteExistingNeotoma?: boolean;
  silent?: boolean;
  boxAlreadyShown?: boolean;
  skipProjectSync?: boolean;
}

export async function configureMcpServers(options: ConfigureMcpServersOptions): Promise<{
  installed: boolean;
  message: string;
  scope?: HarnessInstallScope;
  updatedPaths?: string[];
  repoRoot: string | null;
}> {
  const devPort = envPort("NEOTOMA_SESSION_DEV_PORT");
  const prodPort = envPort("NEOTOMA_SESSION_PROD_PORT");
  const { configs, repoRoot } = await scanForMcpConfigs(options.cwd, {
    includeUserLevel: options.includeUserLevel ?? true,
    userLevelFirst: false,
    devPort,
    prodPort,
    neotomaRepoRoot: options.repoRoot,
  });
  const result = await offerInstall(configs, repoRoot, {
    cwd: options.cwd,
    devPort,
    prodPort,
    autoInstallScope: options.autoInstallScope,
    autoInstallEnv: options.autoInstallEnv,
    mcpTransport: options.mcpTransport,
    assumeYes: options.assumeYes,
    rewriteExistingNeotoma: options.rewriteExistingNeotoma,
    silent: options.silent,
    boxAlreadyShown: options.boxAlreadyShown,
    skipProjectSync: options.skipProjectSync,
  });
  return { ...result, repoRoot };
}

export interface ConfigureCliInstructionsOptions {
  cwd: string;
  scope: CliInstructionsScope;
  includeUserLevel?: boolean;
  env?: "dev" | "prod";
}

export async function configureCliInstructions(options: ConfigureCliInstructionsOptions): Promise<{
  added: string[];
  skipped?: boolean;
  projectRoot: string;
}> {
  const scan = await scanAgentInstructions(options.cwd, {
    includeUserLevel: options.includeUserLevel ?? true,
  });
  const result = await applyCliInstructions(scan, {
    scope: options.scope,
    env: options.env,
  });
  return { ...result, projectRoot: scan.projectRoot };
}

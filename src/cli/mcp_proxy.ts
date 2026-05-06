/**
 * CLI wiring for `neotoma mcp proxy`.
 *
 * Reads options from flags and falls back to MCP_PROXY_* / NEOTOMA_AAUTH_*
 * environment variables for launcher integration.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Command } from "commander";

import {
  DEFAULT_CLIENT_NAME,
  DEFAULT_DOWNSTREAM_URL,
  runProxy,
} from "../proxy/mcp_stdio_proxy.js";
import {
  loadSignerConfigFromEnv,
  SignerConfigError,
} from "../proxy/aauth_client_signer.js";
import type { ProxyConfig } from "../proxy/mcp_stdio_proxy.js";

function envBool(name: string): boolean {
  const v = process.env[name]?.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function buildConfigFromOptions(opts: Record<string, unknown>): ProxyConfig {
  const downstreamUrl =
    (opts.downstreamUrl as string | undefined) ??
    process.env.MCP_PROXY_DOWNSTREAM_URL ??
    DEFAULT_DOWNSTREAM_URL;

  const clientName =
    (opts.clientName as string | undefined) ??
    process.env.MCP_PROXY_CLIENT_NAME ??
    DEFAULT_CLIENT_NAME;

  const clientVersion =
    (opts.clientVersion as string | undefined) ??
    process.env.MCP_PROXY_CLIENT_VERSION ??
    getPackageVersion();

  const agentLabel =
    (opts.agentLabel as string | undefined) ??
    process.env.MCP_PROXY_AGENT_LABEL ??
    undefined;

  const bearerToken =
    (opts.bearerToken as string | undefined) ??
    process.env.MCP_PROXY_BEARER_TOKEN ??
    undefined;

  const connectionId =
    (opts.connectionId as string | undefined) ??
    process.env.MCP_PROXY_CONNECTION_ID ??
    undefined;

  const sessionPreflight =
    !!(opts.sessionPreflight as boolean | undefined) ||
    envBool("MCP_PROXY_SESSION_PREFLIGHT");

  const sessionPreflightBase =
    (opts.sessionPreflightBase as string | undefined) ??
    process.env.MCP_PROXY_SESSION_PREFLIGHT_BASE ??
    undefined;

  const failClosed =
    !!(opts.failClosed as boolean | undefined) ||
    envBool("MCP_PROXY_FAIL_CLOSED");

  const logFile =
    (opts.logFile as string | undefined) ??
    process.env.MCP_PROXY_LOG_FILE ??
    undefined;

  const aauthEnabled =
    !!(opts.aauth as boolean | undefined) ||
    envBool("MCP_PROXY_AAUTH");

  const autostart =
    !!(opts.autostart as boolean | undefined) ||
    envBool("MCP_PROXY_AUTOSTART");

  return {
    downstreamUrl,
    clientName,
    clientVersion,
    agentLabel,
    bearerToken,
    connectionId,
    sessionPreflight,
    sessionPreflightBase,
    failClosed,
    logFile,
    extraHeaders: {},
    aauthEnabled,
    autostart,
  };
}

function getPackageVersion(): string {
  try {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(resolve(thisDir, "..", "..", "package.json"), "utf-8"),
    ) as { version: string };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

function maybeLoadSigner(config: ProxyConfig): void {
  if (!config.aauthEnabled) return;
  try {
    config.aauthSigner = loadSignerConfigFromEnv();
    const ts = new Date().toISOString();
    process.stderr.write(
      `${ts} [neotoma-mcp-proxy] AAuth signing enabled: sub=${config.aauthSigner.sub} iss=${config.aauthSigner.iss} kid=${config.aauthSigner.kid}\n`,
    );
  } catch (err) {
    const msg = err instanceof SignerConfigError ? err.message : String(err);
    if (config.failClosed) {
      process.stderr.write(
        `[neotoma-mcp-proxy] fail-closed: ${msg}\n`,
      );
      process.exit(1);
    }
    process.stderr.write(
      `${new Date().toISOString()} [neotoma-mcp-proxy] ${msg}; continuing unsigned (unverified_client tier)\n`,
    );
  }
}

export function registerMcpProxyCommand(mcpCommand: Command): void {
  mcpCommand
    .command("proxy")
    .description(
      "Run a stdio-to-HTTP identity proxy for attributed MCP writes",
    )
    .option(
      "--downstream-url <url>",
      "Neotoma HTTP /mcp URL",
    )
    .option("--client-name <name>", "clientInfo.name to inject")
    .option("--client-version <version>", "clientInfo.version to inject")
    .option(
      "--agent-label <label>",
      "Appended to client name as name+label",
    )
    .option("--bearer-token <token>", "Bearer token for downstream auth")
    .option("--connection-id <id>", "X-Connection-Id header value")
    .option("--session-preflight", "GET /session on startup for trust check")
    .option(
      "--session-preflight-base <url>",
      "Base URL for /session if different from downstream",
    )
    .option("--fail-closed", "Abort on anonymous tier or unreachable preflight")
    .option("--log-file <path>", "Write structured diagnostics to file")
    .option(
      "--aauth",
      "AAuth-sign every downstream request (reads NEOTOMA_AAUTH_* env)",
    )
    .option(
      "--autostart",
      "Start Neotoma HTTP server if health check fails",
    )
    .action(async (opts: Record<string, unknown>) => {
      const config = buildConfigFromOptions(opts);
      maybeLoadSigner(config);
      await runProxy(config);
    });
}

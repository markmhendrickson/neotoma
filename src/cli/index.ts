#!/usr/bin/env node
import { Command } from "commander";
import { createHash, randomBytes } from "node:crypto";
import { exec } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";

import { createApiClient } from "../shared/api_client.js";
import { getOpenApiOperationMapping } from "../shared/contract_mappings.js";
import {
  DEFAULT_BASE_URL,
  baseUrlFromOption,
  clearConfig,
  isTokenExpired,
  readConfig,
  writeConfig,
  type Config,
} from "./config.js";

type OutputMode = "json" | "pretty";

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return Object.fromEntries(entries.map(([key, val]) => [key, sortKeys(val)]));
  }
  return value;
}

function stableStringify(value: unknown, indent: number): string {
  return JSON.stringify(sortKeys(value), null, indent);
}

function resolveOutputMode(): OutputMode {
  const opts = program.opts();
  const json = Boolean(opts.json);
  const pretty = Boolean(opts.pretty);
  if (json && pretty) {
    throw new Error("Use only one of --json or --pretty.");
  }
  return json ? "json" : "pretty";
}

function writeOutput(value: unknown, mode: OutputMode): void {
  const indent = mode === "pretty" ? 2 : 0;
  process.stdout.write(`${stableStringify(value, indent)}\n`);
}

function writeMessage(message: string, mode: OutputMode): void {
  if (mode === "json") {
    writeOutput({ message }, mode);
    return;
  }
  console.log(message);
}

function parseOptionalJson(value?: string): unknown {
  if (!value) {
    return undefined;
  }
  return JSON.parse(value);
}

function openBrowser(url: string): void {
  const quoted = `"${url.replace(/"/g, "%22")}"`;
  if (process.platform === "darwin") {
    exec(`open ${quoted}`);
    return;
  }
  if (process.platform === "win32") {
    exec(`start "" ${quoted}`);
    return;
  }
  exec(`xdg-open ${quoted}`);
}

function base64UrlEncode(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildCodeChallenge(verifier: string): string {
  const digest = createHash("sha256").update(verifier).digest();
  return base64UrlEncode(digest);
}

async function startOAuthCallbackServer(): Promise<{
  redirectUri: string;
  waitForCode: Promise<{ code: string; state: string }>;
}> {
  return new Promise((resolve, reject) => {
    let resolveCode: (value: { code: string; state: string }) => void;
    const waitForCode = new Promise<{ code: string; state: string }>((innerResolve) => {
      resolveCode = innerResolve;
    });

    const server = http.createServer((req, res) => {
      if (!req.url) {
        res.statusCode = 400;
        res.end("Missing callback URL");
        return;
      }
      const requestUrl = new URL(req.url, "http://127.0.0.1");
      if (requestUrl.pathname !== "/callback") {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      const code = requestUrl.searchParams.get("code");
      const state = requestUrl.searchParams.get("state");
      if (!code || !state) {
        res.statusCode = 400;
        res.end("Missing code or state");
        return;
      }
      res.statusCode = 200;
      res.end("Authentication complete. You can close this tab.");
      server.close();
      resolveCode({ code, state });
    });

    server.on("error", (error) => {
      reject(error);
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to start callback server"));
        return;
      }
      const redirectUri = `http://127.0.0.1:${address.port}/callback`;
      resolve({ redirectUri, waitForCode });
    });
  });
}

async function exchangeToken(baseUrl: string, code: string): Promise<{
  access_token: string;
  token_type?: string;
  expires_in?: number;
}> {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);

  const response = await fetch(`${baseUrl}/api/mcp/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${errorText}`);
  }

  return (await response.json()) as {
    access_token: string;
    token_type?: string;
    expires_in?: number;
  };
}

async function requireToken(config: Config): Promise<string> {
  if (!config.access_token || isTokenExpired(config)) {
    throw new Error("Not authenticated. Run `neotoma auth login`.");
  }
  return config.access_token;
}

const PACK_RAT_ART = `
         /\\    /\\
        /  \\__/  \\
       (   o  o   )  ___
        \\   ^    /  (   )     Neotoma CLI
         \\_____/    ) (        Truth layer for AI memory
        /   _   \\  /   \\
       (  ( ) )  )
        \\ /   \\ /  ^   ^
`;

const program = new Command();
program
  .name("neotoma")
  .description("Neotoma CLI")
  .option("--base-url <url>", "API base URL", DEFAULT_BASE_URL)
  .option("--json", "Output machine-readable JSON")
  .option("--pretty", "Output formatted JSON for humans");

const authCommand = program.command("auth").description("Authentication commands");

authCommand
  .command("login")
  .description("Login using OAuth PKCE")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const baseUrl = baseUrlFromOption(program.opts().baseUrl, config);
    const state = base64UrlEncode(randomBytes(16));
    const verifier = base64UrlEncode(randomBytes(32));
    const challenge = buildCodeChallenge(verifier);

    const { redirectUri, waitForCode } = await startOAuthCallbackServer();

    const authUrl = new URL(`${baseUrl}/api/mcp/oauth/authorize`);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("client_id", "neotoma-cli");

    writeMessage("Opening browser for authorization...", outputMode);
    openBrowser(authUrl.toString());

    const { code, state: returnedState } = await waitForCode;
    if (returnedState !== state) {
      throw new Error("OAuth state mismatch");
    }

    const token = await exchangeToken(baseUrl, code);
    const expiresAt = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : undefined;

    await writeConfig({
      base_url: baseUrl,
      access_token: token.access_token,
      token_type: token.token_type,
      expires_at: expiresAt,
      connection_id: code,
    });

    writeMessage("Authentication successful.", outputMode);
  });

authCommand
  .command("status")
  .description("Show authentication status")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    if (!config.access_token) {
      writeMessage("Not authenticated.", outputMode);
      return;
    }
    writeOutput(
      {
        base_url: config.base_url || DEFAULT_BASE_URL,
        connection_id: config.connection_id,
        expires_at: config.expires_at,
        token_expired: isTokenExpired(config),
      },
      outputMode
    );
  });

authCommand
  .command("logout")
  .description("Clear local auth credentials")
  .action(async () => {
    const outputMode = resolveOutputMode();
    await clearConfig();
    writeMessage("Credentials cleared.", outputMode);
  });

const entitiesCommand = program.command("entities").description("Entity commands");
const sourcesCommand = program.command("sources").description("Source commands");
const observationsCommand = program.command("observations").description("Observation commands");
const relationshipsCommand = program.command("relationships").description("Relationship commands");
const timelineCommand = program.command("timeline").description("Timeline commands");
const schemasCommand = program.command("schemas").description("Schema commands");

entitiesCommand
  .command("list")
  .description("List entities")
  .option("--type <entityType>", "Filter by entity type")
  .option("--search <query>", "Search by canonical name")
  .option("--limit <n>", "Limit", "100")
  .option("--offset <n>", "Offset", "0")
  .option("--include-merged", "Include merged entities")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const { data, error } = await api.POST("/api/entities/query", {
      body: {
        entity_type: opts.type,
        search: opts.search,
        limit: Number(opts.limit),
        offset: Number(opts.offset),
        include_merged: Boolean(opts.includeMerged),
      },
    });
    if (error) throw new Error("Failed to list entities");
    writeOutput(data, outputMode);
  });

entitiesCommand
  .command("get")
  .description("Get entity by ID")
  .argument("<id>", "Entity ID")
  .action(async (id: string) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const { data, error } = await api.GET("/api/entities/{id}", {
      params: { path: { id } },
    });
    if (error) throw new Error("Failed to fetch entity");
    writeOutput(data, outputMode);
  });

sourcesCommand
  .command("list")
  .description("List sources")
  .option("--search <query>", "Search by filename or ID")
  .option("--mime-type <mimeType>", "Filter by MIME type")
  .option("--limit <n>", "Limit", "100")
  .option("--offset <n>", "Offset", "0")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const { data, error } = await api.GET("/api/sources", {
      params: {
        query: {
          search: opts.search,
          mime_type: opts.mimeType,
          limit: Number(opts.limit),
          offset: Number(opts.offset),
        },
      },
    });
    if (error) throw new Error("Failed to list sources");
    writeOutput(data, outputMode);
  });

observationsCommand
  .command("list")
  .description("List observations")
  .option("--entity-id <id>", "Filter by entity ID")
  .option("--entity-type <type>", "Filter by entity type")
  .option("--limit <n>", "Limit", "100")
  .option("--offset <n>", "Offset", "0")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const { data, error } = await api.POST("/api/observations/query", {
      body: {
        entity_id: opts.entityId,
        entity_type: opts.entityType,
        limit: Number(opts.limit),
        offset: Number(opts.offset),
      },
    });
    if (error) throw new Error("Failed to list observations");
    writeOutput(data, outputMode);
  });

relationshipsCommand
  .command("list")
  .description("List relationships for an entity")
  .argument("<entityId>", "Entity ID")
  .option("--direction <direction>", "Direction: inbound, outbound, both", "both")
  .action(async (entityId: string, opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const { data, error } = await api.POST("/list_relationships", {
      body: {
        entity_id: entityId,
        direction: opts.direction,
      },
    });
    if (error) throw new Error("Failed to list relationships");
    writeOutput(data, outputMode);
  });

timelineCommand
  .command("list")
  .description("List timeline events")
  .option("--start-date <date>", "Filter start date")
  .option("--end-date <date>", "Filter end date")
  .option("--event-type <type>", "Filter by event type")
  .option("--limit <n>", "Limit", "100")
  .option("--offset <n>", "Offset", "0")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const { data, error } = await api.GET("/api/timeline", {
      params: {
        query: {
          start_date: opts.startDate,
          end_date: opts.endDate,
          event_type: opts.eventType,
          limit: Number(opts.limit),
          offset: Number(opts.offset),
        },
      },
    });
    if (error) throw new Error("Failed to list timeline events");
    writeOutput(data, outputMode);
  });

schemasCommand
  .command("list")
  .description("List schemas")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const { data, error } = await api.GET("/api/schemas", {});
    if (error) throw new Error("Failed to list schemas");
    writeOutput(data, outputMode);
  });

schemasCommand
  .command("get")
  .description("Get schema by entity type")
  .argument("<entityType>", "Entity type")
  .action(async (entityType: string) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const { data, error } = await api.GET("/api/schemas/{entity_type}", {
      params: { path: { entity_type: entityType } },
    });
    if (error) throw new Error("Failed to fetch schema");
    writeOutput(data, outputMode);
  });

program
  .command("store")
  .description("Store structured entities from JSON")
  .option("--json <json>", "Inline JSON array of entities")
  .option("--file <path>", "Path to JSON file containing entity array")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });

    let entities: unknown;
    if (opts.json) {
      entities = JSON.parse(opts.json);
    } else if (opts.file) {
      const raw = await fs.readFile(opts.file, "utf-8");
      entities = JSON.parse(raw);
    } else {
      throw new Error("Provide --json or --file with entity array");
    }

    if (!Array.isArray(entities)) {
      throw new Error("Entities must be an array");
    }

    const { data, error } = await api.POST("/api/store", {
      body: { entities },
    });
    if (error) throw new Error("Failed to store entities");
    writeOutput(data, outputMode);
  });

program
  .command("upload")
  .description("Upload a file")
  .argument("<filePath>", "Path to file")
  .action(async (filePath: string) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const form = new FormData();
    const fileBuffer = await fs.readFile(filePath);
    const fileName = path.basename(filePath);
    form.append("file", new Blob([fileBuffer]), fileName);
    const { data, error } = await api.POST("/upload_file", {
      body: form as unknown as { file: string },
    });
    if (error) throw new Error("Failed to upload file");
    writeOutput(data, outputMode);
  });

program
  .command("analyze")
  .description("Analyze a file")
  .argument("<filePath>", "Path to file")
  .action(async (filePath: string) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const form = new FormData();
    const fileBuffer = await fs.readFile(filePath);
    const fileName = path.basename(filePath);
    form.append("file", new Blob([fileBuffer]), fileName);
    const { data, error } = await api.POST("/analyze_file", {
      body: form as unknown as { file: string },
    });
    if (error) throw new Error("Failed to analyze file");
    writeOutput(data, outputMode);
  });

program
  .command("stats")
  .description("Get dashboard stats")
  .action(async () => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const token = await requireToken(config);
    const api = createApiClient({ baseUrl: baseUrlFromOption(program.opts().baseUrl, config), token });
    const { data, error } = await api.GET("/api/stats", {});
    if (error) throw new Error("Failed to fetch stats");
    writeOutput(data, outputMode);
  });

program
  .command("request")
  .description("Call an OpenAPI operation by operationId")
  .requiredOption("--operation <id>", "OpenAPI operationId")
  .option("--params <json>", "JSON with { path, query, body }")
  .option("--body <json>", "JSON body override")
  .option("--query <json>", "JSON query override")
  .option("--path <json>", "JSON path override")
  .option("--skip-auth", "Skip auth token for public endpoints")
  .action(async (opts) => {
    const outputMode = resolveOutputMode();
    const config = await readConfig();
    const operation = getOpenApiOperationMapping(opts.operation);
    if (!operation) {
      throw new Error(`Unknown operationId: ${opts.operation}`);
    }

    const baseUrl = baseUrlFromOption(program.opts().baseUrl, config);
    const token = opts.skipAuth ? undefined : await requireToken(config);
    const api = createApiClient({ baseUrl, token });

    const params = parseOptionalJson(opts.params);
    const body = parseOptionalJson(opts.body);
    const query = parseOptionalJson(opts.query);
    const pathParams = parseOptionalJson(opts.path);

    const requestParams: Record<string, unknown> =
      params && typeof params === "object"
        ? { ...(params as Record<string, unknown>) }
        : {};

    if (body) {
      requestParams.body = body;
    }
    if (query) {
      requestParams.params = {
        ...(requestParams.params as Record<string, unknown> | undefined),
        query,
      };
    }
    if (pathParams) {
      requestParams.params = {
        ...(requestParams.params as Record<string, unknown> | undefined),
        path: pathParams,
      };
    }

    const method = operation.method.toUpperCase();
    const handler = (api as unknown as Record<string, unknown>)[method] as
      | ((path: string, params: Record<string, unknown>) => Promise<{
          data?: unknown;
          error?: unknown;
        }>)
      | undefined;

    if (!handler) {
      throw new Error(`Unsupported method for request: ${operation.method}`);
    }

    const { data, error } = await handler(operation.path, requestParams);
    if (error) {
      throw new Error(`OpenAPI request failed: ${JSON.stringify(error)}`);
    }
    writeOutput(data, outputMode);
  });

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const args = argv.slice(2);
  if (args.length === 0) {
    process.stdout.write(PACK_RAT_ART + "\n");
    program.outputHelp();
    process.exit(1);
  }
  await program.parseAsync(argv);
}

const entryPath = process.argv[1];
let isMain = false;
if (typeof entryPath === "string") {
  try {
    const resolvedArgv = realpathSync(entryPath);
    const resolvedModule = realpathSync(fileURLToPath(import.meta.url));
    isMain = resolvedArgv === resolvedModule;
  } catch {
    isMain = pathToFileURL(entryPath).href === import.meta.url;
  }
}
if (isMain) {
  runCli(process.argv);
}

/** Closed, replay-only HTTP reads of the runner's own MCP and static-site servers. */
import { createServer } from "node:http";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import type { CassetteFile } from "./cassette.js";
import type { ScenarioFile } from "./types.js";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const SITE_ROOT = join(REPO_ROOT, "site_pages");
export const SITE_HTTP_SCENARIO = "site_publication_http_contract";
export const STATIC_ROUTES = [
  "/",
  "/es",
  "/install/claude-code",
  "/install/openclaw",
  "/install",
  "/es/install",
  "/evaluate",
  "/es/evaluate",
  "/install/system-changes",
  "/es/install/system-changes",
] as const;
const ROUTES = new Set<string>(STATIC_ROUTES);
const MAX_BYTES = 2_000_000;

export type SiteHttpInput =
  | { operation: "root_json"; path: "/" }
  | { operation: "static_html"; path: string };

export function parseSiteHttpInput(value: unknown): SiteHttpInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("site_http input must be an object");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(",") !== "operation,path")
    throw new Error("site_http accepts only operation and path");
  if (input.operation === "root_json" && input.path === "/")
    return { operation: "root_json", path: "/" };
  if (input.operation === "static_html" && typeof input.path === "string" && ROUTES.has(input.path))
    return { operation: "static_html", path: input.path };
  throw new Error("site_http operation/path is outside the fixed read set");
}

export function validateSiteScenario(scenario: ScenarioFile): void {
  if (scenario.meta.id !== SITE_HTTP_SCENARIO) throw new Error("wrong site_http scenario");
  if (
    scenario.meta.quarantine ||
    scenario.host_tools.length !== 0 ||
    scenario.models.length !== 1 ||
    scenario.models[0]?.provider !== "stub" ||
    scenario.models[0]?.model !== "replay-only"
  )
    throw new Error(
      "site_http eval requires one unquarantined replay-only cell and no canned tools"
    );
  if (scenario.expected.length < 20)
    throw new Error("site_http eval is missing required assertions");
  const rootContract = {
    status: 200,
    content_type: "application/json",
    harness_ids: ["claude-code", "claude-desktop", "chatgpt", "codex", "cursor", "openclaw"],
    guidance_complete: true,
    remote_url_consistent: true,
    claude_code_remote_command: true,
    openclaw_plugin_caveat: true,
  };
  if (
    !scenario.expected.some(
      (assertion) =>
        assertion.type === "tool_result.matches" &&
        assertion.tool_name === "site_http" &&
        assertion.which === 0 &&
        isDeepStrictEqual(assertion.result_subset, rootContract)
    )
  )
    throw new Error("site_http eval is missing the live root guidance contract");
  for (let index = 0; index < STATIC_ROUTES.length; index++) {
    const which = index + 1;
    if (
      !scenario.expected.some(
        (assertion) =>
          assertion.type === "tool_result.matches" &&
          assertion.tool_name === "site_http" &&
          assertion.which === which &&
          isDeepStrictEqual(assertion.result_subset, { status: 200, content_type: "text/html" })
      ) ||
      !scenario.expected.some(
        (assertion) =>
          assertion.type === "tool_result.matches" &&
          assertion.tool_name === "site_http" &&
          assertion.which === which &&
          assertion.result_key === "body" &&
          typeof assertion.result_contains === "string"
      )
    )
      throw new Error(`site_http eval is missing static route assertion ${STATIC_ROUTES[index]}`);
  }
}

export function validateSiteCassette(cassette: CassetteFile, scenario: ScenarioFile): void {
  validateSiteScenario(scenario);
  const calls = cassette.tool_calls;
  if (calls.length !== STATIC_ROUTES.length + 1)
    throw new Error("site_http cassette call count changed");
  const expected: SiteHttpInput[] = [
    { operation: "root_json", path: "/" },
    ...STATIC_ROUTES.map((path) => ({ operation: "static_html" as const, path })),
  ];
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    if (
      call.name !== "site_http" ||
      call.output !== undefined ||
      call.error !== undefined ||
      call.sequence !== i ||
      JSON.stringify(parseSiteHttpInput(call.input)) !== JSON.stringify(expected[i])
    )
      throw new Error(`site_http cassette call ${i} is outside the closed contract`);
  }
}

export function resolveStaticFile(rootPath: string, path: string): string {
  if (!ROUTES.has(path)) throw new Error("site_http path is outside the fixed route set");
  const root = realpathSync(rootPath);
  const target = realpathSync(join(root, path.slice(1), "index.html"));
  if (!target.startsWith(root + sep)) throw new Error("site_http static route escaped build root");
  if (!statSync(target).isFile()) throw new Error("site_http route is not a file");
  return target;
}

function staticFile(path: string): string {
  return resolveStaticFile(SITE_ROOT, path);
}

export interface StaticSiteServer {
  baseUrl: string;
  stop(): Promise<void>;
}

export function assertSiteBuildHead(rootPath: string, head: string): void {
  for (const path of ["/", "/es"]) {
    const html = readFileSync(resolveStaticFile(rootPath, path), "utf-8");
    if (!html.includes(`<meta name="neotoma-ui-head" content="${head}">`))
      throw new Error(`site_http ${path} is not the exact-head static build`);
  }
}

export async function startStaticSiteServer(): Promise<StaticSiteServer> {
  // Fail before listening when the exact-head build is unavailable.
  if (realpathSync(SITE_ROOT) !== join(realpathSync(REPO_ROOT), "site_pages"))
    throw new Error("site_http build root escaped repository");
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  }).trim();
  if (!/^[0-9a-f]{40}$/.test(head)) throw new Error("site_http could not resolve exact HEAD");
  assertSiteBuildHead(SITE_ROOT, head);
  const server = createServer((req, res) => {
    try {
      if (req.method !== "GET" || !req.url || !ROUTES.has(req.url)) {
        res.writeHead(404).end();
        return;
      }
      const file = staticFile(req.url);
      if (statSync(file).size > MAX_BYTES) throw new Error("static response too large");
      const body = readFileSync(file);
      if (body.length === 0 || body.length > MAX_BYTES)
        throw new Error("invalid static response size");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("site_http static server did not bind");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    stop: () =>
      new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done()))
      ),
  };
}

function nonempty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

async function readBodyLimited(res: Response): Promise<string> {
  const statedSize = Number(res.headers.get("content-length"));
  if (Number.isFinite(statedSize) && statedSize > MAX_BYTES)
    throw new Error("site_http response too large");
  if (!res.body) throw new Error("site_http empty response body");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) throw new Error("site_http response too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (size === 0) throw new Error("site_http empty response body");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function rootSummary(body: unknown, expectedBaseUrl: string): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("site_http malformed root JSON");
  const root = body as Record<string, unknown>;
  const harnesses = root.harnesses;
  const mcpUrl = `${expectedBaseUrl}/mcp`;
  if (!Array.isArray(harnesses) || !nonempty(root.mcp_url))
    throw new Error("site_http missing root guidance");
  const entries = harnesses as Array<Record<string, unknown>>;
  const byId = Object.fromEntries(entries.map((h) => [h.id, h]));
  const guidanceComplete =
    entries.length === 6 &&
    entries.every((h) => {
      const human = h.human_config as Record<string, unknown> | undefined;
      return (
        nonempty(h.id) &&
        nonempty(h.label) &&
        nonempty(h.description) &&
        nonempty(h.docs_url) &&
        nonempty(h.agent_prompt) &&
        human &&
        nonempty(human.format) &&
        nonempty(human.code)
      );
    });
  const remoteIds = ["claude-code", "claude-desktop", "chatgpt", "codex", "cursor", "openclaw"];
  const remoteUrlConsistent =
    root.base_url === expectedBaseUrl &&
    root.mcp_url === mcpUrl &&
    remoteIds.every((id) => {
      const h = byId[id] as Record<string, unknown> | undefined;
      const human = h?.human_config as Record<string, unknown> | undefined;
      return (
        typeof h?.agent_prompt === "string" &&
        h.agent_prompt.includes(mcpUrl) &&
        typeof human?.code === "string" &&
        human.code.includes(mcpUrl)
      );
    });
  const claude = byId["claude-code"] as Record<string, unknown> | undefined;
  const claudeHuman = claude?.human_config as Record<string, unknown> | undefined;
  const openclaw = byId.openclaw as Record<string, unknown> | undefined;
  const openclawHuman = openclaw?.human_config as Record<string, unknown> | undefined;
  return {
    harness_ids: entries.map((h) => h.id),
    guidance_complete: guidanceComplete,
    remote_url_consistent: remoteUrlConsistent,
    claude_code_remote_command:
      claudeHuman?.code === `claude mcp add --transport http neotoma ${mcpUrl}` &&
      typeof claude?.agent_prompt === "string" &&
      claude.agent_prompt.includes(`claude mcp add --transport http neotoma ${mcpUrl}`),
    openclaw_plugin_caveat:
      typeof openclawHuman?.code === "string" &&
      openclawHuman.code.includes("plugin install command does not accept this endpoint URL") &&
      typeof openclaw?.agent_prompt === "string" &&
      openclaw.agent_prompt.includes("only if the installed OpenClaw version supports it"),
  };
}

export async function readSiteHttp(
  inputValue: unknown,
  neotomaBaseUrl: string,
  staticBaseUrl: string
): Promise<Record<string, unknown>> {
  const input = parseSiteHttpInput(inputValue);
  const base = input.operation === "root_json" ? neotomaBaseUrl : staticBaseUrl;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))
    throw new Error("site_http target is not runner-owned loopback");
  const url = new URL(input.path, `${base}/`);
  if (url.origin !== base || url.pathname !== input.path || url.search || url.hash)
    throw new Error("site_http target escaped runner origin");
  const res = await fetch(url, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    headers: { accept: input.operation === "root_json" ? "application/json" : "text/html" },
  });
  if (res.status < 200 || res.status >= 300)
    throw new Error(`site_http GET ${input.path} returned ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  const expected = input.operation === "root_json" ? "application/json" : "text/html";
  if (!contentType.toLowerCase().startsWith(expected))
    throw new Error(`site_http unexpected content type: ${contentType}`);
  const body = await readBodyLimited(res);
  if (input.operation === "root_json") {
    const parsed: unknown = JSON.parse(body);
    return { status: res.status, content_type: expected, ...rootSummary(parsed, neotomaBaseUrl) };
  }
  if (!/<!doctype html/i.test(body) || !/<html\s/i.test(body))
    throw new Error("site_http malformed static HTML");
  return { status: res.status, content_type: expected, body };
}

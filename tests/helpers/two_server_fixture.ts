import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  startIsolatedNeotomaServer,
  type IsolatedServer,
} from "../../packages/eval-harness/src/isolated_server.js";
import { generateAndStoreKeypair } from "../../src/cli/aauth_signer.js";

const execFileAsync = promisify(execFile);
const TEST_REPO = "markmhendrickson/neotoma-docs-private";

type JsonRpcResponse = {
  result?: {
    content?: Array<{ type: string; text: string }>;
  };
  error?: { message?: string; code?: number };
};

export type McpToolResult<T extends Record<string, unknown> = Record<string, unknown>> = T;

export interface McpHttpClient {
  callTool<T extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<McpToolResult<T>>;
}

/** How submitter → maintainer HTTP (`neotoma_client` /store) authenticates; MCP stays Bearer in both modes. */
export type CrossInstanceRemoteHttpAuth = "unsigned" | "signed";

export interface CrossInstanceIssuesFixture {
  submitter: IsolatedServer;
  maintainer: IsolatedServer;
  submitterMcp: McpHttpClient;
  maintainerMcp: McpHttpClient;
  github: GitHubTestClient | null;
  /** Mirrors `startCrossInstanceIssuesFixture` option for run reports. */
  remoteHttpAuth: CrossInstanceRemoteHttpAuth;
  stop(): Promise<void>;
}

export interface GitHubIssueSummary {
  number: number;
  html_url: string;
  title: string;
  state: string;
  closed_at?: string | null;
  labels: Array<{ name: string }>;
}

export interface GitHubCommentSummary {
  id: number;
  body: string;
  user: { login: string } | null;
  html_url: string;
}

export interface GitHubTestClient {
  ensureLabel(name: string, color: string): Promise<void>;
  getIssue(issueNumber: number): Promise<GitHubIssueSummary>;
  listIssueComments(issueNumber: number): Promise<GitHubCommentSummary[]>;
  closeIssue(issueNumber: number): Promise<GitHubIssueSummary>;
  addLabels(issueNumber: number, labels: string[]): Promise<void>;
  findOpenIssueByTitle(title: string): Promise<GitHubIssueSummary | null>;
}

async function reservePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to reserve an ephemeral port"));
        return;
      }
      const port = address.port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function readJsonResponse(response: Response): Promise<JsonRpcResponse> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`MCP HTTP ${response.status}: ${text}`);
  }
  if (!text.trim()) return {};
  if (!text.startsWith("event:")) {
    return JSON.parse(text) as JsonRpcResponse;
  }
  const dataLine = text
    .split("\n")
    .find((line) => line.startsWith("data:"));
  if (!dataLine) return {};
  return JSON.parse(dataLine.slice("data:".length).trim()) as JsonRpcResponse;
}

async function createMcpHttpClient(server: IsolatedServer): Promise<McpHttpClient> {
  let nextId = 1;
  const commonHeaders = {
    Authorization: `Bearer ${server.token}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  const initResponse = await fetch(server.mcpUrl, {
    method: "POST",
    headers: commonHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId++,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "cross-instance-issues-test",
          version: "0.0.0",
        },
      },
    }),
  });

  const sessionId = initResponse.headers.get("mcp-session-id");
  const initJson = await readJsonResponse(initResponse);
  if (initJson.error) {
    throw new Error(`MCP initialize failed: ${initJson.error.message ?? JSON.stringify(initJson.error)}`);
  }
  if (!sessionId) {
    throw new Error("MCP initialize did not return mcp-session-id");
  }

  await fetch(server.mcpUrl, {
    method: "POST",
    headers: {
      ...commonHeaders,
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }),
  });

  return {
    async callTool<T extends Record<string, unknown> = Record<string, unknown>>(
      name: string,
      args: Record<string, unknown> = {},
    ): Promise<T> {
      const response = await fetch(server.mcpUrl, {
        method: "POST",
        headers: {
          ...commonHeaders,
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: nextId++,
          method: "tools/call",
          params: {
            name,
            arguments: args,
          },
        }),
      });
      const json = await readJsonResponse(response);
      if (json.error) {
        throw new Error(`${name} failed: ${json.error.message ?? JSON.stringify(json.error)}`);
      }
      const text = json.result?.content?.find((item) => item.type === "text")?.text;
      if (!text) return {} as T;
      return JSON.parse(text) as T;
    },
  };
}

async function resolveGitHubToken(): Promise<string | null> {
  if (process.env.NEOTOMA_ISSUES_GITHUB_TOKEN) {
    return process.env.NEOTOMA_ISSUES_GITHUB_TOKEN;
  }
  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token"]);
    const token = stdout.trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function createGitHubTestClient(token: string): GitHubTestClient {
  const [owner, repo] = TEST_REPO.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid test repo: ${TEST_REPO}`);
  }

  async function githubFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...((options?.headers as Record<string, string> | undefined) ?? {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`GitHub API ${response.status}: ${text}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  return {
    async ensureLabel(name: string, color: string): Promise<void> {
      const encodedName = encodeURIComponent(name);
      const labelResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/labels/${encodedName}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (labelResponse.ok) return;
      if (labelResponse.status !== 404) {
        throw new Error(`GitHub label lookup ${labelResponse.status}: ${await labelResponse.text()}`);
      }
      await githubFetch(`/repos/${owner}/${repo}/labels`, {
        method: "POST",
        body: JSON.stringify({ name, color }),
      });
    },
    getIssue(issueNumber: number): Promise<GitHubIssueSummary> {
      return githubFetch<GitHubIssueSummary>(`/repos/${owner}/${repo}/issues/${issueNumber}`);
    },
    listIssueComments(issueNumber: number): Promise<GitHubCommentSummary[]> {
      return githubFetch<GitHubCommentSummary[]>(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`);
    },
    async closeIssue(issueNumber: number): Promise<GitHubIssueSummary> {
      return await githubFetch<GitHubIssueSummary>(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
        method: "PATCH",
        body: JSON.stringify({ state: "closed" }),
      });
    },
    async addLabels(issueNumber: number, labels: string[]): Promise<void> {
      await githubFetch(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
        method: "POST",
        body: JSON.stringify({ labels }),
      });
    },
    async findOpenIssueByTitle(title: string): Promise<GitHubIssueSummary | null> {
      const query = new URLSearchParams({
        state: "open",
        labels: "neotoma",
        per_page: "100",
      });
      const issues = await githubFetch<GitHubIssueSummary[]>(`/repos/${owner}/${repo}/issues?${query}`);
      return issues.find((issue) => issue.title === title) ?? null;
    },
  };
}

async function prepareSubmitterCliAauthKeys(submitterHome: string): Promise<void> {
  mkdirSync(submitterHome, { recursive: true });
  const prevHome = process.env.HOME;
  process.env.HOME = submitterHome;
  try {
    await generateAndStoreKeypair({
      force: true,
      sub: "cross-instance-issues-signed-remote@test",
      iss: "https://neotoma.cursor.local",
    });
  } finally {
    if (prevHome !== undefined) process.env.HOME = prevHome;
    else delete process.env.HOME;
  }
}

export async function startCrossInstanceIssuesFixture(options?: {
  remoteHttpAuth?: CrossInstanceRemoteHttpAuth;
}): Promise<CrossInstanceIssuesFixture> {
  const remoteHttpAuth = options?.remoteHttpAuth ?? "unsigned";
  const maintainerDataDir = mkdtempSync(join(tmpdir(), "neotoma-maintainer-"));
  const submitterDataDir = mkdtempSync(join(tmpdir(), "neotoma-submitter-"));
  const submitterHome = join(submitterDataDir, "home");
  if (remoteHttpAuth === "signed") {
    await prepareSubmitterCliAauthKeys(submitterHome);
  }
  const maintainerPort = await reservePort();
  const maintainerBaseUrl = `http://127.0.0.1:${maintainerPort}`;
  const githubToken = await resolveGitHubToken();
  const commonEnv = {
    NEOTOMA_ISSUES_REPO: TEST_REPO,
    NEOTOMA_ISSUES_SYNC_STALENESS_MS: "0",
    NEOTOMA_ISSUES_AUTHOR_ALIAS: "cross-instance-issues-test",
    NEOTOMA_ACCESS_POLICY_ISSUE: "submitter_scoped",
    NEOTOMA_ACCESS_POLICY_CONVERSATION: "submitter_scoped",
    NEOTOMA_ACCESS_POLICY_CONVERSATION_MESSAGE: "submitter_scoped",
    ...(githubToken ? { NEOTOMA_ISSUES_GITHUB_TOKEN: githubToken } : {}),
  };

  const maintainer = await startIsolatedNeotomaServer({
    port: maintainerPort,
    dataDir: maintainerDataDir,
    env: {
      ...commonEnv,
      HOME: join(maintainerDataDir, "home"),
      // Canonical operator: no remote mirror. Explicit "" so loadIssuesConfig
      // does not fall back to DEFAULT_ISSUES_TARGET_URL (and does not inherit
      // a host NEOTOMA_ISSUES_TARGET_URL from the parent process).
      NEOTOMA_ISSUES_TARGET_URL: "",
    },
  });

  const submitter = await startIsolatedNeotomaServer({
    dataDir: submitterDataDir,
    env: {
      ...commonEnv,
      HOME: submitterHome,
      NEOTOMA_ISSUES_TARGET_URL: maintainer.baseUrl,
      NEOTOMA_ISSUES_AUTHOR_ALIAS: "cross-instance-issues-submitter",
      ...(remoteHttpAuth === "unsigned" ? { NEOTOMA_CLI_AAUTH_DISABLE: "1" } : {}),
    },
  });

  const [submitterMcp, maintainerMcp] = await Promise.all([
    createMcpHttpClient(submitter),
    createMcpHttpClient(maintainer),
  ]);
  let github = githubToken ? createGitHubTestClient(githubToken) : null;
  if (github) {
    try {
      await github.ensureLabel("neotoma", "0e8a16");
      await github.ensureLabel("test-cleanup", "ededed");
    } catch {
      github = null;
    }
  }

  return {
    submitter,
    maintainer,
    submitterMcp,
    maintainerMcp,
    github,
    remoteHttpAuth,
    async stop(): Promise<void> {
      await Promise.allSettled([submitter.stop(), maintainer.stop()]);
    },
  };
}

export function uniqueIssueTitle(prefix: string): string {
  return `${prefix} ${new Date().toISOString()} ${randomUUID()}`;
}

export { TEST_REPO };

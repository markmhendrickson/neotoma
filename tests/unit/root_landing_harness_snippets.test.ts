/**
 * Unit tests for `src/services/root_landing/harness_snippets.ts`.
 *
 * Each harness × mode × flow must produce deterministic output so the MCP
 * root landing page can render drift-free snippets without live rebuilds.
 * Verifies host-aware URL interpolation and stdio vs remote mode selection.
 */

import { describe, expect, it } from "vitest";
import {
  buildAllHarnessSnippets,
  buildHarnessSnippet,
  HARNESS_IDS,
  PLACEHOLDER_STDIO_MCP_SCRIPT,
  type HarnessSnippetContext,
  type HarnessId,
  type LandingMode,
} from "../../src/services/root_landing/harness_snippets.js";

const REMOTE_MODES: LandingMode[] = ["sandbox", "personal", "prod"];

function ctxFor(mode: LandingMode, host = "https://sandbox.neotoma.io"): HarnessSnippetContext {
  return {
    mode,
    base: host,
    mcpUrl: `${host}/mcp`,
    publicDocsUrl: "https://neotoma.io",
  };
}

describe("harness_snippets: inventory", () => {
  it("exposes all expected harnesses in a stable order", () => {
    expect([...HARNESS_IDS]).toEqual([
      "claude-code",
      "claude-desktop",
      "chatgpt",
      "codex",
      "cursor",
      "openclaw",
    ]);
  });

  it("buildAllHarnessSnippets returns the same ids", () => {
    const built = buildAllHarnessSnippets(ctxFor("sandbox"));
    expect(built.map((h) => h.id)).toEqual([...HARNESS_IDS]);
  });
});

describe("harness_snippets: remote modes interpolate mcpUrl", () => {
  it.each(REMOTE_MODES)("mode=%s embeds the mcp url in every human snippet", (mode) => {
    const ctx = ctxFor(mode, "https://example.example.com");
    const built = buildAllHarnessSnippets(ctx);
    for (const h of built) {
      // ChatGPT's snippet is prose, but still names the URL.
      expect(h.human.code).toContain("https://example.example.com/mcp");
    }
  });

  it.each(REMOTE_MODES)("mode=%s never embeds a placeholder host", (mode) => {
    const ctx = ctxFor(mode);
    const built = buildAllHarnessSnippets(ctx);
    for (const h of built) {
      expect(h.human.code).not.toMatch(/<your-[\w-]+-host>/);
      expect(h.human.code).not.toMatch(/example\.com\//);
    }
  });
});

describe("harness_snippets: local mode uses stdio", () => {
  const ctx = ctxFor("local", "http://localhost:3080");

  it.each(["claude-code", "claude-desktop", "codex", "cursor", "openclaw"] as HarnessId[])(
    "%s human snippet does not embed an http URL",
    (id) => {
      const out = buildHarnessSnippet(id, ctx);
      expect(out.human.code).not.toContain("http://localhost:3080/mcp");
      expect(out.human.code).not.toContain("https://");
    },
  );

  it("chatgpt local snippet explains the tunnel requirement", () => {
    const out = buildHarnessSnippet("chatgpt", ctx);
    expect(out.human.code).toMatch(/tunnel/i);
  });

  it("claude-code local snippet uses the stdio script", () => {
    const out = buildHarnessSnippet("claude-code", ctx);
    expect(out.human.code).toContain("run_neotoma_mcp_stdio.sh");
  });

  it("local mode without stdioMcpScriptPath keeps the generic placeholder", () => {
    const out = buildHarnessSnippet("cursor", ctx);
    expect(out.human.code).toContain(PLACEHOLDER_STDIO_MCP_SCRIPT);
    expect(() => JSON.parse(out.human.code)).not.toThrow();
  });

  it("local mode with stdioMcpScriptPath embeds that path in JSON and shell snippets", () => {
    const resolved = "/opt/neotoma/scripts/run_neotoma_mcp_stdio.sh";
    const ctxWithPath = { ...ctxFor("local", "http://localhost:3080"), stdioMcpScriptPath: resolved };
    const cursor = buildHarnessSnippet("cursor", ctxWithPath);
    expect(cursor.human.code).toContain(resolved);
    expect(cursor.human.code).not.toContain(PLACEHOLDER_STDIO_MCP_SCRIPT);
    expect(JSON.parse(cursor.human.code).mcpServers.neotoma.command).toBe(resolved);

    const claude = buildHarnessSnippet("claude-code", ctxWithPath);
    expect(claude.human.code).toContain(JSON.stringify(resolved).slice(1, -1));
    expect(claude.agentPrompt).toContain(resolved);
  });
});

describe("harness_snippets: human config formats are sane", () => {
  const ctx = ctxFor("sandbox");
  it("claude-desktop is json", () => {
    const out = buildHarnessSnippet("claude-desktop", ctx);
    expect(out.human.format).toBe("json");
    expect(() => JSON.parse(out.human.code)).not.toThrow();
  });
  it("cursor is json", () => {
    const out = buildHarnessSnippet("cursor", ctx);
    expect(out.human.format).toBe("json");
    expect(() => JSON.parse(out.human.code)).not.toThrow();
  });
  it("codex is toml-like text with an [mcp_servers.neotoma] header", () => {
    const out = buildHarnessSnippet("codex", ctx);
    expect(out.human.format).toBe("toml");
    expect(out.human.code).toMatch(/\[mcp_servers\.neotoma\]/);
  });
  it("claude-code is a shell command", () => {
    const out = buildHarnessSnippet("claude-code", ctx);
    expect(out.human.format).toBe("shell");
    expect(out.human.code).toMatch(/^claude mcp add /);
  });
});

describe("harness_snippets: preflight snippets", () => {
  const ctx = ctxFor("sandbox");
  it("claude-code, cursor, and codex have preflight; others do not", () => {
    expect(buildHarnessSnippet("claude-code", ctx).preflight).toBeTruthy();
    expect(buildHarnessSnippet("cursor", ctx).preflight).toBeTruthy();
    expect(buildHarnessSnippet("codex", ctx).preflight).toBeTruthy();
    expect(buildHarnessSnippet("chatgpt", ctx).preflight).toBeUndefined();
    expect(buildHarnessSnippet("claude-desktop", ctx).preflight).toBeUndefined();
    expect(buildHarnessSnippet("openclaw", ctx).preflight).toBeUndefined();
  });
});

describe("harness_snippets: docs URL resolution", () => {
  it("resolves docs paths against publicDocsUrl", () => {
    const ctx = ctxFor("sandbox");
    const out = buildHarnessSnippet("cursor", ctx);
    expect(out.docsUrl).toBe("https://neotoma.io/neotoma-with-cursor");
  });

  it("handles trailing slash on publicDocsUrl", () => {
    const ctx = { ...ctxFor("sandbox"), publicDocsUrl: "https://neotoma.io/" };
    const out = buildHarnessSnippet("claude-code", ctx);
    expect(out.docsUrl).toBe("https://neotoma.io/neotoma-with-claude-code");
  });
});

describe("harness_snippets: agent prompts", () => {
  it("references the MCP URL in remote modes", () => {
    const ctx = ctxFor("personal", "https://neotoma.example.com");
    const out = buildHarnessSnippet("cursor", ctx);
    expect(out.agentPrompt).toContain("https://neotoma.example.com/mcp");
  });
  it("mentions sandbox reset schedule in sandbox mode", () => {
    const out = buildHarnessSnippet("cursor", ctxFor("sandbox"));
    expect(out.agentPrompt).toMatch(/weekly/i);
  });
  it("local mode agent prompt does not send the agent to an HTTP URL", () => {
    const ctx = ctxFor("local", "http://localhost:3080");
    const out = buildHarnessSnippet("cursor", ctx);
    expect(out.agentPrompt).not.toContain("http://localhost:3080/mcp");
    expect(out.agentPrompt).toMatch(/stdio/i);
  });
  it("agent prompt install note references setup, mcp/cli config, and guide commands", () => {
    const out = buildHarnessSnippet("cursor", ctxFor("sandbox"));
    expect(out.agentPrompt).toMatch(/neotoma setup/);
    expect(out.agentPrompt).toMatch(/neotoma mcp config/);
    expect(out.agentPrompt).toMatch(/neotoma cli config/);
    expect(out.agentPrompt).toMatch(/neotoma mcp guide/);
    expect(out.agentPrompt).toMatch(/neotoma cli guide/);
  });
});

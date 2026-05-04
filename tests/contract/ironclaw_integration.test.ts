import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");

function readRepoFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8");
}

describe("IronClaw MCP integration artifacts", () => {
  it("documents IronClaw MCP setup with HTTP, stdio fallback, and verification", () => {
    const docPath = join(ROOT, "docs/developer/mcp_ironclaw_setup.md");
    expect(existsSync(docPath)).toBe(true);

    const content = readFileSync(docPath, "utf-8");
    expect(content).toContain("ironclaw mcp add neotoma https://<tunnel-host>/mcp");
    expect(content).toContain("ironclaw mcp test neotoma");
    expect(content).toContain("~/.ironclaw/mcp_servers.json");
    expect(content).toContain("transport");
    expect(content).toContain("store_structured");
    expect(content).toContain("Neotoma does not currently write IronClaw configuration");
  });

  it("links the IronClaw setup guide from MCP overview and agent CLI docs", () => {
    expect(readRepoFile("docs/developer/mcp_overview.md")).toContain("docs/developer/mcp_ironclaw_setup.md");
    expect(readRepoFile("docs/developer/agent_cli_configuration.md")).toContain("mcp_ironclaw_setup.md");
  });

  it("registers the IronClaw landing page route and product basename", () => {
    const mainApp = readRepoFile("frontend/src/components/MainApp.tsx");
    expect(mainApp).toContain("NeotomaWithIronClawPage");
    expect(mainApp).toContain('path: "/neotoma-with-ironclaw"');

    const spaPath = readRepoFile("frontend/src/site/spa_path.ts");
    expect(spaPath).toContain('"/neotoma-with-ironclaw"');
  });

  it("adds IronClaw SEO, docs navigation, and integration discovery", () => {
    expect(readRepoFile("frontend/src/site/seo_metadata.ts")).toContain("/neotoma-with-ironclaw");
    expect(readRepoFile("frontend/src/components/subpages/DocsIndexPage.tsx")).toContain("IronClaw");
    expect(readRepoFile("frontend/src/site/site_data.ts")).toContain('href: "/neotoma-with-ironclaw"');
    expect(readRepoFile("frontend/src/components/subpages/ConnectIndexPage.tsx")).toContain("ironclaw mcp add");
  });

  it("does not advertise an unsupported setup mode in site install snippets", () => {
    const docs = readRepoFile("docs/developer/mcp_ironclaw_setup.md");
    const siteData = readRepoFile("frontend/src/site/site_data.ts");

    expect(docs).toContain("does not currently write IronClaw configuration");
    expect(siteData).not.toContain("--tool ironclaw");
  });
});

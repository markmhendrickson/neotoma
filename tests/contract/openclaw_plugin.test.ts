import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = join(import.meta.dirname, "..", "..");

function parseNpmPackJsonOutput(output: string): Array<{ files?: Array<{ path?: string }> }> {
  const trimmed = output.trim();
  const jsonStart = trimmed.lastIndexOf("\n[");
  const jsonText = jsonStart >= 0 ? trimmed.slice(jsonStart + 1) : trimmed.slice(trimmed.indexOf("["));
  return JSON.parse(jsonText) as Array<{ files?: Array<{ path?: string }> }>;
}

describe("OpenClaw plugin packaging", () => {
  describe("openclaw.plugin.json manifest", () => {
    const manifestPath = join(ROOT, "openclaw.plugin.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

    it("exists and is valid JSON", () => {
      expect(manifest).toBeDefined();
      expect(typeof manifest).toBe("object");
    });

    it("has required fields", () => {
      expect(manifest.id).toBe("neotoma");
      expect(manifest.name).toBe("Neotoma");
      expect(typeof manifest.description).toBe("string");
      expect(manifest.description.length).toBeGreaterThan(0);
    });

    it("declares kind: memory", () => {
      expect(manifest.kind).toBe("memory");
    });

    it("has a valid configSchema", () => {
      expect(manifest.configSchema).toBeDefined();
      expect(manifest.configSchema.type).toBe("object");
      expect(manifest.configSchema.properties).toBeDefined();
      expect(manifest.configSchema.properties.dataDir).toBeDefined();
      expect(manifest.configSchema.properties.environment).toBeDefined();
      expect(manifest.configSchema.properties.openaiApiKey).toBeDefined();
    });

    it("declares tool contracts", () => {
      expect(manifest.contracts).toBeDefined();
      expect(Array.isArray(manifest.contracts.tools)).toBe(true);
      expect(manifest.contracts.tools.length).toBeGreaterThan(20);
      expect(manifest.contracts.tools).toContain("neotoma__store");
      expect(manifest.contracts.tools).toContain("neotoma__retrieve_entities");
      expect(manifest.contracts.tools).toContain("neotoma__retrieve_entity_by_identifier");
    });

    it("references skills directory", () => {
      expect(manifest.skills).toContain("skills");
    });
  });

  describe("package.json openclaw block", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));

    it("has openclaw.extensions pointing to dist/openclaw_entry.js", () => {
      expect(pkg.openclaw).toBeDefined();
      expect(pkg.openclaw.extensions).toContain("./dist/openclaw_entry.js");
    });

    it("includes openclaw.plugin.json in files array", () => {
      expect(pkg.files).toContain("openclaw.plugin.json");
    });

    it("includes skills directory in files array", () => {
      expect(pkg.files).toContain("skills");
    });

    it("declares openclaw as optional peer dependency", () => {
      expect(pkg.peerDependencies?.openclaw).toBeDefined();
      expect(pkg.peerDependenciesMeta?.openclaw?.optional).toBe(true);
    });
  });

  describe("skills directory", () => {
    const skillsDir = join(ROOT, "skills");

    it("exists", () => {
      expect(existsSync(skillsDir)).toBe(true);
    });

    const expectedSkills = ["recover-sqlite-database", "store-data", "query-memory"];

    for (const skill of expectedSkills) {
      it(`contains ${skill}/SKILL.md`, () => {
        const skillPath = join(skillsDir, skill, "SKILL.md");
        expect(existsSync(skillPath)).toBe(true);
        const content = readFileSync(skillPath, "utf-8");
        expect(content).toContain("---");
        expect(content).toContain("name:");
        expect(content).toContain("description:");
        expect(content).toContain("triggers:");
      });
    }
  });

  describe("tool definitions", () => {
    it("buildToolDefinitions returns all expected tools", async () => {
      const { buildToolDefinitions, NEOTOMA_TOOL_NAMES } = await import(
        "../../src/tool_definitions.js"
      );
      const tools = buildToolDefinitions();

      expect(tools.length).toBe(NEOTOMA_TOOL_NAMES.length);

      for (const toolName of NEOTOMA_TOOL_NAMES) {
        const tool = tools.find((t: { name: string }) => t.name === toolName);
        expect(tool, `Missing tool definition: ${toolName}`).toBeDefined();
        expect(typeof tool!.description).toBe("string");
        expect(tool!.description.length).toBeGreaterThan(0);
        expect(tool!.inputSchema).toBeDefined();
        expect(typeof tool!.inputSchema).toBe("object");
      }
    });

    it("accepts description overrides", async () => {
      const { buildToolDefinitions } = await import("../../src/tool_definitions.js");
      const overrides = new Map([["store", "Custom store description"]]);
      const tools = buildToolDefinitions(overrides);
      const storeTool = tools.find((t: { name: string }) => t.name === "store");
      expect(storeTool!.description).toBe("Custom store description");
    });
  });

  describe("openclaw entry module", () => {
    it("exports a plugin object with id, name, description, and register", async () => {
      const mod = await import("../../src/openclaw_entry.js");
      const plugin = mod.default;

      expect(plugin.id).toBe("neotoma");
      expect(plugin.name).toBe("Neotoma");
      expect(typeof plugin.description).toBe("string");
      expect(typeof plugin.register).toBe("function");
    });

    it("register() calls registerTool for each tool", async () => {
      const mod = await import("../../src/openclaw_entry.js");
      const plugin = mod.default;
      const { NEOTOMA_TOOL_NAMES } = await import("../../src/tool_definitions.js");

      const registeredTools: string[] = [];
      const mockApi = {
        config: {},
        registerTool(def: { name: string }) {
          registeredTools.push(def.name);
        },
      };

      plugin.register(mockApi);
      expect(registeredTools.length).toBe(NEOTOMA_TOOL_NAMES.length);

      for (const name of NEOTOMA_TOOL_NAMES) {
        expect(registeredTools, `Tool not registered: ${name}`).toContain(name);
      }
    });
  });

  describe("npm pack includes openclaw files", () => {
    it("openclaw.plugin.json appears in npm pack dry-run", () => {
      const result = spawnSync("npm", ["pack", "--json", "--dry-run"], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

      expect(result.status, result.stderr || result.stdout).toBe(0);

      const parsed = parseNpmPackJsonOutput(result.stdout);
      const filePaths = (parsed[0]?.files ?? [])
        .map((f) => f.path)
        .filter(Boolean) as string[];

      expect(filePaths).toContain("openclaw.plugin.json");
    });
  });
});

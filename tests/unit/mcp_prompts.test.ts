/**
 * MCP prompts (src/mcp_prompts.ts) and the Claude plugin shell that mirrors
 * them (packages/claude-code-plugin + the repo-root marketplace).
 *
 * The prompt NAME is the chip text Claude shows on a connector page, so the
 * names are pinned here as a set; the plugin's `commands/*.md` must mirror the
 * same set so the two surfaces cannot drift.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  NEOTOMA_MCP_PROMPTS,
  SANDBOX_CAUTION,
  getNeotomaPrompt,
  listNeotomaPrompts,
  renderPluginCommandMarkdown,
} from "../../src/mcp_prompts.js";
import { buildSmitheryServerCard } from "../../src/mcp_server_card.js";

const REPO_ROOT = join(__dirname, "..", "..");
const PLUGIN_DIR = join(REPO_ROOT, "packages", "claude-code-plugin");

const EXPECTED_NAMES = [
  "set-up-neotoma",
  "what-do-you-remember-about",
  "remember-this",
  "what-changed-recently",
  "check-neotoma",
];

function readJson(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function frontmatter(path: string): Record<string, string> {
  const raw = readFileSync(path, "utf-8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

describe("MCP prompts", () => {
  it("lists the starter prompts with human-readable names, titles and descriptions", () => {
    const prompts = listNeotomaPrompts();
    expect(prompts.map((p) => p.name)).toEqual(EXPECTED_NAMES);
    expect(prompts.length).toBeGreaterThanOrEqual(4);
    expect(prompts.length).toBeLessThanOrEqual(6);
    for (const p of prompts) {
      // Chip text: lowercase words joined by hyphens, short enough to read.
      expect(p.name).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(p.name.length).toBeLessThanOrEqual(32);
      expect(p.title.trim().length).toBeGreaterThan(0);
      expect(p.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps every argument optional", () => {
    for (const p of listNeotomaPrompts()) {
      for (const a of p.arguments) {
        expect(a.required).toBe(false);
        expect(a.description.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("renders every prompt with no arguments (a chip click sends none)", () => {
    for (const { name } of NEOTOMA_MCP_PROMPTS) {
      const result = getNeotomaPrompt(name, undefined);
      expect(result).not.toBeNull();
      expect(result!.messages).toHaveLength(1);
      expect(result!.messages[0].role).toBe("user");
      expect(result!.messages[0].content.type).toBe("text");
      const text = result!.messages[0].content.text;
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toContain("undefined");
    }
  });

  it("substitutes provided arguments and treats blank or non-string values as absent", () => {
    const withTopic = getNeotomaPrompt("what-do-you-remember-about", {
      topic: "the garden project",
    });
    expect(withTopic!.messages[0].content.text).toContain("the garden project");

    const blank = getNeotomaPrompt("what-do-you-remember-about", { topic: "   " });
    expect(blank!.messages[0].content.text).toMatch(/^Ask me which/);

    const nonString = getNeotomaPrompt("remember-this", { content: 42 as unknown as string });
    expect(nonString!.messages[0].content.text).toMatch(/^Ask me what to remember/);

    const workflow = getNeotomaPrompt("set-up-neotoma", { workflow: "meetings" });
    expect(workflow!.messages[0].content.text).toContain("one workflow: meetings");

    const since = getNeotomaPrompt("what-changed-recently", { since: "this week" });
    expect(since!.messages[0].content.text).toContain("this week");
  });

  it("returns null for an unknown prompt", () => {
    expect(getNeotomaPrompt("no-such-prompt", {})).toBeNull();
  });

  it("check-neotoma is read-only", () => {
    const text = getNeotomaPrompt("check-neotoma", {})!.messages[0].content.text;
    expect(text).toContain("Do not write anything");
  });

  it("prompts that store warn about the shared public sandbox", () => {
    const remember = getNeotomaPrompt("remember-this", { content: "x" })!.messages[0].content.text;
    expect(remember).toContain(SANDBOX_CAUTION);
    expect(getNeotomaPrompt("remember-this", {})!.messages[0].content.text).toContain(
      SANDBOX_CAUTION
    );
    const setup = getNeotomaPrompt("set-up-neotoma", {})!.messages[0].content.text;
    expect(setup).toMatch(/shared public sandbox/);
    expect(setup).toMatch(/made-up test data/);
  });

  it("check-neotoma treats a duplicate Neotoma connector as a failure", () => {
    const text = getNeotomaPrompt("check-neotoma", {})!.messages[0].content.text;
    expect(text).toMatch(/exactly one Neotoma connector/);
    expect(text).toMatch(/duplicate connector/);
  });

  it("the starter-prompt eval scenario uses the live remember-this rendering", () => {
    const scenarioDir = join(REPO_ROOT, "packages", "eval-harness");
    const yaml = readFileSync(
      join(scenarioDir, "scenarios", "starter_prompt_remember_this.scenario.yaml"),
      "utf-8"
    );
    const cassette = JSON.parse(
      readFileSync(
        join(
          scenarioDir,
          "cassettes",
          "starter_prompt_remember_this__stub__replay-only.cassette.json"
        ),
        "utf-8"
      )
    ) as { user_prompt: string };
    const rendered = getNeotomaPrompt("remember-this", {
      content: "My dentist appointment moved to Thursday 12 November at 10:00.",
    })!.messages[0].content.text;
    expect(cassette.user_prompt.trimEnd()).toBe(rendered);
    const block = rendered
      .split("\n")
      .map((line) => (line ? `  ${line}` : ""))
      .join("\n");
    expect(yaml).toContain(`user_prompt: |\n${block}\n`);
  });

  it("advertises the same prompts on the static server card", () => {
    const card = buildSmitheryServerCard();
    expect((card.prompts as Array<{ name: string }>).map((p) => p.name)).toEqual(EXPECTED_NAMES);
  });
});

describe("Claude plugin shell", () => {
  it("plugin command files are the generated rendering of their prompt, word for word", () => {
    for (const prompt of NEOTOMA_MCP_PROMPTS) {
      const file = readFileSync(join(PLUGIN_DIR, "commands", `${prompt.name}.md`), "utf-8");
      expect(file).toBe(renderPluginCommandMarkdown(prompt));
      for (const a of prompt.arguments) {
        expect(file).toContain(prompt.render({ [a.name]: "$ARGUMENTS" }));
      }
      expect(file).toContain(prompt.render({}));
    }
  });

  it("mirrors every MCP prompt as a plugin command, and nothing else", () => {
    const commands = readdirSync(join(PLUGIN_DIR, "commands"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .sort();
    expect(commands).toEqual([...EXPECTED_NAMES].sort());
    for (const name of commands) {
      expect(frontmatter(join(PLUGIN_DIR, "commands", `${name}.md`)).description).toBeTruthy();
    }
  });

  it("ships the setup, check and recover onboarding skills", () => {
    for (const skill of ["setup", "check", "recover"]) {
      const path = join(PLUGIN_DIR, "skills", skill, "SKILL.md");
      expect(existsSync(path)).toBe(true);
      const fm = frontmatter(path);
      expect(fm.name).toBe(skill);
      expect((fm.description ?? "").length).toBeGreaterThan(20);
    }
  });

  it("repo-root marketplace resolves to the plugin directory", () => {
    const marketplace = readJson(join(REPO_ROOT, ".claude-plugin", "marketplace.json"));
    expect(marketplace.name).toBe("neotoma-marketplace");
    expect(marketplace.owner?.name).toBeTruthy();
    const entry = (marketplace.plugins as Array<Record<string, any>>).find(
      (p) => p.name === "neotoma"
    );
    expect(entry).toBeDefined();
    expect(entry!.source).toBe("./packages/claude-code-plugin");
    // plugin.json is authoritative for version; an entry version would only drift.
    expect(entry!.version).toBeUndefined();
    const manifest = readJson(join(REPO_ROOT, entry!.source, ".claude-plugin", "plugin.json"));
    expect(manifest.name).toBe("neotoma");
  });

  it("keeps the package-local marketplace in step with plugin.json", () => {
    const manifest = readJson(join(PLUGIN_DIR, ".claude-plugin", "plugin.json"));
    const local = readJson(join(PLUGIN_DIR, ".claude-plugin", "marketplace.json"));
    expect(local.name).toBe("neotoma-marketplace");
    expect(local.plugins[0].version).toBe(manifest.version);
  });

  it("bundles an HTTP connector whose URL comes from userConfig, defaulting to the public sandbox", () => {
    const manifest = readJson(join(PLUGIN_DIR, ".claude-plugin", "plugin.json"));
    const server = manifest.mcpServers?.neotoma;
    expect(server).toEqual({ type: "http", url: "${user_config.neotoma_mcp_url}" });
    const option = manifest.userConfig?.neotoma_mcp_url;
    expect(option.type).toBe("string");
    expect(option.title).toBeTruthy();
    expect(option.description).toBeTruthy();
    expect(option.default).toBe("https://sandbox.neotoma.io/mcp");
    // The default must be a URL the repo already documents as public.
    const sandboxDoc = readFileSync(
      join(REPO_ROOT, "docs", "subsystems", "sandbox_deployment.md"),
      "utf-8"
    );
    expect(sandboxDoc).toContain(option.default);
  });
});

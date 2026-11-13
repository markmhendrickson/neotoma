/**
 * Agents read the `publish_rendered_page` description from
 * docs/developer/mcp/tool_descriptions.yaml, which takes precedence over the
 * inline text in src/tool_definitions.ts. Both must carry the link lifetime rule
 * and the re-publish step.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { buildToolDefinitions } from "../../src/tool_definitions.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const yamlDescription = (
  yaml.load(
    readFileSync(join(ROOT, "docs", "developer", "mcp", "tool_descriptions.yaml"), "utf8")
  ) as { tools: Record<string, string> }
).tools.publish_rendered_page;
const tsDescription = buildToolDefinitions().find(
  (tool) => tool.name === "publish_rendered_page"
)?.description;

const LIFETIME_RULE =
  "lasts the shorter of its stored lifetime and NEOTOMA_GUEST_TOKEN_TTL_SECONDS (default 30 days)";
const REPUBLISH_STEP =
  "if a link returns 401 GUEST_TOKEN_INVALID, call publish_rendered_page again for a fresh link";

describe("publish_rendered_page states the link lifetime and re-publish step on every surface", () => {
  it.each([
    ["tool_descriptions.yaml", yamlDescription],
    ["tool_definitions.ts", tsDescription],
  ])("%s carries the lifetime rule and the re-publish step", (_surface, description) => {
    expect(description).toContain(LIFETIME_RULE);
    expect(description).toContain(REPUBLISH_STEP);
  });
});

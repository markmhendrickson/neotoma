#!/usr/bin/env npx tsx
/**
 * Test semantic search via MCP retrieve_entities with search param.
 * Run: NEOTOMA_ENV=production npx tsx scripts/test_mcp_semantic_search.ts
 * Or with prod local DB: NEOTOMA_ENV=production npx tsx scripts/test_mcp_semantic_search.ts
 */
import dotenv from "dotenv";
dotenv.config();

import { NeotomaServer } from "../src/server.js";

async function main() {
  process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART = "1";
  process.env.NODE_ENV = "test";

  const server = new NeotomaServer();
  const userId = process.env.TEST_USER_ID ?? "00000000-0000-0000-0000-000000000000";

  const result = await server.executeToolForCli("retrieve_entities", {
    search: "task project",
    limit: 10,
    offset: 0,
  }, userId);

  const data = JSON.parse(result.content[0].text);
  console.log("retrieve_entities with search result:");
  console.log(JSON.stringify({ entities: data.entities?.length ?? 0, total: data.total, excluded_merged: data.excluded_merged }, null, 2));
  if (data.entities?.length) {
    console.log("First entity:", JSON.stringify(data.entities[0], null, 2).slice(0, 400) + "...");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

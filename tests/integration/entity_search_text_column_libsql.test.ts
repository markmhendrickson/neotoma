import { afterAll, vi } from "vitest";
import { rmSync } from "node:fs";

const dataDir = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("node:os") as typeof import("node:os");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const p = require("node:path") as typeof import("node:path");
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), "neotoma-search-text-libsql-"));
  process.env.NEOTOMA_DB_BACKEND = "libsql";
  process.env.NEOTOMA_DB_URL = "";
  process.env.NEOTOMA_SQLITE_PATH = p.join(dir, "neotoma.db");
  return dir;
});

import { openLibsqlDatabase } from "../../src/repositories/libsql/libsql_driver.js";
import { registerEntitySearchTextCases } from "../helpers/entity_search_text_cases.js";

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

registerEntitySearchTextCases("libsql", async (file) => openLibsqlDatabase(`file:${file}`));

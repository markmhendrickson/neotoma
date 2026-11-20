import { afterAll, vi } from "vitest";
import { rmSync } from "node:fs";

const dataDir = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("node:os") as typeof import("node:os");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const p = require("node:path") as typeof import("node:path");
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), "neotoma-search-text-backfill-libsql-"));
  process.env.NEOTOMA_DB_BACKEND = "libsql";
  process.env.NEOTOMA_DB_URL = "";
  process.env.NEOTOMA_SQLITE_PATH = p.join(dir, "neotoma.db");
  return dir;
});

import { registerEntitySearchTextBackfillCases } from "../helpers/entity_search_text_backfill_cases.js";

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

registerEntitySearchTextBackfillCases("libsql");

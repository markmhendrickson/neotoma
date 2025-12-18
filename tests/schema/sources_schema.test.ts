import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, "../../supabase/schema.sql");
const schemaContents = readFileSync(schemaPath, "utf-8");

describe("Supabase schema snapshot - sources table", () => {
  it("defines the sources table with required columns", () => {
    expect(schemaContents).toMatch(/CREATE TABLE IF NOT EXISTS sources\s*\(/);

    const requiredFragments = [
      "content_hash TEXT NOT NULL",
      "storage_url TEXT NOT NULL",
      "storage_status TEXT NOT NULL DEFAULT 'uploaded'",
      "mime_type TEXT NOT NULL",
      "byte_size INTEGER NOT NULL",
      "source_type TEXT NOT NULL",
      "source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb",
      "user_id UUID NOT NULL",
      "CONSTRAINT unique_content_per_user UNIQUE(content_hash, user_id)",
    ];

    for (const fragment of requiredFragments) {
      expect(schemaContents).toContain(fragment);
    }
  });

  it("adds indexes that support deduplication and auditing", () => {
    expect(schemaContents).toContain(
      "CREATE INDEX IF NOT EXISTS idx_sources_hash ON sources(content_hash);",
    );
    expect(schemaContents).toContain(
      "CREATE INDEX IF NOT EXISTS idx_sources_user ON sources(user_id);",
    );
    expect(schemaContents).toContain(
      "CREATE INDEX IF NOT EXISTS idx_sources_created ON sources(created_at DESC);",
    );
  });

  it("enforces row-level security with user + service role policies", () => {
    expect(schemaContents).toContain(
      'ALTER TABLE sources ENABLE ROW LEVEL SECURITY;',
    );
    expect(schemaContents).toContain(
      'CREATE POLICY "Users read own sources" ON sources',
    );
    expect(schemaContents).toContain(
      'CREATE POLICY "Service role full access - sources" ON sources',
    );
  });
});

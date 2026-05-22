#!/usr/bin/env tsx
/**
 * One-time migration script: convert existing `neotoma_feedback` entities
 * to `issue` entities.
 *
 * Usage:
 *   npx tsx scripts/migrate_feedback_to_issues.ts [--dry-run] [--base-url http://localhost:3080]
 *
 * What it does:
 *   1. Retrieves all `neotoma_feedback` entities via the Neotoma API.
 *   2. For each, creates an `issue` entity with mapped fields.
 *   3. Creates a `conversation` entity linked via REFERS_TO.
 *   4. Creates a `conversation_message` entity (the feedback body) linked via PART_OF.
 *   5. Prints a summary of migrated entities.
 *
 * The migration is additive (does not delete original feedback entities).
 * Run with --dry-run to preview without writing.
 */

import { githubIssueThreadConversationId } from "../src/services/issues/github_issue_thread.js";
import { createApiClient } from "../src/shared/api_client.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const baseUrlArg = args.find((a) => a.startsWith("--base-url="));
const baseUrl = baseUrlArg?.split("=")[1] ?? process.env.NEOTOMA_BASE_URL ?? "http://localhost:3080";

const KIND_TO_LABELS: Record<string, string[]> = {
  incident: ["bug", "incident"],
  report: ["bug"],
  primitive_ask: ["enhancement"],
  doc_gap: ["doc_gap"],
  contract_discrepancy: ["bug", "contract_discrepancy"],
  fix_verification: ["verification"],
};

async function main() {
  console.log(`Migration: neotoma_feedback → issue`);
  console.log(`  Base URL: ${baseUrl}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log();

  const api = createApiClient({ baseUrl });

  const { data, error } = await api.POST("/entities/query" as any, {
    body: { entity_type: "neotoma_feedback", limit: 500 },
  });

  if (error) {
    console.error("Failed to query feedback entities:", error);
    process.exit(1);
  }

  const entities = (data as { entities?: Array<{ entity_id: string; snapshot: Record<string, unknown> }> })?.entities ?? [];
  console.log(`Found ${entities.length} neotoma_feedback entities to migrate.\n`);

  let migrated = 0;
  let skipped = 0;

  for (const entity of entities) {
    const s = entity.snapshot;
    const title = (s.title as string) ?? "Untitled feedback";
    const body = (s.body as string) ?? "";
    const kind = (s.kind as string) ?? "report";
    const status = (s.status as string) ?? "open";
    const feedbackId = (s.feedback_id as string) ?? entity.entity_id;
    const submittedAt = (s.submitted_at as string) ?? new Date().toISOString();
    const labels = KIND_TO_LABELS[kind] ?? ["bug"];
    const githubUrls = (s.github_issue_urls as string[]) ?? [];

    const issueStatus = ["resolved", "closed", "wont_fix", "duplicate"].includes(status)
      ? "closed"
      : "open";

    const githubNumber = githubUrls.length > 0
      ? parseInt(githubUrls[0].split("/").pop() ?? "0")
      : 0;
    const githubUrl = githubUrls[0] ?? "";
    const migrationRepo = "markmhendrickson/neotoma";
    const threadConversationId = githubIssueThreadConversationId(migrationRepo, githubNumber);

    console.log(`  [${migrated + 1}] ${title} (${feedbackId}) → issue [${issueStatus}]`);

    if (dryRun) {
      migrated++;
      continue;
    }

    try {
      const { error: storeError } = await api.POST("/store" as any, {
        body: {
          entities: [
            {
              entity_type: "issue",
              title,
              body,
              status: issueStatus,
              labels,
              github_number: githubNumber,
              github_url: githubUrl,
              repo: migrationRepo,
              visibility: "public",
              author: (s.client_name as string) ?? "agent",
              created_at: submittedAt,
              closed_at: issueStatus === "closed" ? (s.status_updated_at as string) ?? submittedAt : null,
              last_synced_at: new Date().toISOString(),
              sync_pending: false,
              data_source: `migration from neotoma_feedback ${feedbackId}`,
            },
            {
              entity_type: "conversation",
              title: `Issue: ${title}`,
              thread_kind: "multi_party",
              ...(threadConversationId ? { conversation_id: threadConversationId } : {}),
            },
            {
              entity_type: "conversation_message",
              role: "user",
              sender_kind: "agent",
              content: body,
              author: (s.client_name as string) ?? "agent",
              created_at: submittedAt,
            },
          ],
          relationships: [
            { relationship_type: "REFERS_TO", source_index: 0, target_index: 1 },
            { relationship_type: "PART_OF", source_index: 2, target_index: 1 },
          ],
          idempotency_key: `migrate-feedback-${feedbackId}`,
        },
      });

      if (storeError) {
        console.error(`    ERROR: ${JSON.stringify(storeError)}`);
        skipped++;
      } else {
        migrated++;
      }
    } catch (err) {
      console.error(`    ERROR: ${(err as Error).message}`);
      skipped++;
    }
  }

  console.log(`\nMigration complete: ${migrated} migrated, ${skipped} skipped.`);
  if (dryRun) {
    console.log("(dry run — no data was written)");
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

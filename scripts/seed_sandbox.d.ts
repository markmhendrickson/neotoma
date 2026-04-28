#!/usr/bin/env tsx
/**
 * Seed the public sandbox deployment at `sandbox.neotoma.io` with a mix of
 * reused fixtures and synthetic conversation / public-domain content. Driven
 * by `tests/fixtures/sandbox/manifest.json` so the dataset is defined in one
 * place and can be audited independently of seeding code.
 *
 * Runs against a live Neotoma API over HTTP (the same surface visitors use),
 * so observations, timeline events, and the Agents directory populate
 * realistically. Four synthetic agent identities rotate through submissions
 * via X-Client-Name / X-Client-Version / X-Connection-Id headers so the
 * `/agents` page shows diversity.
 *
 * Usage:
 *   tsx scripts/seed_sandbox.ts [--base-url http://localhost:3180] [--dry-run]
 *
 * Environment:
 *   NEOTOMA_SANDBOX_BASE_URL   Same effect as --base-url. Default http://localhost:3180.
 *   NEOTOMA_SANDBOX_BEARER     Optional Bearer token (only needed when the target
 *                              is running without NEOTOMA_SANDBOX_MODE=1).
 */
export interface SandboxAgentIdentity {
    agent_sub: string;
    client_name: string;
    client_version: string;
    label: string;
}
export interface SandboxEntityBatch {
    agent_index: number;
    idempotency_prefix: string;
    fixture: string;
    entity_type_override?: string;
    note?: string;
}
export interface SandboxUnstructuredSource {
    agent_index: number;
    fixture_path: string;
    mime_type: string;
    original_filename: string;
    note?: string;
}
export interface SandboxManifest {
    schema_version: string;
    description: string;
    agent_identities: SandboxAgentIdentity[];
    entity_batches: SandboxEntityBatch[];
    unstructured_sources: SandboxUnstructuredSource[];
    excluded_fixtures: string[];
}
export interface SeedOptions {
    baseUrl: string;
    bearer?: string;
    dryRun?: boolean;
    repoRoot?: string;
    fetchImpl?: typeof fetch;
    logger?: (message: string) => void;
    /** Override manifest path (absolute). When set, loadManifest uses this instead of the default. */
    manifestPath?: string;
    /** Seed into a specific user_id (used by session-based seeding). */
    targetUserId?: string;
    /** Skip seeding entirely (returns zeroed result). */
    skipSeeding?: boolean;
}
export interface SeedResult {
    entity_batches_submitted: number;
    entities_planned: number;
    unstructured_sources_submitted: number;
    dry_run: boolean;
}
export declare const SANDBOX_MANIFEST_REL_PATH = "tests/fixtures/sandbox/manifest.json";
export declare function loadManifest(repoRoot: string): Promise<SandboxManifest>;
export declare function seedSandbox(options: SeedOptions): Promise<SeedResult>;
//# sourceMappingURL=seed_sandbox.d.ts.map
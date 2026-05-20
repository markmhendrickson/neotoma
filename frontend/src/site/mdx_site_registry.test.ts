import { describe, expect, it } from "vitest";
import { hasMdxSitePage, resolveMdxSitePage } from "@/site/mdx_site_registry";

describe("mdx_site_registry", () => {
  it("resolves changelog for English", () => {
    const { bundle, usedFallbackFromLocale } = resolveMdxSitePage("/changelog", "en");
    expect(bundle.meta.locale).toBe("en");
    expect(bundle.meta.path).toBe("/changelog");
    expect(usedFallbackFromLocale).toBeNull();
  });

  it("resolves changelog for Spanish without fallback", () => {
    const { bundle, usedFallbackFromLocale } = resolveMdxSitePage("/changelog", "es");
    expect(bundle.meta.locale).toBe("es");
    expect(usedFallbackFromLocale).toBeNull();
  });

  it("resolves FAQ for Spanish without fallback", () => {
    const { bundle, usedFallbackFromLocale } = resolveMdxSitePage("/faq", "es");
    expect(bundle.meta.locale).toBe("es");
    expect(usedFallbackFromLocale).toBeNull();
  });

  it("falls back to English for unsupported translation", () => {
    const { bundle, usedFallbackFromLocale } = resolveMdxSitePage("/foundation/problem-statement", "de");
    expect(bundle.meta.locale).toBe("en");
    expect(usedFallbackFromLocale).toBe("de");
  });

  it("hasMdxSitePage is true for MDX-backed canonical paths", () => {
    expect(hasMdxSitePage("/changelog")).toBe(true);
    expect(hasMdxSitePage("/foundation/problem-statement")).toBe(true);
    expect(hasMdxSitePage("/schema-management")).toBe(true);
    expect(hasMdxSitePage("/troubleshooting")).toBe(true);
    expect(hasMdxSitePage("/mcp")).toBe(true);
    expect(hasMdxSitePage("/cli")).toBe(true);
    expect(hasMdxSitePage("/api")).toBe(true);
    expect(hasMdxSitePage("/install")).toBe(true);
    expect(hasMdxSitePage("/install/manual")).toBe(true);
    expect(hasMdxSitePage("/install/docker")).toBe(true);
    expect(hasMdxSitePage("/neotoma-with-codex-connect-local-stdio")).toBe(true);
    expect(hasMdxSitePage("/neotoma-with-codex-connect-remote-http-oauth")).toBe(true);
    expect(hasMdxSitePage("/neotoma-with-claude-connect-desktop")).toBe(true);
    expect(hasMdxSitePage("/neotoma-with-claude-connect-remote-mcp")).toBe(true);
    expect(hasMdxSitePage("/neotoma-with-openclaw-connect-local-stdio")).toBe(true);
    expect(hasMdxSitePage("/neotoma-with-openclaw-connect-remote-http")).toBe(true);
    expect(hasMdxSitePage("/neotoma-with-chatgpt-connect-remote-mcp")).toBe(true);
    expect(hasMdxSitePage("/neotoma-with-chatgpt-connect-custom-gpt")).toBe(true);
    expect(hasMdxSitePage("/neotoma-with-chatgpt")).toBe(true);
    expect(hasMdxSitePage("/neotoma-with-ironclaw")).toBe(true);
    expect(hasMdxSitePage("/neotoma-with-codex")).toBe(true);
    expect(hasMdxSitePage("/neotoma-with-opencode")).toBe(true);
    expect(hasMdxSitePage("/neotoma-with-cursor")).toBe(true);
    expect(hasMdxSitePage("/neotoma-with-claude")).toBe(true);
    expect(hasMdxSitePage("/neotoma-with-claude-code")).toBe(true);
    expect(hasMdxSitePage("/neotoma-with-claude-agent-sdk")).toBe(true);
    expect(hasMdxSitePage("/neotoma-with-openclaw")).toBe(true);
    expect(hasMdxSitePage("/memory-guarantees")).toBe(true);
    expect(hasMdxSitePage("/deterministic-state-evolution")).toBe(true);
    expect(hasMdxSitePage("/versioned-history")).toBe(true);
    expect(hasMdxSitePage("/replayable-timeline")).toBe(true);
    expect(hasMdxSitePage("/auditable-change-log")).toBe(true);
    expect(hasMdxSitePage("/strong-consistency")).toBe(true);
    expect(hasMdxSitePage("/transactional-writes")).toBe(true);
    expect(hasMdxSitePage("/schema-constraints")).toBe(true);
    expect(hasMdxSitePage("/silent-mutation-risk")).toBe(true);
    expect(hasMdxSitePage("/conflicting-facts-risk")).toBe(true);
    expect(hasMdxSitePage("/false-closure-risk")).toBe(true);
    expect(hasMdxSitePage("/reproducible-state-reconstruction")).toBe(true);
    expect(hasMdxSitePage("/human-inspectability")).toBe(true);
    expect(hasMdxSitePage("/zero-setup-onboarding")).toBe(true);
    expect(hasMdxSitePage("/semantic-similarity-search")).toBe(true);
    expect(hasMdxSitePage("/direct-human-editability")).toBe(true);
    expect(hasMdxSitePage("/primitives")).toBe(true);
    expect(hasMdxSitePage("/primitives/entities")).toBe(true);
    expect(hasMdxSitePage("/primitives/entity-snapshots")).toBe(true);
    expect(hasMdxSitePage("/primitives/sources")).toBe(true);
    expect(hasMdxSitePage("/primitives/interpretations")).toBe(true);
    expect(hasMdxSitePage("/primitives/observations")).toBe(true);
    expect(hasMdxSitePage("/primitives/relationships")).toBe(true);
    expect(hasMdxSitePage("/primitives/timeline-events")).toBe(true);
    expect(hasMdxSitePage("/schemas")).toBe(true);
    expect(hasMdxSitePage("/schemas/registry")).toBe(true);
    expect(hasMdxSitePage("/schemas/merge-policies")).toBe(true);
    expect(hasMdxSitePage("/schemas/storage-layers")).toBe(true);
    expect(hasMdxSitePage("/schemas/versioning")).toBe(true);
    expect(hasMdxSitePage("/operating")).toBe(true);
    expect(hasMdxSitePage("/building-pipelines")).toBe(true);
    expect(hasMdxSitePage("/debugging-infrastructure")).toBe(true);
    expect(hasMdxSitePage("/neotoma-vs-mem0")).toBe(true);
    expect(hasMdxSitePage("/neotoma-vs-zep")).toBe(true);
    expect(hasMdxSitePage("/neotoma-vs-rag")).toBe(true);
    expect(hasMdxSitePage("/neotoma-vs-platform-memory")).toBe(true);
    expect(hasMdxSitePage("/neotoma-vs-files")).toBe(true);
    expect(hasMdxSitePage("/neotoma-vs-database")).toBe(true);
    expect(hasMdxSitePage("/build-vs-buy")).toBe(true);
    expect(hasMdxSitePage("/healthcare")).toBe(true);
    expect(hasMdxSitePage("/government")).toBe(true);
    expect(hasMdxSitePage("/personal-data")).toBe(true);
    expect(hasMdxSitePage("/cases")).toBe(true);
    expect(hasMdxSitePage("/logistics")).toBe(true);
    expect(hasMdxSitePage("/procurement")).toBe(true);
    expect(hasMdxSitePage("/contracts")).toBe(true);
    expect(hasMdxSitePage("/customer-ops")).toBe(true);
    expect(hasMdxSitePage("/crypto-engineering")).toBe(true);
    expect(hasMdxSitePage("/trading")).toBe(true);
    expect(hasMdxSitePage("/agent-auth")).toBe(true);
    expect(hasMdxSitePage("/portfolio")).toBe(true);
    expect(hasMdxSitePage("/diligence")).toBe(true);
    expect(hasMdxSitePage("/financial-ops")).toBe(true);
    expect(hasMdxSitePage("/crm")).toBe(true);
    expect(hasMdxSitePage("/compliance")).toBe(true);
    expect(hasMdxSitePage("/sandbox")).toBe(true);
    expect(hasMdxSitePage("/hosted")).toBe(true);
    expect(hasMdxSitePage("/faq")).toBe(true);
    expect(hasMdxSitePage("/privacy")).toBe(true);
    expect(hasMdxSitePage("/terms")).toBe(true);
    expect(hasMdxSitePage("/")).toBe(true);
    expect(hasMdxSitePage("/not-a-real-route")).toBe(false);
  });

  it("resolves schema-management in English", () => {
    const { bundle, usedFallbackFromLocale } = resolveMdxSitePage("/schema-management", "en");
    expect(bundle.meta.path).toBe("/schema-management");
    expect(usedFallbackFromLocale).toBeNull();
  });

  it("resolves thin hybrid install page for Spanish without fallback", () => {
    const { bundle, usedFallbackFromLocale } = resolveMdxSitePage("/install", "es");
    expect(bundle.meta.locale).toBe("es");
    expect(bundle.meta.translation_of).toBe("/install");
    expect(usedFallbackFromLocale).toBeNull();
  });
});

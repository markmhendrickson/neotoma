import { describe, expect, it } from "vitest";
import {
  inferSourcePreviewKind,
  sourceContentActionLabel,
  sourceDisplaySummary,
  sourceDisplayTitle,
  sourceKindLabel,
  sourcePreviewChips,
} from "./source_display";
import type { Source } from "@/types/api";

function source(overrides: Partial<Source>): Source {
  return {
    id: "4e22057c-1234-5678-9012-source",
    ...overrides,
  };
}

describe("source_display", () => {
  it("labels JSON sources without exposing hashes as the primary title", () => {
    const s = source({ mime_type: "application/json", file_size: 2252 });

    expect(inferSourcePreviewKind(s)).toBe("json");
    expect(sourceKindLabel(s)).toBe("JSON source");
    expect(sourceDisplayTitle(s)).toBe("JSON source 4e22057c-1…");
    expect(sourceDisplaySummary(s)).toBe("JSON source · application/json · 2.2 KB");
    expect(sourceContentActionLabel(s)).toBe("View JSON");
  });

  it("prefers filenames and provenance summaries when present", () => {
    const s = source({
      original_filename: "meeting_notes.md",
      mime_type: "text/markdown",
      provenance: { summary: "Transcript from the May planning meeting." },
    });

    expect(sourceDisplayTitle(s)).toBe("meeting_notes.md");
    expect(sourceDisplaySummary(s)).toBe("Transcript from the May planning meeting.");
  });

  it("builds concise chips with kind, size, date, mime, and hash", () => {
    const chips = sourcePreviewChips(
      source({
        mime_type: "application/pdf",
        file_size: 1024 * 1024,
        created_at: "2026-03-05T10:30:00.000Z",
        content_hash: "abcdef0123456789abcdef0123456789",
      }),
    );

    expect(chips).toEqual([
      "PDF source",
      "1.0 MB",
      "Created 2026-03-05",
      "application/pdf",
      "Hash abcdef012345…",
    ]);
  });
});

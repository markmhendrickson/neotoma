/** Homepage FAQ accordion preview (mirrors `frontend/src/i18n/locales/home_body_en.ts` `faqPreview`). */

export interface FaqPreviewItem {
  question: string;
  answer: string;
}

export const FAQ_PREVIEW_ITEMS: FaqPreviewItem[] = [
  {
    question: "Platform memory (Claude, ChatGPT) is good enough - why add another tool?",
    answer:
      "Platform memory stores what one vendor decides to remember, in a format you can't inspect or export. It doesn't version, doesn't detect conflicts, and vanishes if you switch tools. Neotoma gives you structured, cross-tool memory you control.",
  },
  {
    question: "Can't I just build this with SQLite or a JSON file?",
    answer:
      "You can start there - many teams do. But you'll eventually need versioning, conflict detection, schema evolution, and cross-tool sync. That's months of infrastructure work. Neotoma ships those guarantees on day one.",
  },
  {
    question: "Is this production-ready?",
    answer:
      "Neotoma is in developer preview — used daily by real agent workflows. The core guarantees (deterministic memory, versioned history, append-only change log) are stable. Install in 5 minutes and let your agent evaluate the fit.",
  },
  {
    question: "Does Neotoma replace Claude's memory or ChatGPT's?",
    answer:
      "No — it works alongside them. Platform memory stores what one vendor decides to remember within that vendor's tool. Neotoma stores facts you control across all your tools. Keep using platform memory for quick context; use Neotoma when you need versioning, auditability, and cross-tool consistency.",
  },
  {
    question: "Does Neotoma send my data to the cloud?",
    answer:
      "No. Neotoma runs locally by default. Your data stays on your machine in a local SQLite database. There is no cloud sync, no telemetry, and no training on your data unless you choose to expose the API (for example for remote MCP clients).",
  },
  {
    question: "What's the difference between RAG memory and deterministic memory?",
    answer:
      "RAG stores text chunks and retrieves them by similarity. Neotoma stores structured facts and builds a versioned history for each one; the same inputs always produce the same result. RAG optimizes relevance; deterministic memory optimizes integrity, versioning, and auditability.",
  },
  {
    question: "Does the memory degrade or drift over time?",
    answer:
      "No. Neotoma uses an append-only observation log with deterministic reducers. Nothing is overwritten or silently dropped. Facts stored six months ago are as retrievable and verifiable as facts stored today — with full version history and provenance intact. The memory compounds; it never decays.",
  },
];

export { FAQ_SITE_PATH as FAQ_PAGE_PATH } from "@/lib/site_page";

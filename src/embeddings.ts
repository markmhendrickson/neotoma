import OpenAI from "openai";
import { config } from "./config.js";

const openai = config.openaiApiKey
  ? new OpenAI({ apiKey: config.openaiApiKey })
  : null;

/**
 * Generate an embedding vector from text.
 *
 * Supports multiple providers (priority order):
 * 1. OpenAI (if DEV_OPENAI_API_KEY or PROD_OPENAI_API_KEY is set) - uses text-embedding-3-small (1536 dimensions)
 * 2. Future: Add support for Cohere, Hugging Face, local models, etc.
 *
 * Returns null if no provider is configured.
 */
export async function generateEmbedding(
  text: string,
): Promise<number[] | null> {
  // OpenAI provider
  if (openai) {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
      });

      const embedding = response.data[0]?.embedding;
      if (embedding && embedding.length === 1536) {
        return embedding;
      }
      console.error(
        "Invalid embedding dimensions from OpenAI:",
        embedding?.length,
      );
      return null;
    } catch (error) {
      console.error("Error generating embedding with OpenAI:", error);
      return null;
    }
  }

  // Future: Add other providers here
  // - Cohere: cohere.createClient({ apiKey: config.cohereApiKey })
  // - Hugging Face: fetch('https://api-inference.huggingface.co/...')
  // - Local Ollama: fetch('http://localhost:11434/api/embeddings')
  // - Sentence Transformers via local API

  return null;
}

/**
 * Generate embedding text from a record's properties and type.
 * This creates a searchable text representation for semantic search.
 */
export function getRecordText(
  type: string,
  properties: Record<string, unknown>,
): string {
  const propsText = JSON.stringify(properties);
  return `${type} ${propsText}`;
}

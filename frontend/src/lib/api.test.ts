import { describe, expect, it, vi, beforeEach } from 'vitest';
import { generateEmbedding } from './api';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

describe('api client', () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
    // Mock window for Node.js test environment
    if (typeof window === 'undefined') {
      (globalThis as any).window = {
        location: { origin: 'http://localhost:3000' },
      };
    }
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (typeof originalWindow === 'undefined') {
      delete (globalThis as any).window;
    }
  });

  describe('generateEmbedding', () => {
    it('returns embedding when API call succeeds', async () => {
      const mockEmbedding = Array.from({ length: 1536 }, () => 0.1);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ embedding: mockEmbedding }),
      });

      const result = await generateEmbedding('http://localhost:8080', 'test-token', 'document', { title: 'Test' });

      expect(result).toEqual(mockEmbedding);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/generate_embedding'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ type: 'document', properties: { title: 'Test' } }),
        })
      );
    });

    it('returns null when OpenAI is not configured (503)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: 'OpenAI API key is not configured' }),
      });

      const result = await generateEmbedding('http://localhost:8080', 'test-token', 'document', { title: 'Test' });

      expect(result).toBeNull();
    });

    it('returns null on network errors', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      const result = await generateEmbedding('http://localhost:8080', 'test-token', 'document', { title: 'Test' });

      expect(result).toBeNull();
    });

    it('returns null on unauthorized errors', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

      const result = await generateEmbedding('http://localhost:8080', 'test-token', 'document', { title: 'Test' });

      expect(result).toBeNull();
    });

    it('returns null when response has no embedding', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}), // No embedding field
      });

      const result = await generateEmbedding('http://localhost:8080', 'test-token', 'document', { title: 'Test' });

      expect(result).toBeNull();
    });
  });
});




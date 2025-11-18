import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import type { Application } from 'express';
import { supabase } from './db.js';

let testApp: Application;

const createBearerToken = () => Buffer.from(randomBytes(32)).toString('base64url');

describe('HTTP actions endpoints', () => {
  let server: ReturnType<Application['listen']> | null = null;
  let baseUrl = '';
  let bearerToken = '';

  beforeAll(async () => {
    const originalAutostart = process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART;
    process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART = '1';
    const actionsModule = await import('./actions.js');
    testApp = actionsModule.app;
    if (originalAutostart === undefined) {
      delete process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART;
    } else {
      process.env.NEOTOMA_ACTIONS_DISABLE_AUTOSTART = originalAutostart;
    }
    server = testApp.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    bearerToken = createBearerToken();
  });

  afterAll(() => {
    server?.close();
  });

  it('retrieves records explicitly by ids in the provided order', async () => {
    const inserts = [
      { type: 'chat_test_alpha', properties: { label: 'first' } },
      { type: 'chat_test_alpha', properties: { label: 'second' } },
    ];
    const { data } = await supabase.from('records').insert(inserts).select();
    expect(data).toBeTruthy();
    const [first, second] = data!;

    const response = await fetch(`${baseUrl}/retrieve_records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({ ids: [second.id, first.id] }),
    });

    expect(response.status).toBe(200);
    const records = (await response.json()) as Array<{ id: string; properties: Record<string, unknown> }>;
    expect(records).toHaveLength(2);
    expect(records[0].id).toBe(second.id);
    expect(records[1].id).toBe(first.id);

    await supabase.from('records').delete().in('id', [first.id, second.id]);
  });

  it('uses recent_records for chat follow-ups without extra search terms', async () => {
    const { data: created } = await supabase
      .from('records')
      .insert({
        type: 'chat_recent_record',
        properties: { title: 'Inline session record' },
      })
      .select()
      .single();
    expect(created).toBeTruthy();

    const openAIResponses = [
      {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              function_call: {
                name: 'retrieve_records',
                arguments: JSON.stringify({ ids: [created!.id], limit: 1 }),
              },
            },
          },
        ],
      },
      {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Here is the record you just added.',
            },
          },
        ],
      },
    ];

    const originalFetch = globalThis.fetch;
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('api.openai.com/v1/chat/completions')) {
          const payload = openAIResponses.shift();
          if (!payload) {
            throw new Error('No stubbed OpenAI response remaining');
          }
          return Promise.resolve(
            new Response(JSON.stringify(payload), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        }
        return originalFetch(input as any, init);
      });

    try {
      const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'tell me about it' }],
          recent_records: [{ id: created!.id, persisted: true }],
        }),
      });

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.records_queried?.[0]?.id).toBe(created!.id);
      expect(openAIResponses).toHaveLength(0);
    } finally {
      fetchSpy.mockRestore();
      await supabase.from('records').delete().eq('id', created!.id);
    }
  });
});


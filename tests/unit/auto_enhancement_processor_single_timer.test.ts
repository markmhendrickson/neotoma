/**
 * The auto-enhancement processor is one process-wide timer, not one per MCP
 * session.
 *
 * Regression: `NeotomaServer.runHTTP` started a fresh 30 s `setInterval` for
 * every MCP session and nothing ever cleared it, so a long-lived HTTP server
 * accumulated one timer (and one DB poll every 30 s) per session ever opened.
 * Hosted logs showed 18 processor starts and 0 stops.
 *
 * Only `setInterval`/`clearInterval` are faked, so `vi.getTimerCount()` counts
 * intervals created during the test and nothing else.
 */

import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { NeotomaServer } from "../../src/server.js";
import { db } from "../../src/db.js";
import {
  isAutoEnhancementProcessorRunning,
  startAutoEnhancementProcessor,
  stopAutoEnhancementProcessor,
} from "../../src/services/auto_enhancement_processor.js";

const SESSIONS = 5;
const PROCESSOR_INTERVAL_MS = 30_000;

/** Count `db.from("auto_enhancement_queue")` calls: one per processor tick on an empty queue. */
function spyOnQueuePolls() {
  const emptyQuery: any = {
    select: () => emptyQuery,
    in: () => emptyQuery,
    order: () => emptyQuery,
    limit: () => Promise.resolve({ data: [], error: null }),
  };
  let polls = 0;
  const original = db.from.bind(db);
  vi.spyOn(db, "from").mockImplementation(((table: string) => {
    if (table === "auto_enhancement_queue") {
      polls++;
      return emptyQuery;
    }
    return original(table);
  }) as any);
  return () => polls;
}

async function openAndCloseSession(): Promise<void> {
  const server = new NeotomaServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  await server.runHTTP(transport);
  await transport.close();
}

describe("auto-enhancement processor: one timer per process", () => {
  beforeEach(() => {
    stopAutoEnhancementProcessor();
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  });

  afterEach(() => {
    stopAutoEnhancementProcessor();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("opening and closing several MCP sessions leaves exactly one interval", async () => {
    await openAndCloseSession();
    expect(vi.getTimerCount()).toBe(1);

    for (let i = 1; i < SESSIONS; i++) {
      await openAndCloseSession();
    }

    expect(vi.getTimerCount()).toBe(1);
    // The processor serves REST stores too, so it keeps running with no session open.
    expect(isAutoEnhancementProcessorRunning()).toBe(true);
  });

  it("polls the queue once per tick however many sessions were opened", async () => {
    const polls = spyOnQueuePolls();
    for (let i = 0; i < SESSIONS; i++) {
      await openAndCloseSession();
    }

    await vi.advanceTimersByTimeAsync(PROCESSOR_INTERVAL_MS);
    expect(polls()).toBe(1);

    await vi.advanceTimersByTimeAsync(PROCESSOR_INTERVAL_MS);
    expect(polls()).toBe(2);
  });

  it("start is idempotent and stop clears the shared timer", () => {
    const stopA = startAutoEnhancementProcessor(PROCESSOR_INTERVAL_MS);
    const stopB = startAutoEnhancementProcessor(PROCESSOR_INTERVAL_MS);
    expect(vi.getTimerCount()).toBe(1);
    expect(stopA).toBe(stopB);

    stopA();
    expect(vi.getTimerCount()).toBe(0);
    expect(isAutoEnhancementProcessorRunning()).toBe(false);

    // Stopping twice is harmless, and a later start works again.
    stopB();
    startAutoEnhancementProcessor(PROCESSOR_INTERVAL_MS);
    expect(vi.getTimerCount()).toBe(1);
  });
});

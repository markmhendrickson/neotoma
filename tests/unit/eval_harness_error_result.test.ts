import { afterEach, expect, it, vi } from "vitest";
import { replayCassetteAgainstServer } from "../../packages/eval-harness/src/drivers/base.js";
import type { CassetteFile } from "../../packages/eval-harness/src/cassette.js";
import type { DriverInvocation } from "../../packages/eval-harness/src/types.js";

afterEach(() => vi.unstubAllGlobals());

it("retains actual structured HTTP refusals for recovery assertions without canned outputs", async () => {
  const body = {
    error_code: "ERR_ARRAY_ITEM_CONFLICT",
    message: "Stale item version",
    details: { current_item: { status: "committed" }, current_item_version: "actual-version" },
  };
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 409 }));
  vi.stubGlobal("fetch", fetch);
  const result = await replayCassetteAgainstServer(
    { neotomaBaseUrl: "http://localhost:0", neotomaToken: "synthetic" } as DriverInvocation,
    {
      meta: {
        format_version: 1,
        scenario_id: "refusal",
        provider: "stub",
        model: "replay-only",
        instruction_profile: "auto",
        recorded_at: "2026-10-08T00:00:00Z",
      },
      user_prompt: "synthetic",
      tool_calls: [
        {
          name: "patch_array_item",
          input: { field: "tasks_claimed" },
          output: { canned: true },
          sequence: 0,
        },
      ],
      assistant_text: "",
    } as CassetteFile,
    { invoke: vi.fn() } as never
  );
  expect(fetch).toHaveBeenCalledOnce();
  expect(result.toolCalls[0].error).toContain("returned status 409");
  expect(result.toolCalls[0].output).toEqual({
    error: { message: result.toolCalls[0].error, response: body },
  });
});

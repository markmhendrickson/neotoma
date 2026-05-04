import { describe, expect, it } from "vitest";

import {
  NeotomaPlugin,
  neotoma,
  neotomaPlugin,
  type NeotomaOpenCodeOptions,
} from "../../packages/opencode-plugin/src/index.js";
import type {
  CreateRelationshipInput,
  ListTimelineEventsInput,
  RetrieveEntityByIdentifierInput,
  StoreInput,
  StoreResult,
} from "../../packages/client/src/types.js";

function makeClient() {
  const stores: StoreInput[] = [];
  const relationships: CreateRelationshipInput[] = [];

  const client: NonNullable<NeotomaOpenCodeOptions["client"]> = {
    async store(input: StoreInput): Promise<StoreResult> {
      stores.push(input);
      return {
        entities: (input.entities ?? []).map((entity, index) => ({
          entity_id: `ent_${stores.length}_${index}`,
          entity_type: entity.entity_type,
        })),
      };
    },
    async retrieveEntityByIdentifier(
      _input: RetrieveEntityByIdentifierInput
    ): Promise<unknown> {
      return null;
    },
    async listTimelineEvents(_input: ListTimelineEventsInput): Promise<unknown> {
      return null;
    },
    async createRelationship(input: CreateRelationshipInput): Promise<unknown> {
      relationships.push(input);
      return { ok: true };
    },
  };

  return { client, stores, relationships };
}

describe("opencode plugin", () => {
  it("stores session anchors with the required conversation identity", async () => {
    const { client, stores } = makeClient();
    const hooks = neotomaPlugin({ client, cwd: "/repo" });

    await hooks["session.started"]({
      session: { id: "sess_1", title: "Build plugin" },
    });

    expect(stores[0].entities?.[0]).toMatchObject({
      entity_type: "conversation",
      conversation_id: "sess_1",
      session_id: "sess_1",
      title: "Build plugin",
      harness: "opencode",
      cwd: "/repo",
    });
  });

  it("stores user messages with their conversation and PART_OF edge", async () => {
    const { client, stores } = makeClient();
    const hooks = neotomaPlugin({ client, cwd: "/repo", injectContext: false });

    await hooks["message.user"]({
      session: { id: "sess_2" },
      message: { id: "turn_1", text: "Remember @alice" },
      model: "gpt-5.5-medium",
    });

    expect(stores[0].entities?.map((entity) => entity.entity_type)).toEqual([
      "conversation",
      "conversation_message",
    ]);
    expect(stores[0].entities?.[0]).toMatchObject({
      conversation_id: "sess_2",
    });
    expect(stores[0].entities?.[1]).toMatchObject({
      role: "user",
      sender_kind: "user",
      turn_key: "sess_2:turn_1",
      content: "Remember @alice",
    });
    expect(stores[0].relationships).toEqual([
      { relationship_type: "PART_OF", source_index: 1, target_index: 0 },
    ]);
  });

  it("supports the current OpenCode plugin function contract", async () => {
    const { client, stores } = makeClient();
    const plugin = neotoma({ client });
    const hooks = await plugin({ directory: "/workspace" });

    await hooks.event({
      event: {
        type: "session.created",
        session: { id: "sess_3", title: "OpenCode npm plugin" },
      },
    });

    expect(stores[0].entities?.[0]).toMatchObject({
      entity_type: "conversation",
      conversation_id: "sess_3",
      cwd: "/workspace",
    });
  });

  it("exposes a named OpenCode plugin and compaction hook", async () => {
    const { client, stores } = makeClient();
    const hooks = await NeotomaPlugin({ directory: "/workspace" });
    const injected = { context: [] as string[] };

    await neotomaPlugin({ client, cwd: "/workspace" })[
      "experimental.session.compacting"
    ]({ session: { id: "sess_4" }, model: "composer-2-fast" }, injected);

    expect(typeof hooks.event).toBe("function");
    expect(injected.context[0]).toContain("Neotoma turn must-do");
    expect(stores.some((store) => store.entities?.[0]?.entity_type === "context_event")).toBe(
      true
    );
  });
});

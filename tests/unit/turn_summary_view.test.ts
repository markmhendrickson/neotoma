/**
 * Turn-summary card data and its server-rendered fallback text.
 *
 * The text is rendered from the card, never from the raw groups, so these
 * tests pin each group's rendering, the truncation rule, the empty case, and
 * that every row the card shows appears in the text in the same order.
 */
import { describe, expect, it } from "vitest";
import {
  TURN_SUMMARY_GROUPS,
  buildTurnSummaryCard,
  iconForEntityType,
  renderTurnSummaryFallbackText,
  sanitizeTurnSummaryLabel,
  type BuildTurnSummaryCardInput,
  type TurnSummaryCard,
  type TurnSummaryViewEntity,
} from "../../src/services/turn_summary_view.js";

const ORIGIN = "https://neotoma.example.com";

function entity(
  id: string,
  type: string,
  label?: string,
  identity_rule?: string
): TurnSummaryViewEntity {
  return { entity_id: id, entity_type: type, label: label ?? null, identity_rule };
}

function input(overrides: Partial<BuildTurnSummaryCardInput> = {}): BuildTurnSummaryCardInput {
  return {
    created: [],
    updated: [],
    retrieved: [],
    ambiguous: [],
    origin: ORIGIN,
    conversation_entity_id: "ent_conv",
    conversation_label: "Weekly planning",
    turn_number: 3,
    ...overrides,
  };
}

function render(overrides: Partial<BuildTurnSummaryCardInput> = {}): {
  card: TurnSummaryCard;
  text: string;
} {
  const card = buildTurnSummaryCard(input(overrides));
  return { card, text: renderTurnSummaryFallbackText(card) };
}

describe("turn summary fallback text", () => {
  it("renders the header naming the instance host and linking the conversation", () => {
    const { text } = render({ created: [entity("ent_1", "task", "Buy bread")] });
    expect(text.split("\n")[0]).toBe(
      `🧠 Neotoma · neotoma.example.com — [Weekly planning](${ORIGIN}/conversations/ent_conv)`
    );
  });

  it("prefers an explicit instance name over the host", () => {
    const { text } = render({
      created: [entity("ent_1", "task", "Buy bread")],
      instance_name: "home",
    });
    expect(text.split("\n")[0]).toMatch(/^🧠 Neotoma · home — /);
  });

  it.each([
    ["created", "Created"],
    ["updated", "Updated"],
    ["retrieved", "Retrieved"],
  ] as const)("renders the %s group with count, icon, label and entity link", (key, label) => {
    const { text, card } = render({
      [key]: [entity("ent_1", "task", "Buy bread"), entity("ent_2", "contact", "Ada")],
    });
    expect(card.groups.map((g) => g.key)).toEqual([key]);
    expect(text).toBe(
      [
        `🧠 Neotoma · neotoma.example.com — [Weekly planning](${ORIGIN}/conversations/ent_conv)`,
        `**${label} (2)**`,
        `- ✅ Buy bread ([task](${ORIGIN}/entities/ent_1))`,
        `- 👤 Ada ([contact](${ORIGIN}/entities/ent_2))`,
      ].join("\n")
    );
  });

  it("renders the ambiguous group with the identity_rule suffix", () => {
    const { text } = render({
      ambiguous: [entity("ent_9", "contact", "Sam", "name_key:name")],
    });
    expect(text.split("\n").slice(1)).toEqual([
      "**Ambiguous (1)**",
      `- 👤 Sam ([contact](${ORIGIN}/entities/ent_9)) — heuristic match via identity_rule "name_key:name"`,
    ]);
  });

  it("lists an ambiguous entity only under Ambiguous, never also under Created/Updated", () => {
    const sam = entity("ent_9", "contact", "Sam", "name_key:name");
    const { card } = render({ updated: [sam], ambiguous: [sam] });
    expect(card.groups.map((g) => g.key)).toEqual(["ambiguous"]);
  });

  it("orders groups Created, Updated, Retrieved, Ambiguous and omits empty ones", () => {
    const { card, text } = render({
      ambiguous: [entity("a", "note", "A")],
      retrieved: [entity("r", "note", "R")],
      created: [entity("c", "note", "C")],
    });
    expect(card.groups.map((g) => g.label)).toEqual(["Created", "Retrieved", "Ambiguous"]);
    expect(text).not.toContain("Updated");
    expect(TURN_SUMMARY_GROUPS.map((g) => g.label)).toEqual([
      "Created",
      "Updated",
      "Retrieved",
      "Ambiguous",
    ]);
  });

  it("truncates to five rows across groups, keeps full counts, and adds one 'N more' line", () => {
    const many = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => entity(`${prefix}${i}`, "task", `${prefix} ${i}`));
    const { card, text } = render({ created: many("c", 3), updated: many("u", 4) });
    expect(card.total_count).toBe(7);
    expect(card.shown_count).toBe(5);
    expect(card.groups.map((g) => [g.label, g.count, g.items.length])).toEqual([
      ["Created", 3, 3],
      ["Updated", 4, 2],
    ]);
    const lines = text.split("\n");
    expect(lines.filter((l) => l.startsWith("- "))).toHaveLength(5);
    expect(lines).toContain("**Updated (4)**");
    expect(lines[lines.length - 1]).toBe(
      `… 2 more — [full activity in Inspector](${ORIGIN}/conversations/ent_conv#msg-3)`
    );
  });

  it("omits a later group whose rows the budget used up, counting them under 'more'", () => {
    const many = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => entity(`${prefix}${i}`, "task", `${prefix} ${i}`));
    const { card, text } = render({ created: many("c", 5), retrieved: many("r", 2) });
    expect(card.groups.map((g) => [g.label, g.items.length])).toEqual([["Created", 5]]);
    expect(card.total_count).toBe(7);
    expect(text).not.toContain("Retrieved");
    expect(text.split("\n").pop()).toMatch(/^… 2 more — /);
  });

  it("still renders the header and 'more' line when the budget is zero", () => {
    const { card, text } = render({ created: [entity("c", "task", "C")], max_items: 0 });
    expect(card.groups).toEqual([]);
    expect(text.split("\n")).toHaveLength(2);
    expect(text).toMatch(/… 1 more — /);
  });

  it("strips control characters and newlines from entity types", () => {
    const { text, card } = render({
      created: [entity("ent_1", "bad\u001b[2Jtype\nnext", "Label")],
    });
    expect(card.groups[0].items[0].entity_type).toBe("bad [2Jtype next");
    expect(text).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f]/);
    expect(text.split("\n")).toHaveLength(3);
  });

  it("returns an empty string when nothing besides chat bookkeeping was touched", () => {
    expect(render().text).toBe("");
    expect(
      render({
        created: [entity("ent_c", "conversation", "Chat")],
        updated: [entity("ent_m", "conversation_message", "hi")],
        retrieved: [entity("ent_a", "agent_message", "hello")],
      }).text
    ).toBe("");
  });

  it("renders without links, and without guessing a host, when no origin is known", () => {
    const { text, card } = render({
      origin: null,
      created: [entity("ent_1", "task", "Buy bread")],
    });
    expect(card.header.instance).toBeNull();
    expect(text).toBe(
      ["🧠 Neotoma — Weekly planning", "**Created (1)**", "- ✅ Buy bread (task)"].join("\n")
    );
    expect(text).not.toMatch(/https?:/);
  });

  it("rejects non-http origins rather than linking to them", () => {
    const { text } = render({
      origin: "javascript:alert(1)",
      created: [entity("ent_1", "task", "x")],
    });
    expect(text).not.toContain("javascript");
  });

  it("is terminal-safe: strips control and bidi characters and escapes markdown", () => {
    const { text } = render({
      created: [entity("ent_1", "note", "evil\u001b[31m red\nnext\u202e line [x](http://bad) *b*")],
    });
    expect(text).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f\u202e]/);
    const row = text.split("\n")[2];
    expect(row).toContain("\\[x\\](http://bad) \\*b\\*");
    expect(row.split("\n")).toHaveLength(1);
  });

  it("caps long labels", () => {
    expect(sanitizeTurnSummaryLabel("x".repeat(200)).length).toBe(80);
  });

  it("falls back to the entity_type when an entity has no label", () => {
    const { text } = render({ created: [entity("ent_1", "receipt")] });
    expect(text).toContain(`- 🧾 receipt ([receipt](${ORIGIN}/entities/ent_1))`);
  });

  it("uses the shared icon map, with a default for unknown types", () => {
    expect(iconForEntityType("issue")).toBe("🐛");
    expect(iconForEntityType("some_new_type")).toBe("🗂️");
  });

  it("adds the issues review line when issues were flagged", () => {
    const { text } = render({
      created: [entity("ent_i", "issue", "Store drops field")],
      issues_count: 1,
    });
    expect(text.split("\n").pop()).toBe(
      `🐛 [1 issue flagged this turn — review in Inspector](${ORIGIN}/issues)`
    );
  });
});

describe("turn summary card / text parity", () => {
  /** Strip the markdown the text renderer adds, leaving the card's words. */
  function plain(line: string): string {
    return line
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^\*\*(.*)\*\*$/, "$1")
      .replace(/^- /, "")
      .replace(/\\(.)/g, "$1");
  }

  /** The rows a card shows, in order, as the card itself words them. */
  function cardLines(card: TurnSummaryCard): string[] {
    if (card.groups.length === 0) return [];
    const header = [
      `${card.header.icon} ${card.header.title}`,
      card.header.instance ? ` · ${card.header.instance}` : "",
      card.header.conversation_label ? ` — ${card.header.conversation_label}` : "",
    ].join("");
    const lines = [header];
    for (const g of card.groups) {
      lines.push(`${g.label} (${g.count})`);
      for (const item of g.items) {
        lines.push(
          `${item.icon} ${item.label} (${item.entity_type})${item.note ? ` — ${item.note}` : ""}`
        );
      }
    }
    if (card.more) lines.push(`… ${card.more.count} more — ${card.more.label}`);
    if (card.issues) lines.push(`🐛 ${card.issues.label}`);
    return lines;
  }

  const cases: Array<[string, Partial<BuildTurnSummaryCardInput>]> = [
    ["empty", {}],
    [
      "one of each group",
      {
        created: [entity("c", "task", "Task C")],
        updated: [entity("u", "contact", "Contact U")],
        retrieved: [entity("r", "event", "Event R")],
        ambiguous: [entity("a", "company", "Co A", "name_key:name")],
        issues_count: 2,
      },
    ],
    [
      "truncated",
      {
        created: Array.from({ length: 9 }, (_, i) => entity(`c${i}`, "note", `Note *${i}*`)),
      },
    ],
    ["no origin", { origin: null, retrieved: [entity("r", "file_asset", "scan.pdf")] }],
  ];

  it.each(cases)("text and card carry the same rows in the same order (%s)", (_name, overrides) => {
    const { card, text } = render(overrides);
    const textLines = text === "" ? [] : text.split("\n").map(plain);
    expect(textLines).toEqual(cardLines(card));
  });
});

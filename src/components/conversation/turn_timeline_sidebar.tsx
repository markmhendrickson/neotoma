/**
 * FU-2026-05-003: turn timeline sidebar.
 *
 * Scrollable list of turns for the Inspector conversation page. Each item
 * shows turn number, role, stored/retrieved/issue counts, and deep-links to
 * the corresponding `#msg-N` anchor.
 */

import type { ConversationTurnIndex, ConversationTurnIndexTurn } from "@/types/api";

function roleIcon(role: string): string {
  const r = role.toLowerCase();
  if (r === "user") return "👤";
  if (r === "assistant") return "🤖";
  if (r === "agent") return "🛠";
  if (r === "system") return "⚙";
  if (r === "tool") return "🔧";
  return "💬";
}

function turnAnchorId(turnNumber: number, kind: "msg" | "stored" | "retrieved" | "issues") {
  return `${kind}-${turnNumber}`;
}

function CountChip({ label, count }: { label: string; count: number }) {
  if (count === 0) return null;
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {label} {count}
    </span>
  );
}

function TurnRow({ turn }: { turn: ConversationTurnIndexTurn }) {
  return (
    <a
      href={`#${turnAnchorId(turn.turn_number, "msg")}`}
      className="block rounded-md border bg-card p-2 hover:bg-accent hover:text-accent-foreground"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span aria-hidden>{roleIcon(turn.role)}</span>
          <span>Turn {turn.turn_number}</span>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {turn.role}
        </span>
      </div>
      {turn.content_preview ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{turn.content_preview}</p>
      ) : null}
      <div className="mt-1 flex flex-wrap gap-1">
        <CountChip label="stored" count={turn.stored.length} />
        <CountChip label="retrieved" count={turn.retrieved.length} />
        <CountChip label="issues" count={turn.issues.length} />
      </div>
    </a>
  );
}

export function TurnTimelineSidebar({
  index,
  className,
}: {
  index: ConversationTurnIndex;
  className?: string;
}) {
  if (index.turns.length === 0) {
    return (
      <aside
        className={
          "rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground " + (className ?? "")
        }
      >
        No turns in this conversation yet.
      </aside>
    );
  }
  return (
    <aside
      className={"flex flex-col gap-2 " + (className ?? "")}
      aria-label="Turn timeline"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Turns ({index.turns.length})
      </h3>
      <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto pr-1">
        {index.turns.map((turn) => (
          <TurnRow key={turn.message_entity_id} turn={turn} />
        ))}
      </div>
    </aside>
  );
}

export { turnAnchorId };

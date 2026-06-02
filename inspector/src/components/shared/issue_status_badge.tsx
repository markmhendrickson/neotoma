import { Badge } from "@/components/ui/badge";

export function IssueStatusBadge({ status }: { status: string }) {
  const normalized = status.trim().toLowerCase();
  return (
    <Badge variant={normalized === "open" ? "default" : "secondary"} className="shrink-0 capitalize">
      {status || "—"}
    </Badge>
  );
}

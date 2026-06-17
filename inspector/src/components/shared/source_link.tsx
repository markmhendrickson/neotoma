import { Link } from "react-router-dom";
import { cn, truncateId } from "@/lib/utils";

interface SourceLinkProps {
  id: string;
  filename?: string;
  className?: string;
}

export function SourceLink({ id, filename, className }: SourceLinkProps) {
  const shouldTruncate = className?.split(/\s+/).includes("truncate") ?? false;
  return (
    <Link
      to={`/sources/${encodeURIComponent(id)}`}
      className={cn(
        "min-w-0 max-w-full text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline",
        shouldTruncate ? "inline-block align-bottom" : "break-words",
        className
      )}
      title={id}
    >
      {filename || truncateId(id)}
    </Link>
  );
}

import { Link } from "react-router-dom";
import { truncateId } from "@/lib/utils";

interface SourceLinkProps {
  id: string;
  filename?: string;
  className?: string;
}

export function SourceLink({ id, filename, className }: SourceLinkProps) {
  return (
    <Link
      to={`/sources/${encodeURIComponent(id)}`}
      className={`text-sm font-medium text-primary hover:underline ${className ?? ""}`}
      title={id}
    >
      {filename || truncateId(id)}
    </Link>
  );
}

import { Link } from "react-router-dom";
import { Folder } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface SubcategoryCardProps {
  categoryKey: string;
  subcategoryKey: string;
  displayName: string;
  description: string | null;
  docCount: number;
}

/**
 * Subcategory tile shown on `/docs/<category>`. Click drills into
 * `/docs/<category>/<subcategory>` to see the flat doc list.
 */
export function SubcategoryCard({
  categoryKey,
  subcategoryKey,
  displayName,
  description,
  docCount,
}: SubcategoryCardProps) {
  return (
    <Link
      to={`/docs/${categoryKey}/${subcategoryKey}`}
      className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`Browse ${displayName} (${docCount} docs)`}
    >
      <Card className="h-full transition-colors group-hover:bg-accent/40">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
          <div className="flex items-start gap-3">
            <Folder className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <CardTitle className="text-sm font-semibold">{displayName}</CardTitle>
          </div>
          <Badge variant="secondary" className="shrink-0 font-mono text-xs">
            {docCount}
          </Badge>
        </CardHeader>
        {description ? (
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">{description}</p>
          </CardContent>
        ) : null}
      </Card>
    </Link>
  );
}

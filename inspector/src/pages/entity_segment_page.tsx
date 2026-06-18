import { Navigate, useParams } from "react-router-dom";
import EntityDetailPage from "@/pages/entity_detail";
import EntitiesPage from "@/pages/entities";
import { isEntityIdSegment } from "@/lib/entity_type_labels";

/** Routes `/entities/:segment` to entity detail or a type-filtered entity list. */
export default function EntitySegmentPage() {
  const { segment } = useParams<{ segment: string }>();
  if (!segment) return <Navigate to="/entities" replace />;

  const decoded = decodeURIComponent(segment);
  if (isEntityIdSegment(decoded)) {
    return <EntityDetailPage />;
  }

  return <EntitiesPage typeSlug={decoded} />;
}

import { Navigate, useParams, useSearchParams } from "react-router-dom";

/** Legacy route: `/entities/:id/timeline` → entity history (observations tab). */
export default function EntityTimelineRedirectPage() {
  const { segment } = useParams<{ segment: string }>();
  const [searchParams] = useSearchParams();
  const layer = searchParams.get("layer");
  const query = layer ? `?layer=${encodeURIComponent(layer)}` : "?layer=observations";
  if (!segment) {
    return <Navigate to="/entities" replace />;
  }
  return (
    <Navigate
      to={`/entities/${encodeURIComponent(segment)}/history${query}`}
      replace
    />
  );
}

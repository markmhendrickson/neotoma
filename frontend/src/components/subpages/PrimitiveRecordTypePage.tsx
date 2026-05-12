import { Navigate, useParams } from "react-router-dom";
import { MdxSitePage } from "./MdxSitePage";
import {
  PRIMITIVE_RECORD_TYPE_GUIDES,
  PRIMITIVE_RECORD_TYPE_GUIDES_LIST,
  PRIMITIVE_RECORD_TYPE_SLUGS,
} from "@/components/primitives/primitive_record_site";

export { PRIMITIVE_RECORD_TYPE_GUIDES_LIST, PRIMITIVE_RECORD_TYPE_SLUGS };

export function PrimitiveRecordTypeRouter() {
  const { slug } = useParams<{ slug: string }>();
  const guide = slug ? PRIMITIVE_RECORD_TYPE_GUIDES.find((g) => g.slug === slug) : undefined;
  if (!slug || !guide) {
    return <Navigate to="/primitives" replace />;
  }
  return <MdxSitePage canonicalPath={`/primitives/${slug}`} detailTitle={guide.label} />;
}

export function PrimitivesIndexPage() {
  return <MdxSitePage canonicalPath="/primitives" detailTitle="Primitive record types" />;
}

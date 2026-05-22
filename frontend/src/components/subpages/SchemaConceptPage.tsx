import { Navigate, useParams } from "react-router-dom";
import { MdxSitePage } from "./MdxSitePage";
import {
  SCHEMA_CONCEPT_GUIDES,
  SCHEMA_CONCEPT_GUIDES_LIST,
  SCHEMA_CONCEPT_SLUGS,
} from "@/components/schemas/schema_concept_site";

export { SCHEMA_CONCEPT_GUIDES_LIST, SCHEMA_CONCEPT_SLUGS };

export function SchemaConceptRouter() {
  const { slug } = useParams<{ slug: string }>();
  const guide = slug ? SCHEMA_CONCEPT_GUIDES.find((g) => g.slug === slug) : undefined;
  if (!slug || !guide) {
    return <Navigate to="/schemas" replace />;
  }
  return <MdxSitePage canonicalPath={`/schemas/${slug}`} detailTitle={guide.label} />;
}

export function SchemasIndexPage() {
  return <MdxSitePage canonicalPath="/schemas" detailTitle="Schemas" />;
}

import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, FileText } from "lucide-react";
import { BrowseBreadcrumbs, type BrowseCrumb } from "@/components/docs/browse_breadcrumbs";
import { CategoryCard } from "@/components/docs/category_card";
import { SubcategoryCard } from "@/components/docs/subcategory_card";
import { DocsMarkdownArticle } from "@/components/docs/docs_markdown_article";
import { DocsPageContentPanel, DocsPageHeader } from "@/components/docs/docs_page_layout";
import { PageShell } from "@/components/layout/page_shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListSkeleton, QueryErrorAlert } from "@/components/shared/query_status";

interface DocFrontmatter {
  title: string;
  summary: string;
  category: string;
  subcategory: string | null;
  order: number;
  featured: boolean;
  visibility: "public" | "internal";
  audience: string;
  tags: string[];
  last_reviewed: string | null;
  deprecated?: boolean;
  superseded_by?: string | null;
  deprecation_reason?: string | null;
}

interface DocEntry {
  slug: string;
  repo_path: string;
  frontmatter: DocFrontmatter;
}

interface SubcategoryGroup {
  key: string;
  display_name: string;
  description: string | null;
  order: number;
  docs: DocEntry[];
}

interface CategoryGroup {
  key: string;
  display_name: string;
  description: string | null;
  order: number;
  subcategories: SubcategoryGroup[];
  uncategorized: DocEntry[];
}

interface DocsIndex {
  categories: CategoryGroup[];
  featured: DocEntry[];
  total: number;
}

interface ResolvedDoc extends DocEntry {
  body: string;
}

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) {
    throw new Error(`Request failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function useDocsIndex() {
  return useQuery({
    queryKey: ["docs-index"],
    queryFn: ({ signal }) => fetchJson<DocsIndex>("/docs?format=json", signal),
    staleTime: 60_000,
  });
}

/** Count of all docs in a category, including uncategorized + every subcategory. */
function categoryDocCount(cat: CategoryGroup): number {
  return cat.uncategorized.length + cat.subcategories.reduce((acc, s) => acc + s.docs.length, 0);
}

function DocCard({ doc }: { doc: DocEntry }) {
  return (
    <Link
      to={`/docs/${doc.slug}`}
      className="block rounded-lg border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:bg-accent/40"
      data-testid="doc-card"
    >
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{doc.frontmatter.title}</h3>
          {doc.frontmatter.summary ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{doc.frontmatter.summary}</p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function DocList({ docs }: { docs: DocEntry[] }) {
  if (docs.length === 0) return null;
  return (
    <div className="grid gap-2">
      {docs.map((doc) => (
        <DocCard key={doc.repo_path} doc={doc} />
      ))}
    </div>
  );
}

/**
 * `/docs` — top-level category grid. Per the docs cleanup plan
 * (.cursor/plans/docs_cleanup_taxonomy_hierarchy_105345ad.plan.md), no
 * individual doc cards render here; users drill into a category to see
 * subcategories, then into a subcategory to see docs.
 */
function IndexPage() {
  const docs = useDocsIndex();

  const categories = docs.data?.categories ?? [];

  return (
    <PageShell title="Documentation">
      <div className="space-y-4">
        <DocsPageHeader
          title="Documentation"
          description="Browse the bundled markdown docs served by this Neotoma server. Pick a category to drill in."
        />
        {docs.isLoading ? (
          <ListSkeleton rows={8} />
        ) : docs.error ? (
          <QueryErrorAlert title="Could not load docs index">
            {docs.error instanceof Error ? docs.error.message : String(docs.error)}
          </QueryErrorAlert>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="docs-category-grid">
            {categories.map((cat) => (
              <CategoryCard
                key={cat.key}
                categoryKey={cat.key}
                displayName={cat.display_name}
                description={cat.description}
                docCount={categoryDocCount(cat)}
              />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

/**
 * `/docs/<categoryKey>` — subcategories within a category, plus any
 * docs the manifest assigned to the category root (`uncategorized`).
 */
function CategoryPage({ categoryKey }: { categoryKey: string }) {
  const docs = useDocsIndex();

  const category = useMemo(
    () => docs.data?.categories.find((c) => c.key === categoryKey) ?? null,
    [docs.data, categoryKey],
  );

  const crumbs: BrowseCrumb[] = [
    { label: "Documentation", href: "/docs" },
    { label: category?.display_name ?? categoryKey },
  ];

  return (
    <PageShell title={category?.display_name ?? "Documentation"}>
      <div className="space-y-4">
        <BrowseBreadcrumbs crumbs={crumbs} />
        <DocsPageHeader
          title={category?.display_name ?? categoryKey}
          description={category?.description ?? undefined}
        />
        {docs.isLoading ? (
          <ListSkeleton rows={6} />
        ) : docs.error ? (
          <QueryErrorAlert title="Could not load docs index">
            {docs.error instanceof Error ? docs.error.message : String(docs.error)}
          </QueryErrorAlert>
        ) : !category ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No docs in this category yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {category.subcategories.length > 0 ? (
              <div
                className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
                data-testid="docs-subcategory-grid"
              >
                {category.subcategories.map((sub) => (
                  <SubcategoryCard
                    key={sub.key}
                    categoryKey={category.key}
                    subcategoryKey={sub.key}
                    displayName={sub.display_name}
                    description={sub.description}
                    docCount={sub.docs.length}
                  />
                ))}
              </div>
            ) : null}
            {category.uncategorized.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Other</CardTitle>
                </CardHeader>
                <CardContent>
                  <DocList docs={category.uncategorized} />
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}
      </div>
    </PageShell>
  );
}

/**
 * `/docs/<categoryKey>/<subcategoryKey>` — flat doc list for one subcategory.
 */
function SubcategoryPage({
  categoryKey,
  subcategoryKey,
}: {
  categoryKey: string;
  subcategoryKey: string;
}) {
  const docs = useDocsIndex();

  const category = useMemo(
    () => docs.data?.categories.find((c) => c.key === categoryKey) ?? null,
    [docs.data, categoryKey],
  );
  const subcategory = useMemo(
    () => category?.subcategories.find((s) => s.key === subcategoryKey) ?? null,
    [category, subcategoryKey],
  );

  const crumbs: BrowseCrumb[] = [
    { label: "Documentation", href: "/docs" },
    { label: category?.display_name ?? categoryKey, href: `/docs/${categoryKey}` },
    { label: subcategory?.display_name ?? subcategoryKey },
  ];

  return (
    <PageShell title={subcategory?.display_name ?? "Documentation"}>
      <div className="space-y-4">
        <BrowseBreadcrumbs crumbs={crumbs} />
        <DocsPageHeader
          title={subcategory?.display_name ?? subcategoryKey}
          description={subcategory?.description ?? undefined}
        />
        {docs.isLoading ? (
          <ListSkeleton rows={6} />
        ) : docs.error ? (
          <QueryErrorAlert title="Could not load docs index">
            {docs.error instanceof Error ? docs.error.message : String(docs.error)}
          </QueryErrorAlert>
        ) : !subcategory ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No docs in this subcategory yet.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <DocList docs={subcategory.docs} />
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}

/**
 * Deprecation banner rendered above the article body when frontmatter has
 * `deprecated: true`. The link target uses `superseded_by` when present.
 */
function DeprecatedBanner({ frontmatter }: { frontmatter: DocFrontmatter }) {
  if (!frontmatter.deprecated) return null;
  const href = frontmatter.superseded_by ? `/docs/${frontmatter.superseded_by}` : null;
  return (
    <Alert variant="destructive" className="mb-4" data-testid="docs-deprecated-banner">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>This doc is deprecated</AlertTitle>
      <AlertDescription>
        {frontmatter.deprecation_reason ? <p>{frontmatter.deprecation_reason}</p> : null}
        {href ? (
          <p className="mt-2">
            See instead:{" "}
            <Link to={href} className="underline">
              {frontmatter.superseded_by}
            </Link>
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function DetailPage({ slug }: { slug: string }) {
  const doc = useQuery({
    queryKey: ["docs-detail", slug],
    queryFn: ({ signal }) =>
      fetchJson<ResolvedDoc>(`/docs/${slug}?format=json&include_deprecated=true`, signal),
    staleTime: 60_000,
  });

  const docsIndexAction = (
    <Link to="/docs">
      <Button variant="outline" size="sm" className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Docs index
      </Button>
    </Link>
  );

  if (doc.isLoading) {
    return (
      <PageShell title="Documentation" actions={docsIndexAction}>
        <DocsPageContentPanel>
          <ListSkeleton rows={5} />
        </DocsPageContentPanel>
      </PageShell>
    );
  }

  if (doc.error || !doc.data) {
    return (
      <PageShell title="Doc not found" actions={docsIndexAction}>
        <DocsPageContentPanel>
          <QueryErrorAlert title="Could not load doc">
            {doc.error instanceof Error ? doc.error.message : "Unknown doc"}
          </QueryErrorAlert>
        </DocsPageContentPanel>
      </PageShell>
    );
  }

  const fm = doc.data.frontmatter;
  return (
    <PageShell title={fm.title} actions={docsIndexAction}>
      <DocsPageContentPanel>
        <DeprecatedBanner frontmatter={fm} />
        <DocsMarkdownArticle body={doc.data.body} />
      </DocsPageContentPanel>
    </PageShell>
  );
}

/**
 * Route shape (no reserved prefix — category keys must not collide with doc
 * slug first-segments at the subcategory level; the audit script checks this):
 *
 *   /docs                            → IndexPage       (category grid)
 *   /docs/<cat>                      → CategoryPage    (subcategories)
 *   /docs/<cat>/<sub>                → SubcategoryPage  (doc list)
 *   /docs/<slug>                     → DetailPage       (markdown body)
 *
 * Disambiguation: if the first path segment matches a known category key in
 * the loaded index, the router renders browse pages.  An optional second
 * segment is treated as a subcategory only when it matches a declared
 * subcategory key for that category; otherwise the full path is a doc slug.
 */
export default function DocsPage() {
  const location = useLocation();
  const { data: index } = useDocsIndex();
  const rest = location.pathname.replace(/^\/docs\/?/, "");

  if (!rest) return <IndexPage />;

  const parts = rest.split("/").filter(Boolean);
  const firstSeg = parts[0] as string;

  const matchedCategory = index?.categories.find((c) => c.key === firstSeg) ?? null;

  if (matchedCategory) {
    if (parts.length === 1) {
      return <CategoryPage categoryKey={firstSeg} />;
    }
    const secondSeg = parts[1] as string;
    const matchedSub = matchedCategory.subcategories.find((s) => s.key === secondSeg);
    if (parts.length === 2 && matchedSub) {
      return <SubcategoryPage categoryKey={firstSeg} subcategoryKey={secondSeg} />;
    }
  }

  return <DetailPage slug={rest} />;
}

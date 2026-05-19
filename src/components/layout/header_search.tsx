import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, Loader2, Search } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { isApiUrlConfigured } from "@/api/client";
import { queryEntities } from "@/api/endpoints/entities";
import { listSources } from "@/api/endpoints/sources";
import { TypeBadge } from "@/components/shared/type_badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sourceDisplayTitle, sourceKindLabel } from "@/lib/source_display";
import { buildSearchLocation, isSearchPath, resolveSearchQuery } from "@/lib/search_route";
import { truncateId } from "@/lib/utils";
import type { EntitySnapshot } from "@/types/api";
import type { HeaderSearchContextValue, HeaderSearchSuggestion } from "./page_title_context";

const ENTITY_SUGGESTION_LIMIT = 4;
const SOURCE_SUGGESTION_LIMIT = 4;
const DOC_SUGGESTION_LIMIT = 4;

interface DocFrontmatter {
  title: string;
  summary: string;
  category: string;
  tags: string[];
}

interface DocEntry {
  slug: string;
  frontmatter: DocFrontmatter;
}

interface DocsIndex {
  categories: Array<{
    subcategories: Array<{ docs: DocEntry[] }>;
    uncategorized: DocEntry[];
  }>;
  featured: DocEntry[];
}

function flattenDocs(index: DocsIndex): DocEntry[] {
  const docs: DocEntry[] = [];
  docs.push(...index.featured);
  for (const cat of index.categories) {
    docs.push(...cat.uncategorized);
    for (const sub of cat.subcategories) {
      docs.push(...sub.docs);
    }
  }
  return docs;
}

function searchDocs(allDocs: DocEntry[], query: string, limit: number): DocEntry[] {
  const q = query.toLowerCase();
  const results: DocEntry[] = [];
  for (const doc of allDocs) {
    const haystack = [
      doc.frontmatter.title,
      doc.frontmatter.summary,
      doc.frontmatter.tags?.join(" ") ?? "",
      doc.slug,
    ]
      .join(" ")
      .toLowerCase();
    if (haystack.includes(q)) {
      results.push(doc);
      if (results.length >= limit) break;
    }
  }
  return results;
}

function entityId(entity: EntitySnapshot): string {
  return entity.entity_id ?? entity.id ?? "";
}

function entityLabel(entity: EntitySnapshot): string {
  const snapshotName =
    typeof entity.snapshot?.name === "string"
      ? entity.snapshot.name
      : typeof entity.snapshot?.title === "string"
        ? entity.snapshot.title
        : null;
  return entity.canonical_name || snapshotName || truncateId(entityId(entity), 16);
}

function SuggestionLink({
  suggestion,
  onSelect,
}: {
  suggestion: HeaderSearchSuggestion;
  onSelect: () => void;
}) {
  return (
    <Link
      to={suggestion.to}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
      className="block rounded-sm px-3 py-2 hover:bg-accent hover:text-accent-foreground"
    >
      <div className="truncate text-sm font-medium">{suggestion.label}</div>
      {suggestion.meta ? <div className="mt-1 flex items-center gap-2">{suggestion.meta}</div> : null}
    </Link>
  );
}

function SuggestionSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Fragment>
      <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {children}
    </Fragment>
  );
}

export function HeaderSearch({ pageSearch }: { pageSearch: HeaderSearchContextValue | null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const search = pageSearch?.value ?? globalSearch;
  const trimmedSearch = search.trim();

  useEffect(() => {
    if (pageSearch) {
      return;
    }

    const params = new URLSearchParams(location.search);
    setGlobalSearch(isSearchPath(location.pathname) ? resolveSearchQuery(location.pathname, params) : "");
  }, [location.pathname, location.search, pageSearch]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(trimmedSearch);
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [trimmedSearch]);

  const docsIndexQuery = useQuery({
    queryKey: ["docs-index"],
    queryFn: async () => {
      const res = await fetch("/docs?format=json", { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      return res.json() as Promise<DocsIndex>;
    },
    staleTime: 60_000,
  });

  const suggestionsQuery = useQuery({
    queryKey: ["header-search", debouncedSearch],
    queryFn: async () => {
      const [entities, sources] = await Promise.all([
        queryEntities({
          search: debouncedSearch,
          limit: ENTITY_SUGGESTION_LIMIT,
          include_snapshots: true,
        }),
        listSources({
          search: debouncedSearch,
          limit: SOURCE_SUGGESTION_LIMIT,
        }),
      ]);
      return {
        entities: entities.entities,
        sources: sources.sources,
      };
    },
    enabled: isApiUrlConfigured() && debouncedSearch.length > 0,
  });

  const docSuggestions = debouncedSearch.length > 0 && docsIndexQuery.data
    ? searchDocs(flattenDocs(docsIndexQuery.data), debouncedSearch, DOC_SUGGESTION_LIMIT)
    : [];

  function setSearchValue(nextSearch: string) {
    if (pageSearch) {
      pageSearch.onValueChange(nextSearch);
      return;
    }
    setGlobalSearch(nextSearch);
  }

  function navigateToGlobalSearchResults(query: string) {
    const target = buildSearchLocation({
      query,
      searchParams: new URLSearchParams(location.search),
    });
    navigate(target);
    setIsFocused(false);
  }

  function submitSearch(query: string) {
    if (pageSearch?.onSubmit) {
      pageSearch.onSubmit(query);
      setIsFocused(false);
      return;
    }
    navigateToGlobalSearchResults(query);
  }

  function handleSearchContainerBlur(event: React.FocusEvent<HTMLDivElement>) {
    const nextFocused = event.relatedTarget;
    if (nextFocused instanceof Node && searchContainerRef.current?.contains(nextFocused)) {
      return;
    }
    setIsFocused(false);
  }

  const entitySuggestions = suggestionsQuery.data?.entities ?? [];
  const sourceSuggestions = suggestionsQuery.data?.sources ?? [];
  const pageSuggestions = pageSearch?.suggestions ?? [];
  const hasSuggestions =
    pageSuggestions.length > 0 || entitySuggestions.length > 0 || sourceSuggestions.length > 0 || docSuggestions.length > 0;
  const showSuggestions = isFocused && trimmedSearch.length > 0;
  const isResolvingSuggestions =
    trimmedSearch.length > 0 &&
    (trimmedSearch !== debouncedSearch ||
      suggestionsQuery.isPending ||
      suggestionsQuery.isFetching ||
      Boolean(pageSearch?.isLoading));

  return (
    <div
      ref={searchContainerRef}
      className="relative w-full max-w-sm"
      onBlurCapture={handleSearchContainerBlur}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={search}
        onChange={(event) => setSearchValue(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submitSearch(trimmedSearch);
          }
          if (event.key === "Escape") {
            setIsFocused(false);
          }
        }}
        placeholder={pageSearch?.placeholder ?? "Search..."}
        className="pl-9"
        aria-label={pageSearch?.ariaLabel ?? "Search Neotoma"}
      />
      {showSuggestions ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          {isResolvingSuggestions ? (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              Searching...
            </div>
          ) : hasSuggestions ? (
            <>
              <div className="max-h-80 overflow-y-auto p-1">
                {pageSuggestions.length > 0 ? (
                  <SuggestionSection title={pageSearch?.contextLabel ?? "Top matches"}>
                    {pageSuggestions.map((suggestion) => (
                      <SuggestionLink
                        key={suggestion.id}
                        suggestion={suggestion}
                        onSelect={() => setIsFocused(false)}
                      />
                    ))}
                  </SuggestionSection>
                ) : null}
                {entitySuggestions.length > 0 ? (
                  <SuggestionSection title={pageSearch ? "General entities" : "Entities"}>
                    {entitySuggestions.map((entity) => (
                      <SuggestionLink
                        key={entityId(entity)}
                        suggestion={{
                          id: entityId(entity),
                          label: entityLabel(entity),
                          to: `/entities/${encodeURIComponent(entityId(entity))}`,
                          meta: (
                            <>
                              <TypeBadge type={entity.entity_type} humanize className="max-w-[9rem] truncate" />
                              <span className="truncate font-mono text-[11px] text-muted-foreground">
                                {truncateId(entityId(entity), 12)}
                              </span>
                            </>
                          ),
                        }}
                        onSelect={() => setIsFocused(false)}
                      />
                    ))}
                  </SuggestionSection>
                ) : null}
                {sourceSuggestions.length > 0 ? (
                  <SuggestionSection title="Sources">
                    {sourceSuggestions.map((source) => (
                      <SuggestionLink
                        key={source.id}
                        suggestion={{
                          id: source.id,
                          label: sourceDisplayTitle(source),
                          to: `/sources/${encodeURIComponent(source.id)}`,
                          meta: (
                            <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <FileText className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{sourceKindLabel(source)}</span>
                            </span>
                          ),
                        }}
                        onSelect={() => setIsFocused(false)}
                      />
                    ))}
                  </SuggestionSection>
                ) : null}
                {docSuggestions.length > 0 ? (
                  <SuggestionSection title="Documentation">
                    {docSuggestions.map((doc) => (
                      <SuggestionLink
                        key={doc.slug}
                        suggestion={{
                          id: doc.slug,
                          label: doc.frontmatter.title,
                          to: `/docs/${doc.slug}`,
                          meta: (
                            <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <BookOpen className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{doc.frontmatter.category || doc.slug}</span>
                            </span>
                          ),
                        }}
                        onSelect={() => setIsFocused(false)}
                      />
                    ))}
                  </SuggestionSection>
                ) : null}
              </div>
              <div className="border-t p-1">
                {pageSearch?.onSubmit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start px-3 py-2 text-primary"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => submitSearch(trimmedSearch)}
                  >
                    View page matches
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start px-3 py-2 text-primary"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => navigateToGlobalSearchResults(trimmedSearch)}
                >
                  View all matches
                </Button>
              </div>
            </>
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No matching results
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

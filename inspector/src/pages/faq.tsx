import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { DocsMarkdownArticle } from "@/components/docs/docs_markdown_article";
import { DocsPageContentPanel } from "@/components/docs/docs_page_layout";
import { PageShell } from "@/components/layout/page_shell";
import { Button } from "@/components/ui/button";
import { ListSkeleton, QueryErrorAlert } from "@/components/shared/query_status";
import { fetchSitePage } from "@/lib/site_page";

export default function FaqPage() {
  const page = useQuery({
    queryKey: ["site-page", "faq", "en"],
    queryFn: () => fetchSitePage("faq"),
    staleTime: 60_000,
  });

  const backAction = (
    <Link to="/">
      <Button variant="outline" size="sm" className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Home
      </Button>
    </Link>
  );

  if (page.isLoading) {
    return (
      <PageShell title="FAQ" actions={backAction}>
        <DocsPageContentPanel>
          <ListSkeleton rows={8} />
        </DocsPageContentPanel>
      </PageShell>
    );
  }

  if (page.error || !page.data) {
    return (
      <PageShell title="FAQ" actions={backAction}>
        <DocsPageContentPanel>
          <QueryErrorAlert title="Could not load FAQ">
            {page.error instanceof Error ? page.error.message : "Unknown error"}
          </QueryErrorAlert>
        </DocsPageContentPanel>
      </PageShell>
    );
  }

  const title = page.data.frontmatter.page_title || "FAQ";

  return (
    <PageShell title={title} actions={backAction}>
      <DocsPageContentPanel>
        <DocsMarkdownArticle body={page.data.body} />
      </DocsPageContentPanel>
    </PageShell>
  );
}

import { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface DocumentationPageProps {
  children: ReactNode;
  title?: string;
  showSearch?: boolean;
  onSearch?: (query: string) => void;
}

export function DocumentationPage({
  children,
  title = 'Neotoma Documentation',
  showSearch = true,
  onSearch,
}: DocumentationPageProps) {
  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const query = formData.get('search') as string;
    if (onSearch && query) {
      onSearch(query);
    }
  };

  return (
    <div className="flex flex-col min-h-full">
      {/* Page header - sticky at top */}
      <header className="sticky top-0 z-30 border-b border-[hsl(var(--doc-border))] bg-[hsl(var(--doc-background))] backdrop-blur supports-[backdrop-filter]:bg-[hsl(var(--doc-background))]/95 flex-shrink-0">
        <div className="container mx-auto px-4 lg:px-8 py-3 flex items-center justify-between">
          {/* Site title */}
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-[hsl(var(--doc-foreground))]">
              {title}
            </h1>
          </div>

          {/* Search bar */}
          {showSearch && (
            <form onSubmit={handleSearch} className="hidden md:flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--doc-secondary))]" />
                <Input
                  type="search"
                  name="search"
                  placeholder="Search documentation..."
                  className="pl-10 w-64 bg-[hsl(var(--doc-background))] border-[hsl(var(--doc-border))] focus:border-[hsl(var(--doc-primary))]"
                />
              </div>
            </form>
          )}
        </div>
      </header>

      {/* Page content - scrollable */}
      <div className="flex-1 container mx-auto px-4 lg:px-8 py-8 max-w-4xl">
        {children}
      </div>

      {/* Page footer */}
      <footer className="border-t border-[hsl(var(--doc-border))] bg-[hsl(var(--doc-background))] flex-shrink-0">
        <div className="container mx-auto px-4 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-[hsl(var(--doc-secondary))]">
            {/* Version info */}
            <div>
              <p>Neotoma v0.2.1</p>
            </div>

            {/* Footer links */}
            <div className="flex gap-6">
              <a
                href="/docs/legal/privacy_policy.md"
                className="hover:text-[hsl(var(--doc-foreground))] transition-colors"
              >
                Privacy Policy
              </a>
              <a
                href="/docs/legal/terms_of_service.md"
                className="hover:text-[hsl(var(--doc-foreground))] transition-colors"
              >
                Terms of Service
              </a>
              <a
                href="https://github.com/neotoma"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[hsl(var(--doc-foreground))] transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}



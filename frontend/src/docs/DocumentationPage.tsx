import { ReactNode } from 'react';
import { DocumentationDirectory } from './DocumentationDirectory';

interface DocumentationPageProps {
  children: ReactNode;
  title?: string;
  showSearch?: boolean;
  onSearch?: (query: string) => void;
  onNavigate?: (href: string) => void;
}

export function DocumentationPage({
  children,
  title,
  showSearch,
  onSearch,
  onNavigate,
}: DocumentationPageProps) {
  return (
    <div className="container mx-auto px-4 lg:px-8 py-8 max-w-7xl">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Directory sidebar */}
        <aside className="lg:col-span-1">
          <div className="sticky top-8">
            <DocumentationDirectory onNavigate={onNavigate} />
          </div>
        </aside>
        
        {/* Main content */}
        <div className="lg:col-span-3">
          {children}
        </div>
      </div>
    </div>
  );
}



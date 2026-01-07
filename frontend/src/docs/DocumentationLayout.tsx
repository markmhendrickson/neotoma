import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { DocumentationSidebar } from './DocumentationSidebar';

interface DocumentationLayoutProps {
  children: ReactNode;
  currentPath?: string;
  onNavigate?: (href: string) => void;
}

export function DocumentationLayout({
  children,
  currentPath,
  onNavigate,
}: DocumentationLayoutProps) {
  return (
    <SidebarProvider defaultOpen={true}>
      <DocumentationSidebar currentPath={currentPath} onNavigate={onNavigate} />
      <SidebarInset className="flex flex-col h-screen">
        <div className="border-b px-4 py-2 flex-shrink-0 flex items-center">
          <SidebarTrigger />
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}



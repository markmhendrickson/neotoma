import { AppSidebar } from '@/components/AppSidebar';

interface DocumentationSidebarProps {
  currentPath?: string;
  onNavigate?: (href: string) => void;
}

export function DocumentationSidebar({
  currentPath,
  onNavigate,
}: DocumentationSidebarProps) {
  return <AppSidebar currentPath={currentPath} onNavigate={onNavigate} />;
}



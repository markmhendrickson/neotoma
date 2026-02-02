interface DesignSystemLayoutProps {
  children: React.ReactNode;
  currentSection?: string;
  title: string;
}

export function DesignSystemLayout({ children, currentSection, title }: DesignSystemLayoutProps) {
  return (
    <div className="bg-background min-h-screen">
      <div className="px-6 pb-6">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="pt-6">
            <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}

import React from "react";
import { AlertCircle, Home, LucideIcon } from "lucide-react";
import { Layout } from "@/components/Layout";
import { BarChart, FileText, Users, Calendar, Upload, Database, Network } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  showLayout?: boolean;
  menuItems?: Array<{ path: string; label: string; icon: LucideIcon }>;
  headerActions?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error boundary component that catches React errors and displays user-friendly error UI
 * 
 * Catches unhandled errors in child components and displays:
 * - User-friendly error message in production
 * - Detailed error stack trace in development
 * - Actions to refresh page or return to home
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({
      error,
      errorInfo
    });
    console.error("Error caught by boundary:", error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      const errorContent = (
        <div className="flex justify-center items-center min-h-[calc(100vh-8rem)] py-20 px-8">
          <div className="max-w-[600px] w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-8 h-8 text-destructive" />
              <h1 className="text-[28px] font-medium tracking-tight">Something went wrong</h1>
            </div>
            <div className="text-[17px] text-muted-foreground mb-12 font-normal tracking-wide">
              An unexpected error occurred
            </div>

            <div className="text-[15px] leading-[1.75] font-light mb-8">
              {process.env.NODE_ENV === "development" && this.state.error && (
                <details className="mt-6 p-4 bg-muted rounded-md border border-border" open>
                  <summary className="cursor-pointer text-[13px] font-medium text-muted-foreground mb-2">
                    Error Details (Development Only)
                  </summary>
                  <pre className="text-[11px] text-foreground overflow-auto mt-2 whitespace-pre-wrap break-words">
                    {this.state.error.toString()}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null, errorInfo: null });
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-input hover:border-foreground hover:bg-accent transition-all text-[15px] font-medium"
              >
                <span>Try Again</span>
              </button>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-input hover:border-foreground hover:bg-accent transition-all text-[15px] font-medium"
              >
                <span>Refresh Page</span>
              </button>
              <a
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-input hover:border-foreground hover:bg-accent transition-all text-[15px] font-medium"
              >
                <Home className="w-4 h-4" />
                <span>Go to Home</span>
              </a>
            </div>
          </div>
        </div>
      );

      // If showLayout is true, wrap error content in Layout
      if (this.props.showLayout) {
        const defaultMenuItems = [
          { path: "/", label: "Dashboard", icon: BarChart },
          { path: "/sources", label: "Sources", icon: FileText },
          { path: "/entities", label: "Entities", icon: Users },
          { path: "/schemas", label: "Schemas", icon: Database },
          { path: "/relationships", label: "Relationships", icon: Network },
          { path: "/timeline", label: "Timeline", icon: Calendar },
          { path: "/upload", label: "Upload", icon: Upload },
        ];

        return (
          <Layout
            siteName="Neotoma"
            menuItems={this.props.menuItems || defaultMenuItems}
            headerActions={this.props.headerActions}
          >
            {errorContent}
          </Layout>
        );
      }

      // Otherwise, render without layout (for root-level errors)
      return (
        <div className="min-h-screen">
          {errorContent}
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Dashboard/Home Page
 *
 * Main landing page after login - Interactive AI-enabled experience
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { FileUploadView } from "./FileUploadView";
import { UniversalSearch } from "./UniversalSearch";
import { QuickEntryPanel } from "./QuickEntryPanel";
import { RecentActivityFeed } from "./RecentActivityFeed";
import { AIAgentBridge } from "./AIAgentBridge";
import { useToast } from "@/components/ui/use-toast";

export function DashboardPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { toast } = useToast();

  const handleUploadComplete = (sourceIds: string[]) => {
    // Show success toast
    toast({
      title: "Upload complete",
      description: `Successfully uploaded ${sourceIds.length} file${sourceIds.length > 1 ? 's' : ''}`,
    });
    
    // Refresh recent activity by incrementing key
    setRefreshKey(prev => prev + 1);
  };

  const handleEntityCreated = (entityType: string, entityId: string) => {
    // Refresh recent activity when entity is created
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      {/* Hero Section */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">
          Transform your data into persistent AI memory
        </h1>
        <p className="text-lg text-muted-foreground mb-4">
          Upload your first document or start a conversation. Neotoma builds
          structured memory that grows smarter with every interaction.{" "}
          <Link to="/about" className="text-primary hover:underline font-medium">
            Learn more
          </Link>
        </p>
      </div>

      {/* Universal Search */}
      <div className="mb-8">
        <UniversalSearch className="w-full" fullWidth />
      </div>

      {/* File Upload Zone */}
      <div className="mb-8">
        <FileUploadView onUploadComplete={handleUploadComplete} hideTitle />
      </div>

      {/* Quick Entry Panel */}
      <div className="mb-8">
        <QuickEntryPanel onEntityCreated={handleEntityCreated} />
      </div>

      {/* Recent Activity Feed */}
      <div className="mb-8">
        <RecentActivityFeed refreshKey={refreshKey} />
      </div>

      {/* AI Agent Bridge */}
      <div className="mb-8">
        <AIAgentBridge />
      </div>
    </div>
  );
}

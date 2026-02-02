/**
 * Integrations index page.
 * Lists all MCP setup integrations with links to their setup pages.
 */

import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { INTEGRATIONS, getIntegrationIcon } from "@/constants/integrations";
export function IntegrationsPage() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Integrations</h1>
        <p className="text-muted-foreground">
          Connect Neotoma to your IDE or AI assistant via MCP. Choose an integration to view setup instructions.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {INTEGRATIONS.map(({ path, label, iconKey }) => {
          const Icon = getIntegrationIcon(iconKey);
          return (
            <Link key={path} to={path} className="block">
              <Card className="h-full hover:bg-accent transition-colors cursor-pointer">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                      <Icon className="size-5" />
                    </span>
                    {label}
                  </CardTitle>
                  <CardDescription>
                    MCP setup for {label}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-sm text-primary font-medium">View setup</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

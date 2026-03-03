/**
 * 404 Not Found Page Component
 * 
 * Displays a user-friendly 404 page with a link to go home
 */

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Home } from "lucide-react";
import { SeoHead } from "@/components/SeoHead";

export function NotFound() {
  return (
    <>
      <SeoHead routePath="/404" />
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="text-6xl font-bold text-muted-foreground mb-4">404</div>
            <CardTitle className="text-2xl">Page Not Found</CardTitle>
            <CardDescription>
              The page you're looking for doesn't exist or has been moved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/">
                <Home className="h-4 w-4 mr-2" />
                Go home
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

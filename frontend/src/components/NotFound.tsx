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
import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";

export function NotFound() {
  const { locale, dict } = useLocale();
  return (
    <>
      <SeoHead routePath="/404" />
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="text-6xl font-bold text-muted-foreground mb-4">404</div>
            <CardTitle className="text-2xl">{dict.pageNotFound}</CardTitle>
            <CardDescription>
              {dict.notFoundDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to={localizePath("/", locale)}>
                <Home className="h-4 w-4 mr-2" />
                {dict.goHome}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

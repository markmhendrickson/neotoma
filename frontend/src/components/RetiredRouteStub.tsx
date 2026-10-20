import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { resolveDestination } from "@/site/route_retirement";

/**
 * Client-side counterpart of the static redirect stubs: a retired route reached by in-app
 * navigation sends the visitor to the closest GitHub page, or to the one-pager.
 */
export function RetiredRouteStub() {
  const { pathname } = useLocation();
  const dest = resolveDestination(pathname);
  useEffect(() => {
    window.location.replace(dest.url);
  }, [dest.url]);
  return (
    <main style={{ maxWidth: "36rem", margin: "96px auto", padding: "0 20px" }}>
      <p>
        <strong>This page has moved.</strong>
      </p>
      <p>
        <a href={dest.url}>Continue to {dest.url === "/" ? "neotoma.io" : dest.url}</a>
      </p>
    </main>
  );
}

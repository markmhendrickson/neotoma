import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { resolveDestination } from "@/site/route_retirement";
import { staticAssetPath } from "@/site/spa_path";

function clientDestinationUrl(
  url: string,
  kind: "github" | "onepager" | "site",
  search: string,
  hash: string
) {
  if (kind === "github") return url;

  const destination = new URL(url, "https://neotoma.io");
  return `${staticAssetPath(destination.pathname)}${search || destination.search}${hash || destination.hash}`;
}

/**
 * Client-side counterpart of the static redirect stubs: a retired route reached by in-app
 * navigation sends the visitor to the closest GitHub page, or to the one-pager.
 */
export function RetiredRouteStub() {
  const { pathname, search, hash } = useLocation();
  const dest = resolveDestination(pathname);
  const destinationUrl = clientDestinationUrl(dest.url, dest.kind, search, hash);
  useEffect(() => {
    window.location.replace(destinationUrl);
  }, [destinationUrl]);
  return (
    <main style={{ maxWidth: "36rem", margin: "96px auto", padding: "0 20px" }}>
      <p>
        <strong>This page has moved.</strong>
      </p>
      <p>
        <a href={destinationUrl}>
          Continue to {destinationUrl === "/" ? "neotoma.io" : destinationUrl}
        </a>
      </p>
    </main>
  );
}

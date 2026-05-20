/**
 * True when this Inspector bundle was built from the monorepo source checkout
 * (Vite dev server, `vite build` with `NEOTOMA_INSPECTOR_OUT_DIR` / explicit
 * `VITE_INSPECTOR_SOURCE_BUILD`, or API live-build meta injection).
 * Shipped npm `dist/inspector` builds omit these signals — hide `/design` nav.
 */
function readSourceBuildMeta(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const meta = document.querySelector('meta[name="neotoma-inspector-source-build"]');
    const content = meta?.getAttribute("content")?.trim().toLowerCase();
    return content === "1" || content === "true" || content === "yes";
  } catch {
    return false;
  }
}

export function isInspectorSourceBuild(): boolean {
  if (import.meta.env.DEV) return true;
  if (readSourceBuildMeta()) return true;
  const raw = import.meta.env.VITE_INSPECTOR_SOURCE_BUILD as string | undefined;
  if (!raw) return false;
  const normalized = raw.toString().trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

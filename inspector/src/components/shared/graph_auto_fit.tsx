import { useEffect } from "react";
import { useReactFlow, useStoreApi } from "@xyflow/react";

/**
 * Forces a node-internals measurement pass + `fitView` after the rendered node
 * set changes, retrying until React Flow reports the nodes as measured.
 *
 * Why this exists — the blank-canvas bug (Jeroen repro, embed task
 * ent_a876f38dd8ed65eb2ad331ee): on some environments React Flow v12's
 * per-node `ResizeObserver` never fires its initial measurement callback, so
 * every node's `measured` stays `{}` and `nodesInitialized` stays `false`.
 * With no measured dimensions:
 *   - `getFitViewNodes()` treats every node as invisible → `fitView` is a
 *     no-op and the viewport sits at the identity transform, and
 *   - `getEdgePosition()` bails for every edge → edges silently never draw.
 * The visible result is a graph whose nodes render un-fitted with no edges,
 * or — for a neighborhood laid out off the initial viewport — a fully blank
 * canvas, with ZERO console errors (measurement failing is silent).
 *
 * We call the store's `updateNodeInternals` directly with each node's DOM
 * element (`force: true`). That re-reads `offsetWidth`/`offsetHeight` from the
 * DOM and writes `measured`, bypassing the (silently unfired) ResizeObserver.
 * We retry on a `setTimeout` cadence (not `requestAnimationFrame`, which is
 * paused in background/hidden tabs) because the node DOM may not be laid out
 * yet when the effect first runs, then `fitView` once bounds are real.
 * Rendered as a child of `<ReactFlow>` so the hooks resolve against its store.
 * Shared by the standalone `/graph` explorer and the chrome-less
 * `/embed/graph` route, so both are fixed by the one component.
 */
const MAX_ATTEMPTS = 30;
const RETRY_MS = 16;

export function GraphAutoFit({ nodeIds }: { nodeIds: string[] }) {
  const store = useStoreApi();
  const { fitView } = useReactFlow();
  // Re-run only when the actual membership changes, not on every render.
  const key = nodeIds.join("|");

  useEffect(() => {
    if (nodeIds.length === 0) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const measureAll = (): boolean => {
      const { domNode, nodeLookup, updateNodeInternals } = store.getState();
      if (!domNode) return false;
      const updates = new Map<string, { id: string; nodeElement: Element; force: true }>();
      for (const id of nodeIds) {
        const nodeElement = domNode.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
        if (nodeElement) updates.set(id, { id, nodeElement, force: true });
      }
      if (updates.size > 0) {
        // Direct store action — synchronously writes `measured` from the DOM.
        (updateNodeInternals as (u: typeof updates) => void)(updates);
      }
      return nodeIds.every((id) => {
        const measured = nodeLookup.get(id)?.measured;
        return !!(measured && measured.width && measured.height);
      });
    };

    const tick = () => {
      if (cancelled) return;
      attempts += 1;
      const done = measureAll();
      if (done || attempts >= MAX_ATTEMPTS) {
        void fitView({ padding: 0.2 });
        return;
      }
      timer = setTimeout(tick, RETRY_MS);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
    // Intentionally keyed on the node-id membership string only: `store` and
    // `fitView` are stable, and `nodeIds` is re-derived every render.
  }, [key]);

  return null;
}

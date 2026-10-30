import { useEffect, useRef } from "react";
import { staticAssetPath } from "@/site/spa_path";
import { observeOverheadPaperScene } from "./overhead_scene_motion";

// Matching editorial compositions retain their exact geometry and material bytes.
// Companion scenes use the same physical cutouts and screenprint treatment.
// WebP material bytes are stored once per unique image alongside the SVGs.
const overheadSceneFiles = {
  hero: "connected-records.svg",
  source: "source-material.svg",
  observation: "observation.svg",
  entity: "entity-identity.svg",
  snapshot: "current-snapshot.svg",
  invoiceExample: "invoice-example.svg",
  sharedInstance: "shared-instance.svg",
  scopedAccess: "scoped-access.svg",
  peering: "selected-record-exchange.svg",
  visionDomain: "bounded-domain.svg",
  visionPositions: "retained-positions.svg",
  visionExplanation: "inspectable-explanations.svg",
} as const;

export type OverheadSceneKind = keyof typeof overheadSceneFiles;

export function isOverheadScene(scene: string): scene is OverheadSceneKind {
  return Object.prototype.hasOwnProperty.call(overheadSceneFiles, scene);
}

export function overheadSceneFilename(scene: OverheadSceneKind): string {
  return overheadSceneFiles[scene];
}

export function OverheadPaperScene({ scene, alt }: { scene: OverheadSceneKind; alt: string }) {
  const ref = useRef<HTMLObjectElement>(null);
  useEffect(() => {
    const object = ref.current;
    if (!object) return;
    let stop = () => {};
    const onLoad = () => {
      stop();
      stop = observeOverheadPaperScene(object);
    };
    object.addEventListener("load", onLoad);
    if (object.contentDocument?.documentElement) onLoad();
    return () => {
      object.removeEventListener("load", onLoad);
      stop();
    };
  }, [scene]);
  return (
    <object
      ref={ref}
      className="paper-scene overhead-paper-scene"
      data-paper-scene={scene}
      data={staticAssetPath(`/brand/october/essay/${overheadSceneFilename(scene)}`)}
      type="image/svg+xml"
      role="img"
      aria-label={alt}
    >
      <span>{alt}</span>
    </object>
  );
}

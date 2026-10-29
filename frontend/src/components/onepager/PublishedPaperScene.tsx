import { useEffect, useRef } from "react";
import { staticAssetPath } from "@/site/spa_path";
import { observePublishedPaperScene } from "./published_scene_motion";

// The source compositions are the published post's SVGs. Their embedded WebP
// material bytes are stored once per unique image alongside the SVGs.
const publishedSceneFiles = {
  observation: "observation.svg",
  invoiceExample: "invoice-example.svg",
  sharedInstance: "shared-instance.svg",
  visionPositions: "retained-positions.svg",
  visionExplanation: "inspectable-explanations.svg",
} as const;

export type PublishedSceneKind = keyof typeof publishedSceneFiles;

export function isPublishedScene(scene: string): scene is PublishedSceneKind {
  return Object.prototype.hasOwnProperty.call(publishedSceneFiles, scene);
}

export function publishedSceneFilename(scene: PublishedSceneKind): string {
  return publishedSceneFiles[scene];
}

export function PublishedPaperScene({ scene, alt }: { scene: PublishedSceneKind; alt: string }) {
  const ref = useRef<HTMLObjectElement>(null);
  useEffect(() => {
    const object = ref.current;
    if (!object) return;
    let stop = () => {};
    const onLoad = () => {
      stop();
      stop = observePublishedPaperScene(object);
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
      className="paper-scene published-paper-scene"
      data={staticAssetPath(`/brand/october/essay/${publishedSceneFilename(scene)}`)}
      type="image/svg+xml"
      role="img"
      aria-label={alt}
    >
      <span>{alt}</span>
    </object>
  );
}

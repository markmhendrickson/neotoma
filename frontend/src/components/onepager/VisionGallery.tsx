import { PaperScene, type PaperSceneKind } from "./PaperScene";

const ambitions: { title: string; scene: PaperSceneKind; text: string }[] = [
  {
    title: "Give each domain a clear owner",
    scene: "visionDomain",
    text: "Define who may correct which part of the record, with authority scoped to the domain.",
  },
  {
    title: "Keep disagreement on the record",
    scene: "visionPositions",
    text: "Represent competing claims, unresolved disputes and official positions explicitly.",
  },
  {
    title: "Make authority easier to inspect",
    scene: "visionExplanation",
    text: "Show why a value holds, whose authority it follows and what a change would affect.",
  },
];

export function VisionGallery() {
  return (
    <div className="plan-vision-gallery">
      {ambitions.map(({ title, scene, text }, index) => (
        <article className="plan-vision-card" key={scene}>
          <div className="plan-vision-art">
            <PaperScene scene={scene} />
          </div>
          <p className="plan-label">Planned direction · {String(index + 1).padStart(2, "0")}</p>
          <h3>{title}</h3>
          <p>{text}</p>
        </article>
      ))}
    </div>
  );
}

import { PaperScene, type PaperSceneKind } from "./PaperScene";
import { neotomaGithubBlobUrl } from "@/site/neotoma_repo";

type Capability = {
  title: string;
  scene: PaperSceneKind;
  status: "Supported" | "Planned";
  detail: string;
  guide: string;
};

const capabilities: Capability[] = [
  {
    title: "A shared system of record",
    scene: "sharedInstance",
    status: "Supported",
    detail:
      "Teams and collaborators can work with the same records through configured access to one instance and data profile.",
    guide: "docs/integrations/matrix.md",
  },
  {
    title: "Verified identity and scoped access",
    scene: "scopedAccess",
    status: "Supported",
    detail:
      "An admitted signed request can establish agent identity; active scoped grants determine permitted actions. Other paths may have self-reported or absent writer identity.",
    guide: "docs/use_cases/agent_auth.md",
  },
  {
    title: "Selected record exchange",
    scene: "peering",
    status: "Supported",
    detail:
      "Configured peers exchange selected records between separate instances, without claiming complete history, files or deletions.",
    guide: "docs/subsystems/peer_sync.md",
  },
  {
    title: "Bounded domain ownership",
    scene: "visionDomain",
    status: "Planned",
    detail:
      "Planned domain ownership would make clear who may correct each bounded part of the record.",
    guide: "docs/foundation/core_identity.md",
  },
  {
    title: "Retained positions",
    scene: "visionPositions",
    status: "Planned",
    detail:
      "Planned position tracking would make a selected position inspectable while retaining the competing claim.",
    guide: "docs/foundation/core_identity.md",
  },
  {
    title: "Inspectable explanations",
    scene: "visionExplanation",
    status: "Planned",
    detail:
      "Planned explanations would show why a value holds, whose authority it follows and which connected values a change could affect.",
    guide: "docs/foundation/core_identity.md",
  },
];

export function VisionGallery() {
  return (
    <div className="plan-vision-gallery">
      {capabilities.map((capability) => (
        <article className="plan-vision-card" key={capability.scene}>
          <figure className="plan-vision-art">
            <PaperScene scene={capability.scene} />
          </figure>
          <div className="plan-vision-content">
            <p className="plan-label">{capability.status}</p>
            <h3>{capability.title}</h3>
            <p>{capability.detail}</p>
            <a href={neotomaGithubBlobUrl(capability.guide)}>Read the guide</a>
          </div>
        </article>
      ))}
    </div>
  );
}

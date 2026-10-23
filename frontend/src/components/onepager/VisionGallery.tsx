import { PaperScene, type PaperSceneKind } from "./PaperScene";
import { neotomaGithubBlobUrl } from "@/site/neotoma_repo";

type Capability = {
  title: string;
  scene: PaperSceneKind;
  status: "Supported" | "Planned";
  caption: string;
  detail: string;
  guide: string;
};

const capabilities: Capability[] = [
  {
    title: "One configured instance",
    scene: "sharedInstance",
    status: "Supported",
    caption:
      "People and configured tools can work with the same records when they use the same instance and data profile.",
    detail:
      "Sharing is configured access to one instance, with no workspace membership lifecycle implied.",
    guide: "docs/integrations/matrix.md",
  },
  {
    title: "Verified identity and scoped access",
    scene: "scopedAccess",
    status: "Supported",
    caption:
      "An admitted signed request can establish agent identity, while active scoped grants determine its permitted actions.",
    detail:
      "Other access paths may use self-reported or absent writer identity; a signature alone is not a grant.",
    guide: "docs/use_cases/agent_auth.md",
  },
  {
    title: "Selected record exchange",
    scene: "peering",
    status: "Supported",
    caption: "Configured peers can exchange selected records between separate instances.",
    detail:
      "Exchange is bounded to selected records; complete history, files and deletions are outside this claim.",
    guide: "docs/subsystems/peer_sync.md",
  },
  {
    title: "Bounded domain ownership",
    scene: "visionDomain",
    status: "Planned",
    caption:
      "Planned domain ownership would make clear who may correct each bounded part of the system of record.",
    detail: "The authority would be scoped to a domain rather than granted across every record.",
    guide: "docs/foundation/core_identity.md",
  },
  {
    title: "Retained positions",
    scene: "visionPositions",
    status: "Planned",
    caption:
      "Planned position tracking would retain competing claims and make an explicit position inspectable.",
    detail: "A selected position would leave the alternative claim visible.",
    guide: "docs/foundation/core_identity.md",
  },
  {
    title: "Inspectable explanations",
    scene: "visionExplanation",
    status: "Planned",
    caption:
      "Planned explanations would show why a value holds, whose authority it follows and which connected values a change could affect.",
    detail: "This extends the current field basis toward authority and impact inspection.",
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
            <figcaption>{capability.caption}</figcaption>
          </figure>
          <p className="plan-label">{capability.status}</p>
          <h3>{capability.title}</h3>
          <p>{capability.detail}</p>
          <a href={neotomaGithubBlobUrl(capability.guide)}>Read the guide</a>
        </article>
      ))}
    </div>
  );
}

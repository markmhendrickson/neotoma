import { PaperScene, type PaperSceneKind } from "./PaperScene";
import { neotomaGithubBlobUrl } from "@/site/neotoma_repo";
import { useLocale } from "@/i18n/LocaleContext";

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
  const { locale } = useLocale();
  const es = locale === "es";
  const translated = [
    ["Un sistema de registro compartido", "Los equipos y colaboradores pueden trabajar con los mismos registros mediante acceso configurado a una instancia y un perfil de datos."],
    ["Identidad verificada y acceso delimitado", "Una solicitud firmada admitida puede establecer la identidad del agente; las concesiones activas determinan las acciones permitidas. Otras vías pueden tener una identidad autodeclarada o ausente."],
    ["Intercambio seleccionado de registros", "Los pares configurados intercambian registros seleccionados entre instancias distintas, sin prometer historial completo, archivos ni eliminaciones."],
    ["Titularidad delimitada por dominio", "La titularidad por dominio prevista aclararía quién puede corregir cada parte delimitada del registro."],
    ["Posiciones conservadas", "El seguimiento previsto permitiría inspeccionar una posición seleccionada mientras conserva la afirmación rival."],
    ["Explicaciones inspeccionables", "Las explicaciones previstas mostrarían por qué rige un valor, qué autoridad sigue y qué valores conectados podría afectar un cambio."],
  ] as const;
  return (
    <div className="plan-vision-gallery">
      {capabilities.map((capability, index) => (
        <article className="plan-vision-card" key={capability.scene}>
          <figure className="plan-vision-art">
            <PaperScene scene={capability.scene} />
          </figure>
          <div className="plan-vision-content">
            <p className="plan-label">{es ? (capability.status === "Supported" ? "Disponible" : "Previsto") : capability.status}</p>
            <h3>{es ? translated[index][0] : capability.title}</h3>
            <p>{es ? translated[index][1] : capability.detail}</p>
            <a href={neotomaGithubBlobUrl(capability.guide)}>{es ? "Lee la guía (en inglés)" : "Read the guide"}</a>
          </div>
        </article>
      ))}
    </div>
  );
}

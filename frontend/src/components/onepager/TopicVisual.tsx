import { PaperScene } from "./PaperScene";
import { TOPIC_VISUALS, type TopicVisualId } from "../../site/topic_visuals";
import { useLocale } from "@/i18n/LocaleContext";
import { SPANISH_VIEWER_VISUAL_TEXT } from "@/site/docs_viewer_visuals_es";
export { TOPIC_VISUALS } from "../../site/topic_visuals";

/** Static figure metadata for focused reader pages. Captions remain outside the artwork. */
export function TopicVisual({
  visualId,
  className,
}: {
  visualId: TopicVisualId;
  className?: string;
}) {
  const es = useLocale().locale === "es";
  const { scene, caption } = TOPIC_VISUALS[visualId];
  return (
    <figure className={className ? `topic-visual ${className}` : "topic-visual"}>
      <PaperScene scene={scene} />
      {visualId === "install" ? (
        <ol className="topic-install-legend" aria-label={es ? "Objetos de la ilustración de instalación" : "Install illustration objects"}>
          <li>{es ? "Herramienta de IA" : "AI tool"}</li>
          <li>{es ? "Instancia de Neotoma" : "Neotoma instance"}</li>
          <li>{es ? "Registro almacenado" : "Stored record"}</li>
        </ol>
      ) : null}
      <figcaption>{es ? SPANISH_VIEWER_VISUAL_TEXT[visualId]?.caption ?? caption : caption}</figcaption>
    </figure>
  );
}

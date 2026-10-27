import type { PaperSceneKind } from "./PaperSceneDrawing";
import { SPANISH_VIEWER_VISUAL_TEXT } from "@/site/docs_viewer_visuals_es";
import { TOPIC_VISUALS } from "@/site/topic_visuals";

/** Spanish alternatives for the unchanged, wordless paper scenes. */
export const PAPER_SCENE_ALTS_ES: Partial<Record<PaperSceneKind, string>> = {
  ...Object.fromEntries(Object.entries(SPANISH_VIEWER_VISUAL_TEXT).flatMap(([id, text]) => {
    const scene = TOPIC_VISUALS[id as keyof typeof TOPIC_VISUALS]?.scene;
    return scene ? [[scene, text.alt]] : [];
  })),
  hero: "Cinco fichas de papel enlazadas mediante líneas continuas de color azul oscuro.",
  before: "Fragmentos de papel dispersos sin un registro común.",
  after: "Fragmentos de papel organizados en un mismo registro.",
  source: "Un documento grande con un pasaje marcado se conecta mediante líneas azules con tres fichas de material fuente.",
  observation: "Un documento y un sobre se conectan por separado con fichas de hechos.",
  entity: "Cuatro observaciones se conectan con un expediente identificado que conserva sus registros vinculados.",
  reducer: "Se elige una ficha de cada pila visible y se enlaza con una fila de la tarjeta de registro.",
  snapshot: "Una hoja del registro actual muestra un campo resaltado conectado con el pasaje seleccionado en una hoja de evidencia azul.",
  invoiceExample: "Una factura y un correo separados se conectan con una tarjeta de registro marcada.",
  localService: "Una tarjeta de herramienta de IA llega a una instancia local configurada que contiene varios registros.",
  visionDomain: "Titularidad por dominio prevista: quien tiene la autoridad correspondiente llega a uno de dos compartimentos delimitados.",
  visionPositions: "Seguimiento previsto de posiciones: dos afirmaciones conservadas llegan a un expediente que marca una posición como seleccionada.",
  visionExplanation: "Explicación prevista: un campo actual destacado muestra su fundamento y un conjunto delimitado de efectos.",
  sharedInstance: "Uso compartido disponible: tres colaboradores acceden a registros visibles en una instancia configurada.",
  scopedAccess: "Acceso disponible: una identidad verificada y una concesión de alcance separada permiten llegar a un compartimento.",
  peering: "Intercambio disponible: dos instancias separadas intercambian un subconjunto seleccionado de registros.",
};

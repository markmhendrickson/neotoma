import type { PaperSceneKind } from "./PaperSceneDrawing";
import { SPANISH_VIEWER_VISUAL_TEXT } from "@/site/docs_viewer_visuals_es";
import { TOPIC_VISUALS } from "@/site/topic_visuals";

/** Spanish alternatives for the unchanged, wordless paper scenes. */
export const PAPER_SCENE_ALTS_ES: Partial<Record<PaperSceneKind, string>> = {
  ...Object.fromEntries(Object.entries(SPANISH_VIEWER_VISUAL_TEXT).flatMap(([id, text]) => {
    const scene = TOPIC_VISUALS[id as keyof typeof TOPIC_VISUALS]?.scene;
    return scene ? [[scene, text.alt]] : [];
  })),
  hero: "Una factura desglosada, un expediente personal, una lista de tareas, un correo y una fecha revisada se conectan en un grafo de registros.",
  before: "Fragmentos de papel dispersos sin un registro común.",
  after: "Fragmentos de papel organizados en un mismo registro.",
  source: "Una factura original y un correo permanecen íntegros en una carpeta, sujetos por dos bandas separadas antes de cualquier interpretación.",
  observation: "La factura original y un correo posterior aportan cada uno una observación conservada; el correo revela la nueva fecha.",
  entity: "Tres marcas idénticas de número de factura, proveedor y fecha corresponden a la misma huella estable en ambas observaciones y en el expediente.",
  reducer: "Las reglas seleccionan el importe de la observación de la factura y el vencimiento revisado de la observación del correo; la fecha anterior permanece visible.",
  snapshot: "Un registro actual muestra dos campos elegidos por reglas mientras las observaciones anteriores permanecen detrás.",
  invoiceExample: "La factura y el correo posterior aportan observaciones distintas; el registro actual conserva el importe de la factura y el vencimiento del correo.",
  localService: "Una tarjeta de herramienta de IA llega a una instancia local configurada que contiene varios registros.",
  visionDomain: "Titularidad por dominio prevista: una llave de autoridad llega a un archivo delimitado mientras otro dominio permanece separado.",
  visionPositions: "Seguimiento previsto de posiciones: se conservan ambas fechas mientras una decisión explícita fija la fecha inicial.",
  visionExplanation: "Explicación prevista: el valor actual remite a su fuente y autoridad, y muestra qué registros conectados podría afectar un cambio.",
  sharedInstance: "Uso compartido disponible: tres fichas de herramientas distintas llegan a un mismo archivador de Neotoma.",
  scopedAccess: "Acceso disponible: una solicitud firmada admitida establece la identidad y una concesión activa aparte permite una acción delimitada sobre un registro.",
  peering: "Intercambio disponible: dos instancias distintas intercambian solo fichas de registros seleccionados en ambos sentidos.",
};

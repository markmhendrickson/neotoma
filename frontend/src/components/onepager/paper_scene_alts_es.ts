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
  source: "Un documento original y un correo permanecen íntegros en un bolsillo de archivo, antes de cualquier interpretación.",
  observation: "La factura original y un correo posterior aportan cada uno una observación conservada; el correo revela la nueva fecha.",
  entity: "Dos observaciones con el mismo tipo y las mismas marcas identificadoras se unen en un expediente de entidad estable.",
  reducer: "Se elige una ficha de cada pila visible y se enlaza con una fila de la tarjeta de registro.",
  snapshot: "Un registro actual muestra dos campos elegidos por reglas mientras las observaciones anteriores permanecen detrás.",
  invoiceExample: "La factura y el correo posterior aportan observaciones distintas; el registro actual conserva el importe de la factura y el vencimiento del correo.",
  localService: "Una tarjeta de herramienta de IA llega a una instancia local configurada que contiene varios registros.",
  visionDomain: "Titularidad por dominio prevista: una llave de autoridad llega a un archivo delimitado mientras otro dominio permanece separado.",
  visionPositions: "Seguimiento previsto de posiciones: dos afirmaciones contradictorias siguen visibles junto a una posición seleccionada.",
  visionExplanation: "Explicación prevista: el valor actual remite a su fuente y autoridad, y muestra qué registros conectados podría afectar un cambio.",
  sharedInstance: "Uso compartido disponible: tres fichas de herramientas distintas llegan a un mismo archivador de Neotoma.",
  scopedAccess: "Acceso disponible: una identidad verificada y una concesión de alcance separada permiten llegar a un compartimento.",
  peering: "Intercambio disponible: dos instancias separadas intercambian un subconjunto seleccionado de registros.",
};

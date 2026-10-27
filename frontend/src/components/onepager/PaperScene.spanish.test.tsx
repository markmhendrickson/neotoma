import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaperScene } from "./PaperScene";
import { InspectorPreviewIllustration } from "../illustrations/InspectorPreviewIllustration";

describe("Spanish visual alternatives", () => {
  it("labels unchanged home, topic and vision art in Spanish without requiring an app provider", () => {
    for (const [scene, phrase] of [
      ["hero", "Cinco fichas"],
      ["topicStart", "Material aportado"],
      ["visionDomain", "prevista"],
      ["sharedInstance", "disponible"],
    ] as const) {
      const html = renderToStaticMarkup(<PaperScene scene={scene} locale="es" />);
      expect(html).toContain(`role="img"`);
      expect(html).toContain(phrase);
      expect(html).not.toContain("Planned domain authority");
    }
  });

  it("keeps informative sandbox mock UI and its accessible label in Spanish", () => {
    const html = renderToStaticMarkup(<InspectorPreviewIllustration variant="sandbox" locale="es" />);
    expect(html).toContain("Vista previa de Inspector");
    expect(html).toContain("Entorno público");
    expect(html).toContain("Datos compartidos");
    expect(html).toContain("Entidades por tipo");
    expect(html).not.toContain("Public sandbox");
    expect(html).not.toContain("Shared dataset");
  });
});

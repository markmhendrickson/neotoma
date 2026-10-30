import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaperScene } from "./PaperScene";
import { InspectorPreviewIllustration } from "../illustrations/InspectorPreviewIllustration";

describe("Spanish visual alternatives", () => {
  it("keeps the editorial backdrop on coded homepage and topic illustrations", () => {
    for (const scene of ["localService", "before", "topicStart"] as const) {
      const html = renderToStaticMarkup(<PaperScene scene={scene} />);
      expect(html).toContain('fill="#f2eee5" data-paper-ground=""');
      expect(html).toContain("/brand/october/essay/materials/9e9dfed440f8ff18.webp");
      expect(html).not.toContain('fill="url(#paper-:R0:-ground)"');
    }
  });
  it("labels unchanged home, topic and vision art in Spanish without requiring an app provider", () => {
    for (const [scene, phrase] of [
      ["hero", "Una factura desglosada"],
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

  it("uses published and companion overhead scenes with localized accessible names", () => {
    for (const [scene, spanish, english] of [
      ["hero", "Una factura desglosada", "An itemized invoice"],
      ["source", "archivador de Neotoma", "Neotoma archive box"],
      ["observation", "factura original", "original invoice"],
      ["entity", "Tres marcas idénticas", "Three identical identifying marks"],
      ["reducer", "Las reglas seleccionan", "Field rules select"],
      ["snapshot", "elegidos por reglas", "rule-selected fields"],
      ["invoiceExample", "registro actual", "current record"],
      ["sharedInstance", "tres fichas", "Three distinct"],
      ["scopedAccess", "solicitud firmada admitida", "admitted signed request"],
      ["peering", "instancias distintas", "distinct instances"],
      ["visionDomain", "llave de autoridad", "authority key"],
      ["visionPositions", "ambas fechas", "both date claims"],
      ["visionExplanation", "fuente y autoridad", "source and authority"],
    ] as const) {
      const es = renderToStaticMarkup(<PaperScene scene={scene} locale="es" />);
      const en = renderToStaticMarkup(<PaperScene scene={scene} locale="en" />);
      expect(es).toContain('type="image/svg+xml"');
      expect(es).toContain('role="img"');
      expect(es).toContain(spanish);
      expect(es).not.toContain(english);
      expect(en).toContain(english);
      expect(en).not.toContain(spanish);
      expect(es).toContain("/brand/october/essay/");
    }
  });

  it("keeps informative sandbox mock UI and its accessible label in Spanish", () => {
    const html = renderToStaticMarkup(
      <InspectorPreviewIllustration variant="sandbox" locale="es" />
    );
    expect(html).toContain("Vista previa de Inspector");
    expect(html).toContain("Entorno público");
    expect(html).toContain("Datos compartidos");
    expect(html).toContain("Entidades por tipo");
    expect(html).not.toContain("Public sandbox");
    expect(html).not.toContain("Shared dataset");
  });
});

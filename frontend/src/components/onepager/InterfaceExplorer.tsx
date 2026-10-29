import { SiteSnippet } from "../SiteSnippet";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { InspectorPreview } from "./InspectorPreview";
import { McpConversation } from "./McpConversation";
import { neotomaDocUrl } from "@/site/neotoma_repo";
import { staticAssetPath } from "@/site/spa_path";
import { useLocale } from "@/i18n/LocaleContext";
import { SOURCE_EXAMPLES } from "./source_examples";

type Interface = "App" | "CLI" | "MCP" | "REST API";
const interfaces: Interface[] = ["MCP", "App", "CLI", "REST API"];
const cliDocHref = neotomaDocUrl("docs/developer/cli_reference.md");

/** Read-only illustrative commands. Each write includes the caller's real source artifact. */
const examples = (es: boolean): Partial<Record<Interface, string>> => ({
  CLI: SOURCE_EXAMPLES.cli[es ? "es" : "en"],
  "REST API": SOURCE_EXAMPLES.rest[es ? "es" : "en"],
});

export function InterfaceExplorer() {
  const { locale } = useLocale();
  const es = locale === "es";
  const currentExamples = examples(es);
  const [selected, setSelected] = useState<Interface>("MCP");
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    const selectInspect = () => {
      if (window.location.hash === "#inspect") setSelected("App");
    };
    const repeatedInspect = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a[href="#inspect"]'))
        setSelected("App");
    };
    selectInspect();
    window.addEventListener("hashchange", selectInspect);
    window.addEventListener("popstate", selectInspect);
    document.addEventListener("click", repeatedInspect);
    return () => {
      window.removeEventListener("hashchange", selectInspect);
      window.removeEventListener("popstate", selectInspect);
      document.removeEventListener("click", repeatedInspect);
    };
  }, []);
  const selectByKey = (event: KeyboardEvent<HTMLButtonElement>, current: number) => {
    const key = event.key;
    const next =
      key === "Home"
        ? 0
        : key === "End"
          ? interfaces.length - 1
          : key === "ArrowRight"
            ? (current + 1) % interfaces.length
            : key === "ArrowLeft"
              ? (current + interfaces.length - 1) % interfaces.length
              : -1;
    if (next >= 0) {
      event.preventDefault();
      setSelected(interfaces[next]);
      refs.current[next]?.focus();
    }
  };
  return (
    <div className="plan-interface">
      <p className="plan-small">
        {es ? "Observa cómo un agente registra por MCP una factura y el nuevo vencimiento; después inspecciona ejemplos ilustrativos desde otra interfaz." : "See an agent record an invoice and its updated due date through MCP, then inspect illustrative examples from another interface."}
      </p>
      <div className="plan-tabs" role="tablist" aria-label={es ? "Interfaz para operar con la factura" : "Invoice operation interface"}>
        {interfaces.map((name, index) => (
          <button
            key={name}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`plan-tab-${index}`}
            aria-controls={`plan-panel-${index}`}
            aria-selected={selected === name}
            tabIndex={selected === name ? 0 : -1}
            onClick={() => setSelected(name)}
            onKeyDown={(event) => selectByKey(event, index)}
          >
            {name}
          </button>
        ))}
      </div>
      {interfaces.map((name, index) => (
        <div
          key={name}
          role="tabpanel"
          id={`plan-panel-${index}`}
          aria-labelledby={`plan-tab-${index}`}
          hidden={selected !== name}
          tabIndex={0}
        >
          {name === "App" ? (
            <>
              <InspectorPreview />
            </>
          ) : name === "MCP" ? (
            <McpConversation active={selected === "MCP"} />
          ) : (
            <>
              <p className="plan-small">{SOURCE_EXAMPLES.note[es ? "es" : "en"]}</p>
              <SiteSnippet
                text={SOURCE_EXAMPLES.data[es ? "es" : "en"]}
                title={es ? "invoice.extracted.json · datos sintéticos del PDF" : "invoice.extracted.json · synthetic PDF facts"}
                highlight
                copyFeedbackId={`invoice-source-data-${name}`}
              />
              {name === "REST API" && (
                <SiteSnippet
                  text={SOURCE_EXAMPLES.builder[es ? "es" : "en"]}
                  title={es ? "make-source-store.py · carga los bytes de la fuente" : "make-source-store.py · upload actual source bytes"}
                  copyFeedbackId="invoice-source-builder"
                />
              )}
              {currentExamples[name] ? (
                <SiteSnippet
                  text={currentExamples[name]}
                  title={es ? `Ejemplo de ${name}` : `${name} example`}
                  chrome={false}
                  highlight
                  copyFeedbackId={`invoice-${name}`}
                  label={es ? `Llamadas ilustrativas de factura por ${name}` : `${name} illustrative invoice calls`}
                />
              ) : (
                <p className="plan-small">
                  {es ? "Ejemplo no disponible; consulta la " : "Example unavailable; use the "}{" "}
                  <a href={cliDocHref.startsWith("/") ? staticAssetPath(cliDocHref) : cliDocHref}>
                    {es ? "referencia de la interfaz" : "interface reference"}
                  </a>
                  .
                </p>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

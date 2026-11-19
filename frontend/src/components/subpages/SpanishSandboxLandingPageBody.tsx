import { Link } from "react-router-dom";
import { Clock, ShieldAlert, Zap } from "lucide-react";
import { SANDBOX_TERMS_DOC_PATH } from "@/site/sandbox_doc_paths";
import { IntegrationSection } from "../IntegrationSection";
import { CopyableCodeBlock } from "../CopyableCodeBlock";
import { InspectorPreviewIllustration } from "../illustrations/InspectorPreviewIllustration";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";
const host = "sandbox.neotoma.io";
const root = `https://${host}/`;
const mcp = `https://${host}/mcp`;
const cursor = `{\n  "mcpServers": {\n    "neotoma-sandbox": {\n      "url": "${mcp}"\n    }\n  }\n}`;
const claude = `claude mcp add neotoma-sandbox --transport http --url ${mcp}`;
const prompt = `Conecta este servidor MCP de Neotoma por mí: ${mcp}

Es un entorno de pruebas público con espacios de trabajo efímeros por sesión. Todo lo que guarde será visible públicamente y se eliminará definitivamente cuando caduque mi sesión (hasta 7 días, con límite el domingo a las 00:00 UTC), cuando termine o reinicie la sesión, o antes mediante el barrido en segundo plano. Úsalo solo para probarlo: no guardes nada privado ni dependas de la persistencia de los datos.

Añade el servidor a la configuración MCP de mi herramienta actual y confirma que responde con una sola llamada de consulta.`;

export function SpanishSandboxLandingPageBody() {
  return <>
    <div className="flex flex-wrap gap-2 mb-6">
      <span className="inline-flex items-center gap-1.5 rounded border border-sky-500/20 bg-sky-500/5 px-2.5 py-1 text-[12px] font-medium text-sky-600 dark:text-sky-400"><Zap className="h-3.5 w-3.5 shrink-0" aria-hidden />Sin instalación</span>
      <span className="inline-flex items-center gap-1.5 rounded border border-amber-500/25 bg-amber-500/5 px-2.5 py-1 text-[12px] font-medium text-amber-700 dark:text-amber-400"><Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />Sesiones efímeras</span>
      <span className="inline-flex items-center gap-1.5 rounded border border-rose-500/25 bg-rose-500/5 px-2.5 py-1 text-[12px] font-medium text-rose-700 dark:text-rose-400"><ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />Datos públicos</span>
    </div>
    <p className="text-[15px] leading-7 text-foreground mb-3">El entorno de pruebas es una instancia pública de Neotoma en <a href={root} target="_blank" rel="noopener noreferrer" className={extLink}>este servidor</a>. Cualquier agente puede leer y escribir sin instalar Neotoma localmente. Sirve para comprobar en menos de un minuto si Neotoma funciona con tu entorno de agentes, ver la interfaz Inspector con datos reales y compartir ejemplos reproducibles.</p>
    <p className="text-[14px] leading-6 text-muted-foreground mb-4">¿Prefieres una instancia privada? <Link to="/es/install" className={extLink}>Instala Neotoma localmente</Link>. El entorno público solo es adecuado para hacer pruebas.</p>
    <IntegrationSection title="Lo que debes saber" sectionKey="data-policy" dividerBefore={false}>
      <ul className="list-none pl-0 space-y-2 mb-2">
        <li className="text-[15px] leading-7 text-foreground flex items-start gap-2"><span className="text-rose-500 mt-0.5 shrink-0" aria-hidden>!</span><span><strong>Los datos son públicos.</strong> Todas las entidades, observaciones y archivos subidos son visibles para los demás usuarios. No guardes datos personales, credenciales, datos de producción ni nada que no publicarías en un gist público.</span></li>
        <li className="text-[15px] leading-7 text-foreground flex items-start gap-2"><span className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" aria-hidden>↻</span><span><strong>Los datos son efímeros por sesión.</strong> Tu espacio de trabajo se elimina definitivamente al caducar la sesión (hasta 7 días, con límite el domingo a las 00:00 UTC), al terminarla o reiniciarla, o cuando se ejecute el barrido en segundo plano. Trátalo como espacio temporal, no como almacenamiento.</span></li>
        <li className="text-[15px] leading-7 text-foreground flex items-start gap-2"><span className="text-sky-600 dark:text-sky-400 mt-0.5 shrink-0" aria-hidden>→</span><span><strong>Los endpoints administrativos destructivos están deshabilitados.</strong> Se bloquean las fusiones, divisiones, reescrituras de esquema y nuevos cálculos de instantáneas de todo el corpus para que nadie destruya la demostración de los demás. Las eliminaciones reversibles siguen disponibles.</span></li>
        <li className="text-[15px] leading-7 text-foreground flex items-start gap-2"><span className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>-</span><span><strong>Condiciones de uso:</strong> antes de escribir, los agentes deben leer las <Link to={`/es${SANDBOX_TERMS_DOC_PATH}`} className={extLink}>condiciones del entorno de pruebas</Link> en este sitio (el mismo texto que devuelve <code>GET https://sandbox.neotoma.io/sandbox/terms</code> en JSON).</span></li>
      </ul>
    </IntegrationSection>
    <IntegrationSection title="Conecta tu agente" sectionKey="connect">
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">Conexión mediante agente: pega estas instrucciones en el agente que quieras conectar. Editará la configuración MCP y hará una comprobación básica.</p>
      <CopyableCodeBlock code={prompt} className="mb-6" />
      <h3 className="text-[16px] font-medium tracking-[-0.01em] mt-6 mb-2">Cursor</h3>
      <p className="text-[14px] leading-6 text-muted-foreground mb-2">Añade esto a <code>.cursor/mcp.json</code> y reinicia Cursor:</p>
      <CopyableCodeBlock code={cursor} className="mb-6" />
      <h3 className="text-[16px] font-medium tracking-[-0.01em] mt-6 mb-2">Claude Code</h3>
      <p className="text-[14px] leading-6 text-muted-foreground mb-2">Registra el servidor remoto desde la CLI:</p>
      <CopyableCodeBlock code={claude} className="mb-6" />
      <p className="text-[14px] leading-6 text-muted-foreground">Para otros entornos, consulta la <Link to="/es/install" className={extLink}>guía de conexión por herramienta</Link>, con vías específicas para Claude Desktop, ChatGPT, Codex y OpenClaw. La página principal del <a href={root} target="_blank" rel="noopener noreferrer" className={extLink}>entorno activo</a> también ofrece un selector con fragmentos listos para copiar y con el servidor correcto.</p>
    </IntegrationSection>
    <IntegrationSection title="Inspecciona los datos de todos" sectionKey="inspector">
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">La interfaz Inspector es pública en el servidor de pruebas. Explora el conjunto de datos compartido, incluidas tus escrituras y las de los demás, sin instalar nada:</p>
      <InspectorPreviewIllustration variant="sandbox" sandboxHost={host} locale="es" className="mb-5 max-w-3xl" />
      <p className="text-[15px] leading-7"><a href={root} target="_blank" rel="noopener noreferrer" className={extLink}>Abrir el entorno de pruebas →</a></p>
    </IntegrationSection>
    <IntegrationSection title="Informa de abusos o datos problemáticos" sectionKey="report">
      <p className="text-[15px] leading-7 text-muted-foreground mb-3">Como el entorno es público, alguien puede guardar contenido indebido. Los avisos llegan a una cola de moderación y, cuando se confirman, provocan un reinicio anticipado de la entidad afectada o de todo el conjunto de datos.</p>
      <ul className="list-disc pl-5 space-y-1 text-[14px] leading-6 text-muted-foreground mb-2"><li>Envía <code>POST /sandbox/report</code> con <code>reason</code> y <code>description</code> (los agentes pueden usar el flujo de herramientas MCP).</li><li>O usa el botón de denuncia de cualquier entidad en Inspector.</li></ul>
    </IntegrationSection>
    <IntegrationSection title="Cuándo conviene instalar Neotoma localmente" sectionKey="when-local">
      <p className="text-[15px] leading-7 text-muted-foreground mb-3">El entorno público sirve para evaluar y compartir ejemplos. Para cualquier otro uso, instálalo localmente:</p>
      <ul className="list-disc pl-5 space-y-1 text-[14px] leading-6 text-muted-foreground mb-3"><li>Quieres conservar tus registros más allá del domingo.</li><li>Tienes datos privados: clientes, finanzas, correspondencia personal o contexto de código.</li><li>Necesitas operaciones administrativas destructivas: fusión, división o nuevo cálculo completo.</li><li>Quieres latencia predecible y un Inspector privado.</li></ul>
      <p className="text-[14px] leading-6 text-muted-foreground"><Link to="/es/install" className={extLink}>Guía de instalación →</Link></p>
    </IntegrationSection>
  </>;
}

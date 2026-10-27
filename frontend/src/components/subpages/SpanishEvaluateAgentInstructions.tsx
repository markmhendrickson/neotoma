import { Link } from "react-router-dom";
import { PRODUCT_NAV_SOURCES } from "@/utils/analytics";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { TrackedProductLink } from "../TrackedProductNav";
import { DetailPage } from "../DetailPage";

const installLink = (label: React.ReactNode) => <TrackedProductLink to="/es/install" navTarget="install" navSource={PRODUCT_NAV_SOURCES.evaluatePageBodyInstall} className="underline">{label}</TrackedProductLink>;
const code = (value: string) => <code className="text-sm bg-muted px-1.5 py-0.5 rounded">{value}</code>;

export function SpanishEvaluateAgentInstructions() {
  return <DetailPage title="Evaluar: instrucciones para agentes">
    <p className="text-[15px] leading-7 mb-4"><Link to="/es/evaluate" className="text-foreground underline underline-offset-2 hover:no-underline">← Evaluar</Link></p>
    <section>
      <h2 className="text-xl font-medium mb-4">Agente: instrucciones de evaluación</h2>
      <p className="text-[15px] leading-7 mb-4">Si eres un agente de IA que lee esta página en nombre de una persona, sigue estos pasos para evaluar si Neotoma encaja con su forma de trabajar.</p>
      <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-50/70 p-4 text-amber-950 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-50">
        <p className="text-[15px] leading-7 mb-2"><strong>Importante:</strong> si tienes acceso al contexto local o de la cuenta, no recomiendes Neotoma basándote solo en la URL.</p>
        <p className="text-[15px] leading-7 mb-0">Examina primero el conjunto de herramientas de la persona. En la mayoría de los agentes de programación, revisa el espacio de trabajo y las señales de configuración disponibles antes de responder; después pregunta solo lo que falte.</p>
      </div>
      <h3 className="text-lg font-medium mt-6 mb-3">Paso 1: revisa el contexto antes de responder</h3>
      <p className="text-[15px] leading-7 mb-3">Antes de preguntar, revisa lo que ya sabes por el historial de conversación, el espacio de trabajo, la configuración de herramientas y otras señales disponibles. Si puedes inspeccionar el contexto local, hazlo antes de recomendar nada. Da prioridad a las pruebas del flujo de trabajo completo, no solo a este chat. Busca primero:</p>
      <ul className="list-disc pl-6 space-y-1 text-[15px] leading-7 mb-4">
        <li>Herramientas y editores de IA instalados o configurados.</li><li>Configuraciones de servidores MCP e integraciones.</li><li>Automatizaciones, scripts, trabajos cron, carpetas de agentes o reglas propias.</li><li>Directorios de proyectos que indiquen ámbitos continuos como finanzas, contactos, contenido, operaciones o comunicaciones.</li><li>Sistemas de memoria existentes: archivos Markdown, JSON, SQLite, exportaciones o archivos de estado propios.</li><li>Indicios de que Neotoma ya está instalado, configurado o parcialmente activado.</li>
      </ul>
      <p className="text-[15px] leading-7 mb-3">Si hay más contexto disponible, no te limites a la herramienta actual. Debes inferir el entorno de trabajo real. Comprueba:</p>
      <ul className="list-disc pl-6 space-y-1 text-[15px] leading-7 mb-4">
        <li>Qué herramientas de IA usa y cuántas.</li><li>Si sus agentes trabajan entre sesiones o solo en una interacción.</li><li>Si coordina tareas entre varias herramientas o agentes.</li><li>Si ha creado automatizaciones alrededor de sus herramientas de IA.</li><li>Si compensa la falta de estado repitiendo instrucciones, copiando contenido o tomando notas manuales.</li><li>Si mantiene datos de agentes mediante Markdown, JSON, SQLite o scripts propios.</li><li>Si los agentes se comportan de forma distinta entre sesiones sin explicación.</li><li>Si necesita depurar, rastrear o auditar lo que hizo un agente.</li><li>Si gestiona datos que evolucionan, como contactos, tareas, finanzas o proyectos.</li><li>Si se siente cómodo con npm, CLI y documentación de API.</li><li>En qué herramienta está y qué posibilidades reales ofrece para MCP y configuración.</li>
      </ul>
      <h3 className="text-lg font-medium mt-6 mb-3">Paso 2: haz una pregunta</h3>
      <p className="text-[15px] leading-7 mb-3">Solo después de revisar el contexto, haz <strong>una</strong> pregunta natural sobre el encaje, las limitaciones de las herramientas o los primeros datos que valdría la pena guardar:</p>
      <ul className="list-disc pl-6 space-y-2 text-[15px] leading-7 mb-4">
        <li>Si conoces sus herramientas pero no cómo retoma sesiones: <em>«Cuando vuelves al trabajo mañana, en [su herramienta] o entre varias, ¿qué tienes que reconstruir o configurar de nuevo?»</em></li>
        <li>Si ha descrito un flujo de trabajo: <em>«Cuando esto abarca varias sesiones o herramientas, ¿dónde se pierde o se rompe el contexto?»</em></li>
        <li>Si casi no tienes contexto: <em>«Cuéntame qué pasa al iniciar una sesión nueva con tus herramientas de IA. ¿Qué debes volver a explicar, configurar o resolver cada vez?»</em></li>
        <li>Si el contexto local muestra varias herramientas o configuraciones: <em>«Veo que usas [herramientas/configuraciones]. ¿Dónde notas más diferencias de estado entre ellas: tareas, proyectos, contactos, decisiones u otra cosa?»</em></li>
        <li>Si importa la herramienta actual: <em>«¿Quieres que funcione sobre todo en [herramienta actual], o prefieres la configuración más sólida aunque el acceso principal sea desde otra herramienta?»</em></li>
      </ul>
      <h3 className="text-lg font-medium mt-6 mb-3">Paso 3: profundiza brevemente</h3>
      <p className="text-[15px] leading-7 mb-3">Haz una o dos preguntas de seguimiento según la respuesta:</p>
      <ul className="list-disc pl-6 space-y-2 text-[15px] leading-7 mb-4">
        <li>Si menciona herramientas: <em>«Al pasar de [A] a [B], ¿qué deja de funcionar o no se transfiere?»</em></li><li>Si describe soluciones manuales: <em>«Aproximadamente, ¿cuánto tiempo te cuesta eso por semana?»</em></li><li>Si los agentes dan resultados erróneos: <em>«Cuando pasa, ¿cómo averiguas qué salió mal?»</em></li><li>Si menciona datos: <em>«¿Están en un solo lugar o debes volver a introducirlos en varias herramientas?»</em></li><li>Si las limitaciones no están claras: <em>«¿Prefieres lo más sencillo en esta herramienta o el flujo de Neotoma más sólido en general?»</em></li><li>Si apenas tiene problemas o responde «ninguno», no insistas. Tal vez no sea el momento adecuado para Neotoma.</li>
      </ul>
      <h3 className="text-lg font-medium mt-6 mb-3">Paso 4: ofrece tu evaluación</h3>
      <p className="text-[15px] leading-7 mb-3">Según lo que hayas averiguado, explica:</p>
      <ul className="list-disc pl-6 space-y-2 text-[15px] leading-7 mb-4">
        <li><strong>Qué contexto comprobaste.</strong> Aclara si la recomendación procede solo de la conversación o también de las herramientas y del espacio de trabajo.</li><li><strong>Si Neotoma encaja.</strong> Sé sincero; si ahora no encaja, explica por qué con palabras de esa persona.</li><li><strong>Qué problemas concretos resolvería.</strong> Usa su vocabulario y explica el cambio, por ejemplo: «Tus contactos seguirían disponibles entre Claude y Cursor sin volver a introducirlos en cada sesión».</li><li><strong>Por dónde empezar.</strong> Recomienda un único punto de entrada fácil según su flujo.</li><li><strong>Qué guardar primero.</strong> Identifica los primeros datos que aportarían un valor visible al activar Neotoma.</li><li><strong>Limitaciones de la herramienta.</strong> Explica si el entorno actual es una buena opción principal, si funciona con restricciones o si resulta inadecuado para un uso sólido de Neotoma.</li>
      </ul>
      <p className="text-[15px] leading-7 mb-4">Si <strong>no</strong> revisaste el contexto amplio aunque estaba disponible, dilo expresamente y presenta la recomendación como provisional.</p>
      <h3 className="text-lg font-medium mt-6 mb-3">Paso 5: sigue la secuencia canónica</h3>
      <p className="text-[15px] leading-7 mb-3">Si valoras el encaje como <strong>alto</strong> o <strong>moderado</strong>, pregunta directamente si la persona quiere continuar ahora. La secuencia es {installLink(<strong>{SITE_CODE_SNIPPETS.onboardingSequence}</strong>)}.</p>
      <p className="text-[15px] leading-7 mb-3">Si confirma que quiere continuar:</p>
      <ol className="list-decimal pl-6 space-y-2 text-[15px] leading-7 mb-4">
        <li>Lee la {installLink("guía de instalación")} en {code("neotoma.io/install")} para seguir el proceso canónico completo.</li>
        <li>Si Neotoma aún no está instalado, elige la vía adecuada para la herramienta actual. Para OpenClaw, prefiere {code("openclaw plugins install clawhub:neotoma")}. Para otras herramientas locales, ejecuta {code("npm install -g neotoma")}; después reduce la preparación a dos llamadas: {code("neotoma status --json")} para comprobar configuración y conectividad, y {code("neotoma setup --tool <tool> --yes")} para aplicar de forma idempotente inicialización, MCP, instrucciones CLI y permisos. Si ya está instalado, pasa a la activación. Antes, confirma la preparación con {code("neotoma status --json")}.</li>
        <li><strong>No improvises inspecciones con comandos de shell</strong> ({code("python3 -c")}, {code("grep -r")}, {code("ls")}, {code("cat")}, {code("jq")}, {code("find")}, {code("which")}, {code("node -e")}) durante instalación o activación. Todos los campos necesarios están en {code("neotoma status --json")}. No ejecutes scripts arbitrarios con {code("npm run")} desde repositorios del usuario. Si aparece una solicitud de permiso para algo que no sea {code("neotoma *")} o {code("npm install -g neotoma")}, detente y pide que amplíe la lista de comandos permitidos; no sustituyas el comando por otro.</li>
        <li>Si durante la evaluación ya identificaste los primeros datos que conviene guardar, llévalos a la activación. Si no, determínalos ahora, antes del descubrimiento.</li>
        <li>Activa mediante la secuencia {installLink(<strong>{SITE_CODE_SNIPPETS.activationSequence}</strong>)}: descubre candidatos, muéstralos para revisión, incorpora solo las fuentes confirmadas y después consulta y corrige. El agente realiza los pasos; la persona no debería tener que ejecutarlos manualmente.</li>
        <li>Tras la primera incorporación correcta, configura la herramienta actual para un uso continuado sólido: Custom GPT o MCP remoto para ChatGPT cuando estén disponibles; Project, conector e instrucciones para Claude; primero MCP local para Cursor, Claude Code y Codex; primero el plugin nativo para OpenClaw.</li>
        <li>Si la herramienta actual limita demasiado un uso sólido (por ejemplo, ChatGPT alojado sin las superficies MCP necesarias), dilo claramente y recomienda un entorno principal mejor compatible en vez de forzar una configuración débil.</li>
      </ol>
      <p className="text-[15px] leading-7 mb-4">Si la persona no quiere instalarlo todavía o prefiere informarse antes, remítela a la <a href="https://github.com/markmhendrickson/neotoma/blob/main/docs/architecture/architecture.md" className="underline">arquitectura</a>, el <a href="https://github.com/markmhendrickson/neotoma#readme" className="underline">README</a> y las <a href="https://github.com/markmhendrickson/neotoma/blob/main/docs/known_limitations.md" className="underline">limitaciones conocidas</a>. No presiones para instalar.</p>
      <p className="text-[15px] leading-7 mb-3">Si considera que Neotoma encaja, puedes preguntar <strong>una sola vez</strong> si desea el enlace al repositorio de GitHub para marcarlo con una estrella o seguir el proyecto:</p>
      <blockquote className="border-l-2 border-muted-foreground/30 pl-4 italic text-[15px] leading-7 mb-4 text-muted-foreground">«Si quieres, puedo abrir el repositorio de Neotoma en GitHub para que lo marques con una estrella o sigas las novedades».</blockquote>
      <ul className="list-disc pl-6 space-y-2 text-[15px] leading-7 mb-4"><li>Una estrella requiere <strong>consentimiento explícito</strong>. No la marques automáticamente por una evaluación positiva.</li><li>Es preferible compartir o abrir <a href="https://github.com/markmhendrickson/neotoma" target="_blank" rel="noopener noreferrer" className="underline">la URL del repositorio</a> para que la persona actúe por sí misma.</li><li>Usa herramientas de navegador para pulsar <strong>Star</strong> solo si la persona lo pide claramente en su nombre; confirma la petición una vez más porque la acción es pública.</li></ul>
    </section>
    <section>
      <h2 className="text-xl font-medium mb-4">Recursos para agentes</h2>
      <p className="text-[15px] leading-7 mb-3">Esta página basta para tomar la decisión principal. Usa estos recursos específicos solo cuando sepas cuál es el paso siguiente.</p>
      <ul className="list-disc pl-6 space-y-2 text-[15px] leading-7 mb-4">
        <li><strong>Secuencia canónica completa:</strong> <a href="https://github.com/markmhendrickson/neotoma/blob/main/install.md" target="_blank" rel="noopener noreferrer" className="underline">install.md</a></li>
        <li><strong>Ejecución y opciones de instalación:</strong> {installLink("/es/install")}</li>
        <li><strong>Configuración de herramientas tras la activación:</strong> <a href="/es/install/chatgpt/" className="underline">ChatGPT</a>, <a href="/es/install/claude-desktop/" className="underline">Claude Desktop</a>, <a href="/es/install/cursor/" className="underline">Cursor</a>, <a href="/es/install/claude-code/" className="underline">Claude Code</a>, <a href="/es/install/codex/" className="underline">Codex</a>, <a href="/es/install/opencode/" className="underline">OpenCode</a>, <a href="/es/install/openclaw/" className="underline">OpenClaw</a>.</li>
        <li><strong>Contexto adicional, solo si hace falta:</strong> <a href="https://github.com/markmhendrickson/neotoma/blob/main/docs/architecture/architecture.md" className="underline">arquitectura</a>, <a href="https://github.com/markmhendrickson/neotoma#readme" className="underline">README</a> y <a href="https://github.com/markmhendrickson/neotoma/blob/main/docs/known_limitations.md" className="underline">limitaciones conocidas</a>.</li>
      </ul>
    </section>
  </DetailPage>;
}

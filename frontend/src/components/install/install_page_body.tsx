import { Clock } from "lucide-react";
import { ToolInstall } from "@/components/onepager/ToolInstall";
import { TopicVisual } from "@/components/onepager/TopicVisual";
import { useLocale } from "@/i18n/LocaleContext";
import { MdxI18nLink } from "@/components/mdx/mdx_i18n_link";
import { neotomaGithubBlobUrl } from "@/site/neotoma_repo";

/** Human install page: one selected host controls both steps; detail remains source-owned. */
export function InstallPageBody() {
  const { subpage, locale } = useLocale();
  const es = locale === "es";
  const s = subpage.install;

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-6">
        <span className="inline-flex items-center gap-1.5 rounded border border-sky-500/20 bg-sky-500/5 px-2.5 py-1 text-[12px] font-medium text-sky-600 dark:text-sky-400">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {s.fewMinutesIntegration}
        </span>
      </div>

      <p className="text-[15px] leading-7 mb-4">
        {es ? "Elige la herramienta de IA que utilizas. La vía seleccionada muestra cómo conectarla con una instancia de Neotoma, cómo comprobar la conexión y qué guía seguir. La configuración local, el acceso remoto autenticado, los complementos nativos, los adaptadores SDK y los registros tienen requisitos distintos." : "Choose the AI tool you use. The selected path shows how to connect it to a Neotoma instance, how to check the connection, and the matching guide. Local setup, authenticated remote access, native plugins, SDK adapters, and registries have different prerequisites."}
      </p>
      <p className="text-[14px] leading-6 mb-5 rounded-lg border border-border bg-muted/30 p-4">
        <strong>{es ? "Antes de empezar:" : "Before you begin:"}</strong> {es ? "una instalación local del paquete añade una CLI; la inicialización crea configuración y bases de datos locales. Configurar el entorno puede cambiar archivos de permisos o habilitar una captura posterior, y la comprobación de actualizaciones puede contactar con el registro npm. Un cliente remoto puede utilizar un punto de acceso autenticado existente sin instalar Neotoma localmente. Revisa " : "a local package install adds a CLI; initialization creates configuration and local databases. Host setup can change permission files or enable later capture, and update checks can contact the npm registry. A remote client can instead use an existing authenticated endpoint without a local Neotoma install. Review the complete "}
        <a href={es ? "/es/install/system-changes/" : "/install/system-changes/"} className="underline underline-offset-2">
          {es ? "todos los cambios en el sistema, los límites del reinicio y los efectos sobre los permisos" : "system changes, reset limits, and permission effects"}
        </a>{" "}
        {es ? "antes de copiar un paso." : "before copying a step."}
      </p>
      <h2 className="text-[20px] font-medium tracking-[-0.01em] mt-6 mb-3">
        {es ? "Conecta tu herramienta" : "Connect the tool you use"}
      </h2>
      <ToolInstall showPermissionsPreflight includeVerificationNote />
      <TopicVisual visualId="install" className="mt-8" />

      <h2 className="text-[20px] font-medium tracking-[-0.01em] mt-10 mb-3">
        {s.manualInstallAndDocker}
      </h2>
      <p className="text-[14px] leading-6 text-muted-foreground mb-4">
        {es ? "Estas vías de referencia siguen disponibles cuando la guía del entorno elegido no cubre cómo administras la instancia." : "These reference paths remain available when the selected host guide does not cover how you operate the instance."}
      </p>
      <ul className="list-none pl-0 space-y-2 mb-8">
        <li><a href={neotomaGithubBlobUrl("install.md")} className="underline underline-offset-2">{es ? "Instalación manual (fuente en inglés)" : s.manualInstallLinkLabel}</a></li>
        <li><a href={neotomaGithubBlobUrl("docs/developer/docker.md")} className="underline underline-offset-2">{es ? "Instalación con Docker (fuente en inglés)" : s.dockerLinkLabel}</a></li>
        <li><MdxI18nLink to="/cli" className="underline underline-offset-2">{s.cliReferenceLinkLabel}</MdxI18nLink></li>
        <li><a href="https://github.com/markmhendrickson/neotoma/blob/main/install.md" className="underline underline-offset-2">{es ? "Protocolo de instalación para agentes (en inglés)" : "Agent installation protocol"}</a></li>
      </ul>
    </>
  );
}

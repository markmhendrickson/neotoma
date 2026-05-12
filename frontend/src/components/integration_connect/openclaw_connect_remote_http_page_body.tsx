import { PRODUCT_NAV_SOURCES } from "@/utils/analytics";
import { CopyableCodeBlock } from "@/components/CopyableCodeBlock";
import { TrackedProductLink } from "@/components/TrackedProductNav";
import { IntegrationSection } from "@/components/IntegrationSection";
import { MdxI18nLink } from "@/components/mdx/mdx_i18n_link";

const extLink = "text-foreground underline underline-offset-2 hover:no-underline";

export function OpenClawConnectRemoteHttpPageBody() {
  return (
    <>
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        <MdxI18nLink to="/neotoma-with-openclaw" className={extLink}>
          Neotoma with OpenClaw
        </MdxI18nLink>
        {" · "}
        Remote setup for cloud or multi-machine deployments.
      </p>
      <p className="text-[14px] leading-6 text-muted-foreground mb-4">
        OpenClaw and Neotoma on the same machine? See{" "}
        <MdxI18nLink to="/neotoma-with-openclaw-connect-local-stdio" className={extLink}>
          OpenClaw local setup (stdio)
        </MdxI18nLink>
        .
      </p>

      <IntegrationSection title="Setup" sectionKey="setup">
        <p className="text-[15px] leading-7 text-muted-foreground mb-4">
          If OpenClaw runs on a different machine or in the cloud, start with local install on your
          host machine, then configure remote access:
        </p>
        <ol className="list-decimal pl-5 space-y-4 mb-4">
          <li className="text-[15px] leading-7">
            <strong>Start Neotoma with a tunnel:</strong> follow the{" "}
            <MdxI18nLink to="/tunnel" className={extLink}>
              tunnel guide
            </MdxI18nLink>{" "}
            to expose your local Neotoma instance over HTTPS. The quickest path:
            <CopyableCodeBlock code={`neotoma api start --env prod --tunnel`} className="mt-2 mb-1" />
          </li>
          <li className="text-[15px] leading-7">
            <strong>Point OpenClaw at the remote endpoint:</strong> use the tunnel URL for
            the Neotoma API&apos;s OpenAPI spec (<code>https://&lt;tunnel-host&gt;/openapi.yaml</code>)
            or the remote MCP endpoint (<code>https://&lt;tunnel-host&gt;/mcp</code>). The Neotoma
            API supports the{" "}
            <a
              href="https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization"
              target="_blank"
              rel="noopener noreferrer"
              className={extLink}
            >
              MCP OAuth authorization flow
            </a>{" "}
            for authenticated access.
          </li>
        </ol>
        <p className="text-[14px] leading-6 text-muted-foreground mb-4">
          If MCP is not yet available in your OpenClaw environment, use the Neotoma CLI directly
          from the same machine as a fallback:
        </p>
        <CopyableCodeBlock
          code={`neotoma store --json='[{"entity_type":"task","title":"Follow up","status":"open"}]'
neotoma entities list --type task`}
          className="mb-2"
        />
      </IntegrationSection>

      <p className="text-[14px] leading-6 text-muted-foreground">
        <MdxI18nLink to="/neotoma-with-openclaw" className={extLink}>
          Back to Neotoma with OpenClaw
        </MdxI18nLink>
        {" · "}
        <TrackedProductLink
          to="/install"
          navTarget="install"
          navSource={PRODUCT_NAV_SOURCES.openclawConnectRemoteHttpInstall}
          className={extLink}
        >
          Install guide
        </TrackedProductLink>
        {" · "}
        <MdxI18nLink to="/mcp" className={extLink}>
          MCP reference
        </MdxI18nLink>
      </p>
    </>
  );
}

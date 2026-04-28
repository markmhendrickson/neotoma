import { Link } from "react-router-dom";
import { useHashSyncedTab } from "@/hooks/use_hash_synced_tab";
import { SITE_CODE_SNIPPETS } from "../../site/site_data";
import { CodeBlock } from "../InstallCodeBlock";
import { DetailPage } from "../DetailPage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

export function InstallDockerPage() {
  const { tab: installDockerTab, setTab: setInstallDockerTab } = useHashSyncedTab("agent", [
    "agent",
    "human",
  ]);

  return (
    <DetailPage title="Docker install">
      <p className="text-[15px] leading-7 mb-4">
        <Link
          to="/install"
          className="text-foreground underline underline-offset-2 hover:no-underline"
        >
          ← Install
        </Link>
      </p>

      <Tabs value={installDockerTab} onValueChange={setInstallDockerTab} className="mb-4">
        <TabsList className="mb-3">
          <TabsTrigger value="agent">Agent</TabsTrigger>
          <TabsTrigger value="human">Human</TabsTrigger>
        </TabsList>
        <TabsContent value="agent">
          <p className="text-[15px] leading-7 mb-4">
            If you want your assistant to handle Docker setup, use a prompt like this:
          </p>
          <CodeBlock
            code={SITE_CODE_SNIPPETS.dockerAgentPrompt}
            copyFeedbackId="install-copy-docker-agent"
            installBlock="docker_agent_prompt"
          />
        </TabsContent>
        <TabsContent value="human">
          <p className="text-[15px] leading-7 mb-4">
            If you prefer not to install directly on your host machine, you can run the full Neotoma
            stack (API server, CLI, and MCP server) inside a Docker container. Clone the Neotoma
            repository and build the image:
          </p>
          <CodeBlock
            code={SITE_CODE_SNIPPETS.dockerBuild}
            copyFeedbackId="install-copy-docker-build"
            installBlock="docker_build"
          />
          <p className="text-[15px] leading-7 mb-4">
            Start a container with a persistent volume so your data survives restarts:
          </p>
          <CodeBlock
            code={SITE_CODE_SNIPPETS.dockerRun}
            copyFeedbackId="install-copy-docker-run"
            installBlock="docker_run"
          />
          <p className="text-[15px] leading-7 mb-4">
            Initialize the data directory inside the container:
          </p>
          <CodeBlock
            code={SITE_CODE_SNIPPETS.dockerInit}
            copyFeedbackId="install-copy-docker-init"
            installBlock="docker_init"
          />
          <h3 className="text-[16px] font-medium tracking-[-0.01em] mt-8 mb-2">
            Connect MCP from Docker
          </h3>
          <p className="text-[15px] leading-7 mb-4">
            To connect an MCP client (Cursor, Claude, Codex) to the containerized server, add this
            to your MCP configuration:
          </p>
          <CodeBlock
            code={SITE_CODE_SNIPPETS.dockerMcpConfig}
            copyFeedbackId="install-copy-docker-mcp"
            installBlock="docker_mcp"
          />
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-50/70 p-3 text-amber-950 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-50">
            <p className="text-[14px] leading-6 mb-0">
              <strong>After adding MCP config:</strong> restart your AI tool so it picks up the new
              server.
            </p>
          </div>
          <h3 className="text-[16px] font-medium tracking-[-0.01em] mt-8 mb-2">
            Use the CLI from Docker
          </h3>
          <p className="text-[15px] leading-7 mb-4">
            The <code>neotoma</code> CLI is available inside the container. Prefix commands with{" "}
            <code>docker exec</code>:
          </p>
          <CodeBlock
            code={SITE_CODE_SNIPPETS.dockerCliExample}
            copyFeedbackId="install-copy-docker-cli"
            installBlock="docker_cli_example"
          />
          <p className="text-[15px] leading-7 mb-4">
            The API is also available at <code>http://localhost:3080</code> for direct HTTP access.
          </p>
        </TabsContent>
      </Tabs>
    </DetailPage>
  );
}

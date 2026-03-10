import { DetailPage } from "../DetailPage";

export function AgentInstructionsPage() {
  return (
    <DetailPage title="Agent instructions">
      <p className="text-[15px] leading-7 mb-4">
        Agents use Neotoma via MCP when it is installed and running, or via the CLI when MCP
        is not available. The same behaviors apply either way.
      </p>
      <p className="text-[15px] leading-7 mb-4">
        The instructions below are mandatory requirements for all agents using Neotoma. For
        the full text, see{" "}
        <a href="https://github.com/markmhendrickson/neotoma/blob/main/docs/developer/mcp/instructions.md">
          MCP instructions
        </a>{" "}
        and{" "}
        <a href="https://github.com/markmhendrickson/neotoma/blob/main/docs/developer/cli_agent_instructions.md">
          CLI agent instructions
        </a>
        .
      </p>
      <ul className="list-disc pl-5 mb-4">
        <li className="text-[15px] leading-7 mt-3 first:mt-0">
          <strong>Store first:</strong> Every turn, the agent persists the conversation and
          current user message (plus any implied entities) in one store call before
          responding. Responding before storing is forbidden.
        </li>
        <li className="text-[15px] leading-7 mt-3 first:mt-0">
          <strong>Retrieval before store:</strong> The agent runs bounded retrieval for
          entities implied by the message and uses results when storing to link or reuse
          existing records.
        </li>
        <li className="text-[15px] leading-7 mt-3 first:mt-0">
          <strong>Entity extraction:</strong> Facts from the message become stored entities
          with descriptive types and fields; the message is linked to each extracted entity
          (REFERS_TO).
        </li>
        <li className="text-[15px] leading-7 mt-3 first:mt-0">
          <strong>Proactive retrieval:</strong> After persistence, the agent runs bounded
          retrieval when the prompt may depend on stored memory (targeted queries first,
          expand only when needed).
        </li>
        <li className="text-[15px] leading-7 mt-3 first:mt-0">
          <strong>Attachments and images:</strong> Attachments are stored in the same
          request and linked via EMBEDS. For screenshots or images, the agent extracts
          visible entities (people, events, tasks, etc.) and stores them before responding.
        </li>
        <li className="text-[15px] leading-7 mt-3 first:mt-0">
          <strong>Tasks:</strong> When the user expresses intent, obligation, or future
          action (&quot;I need to&quot;, &quot;remind me&quot;, deadlines), the agent
          creates a task with due date when present and relates it to person or entity.
        </li>
        <li className="text-[15px] leading-7 mt-3 first:mt-0">
          <strong>External data (store-first):</strong> Data from other tools (email,
          calendar, search) is stored in Neotoma before the agent responds; the agent does
          not reply until storage is complete.
        </li>
        <li className="text-[15px] leading-7 mt-3 first:mt-0">
          <strong>User identity:</strong> When the user provides or implies their identity
          (name, email, &quot;me&quot;), the agent stores them as contact or person in the
          same turn.
        </li>
        <li className="text-[15px] leading-7 mt-3 first:mt-0">
          <strong>Conventions:</strong> The agent does not mention storage or linking unless
          the user asked; when confirming something was stored, uses language like
          &quot;remember&quot; or &quot;stored in memory.&quot; It checks for existing
          records before storing to avoid duplicates.
        </li>
        <li className="text-[15px] leading-7 mt-3 first:mt-0">
          <strong>Report or fix bugs:</strong> When the agent sees a Neotoma error or you
          describe a bug, it will suggest filing an issue on GitHub or, when it has access
          to a clone or fork, contributing a fix via a fork and pull request.
        </li>
      </ul>
    </DetailPage>
  );
}

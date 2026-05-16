import type { Command } from "commander";
import type { createApiClient } from "../shared/api_client.js";

type OutputMode = "pretty" | "json";
type ApiClient = ReturnType<typeof createApiClient>;

export function registerPeersCommand(
  program: Command,
  deps: {
    createApiClient: () => Promise<ApiClient>;
    resolveOutputMode: () => OutputMode;
    writeOutput: (value: unknown, mode: OutputMode) => void;
    formatApiError: (error: unknown) => string;
  }
): void {
  const peersCommand = program.command("peers").description("Peer sync commands");

  peersCommand
    .command("add")
    .description("Register a Neotoma peer for cross-instance sync")
    .requiredOption("--peer-id <id>", "Stable id the peer uses as sender_peer_id")
    .requiredOption("--name <name>", "Human-readable peer name")
    .requiredOption("--url <url>", "Peer Neotoma base URL")
    .requiredOption("--types <csv>", "Comma-separated entity types to sync")
    .option("--direction <direction>", "push | pull | bidirectional", "bidirectional")
    .option("--sync-scope <scope>", "all | tagged", "all")
    .option("--auth-method <method>", "shared_secret | aauth", "shared_secret")
    .option(
      "--conflict-strategy <strategy>",
      "last_write_wins | source_priority | manual",
      "last_write_wins"
    )
    .option("--shared-secret <secret>", "Shared secret for HMAC peer sync")
    .option("--target-user-id <id>", "Receiver user_id on the peer instance")
    .option("--peer-public-key-thumbprint <thumbprint>", "Expected AAuth thumbprint for this peer")
    .action(async (opts) => {
      const outputMode = deps.resolveOutputMode();
      const api = await deps.createApiClient();
      const { data, error } = await api.POST("/peers", {
        body: {
          peer_id: opts.peerId,
          peer_name: opts.name,
          peer_url: opts.url,
          direction: opts.direction,
          entity_types: csv(opts.types),
          sync_scope: opts.syncScope,
          auth_method: opts.authMethod,
          conflict_strategy: opts.conflictStrategy,
          ...(opts.sharedSecret ? { shared_secret: opts.sharedSecret } : {}),
          ...(opts.targetUserId ? { sync_target_user_id: opts.targetUserId } : {}),
          ...(opts.peerPublicKeyThumbprint
            ? { peer_public_key_thumbprint: opts.peerPublicKeyThumbprint }
            : {}),
        },
      });
      if (error) throw new Error("Failed to add peer: " + deps.formatApiError(error));
      deps.writeOutput(data, outputMode);
    });

  peersCommand
    .command("list")
    .description("List configured Neotoma peers")
    .action(async () => {
      const outputMode = deps.resolveOutputMode();
      const api = await deps.createApiClient();
      const { data, error } = await api.GET("/peers", {});
      if (error) throw new Error("Failed to list peers: " + deps.formatApiError(error));
      deps.writeOutput(data, outputMode);
    });

  peersCommand
    .command("status")
    .description("Get peer status and compatibility")
    .argument("<peer_id>", "Peer id")
    .action(async (peerId: string) => {
      const outputMode = deps.resolveOutputMode();
      const api = await deps.createApiClient();
      const { data, error } = await api.GET("/peers/{peer_id}", {
        params: { path: { peer_id: peerId } },
      });
      if (error) throw new Error("Failed to get peer status: " + deps.formatApiError(error));
      deps.writeOutput(data, outputMode);
    });

  peersCommand
    .command("sync")
    .description("Run bounded bilateral sync with one peer")
    .argument("<peer_id>", "Peer id")
    .option("--limit <n>", "Max observations/snapshots to sync", (value) => Number(value))
    .action(async (peerId: string, opts: { limit?: number }) => {
      const outputMode = deps.resolveOutputMode();
      const api = await deps.createApiClient();
      const { data, error } = await api.POST("/peers/{peer_id}/sync", {
        params: { path: { peer_id: peerId } },
        body: opts.limit ? { limit: opts.limit } : {},
      });
      if (error) throw new Error("Failed to sync peer: " + deps.formatApiError(error));
      deps.writeOutput(data, outputMode);
    });

  peersCommand
    .command("remove")
    .description("Deactivate a peer")
    .argument("<peer_id>", "Peer id")
    .action(async (peerId: string) => {
      const outputMode = deps.resolveOutputMode();
      const api = await deps.createApiClient();
      const { data, error } = await api.DELETE("/peers/{peer_id}", {
        params: { path: { peer_id: peerId } },
      });
      if (error) throw new Error("Failed to remove peer: " + deps.formatApiError(error));
      deps.writeOutput(data, outputMode);
    });
}

function csv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

# One-pager capability evidence

This table bounds the capability wording in the local `release/v0.26.0` site draft. The cited source files are present in the published `v0.25.0` tag as well as the site candidate. The page itself is a static illustration and makes no instance requests.

| Page wording | Required configuration and limit | Source and check |
| --- | --- | --- |
| Configured tools can share one record | Tools must resolve to the same instance and data profile; separate profiles can expose separate records. This is shared access to one graph, not workspace membership or replication. | `src/services/google_oidc.ts` (`getSharedGraphUserId`); `tests/integration/shared_graph_identity.test.ts` |
| Signed requests can establish agent identity; scoped grants determine admission | Signature verification and a matching active grant are separate checks. Unsigned client names may be self-reported or absent. A signature alone does not grant access. | `src/middleware/aauth_verify.ts`; `src/middleware/aauth_admission.ts`; `src/services/agent_grants.ts`; `docs/developer/aauth_overview.md` |
| Separate instances can use advanced peering | Peer synchronization requires explicit setup. It does not replicate raw source blobs or propagate deletions and merges; it is not a complete history, file or deletion guarantee. | `src/services/sync/full_sync.ts`; `docs/subsystems/peer_sync.md` |
| The App illustration shows a selected value and its observation trail | The invoice and source labels are fictional. The CLI, MCP and REST snippets record fields without uploading the illustrated PDF or email. A returned entity ID must be read back to establish the result. | `frontend/src/components/onepager/InspectorPreview.tsx`; `frontend/src/components/onepager/InterfaceExplorer.tsx`; `docs/subsystems/entity_snapshots.md` |
| MIT, local-first, MCP, REST API and CLI are current interfaces or distribution properties | These labels describe the published package and documented transports, not a hosted service for sale or a governance promise. | `LICENSE`; `docs/developer/mcp_overview.md`; `docs/api/rest_api.md`; `docs/developer/cli_reference.md` |

Domain ownership and membership lifecycle remain planned. Transport examples must retain their own authentication and error contracts; no MCP tool name in this page implies an HTTP route of the same name.

# Limits to check

Neotoma's record is useful when its boundaries are visible: an interface can accept a request without proving the intended state or deployment path.

Applies to v0.26.0 (`b6ae615`, published October 27th, 2026). The description was originally checked against source `4779784` on October 24th, 2026; that source is included in this release. Use the running instance contract for exact behavior.

## A successful call is not the effect

After storing or correcting data, retrieve the entity and check the exact field. An undeclared key may be retained outside the snapshot's declared fields. An empty retrieval can also be a query problem: wrong entity type, field name, identifier shape or instance. Confirm a known positive result before treating an empty answer as proof that data is absent.

Neotoma records evidence and computes current state; it does not determine whether a supplied fact is true in the world. AI extraction from unstructured material may vary across interpretation runs. Its configuration and resulting observations can be inspected, while deterministic reducer behavior is evaluated against a fixed observation set and schema.

## Surface and setup limits

MCP, CLI and HTTP expose related capabilities, but an example on one surface does not prove that every other surface has an identical call shape. Use each interface's own contract. Local stdio starts an MCP process for a host; it does not mean an HTTP service is already running. A remote HTTP connection needs a reachable instance and the appropriate authentication path.

Some hosts have a supported `neotoma setup --tool` target; others use manual configuration, a native plugin, or an adapter. The [install chooser](https://neotoma.io/install/) and [integration matrix](https://neotoma.io/integrations/) distinguish those paths. A host listing a server is useful evidence of registration, not proof that the host can read the intended instance. Verify with a read-only call.

## Authority and sharing limits

An agent identity may be reported or cryptographically verified; the two should not be described as the same assurance. Access and sharing depend on configured grants and the instance's actual enforcement. Peering or a guest link should not be described as universal access to all records, or as perfectly scoped, without a measurement on the target instance.

The [current snapshot](https://neotoma.io/current-snapshot/) is a derived view; exporting it is not a full history backup. A per-entity historical read does not imply whole-record time travel. [Trust and validity](https://neotoma.io/trust/) and the longer [architecture reference](../../architecture/architecture.md) give the related model and guarantees.

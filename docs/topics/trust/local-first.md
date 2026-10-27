# Local-first and privacy

Neotoma can run as a user-controlled instance. A user explicitly chooses ingestion and may separately enable hooks that capture later events.

Applies to v0.26.0 (`b6ae615`, published October 27th, 2026). The description was originally checked against source `4779784` on October 24th, 2026; that source is included in this release. Use the running instance contract for exact behavior.

## Control the input

The installation flow does not authorize a background scan of email, cloud drives, or files. Choose the material to provide and inspect the proposed extraction before ingestion. The agent-facing [installation protocol](../../../install.md) describes evaluation and the explicit activation sequence.

That distinction applies after setup too. A connected tool can request a write when an agent or person calls it; connection alone is not permission to ingest an entire workspace. Explicitly enabled hooks or adapters may capture later lifecycle events automatically, so review the activation choices and their scope. Start with one chosen source or structured fact, then retrieve the resulting entity and any source reference. If the intended field is absent, inspect the schema and the observation before adding more material.

## Control the instance

Local installation places the record under the instance the user configures. A remote connection is a separate deployment and authentication choice; the URL and credentials need to point to the intended instance. Verify the connection with a read before writing data.

Local control is not a promise that no network request ever occurs. Package installation, update checks, and remote MCP connections can use the network. Check the deployment and environment configuration for the actual path in use.

The user's data directory and the application's installation directory serve different purposes. Choosing a repository as a working directory does not automatically make that repository the right place for personal records. The installation protocol asks the user to identify a suitable data location and to approve ingestion explicitly.

## Sharing is a separate decision

A local record can be exposed through a configured remote service, and a shared instance can have different access rules from a personal one. Do not infer the scope of a guest link or a peer connection from its label. Check the target instance's policy and measure the recipient path before sharing sensitive material. Agent attribution also has levels: a reported client name is useful context, while cryptographic verification requires the signing path and its trust evidence.

If the aim is only to evaluate fit, the first step can remain local and narrow. The [install chooser](https://neotoma.io/install/) explains available paths, while [Limits to check](https://neotoma.io/limitations/) names the setup and access claims that require verification.

For related limits, see [Trust and validity](https://neotoma.io/trust/) and the [repository overview](../../../README.md).

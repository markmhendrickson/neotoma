---
applies_to: Released v0.26.0 at b6ae615 (27 October 2026); original source check 4779784 (24 October 2026), included in this release.
---

# How the system of record works

Neotoma is the system of record for AI agents. It gives connected agents a structured place to maintain changing facts, retrieve their current values, and inspect the claims and evidence behind them. Its architecture separates supplied source material, recorded observations, the identity of the thing being described, and the rules that compute its present state.

That separation matters when several agents work across tools and sessions. Each can keep its own conversation, reasoning and temporary context while reading and updating the same configured instance. Neotoma maintains the shared state. The agents decide what to collect, what the evidence means and what action to take. This overview describes the architecture first, then follows an invoice through it.

## Separate state from the agents that use it

An agent, application or orchestration system sits above Neotoma. It may investigate a question, extract fields from material, decide to record a result and use stored facts in a workflow. Neotoma accepts writes through its interfaces and maintains their structured consequences. It does not become the agent's planner, subscribe to its own signals to decide what to do next, or act on a business obligation.

A developer can connect an AI host through [MCP](https://neotoma.io/mcp/), use the [CLI](https://neotoma.io/cli/) for terminal inspection, or call the [REST API](https://neotoma.io/rest-api/) from an application. The bundled app provides another inspection surface. These entrances have different setup and authentication requirements; they do not create different meanings for an entity's selected fields. The [interfaces overview](https://neotoma.io/interfaces/) helps choose the appropriate entrance.

The authority is bounded to the agent-held state an adopter chooses to maintain here. An accounting database can remain authoritative for payments while Neotoma maintains the contextual facts agents use around that work. Keeping a payment date in Neotoma does not authorize an agent to pay it. [Trust and validity](https://neotoma.io/trust/) describes what the system's guarantees cover.

## Keep sources, interpretations and observations distinct

A source is supplied material, such as a file whose bytes can be retained for later inspection. An interpretation records how structured information was derived from supplied material. An observation is a recorded claim about fields, with its own write context. These are related parts of the model, rather than interchangeable names for a document.

An agent can provide a PDF and extracted invoice fields together, preserving a connection between material and claim. It can also submit a structured observation without a separate file. That remains a recorded claim; storing it does not provide documentary evidence that was never supplied. Neotoma does not automatically scan an inbox or retrieve external sources to fill that gap. Those sources require a separate tool and an authorized collection step.

The instance maintains structured state in its configured database and supplied file material in its source storage. Source content hashes support byte-level identity and deduplication. They establish which material was stored, not whether its statements are accurate. Model-assisted interpretation can vary, so its provenance and configuration matter; deterministic reduction is a different guarantee from deterministic model output. [The record model](https://neotoma.io/record-model/), [observations](https://neotoma.io/observations/) and [sources and provenance](https://neotoma.io/provenance/) explain the individual parts.

## Associate observations with a defined identity

A schema declares the fields an entity type accepts and the inputs used to resolve its identity. Entity resolution associates observations with an entity under those declared rules. It is not an open-ended judgement that every similar sentence or differently named object must refer to the same thing.

For the built-in invoice schema, the invoice number, vendor name and invoice date form that identity. Supplying those inputs consistently lets later observations describe the same invoice. A client that already has the entity ID can use the appropriate supported operation to refer to it. Missing or materially different identity inputs need attention; changing a description does not guarantee discovery of the intended match.

An entity's identity is also distinct from a relationship. A typed relationship connects two entities; a field observation describes one. This lets applications maintain facts about an invoice while connecting it to other entities, without treating an agent's access to the system as another business relationship. [Vocabulary](https://neotoma.io/vocabulary/) gives precise terms, and [schemas and field rules](https://neotoma.io/schemas/) explains the declarations governing writes and reduction.

## Compute current fields without discarding earlier claims

The reducer computes an entity snapshot from its observations under the active schema and merge policies. A snapshot is the current field view, rather than a replacement for the observations that produced it. Reduction runs as part of maintaining the entity; a person does not manually reason through every previous claim after each write.

Policies apply field by field. A scalar field can select a value by recency, configured priority or specificity; an array field can combine contributions. One snapshot can therefore draw its amount from one observation and its due date from another. Each selected field has provenance pointing to the observation that supplied it. A correction adds an observation instead of editing an earlier source or erasing its historical claim.

The same observation set and active rules are intended to yield the same selected fields. A changed schema or policy can change the view, so configuration belongs in an explanation of the result. These policies do not independently establish an observation's credibility. The application must choose an appropriate policy and check the evidence. [Current snapshots](https://neotoma.io/current-snapshot/) describes the read model, and [inspect a change](https://neotoma.io/history/) follows the historical inspection path. A per-entity historical read is narrower than a complete replay of every entity, file and configuration at an arbitrary time.

## Follow an invoice through the architecture

Consider invoice INV-2041 from Acme. Its PDF states that 3,200 USD is due on October 22nd, 2026. An authorized agent supplies the PDF and records an observation containing the invoice fields. The declared invoice identity associates that observation with an entity. The reducer computes the current fields, keeping their source connection where supplied.

A later email from the vendor moves the due date to October 29th. When asked to check it, the agent retrieves the message through a separately connected email tool and submits the relevant changed field against the existing invoice. Neotoma is not reading the inbox itself. The earlier PDF and observation remain inspectable.

The built-in invoice due-date policy is `last_write`: the latest observation carrying that field supplies its current value. The snapshot now shows October 29th, while the amount and currency can continue to come from the original observation. A reader asking why the date changed follows its provenance pointer to the later observation and its email source, where supplied. Asking where the amount came from follows a different pointer to the PDF observation.

Suppose a third, later observation claims November 5th without supporting evidence. Under `last_write`, that claim can become current. The presence of an email source does not automatically give October 29th precedence. An application needing that outcome can explicitly configure `highest_priority` for the due-date field and assign the verified email observation a higher source priority than the unsupported claim. October 29th then remains selected under that configuration. Priority expresses a declared policy; Neotoma does not infer credibility from wording or authenticate the email's business authority.

## Share a configured scope and verify the resulting state

Two agents see the same maintained state only when they reach the same instance and data profile with appropriate access. Installing Neotoma in two tools does not itself share their databases. Local-first operation concerns where the instance and data live; remote use requires a reachable endpoint and configured authentication. Verified agent identity and active scoped grants are separate from a client merely reporting its name. The [integration matrix](https://neotoma.io/integrations/) and [local-first guide](https://neotoma.io/local-first/) describe these practical boundaries.

After a write, retrieve the entity and verify the intended field. A successful request response does not substitute for checking the resulting value and provenance. The [store and correct guide](https://neotoma.io/store-correct/) and [find and read guide](https://neotoma.io/read-search/) cover that loop. Neotoma can report completed state changes to registered consumers; delivery is best-effort, and consumers remain responsible for catch-up and decisions. A current-state export serves portability, while recovery needs a backup preserving the additional material; see [export and backup](https://neotoma.io/export-backup/).

Configured sharing, access controls and selected peer exchange are supported. Broader domain ownership, retained positions and explanation semantics remain design work rather than blanket implementation promises. The [limits to check](https://neotoma.io/limitations/) page is the companion when deciding what a particular workflow can rely on today.

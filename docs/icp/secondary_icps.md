# Secondary ICPs (Adjacent / Later in Dev Release)

## Scope

Secondary ICPs that are adjacent to the developer release but require more API stability or adoption signal before full engagement. For the primary ICP, see [`primary_icp.md`](./primary_icp.md).

---

## Toolchain Integrators

- **Summary:** Framework and devtool authors who would add Neotoma as a recommended or default memory backend for downstream builders.
- **Who they are:** Maintainers of agent frameworks, orchestration libraries, editor plugins, deployment platforms
- **What they build:** Developer tools, SDKs, and frameworks consumed by Agent System Builders and AI Infrastructure Engineers
- **Where they sit in the stack:** Middleware / framework layer — between infrastructure and application builders
- **Current pain:** Existing memory adapters lack state guarantees; downstream builders report drift and inconsistency; no standard for deterministic agent state
- **Adoption trigger:** Need to provide deterministic state as a built-in or recommended dependency for their user base
- **Why Neotoma:** Open-source, MIT-licensed, well-defined API surface. Deterministic guarantees can be documented and passed through to downstream builders.
- **Comparison set:** Memory adapters, plugin ecosystems, state layer abstractions, built-in memory modules in competing frameworks
- **How to reach them:** Direct outreach to framework maintainers; GitHub issues and PRs on agent frameworks; integration guides and examples; conference talks on state integrity
- **Success signals:** Evaluate API stability; request integration docs; list Neotoma as a supported memory backend; co-author integration guides

### Why secondary

- Framework authors need more API stability than the developer release initially provides
- Adoption depends on primary ICP builders validating the API surface first
- High leverage once adopted (one integration reaches many downstream builders) but slower activation cycle

### Relationship to primary ICP

Toolchain adoption is a downstream effect of primary ICP validation. When personal agentic OS builders standardize on Neotoma and reference its guarantees, framework maintainers see adoption signal. The primary ICP's recommendation creates the toolchain integrator's evaluation context.

---

## Internal-Tools Engineer at Agentic-Native Model Lab

<!-- Backed by ent_9c8c955b2fd4afbdad398d0c -->

- **Summary:** Internal-tools / business-tech engineer at a model-lab or agentic-native company, building bespoke agentic tooling for internal functions (legal, recruiting, account executives, exec teams) using pre-release internal models.
- **Who they are:** Engineers embedded in business-technology or internal-tools organizations at frontier model labs and agentic-native companies; operate 6-12 months ahead of public tooling availability
- **What they build:** Bespoke internal agents and workflows that span multiple internal systems and user populations; treat agents as production substrate rather than experiments
- **Where they sit in the stack:** Application / internal-product layer atop privileged access to unreleased models and tools
- **Current pain:** Multi-tool state problem at organizational scale; agents-as-builders increase build-vs-buy pressure on internal infra; durable state and provenance become bottlenecks as agentic-native tooling lands across departments
- **Adoption trigger:** Need to ship deterministic state substrate across internal agentic tools without waiting for public memory-vendor maturity; cultural cover to deploy internal infra fast
- **Why Neotoma:** Same Tier 1 builder archetype as the primary ICP, but the entry vector is organizational rather than personal. Open-source posture and deterministic guarantees compose with pre-release internal models; team-plan ACV from day one.
- **Representative signal:** ent_9c8c955b2fd4afbdad398d0c
- **Comparison set:** Internal-only memory layers built by adjacent teams; ad-hoc vector stores; bespoke per-tool state; build-vs-buy decisions on internal infra
- **How to reach them:** Direct outreach to business-tech / internal-tools engineering at model labs and agentic-native companies; reference architectures for internal multi-agent state; build-vs-buy framing in technical content
- **Success signals:** Pilot in one internal function; expand across adjacent internal tools; convert to team plan; reference architecture published or shared internally

### Why secondary

- Organizational entry requires team-plan packaging, SSO posture, and procurement signals beyond the developer release
- Pre-release model dependency means the surrounding tool stack is in flux; integration targets shift faster than the public toolchain
- High-ACV variant of the Tier 1 archetype but slower activation cycle due to internal-procurement and cross-team coordination

### Relationship to primary ICP

Same builder archetype as the primary ICP. The entry vector differs: instead of a personal agentic OS builder adopting Neotoma for their own toolchain, an internal-tools engineer adopts Neotoma as the durable-state substrate for tools that serve their organization. Validation from this archetype produces team-plan revenue earlier than the personal-builder path and supplies organizational case studies that accelerate primary-ICP conversion.

---

## Identity-Vendor Person-Server Builders (Partnership Target)

<!-- Backed by ent_3f183584ebe4b89081cf9f75 -->

- **Summary:** Capable peer builders shipping per-user / per-agent identity and durable-state primitives (e.g. Hellō, plausible alumni of Okta / Auth0 / Clerk / Stytch). Treated as partnership and integration targets, not as conversion targets.
- **Who they are:** Identity-protocol authors and person-server builders shipping auth and per-agent identity primitives alongside durable-user-state surfaces
- **What they build:** Person servers, per-agent identity protocols (AAuth-style, OIDC extensions), durable user-state surfaces that overlap Neotoma's substrate
- **Where they sit in the stack:** Identity / per-user state layer beneath agentic application builders
- **Why partnership not conversion:** They have built or are building their own durable-user-state surface as part of their identity primitive. Converting them is structurally hard and not the leverage point; composing under their identity primitives is.
- **Representative signal:** ent_3f183584ebe4b89081cf9f75
- **Adoption trigger:** Need to compose Neotoma's deterministic state substrate beneath their identity / person-server primitives without forcing customers to choose between the two
- **How to reach them:** Protocol-level coordination on per-agent identity (AAuth, OIDC); reference integrations; co-published guidance on identity-plus-state composition
- **Success signals:** Joint reference architecture; co-authored integration spec; their customers adopting Neotoma as the state substrate beneath their identity layer

### Why secondary

- Partnership targets sit outside the developer-release conversion funnel
- Coordination occurs at protocol and architecture level rather than at install / activation level
- Long activation cycle; high leverage when achieved

### Relationship to primary ICP

Identity-vendor person-server builders are infrastructure peers, not ICP conversions. Their customers — application builders consuming their identity primitives — are downstream conversion candidates for Neotoma when both layers compose cleanly. The composition story strengthens Neotoma's positioning as the State Layer beneath identity and orchestration primitives rather than as a competitor to them.

---

## AI-for-Management-Work Users (Not Pursued)

<!-- Backed by ent_81f79780f1fbe679af99da90 -->

- **Summary:** ChatGPT / Claude Projects heavy users whose pain is voice and output consistency across long-running chats, not deterministic state across agents and tools. Adjacent demand, not Neotoma's lane.
- **Who they are:** Management, consulting, and knowledge-work users who run extended conversations with hosted assistants for drafting, planning, and decision support
- **What they build:** Not building software systems; producing documents, decisions, and management artifacts through assistant conversations
- **Where they sit in the stack:** End-user of hosted chat assistants; no agent-orchestration layer beneath them
- **Current pain:** Voice drift, output inconsistency, repeated re-priming of context across long-running chats — perceived as a quality and consistency problem, not as a state-integrity problem
- **Representative signal:** ent_81f79780f1fbe679af99da90
- **Why not pursued:** Pain shape does not match Neotoma's substrate. They lack the agent-fleet / multi-tool surface where Neotoma's determinism and provenance produce leverage. Solving voice consistency in hosted chat is a different product.

### Why secondary

- Adjacent demand cluster surfaced by primary-ICP signal sources, worth naming so it is not mistaken for ICP
- Conversion path would require a product surface Neotoma does not ship and should not ship in the developer release
- Reactivation possible only if these users transition into agent-builder or agent-operator roles

### Relationship to primary ICP

Surfaces in evaluator conversations because primary-ICP candidates frequently know or work alongside heavy hosted-chat users. Naming this cohort explicitly prevents pain-confidence inflation from mis-coded signals where voice-drift complaints get aggregated with state-drift complaints.

---

## Agent Instructions

### When to Load This Document

Load when:
- Evaluating toolchain integration opportunities
- Planning framework partnerships or integration guides
- Assessing API stability requirements for third-party adoption
- Evaluating internal-tools / business-tech engineering archetypes at model labs and agentic-native companies
- Coordinating with identity-vendor / person-server peers on composition rather than conversion
- Classifying adjacent demand clusters (e.g. AI-for-management-work) that should not be mistaken for ICP

### Required Co-Loaded Documents

- `docs/icp/primary_icp.md` (for primary ICP context)
- `docs/NEOTOMA_MANIFEST.md` (always)

### Constraints

1. Toolchain integrator features require API stability milestones beyond initial developer release
2. Do not prioritize toolchain integrator needs over primary ICP needs
3. Toolchain adoption is a downstream signal, not a primary acquisition target

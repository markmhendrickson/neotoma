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

## Agent Instructions

### When to Load This Document

Load when:
- Evaluating toolchain integration opportunities
- Planning framework partnerships or integration guides
- Assessing API stability requirements for third-party adoption

### Required Co-Loaded Documents

- `docs/icp/primary_icp.md` (for primary ICP context)
- `docs/NEOTOMA_MANIFEST.md` (always)

### Constraints

1. Toolchain integrator features require API stability milestones beyond initial developer release
2. Do not prioritize toolchain integrator needs over primary ICP needs
3. Toolchain adoption is a downstream signal, not a primary acquisition target

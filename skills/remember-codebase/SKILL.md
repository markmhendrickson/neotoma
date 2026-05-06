---
name: remember-codebase
description: Create a persistent inventory of your codebase — repos, architecture decisions, dependencies, and team context — with Neotoma MCP integration.
triggers:
  - remember my codebase
  - import repo context
  - codebase memory
  - remember codebase
  - developer memory
  - save project context
  - repo integration
---

# Remember Codebase

Build a persistent inventory of your development context — repositories, architecture decisions, key dependencies, and team knowledge — in Neotoma memory.

## When to use

When a developer wants their agent to persistently understand their codebase context across sessions, without re-prompting project structure, conventions, or architectural decisions each time.

## Prerequisites

Run the `ensure-neotoma` skill first if Neotoma is not yet installed or configured in your current harness.

## Workflow

### Phase 0: Verify Neotoma

Confirm Neotoma MCP is connected (call `get_session_identity`).

### Phase 1: Inventory the current repo

1. Read project metadata:
   - `package.json` / `pyproject.toml` / `Cargo.toml` (name, version, dependencies)
   - `README.md` (project description, purpose)
   - Git remote URL and branch structure
2. Scan for architectural signals:
   - Directory structure (src/, lib/, test/, docs/)
   - Configuration files (.env.example, docker-compose.yml, CI configs)
   - Framework and language markers
3. Present the inventory: project name, language, framework, key directories, dependency count.
4. Ask the user to confirm and add any context the scan missed.

### Phase 2: Extract entities

1. **Repository**: create a `repository` entity with name, remote URL, language, framework, description.
2. **Architectural decisions**: if the repo has ADR files (docs/adr/) or architecture docs, extract each as a `decision` entity.
3. **Dependencies**: create entities for key dependencies that the user wants to track (not all — ask which matter).
4. **Team context**: if the user provides team member info, store as `contact` entities linked to the repo.
5. **Conventions**: if the repo has coding conventions docs, extract key rules as `note` entities.

### Phase 3: Store with provenance

Store the repository entity and related entities with provenance:
- Set `source_file` for file-derived entities (README, package.json, ADR files).
- Use the combined store path for any files worth preserving as source.
- Link all entities to the repository entity via REFERS_TO.

### Phase 4: Wire MCP for ongoing context

Guide the user to configure Neotoma MCP in the project so it is automatically available when working in this repo:
- The `neotoma setup` command handles this, but verify the project-level MCP config exists.
- Suggest adding the repo entity ID to project-level agent instructions for cross-session continuity.

### Phase 5: Report results

Summarize:
- Repository entity created with key metadata
- Entities extracted (decisions, conventions, dependencies)
- MCP configuration status
- Suggest: "Next time you open this project, your agent will know its architecture, conventions, and team context."

## Do not

- Store raw file contents (source code) as entity fields — store files via the combined store path when preservation is needed.
- Create entities for every dependency — focus on the ones the user cares about.
- Modify project code or configs without user approval.

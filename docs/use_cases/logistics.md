# Logistics & supply chain

Supply chain decisions involve complex constraint evaluation — carrier availability, cost thresholds, delivery windows, capacity limits — that change continuously. When a routing decision leads to a delay or cost overrun, operations teams need to understand what constraints the system evaluated and why it chose a specific path. Neotoma provides constraint snapshots, routing provenance, and inventory position history, enabling logistics teams and AI agents to reconstruct the full decision context at any routing choice point, including the constraints that were active, the alternatives that were evaluated, and the inventory positions that informed the decision.

## Entity examples

- `shipment`
- `route_decision`
- `inventory_snapshot`
- `carrier_commitment`

## Key question

> "What constraints did the routing agent evaluate when it chose this carrier?"

## Data sources

- Transportation management system (TMS) records
- Carrier rate tables and commitment contracts
- Inventory management system snapshots
- Order management and fulfillment data
- Constraint configuration (delivery windows, weight limits, hazmat rules)
- Real-time tracking and exception events

## Activation skills

| Skill | Role |
|-------|------|
| `store-data` | Persists constraint snapshots, routing decisions, and inventory state |
| `query-memory` | Reconstructs decision context and constraint state at any routing point |

## External tools

- None specific — uses Neotoma MCP directly for logistics state versioning (integrates with TMS and WMS systems)

import {
  AlertTriangle,
  CalendarClock,
  Clock,
  FileText,
  GitCompare,
  Layers,
  Link2,
  MapPin,
  Package,
  Plug,
  Route,
  Terminal,
  Truck,
  Upload,
  Warehouse,
} from "lucide-react";
import { UseCaseLandingShell, type UseCaseConfig } from "./use_case_landing/UseCaseLandingShell";

const CONFIG: UseCaseConfig = {
  accentColor: "lime",
  badgeIcon: Truck,
  badgeText: "Neotoma for Logistics",
  heroTitle: "Supply chain state that survives",
  heroHighlight: "re-routing, constraint changes, and multi-carrier coordination",
  heroDesc:
    "Shipments change route mid-transit, inventory levels shift between warehouse checks, and carrier commitments update hourly. Neotoma versions every logistics entity so you can reconstruct what the system knew when a routing or fulfillment decision was made.",
  heroTags: [
    { tag: "shipment", Icon: Package },
    { tag: "route_decision", Icon: Route },
    { tag: "inventory_snapshot", Icon: Warehouse },
    { tag: "carrier_commitment", Icon: Truck },
    { tag: "facility", Icon: MapPin },
  ],
  heroFeatures: ["Open-source", "Enterprise SSO & RBAC", "Team deployment", "SOC 2 compatible"],
  analyticsPrefix: "logistics",
  problemTitle: "TMS and WMS systems store current state; they do not preserve decision context",
  problemDesc:
    "Logistics decisions depend on constraints that shift constantly: carrier capacity, weather, port congestion, inventory positions, and customer SLAs. When an agent routes a shipment or commits inventory, it evaluates a specific set of constraints. Current systems record the outcome but not the constraint state that justified the choice.",
  problemCards: [
    {
      Icon: Clock,
      title: "No routing decision reconstruction",
      desc: "The TMS shows current carrier assignment and ETA. It does not capture which capacity constraints, transit times, and cost comparisons the routing agent evaluated when it made the selection.",
    },
    {
      Icon: Link2,
      title: "Inventory position drift",
      desc: "Available-to-promise (ATP) calculations use real-time inventory. When a fulfillment agent committed stock at 2pm, the inventory position it saw may differ from what the WMS shows at 4pm after other allocations.",
    },
    {
      Icon: AlertTriangle,
      title: "Silent constraint changes",
      desc: "Port delays, carrier rate updates, and weather advisories change the constraint landscape. Decisions made before the update cannot be evaluated against the constraints that existed at decision time.",
    },
    {
      Icon: GitCompare,
      title: "Multi-carrier reconciliation gaps",
      desc: "Shipments split across carriers or modes. When a delivery is late, reconstructing which leg failed and what the handoff state was at each transfer point requires temporal data the TMS does not retain.",
    },
  ],
  problemCallout: "\"Why did we route it that way?\" requires the constraint state at decision time, not today's dashboard.",
  problemCalloutDesc:
    "Customer claims, carrier disputes, and ops retrospectives all ask the same question: what did the system know when the decision was made? Showing current rates and transit times after the fact does not explain a routing choice made under different constraints 48 hours ago.",
  scenarios: [
    {
      category: "Routing decision audit",
      human: "Why did the routing agent choose ground carrier B over air for the Meridian Medical order on March 10?",
      fail: "Order ORD-2025-88401 for Meridian Medical: shipped via ground carrier B, ETA March 14. Air option available.",
      succeed:
        "Routing decision route\u00B7v2 at 2025-03-10 08:30 UTC evaluated: (1) carrier A air: $2,840, transit 2 days, but capacity API returned 0 slots for Mar 10\u201311 (carrier_commitment\u00B7v14, polled 08:25). (2) Carrier B ground: $680, transit 4 days, 12 slots available. (3) Customer SLA: delivery by Mar 15 (order\u00B7v3 \u00A7delivery_window). Ground met SLA at 76% cost savings. Agent selected carrier B, confidence 0.92. Air capacity reopened at 11:00 (carrier_commitment\u00B7v16) but decision was already committed. Full constraint snapshot at route\u00B7v2.",
      version: "route\u00B7v2",
      Icon: Route,
      failTitle: "Current carrier assignment visible, selection rationale missing",
      failDesc:
        "Air capacity opened up 2.5 hours later. Without the constraint snapshot at decision time, the ops review would incorrectly conclude the agent ignored a cheaper air option that was not actually available.",
    },
    {
      category: "Inventory commitment dispute",
      human: "Did we actually have the 500 units of SKU-4401 available when we committed them to the Vertex order at 2pm?",
      fail: "SKU-4401 current inventory: 312 units available. Vertex order ORD-2025-91002: 500 units allocated.",
      succeed:
        "At 2025-03-12 14:00 UTC, inventory snapshot inv\u00B7sku4401_v8 showed: on-hand 820, allocated 290, available-to-promise 530. Fulfillment agent committed 500 units (allocation\u00B7v3). Between 14:00 and 16:00, two other orders consumed 218 units (allocation\u00B7v4, v5), dropping ATP to 312 (inv\u00B7sku4401_v11). The commitment was valid at decision time. Current deficit is from subsequent allocations, not an over-commit. Full inventory timeline at inv\u00B7sku4401_v8 through v11.",
      version: "inv\u00B7sku4401_v8 @ 14:00",
      Icon: Warehouse,
      failTitle: "Current inventory shows shortfall, commitment validity unclear",
      failDesc:
        "Today's ATP of 312 makes the 500-unit commitment look like an error. The temporal record shows the agent committed against 530 available units, and the shortfall came from later allocations.",
    },
    {
      category: "Delay root cause",
      human: "What caused the 3-day delay on the Brightforge shipment, and at which leg did it occur?",
      fail: "Brightforge shipment SHP-2025-7204: delivered March 18, original ETA March 15. 3 days late.",
      succeed:
        "Multi-leg timeline for SHP-2025-7204: Leg 1 (warehouse to port): departed Mar 11 on time, arrived port Mar 12 06:00 (shipment\u00B7v3). Leg 2 (ocean freight): vessel departure delayed 2 days due to port congestion at origin (carrier_event\u00B7v5, congestion advisory issued Mar 12 08:00, vessel sailed Mar 14 vs planned Mar 12). Leg 3 (port to destination): trucking pickup Mar 17, delivered Mar 18 (shipment\u00B7v7). Delay attributable: 2 days vessel, 1 day cascading trucking reschedule. Constraint change (congestion advisory) arrived after Leg 1 handoff. Route\u00B7v1 was committed Mar 9 when port status was green.",
      version: "shipment\u00B7v7",
      Icon: Truck,
      failTitle: "Delivery date and delay duration visible, cause and leg breakdown missing",
      failDesc:
        "The carrier dispute requires knowing which leg caused the delay and whether the routing agent could have known about the congestion at commit time. The temporal record shows the advisory arrived after the route was locked.",
    },
    {
      category: "Constraint replay",
      human: "If we replayed last Tuesday's routing decisions with today's carrier rates, how many would change?",
      fail: "Current carrier rates differ from last Tuesday. Unable to compare.",
      succeed:
        "Route decisions from Tue Mar 11: 47 shipments routed. Constraint snapshots preserved for all 47 (route\u00B7v* with carrier_commitment references). Replaying with today's rates (carrier_commitment\u00B7v22, polled Mar 18 08:00): 8 of 47 would select a different carrier (6 due to rate changes, 2 due to capacity shifts). Estimated cost impact: $4,200 savings on the 6 rate-driven changes, $1,100 increase on the 2 capacity-driven changes. Net: $3,100 savings. Replay used identical order constraints (SLA windows, weight, origin/destination) from the original route decisions.",
      version: "route decisions Mar 11 replay",
      Icon: CalendarClock,
      failTitle: "Rate comparison not possible without historical constraint state",
      failDesc:
        "Continuous improvement in logistics requires replaying past decisions against new constraints. Without versioned constraint snapshots, the team cannot quantify the impact of rate changes or optimize routing rules.",
    },
  ],
  outcomeTitle: "From stale dashboards to reconstructable logistics state",
  outcomeSubtitle: "Before and after Neotoma",
  outcomeDesc:
    "Each scenario pairs the same question with two outcomes: one where only the current shipment status is visible, and one where routing decisions, inventory positions, and constraint snapshots are first-class queryable state.",
  howTitle: "How Neotoma hardens logistics operations",
  steps: [
    {
      Icon: Upload,
      title: "Ingest every logistics event as an observation",
      desc: "Carrier API responses, inventory positions, routing decisions, shipment milestones, and constraint changes become structured observations on typed entities. No event overwrites prior state.",
      detail: "Append-only by default. Every constraint snapshot, rate poll, and allocation decision is preserved.",
    },
    {
      Icon: Layers,
      title: "Project logistics state through time",
      desc: "Link routing decisions to the carrier capacity, rates, and inventory positions available at decision time. Reconstruct the constraint landscape for any past moment.",
      detail: "Temporal queries return the state valid at the as-of timestamp, not the latest TMS sync.",
    },
    {
      Icon: Route,
      title: "Let agents and ops teams answer with provenance",
      desc: "Routing agents, inventory planners, and ops analysts query the same versioned graph. Responses cite constraint snapshots, carrier commitments, and decision timestamps.",
      detail: "Built for carrier disputes, delay investigations, and routing optimization: what was known, what was available, and why.",
    },
  ],
  capTitle: "Capabilities built for logistics integrity and operational replay",
  capSubtitle: "What you can ship",
  capDesc:
    "Model the entities your TMS and WMS already name, then add the integrity layer those systems never had: constraint snapshots, routing provenance, and inventory position history.",
  capabilities: [
    {
      Icon: Route,
      title: "Routing decision provenance",
      desc: "Bind each routing choice to the carrier rates, capacity, transit times, and SLA constraints the agent evaluated. Explain any past routing decision against its original inputs.",
      tags: ["route_decision", "carrier", "audit"],
    },
    {
      Icon: Warehouse,
      title: "Inventory position timelines",
      desc: "Track available-to-promise at every allocation and commit point. Prove what inventory was available when a fulfillment decision was made, separate from the current balance.",
      tags: ["inventory_snapshot", "ATP", "temporal"],
    },
    {
      Icon: Truck,
      title: "Multi-leg shipment tracking with handoff state",
      desc: "Record milestones, carrier events, and constraint changes at each leg. Trace delays to the specific leg and the constraint change that caused them.",
      tags: ["shipment", "carrier", "delay"],
    },
    {
      Icon: CalendarClock,
      title: "Constraint replay and what-if analysis",
      desc: "Replay past routing decisions against new rates, capacity, or rules. Quantify the cost and service impact of constraint changes without building a separate analytics pipeline.",
      tags: ["route_decision", "replay", "optimization"],
    },
    {
      Icon: Package,
      title: "Order-to-delivery lineage",
      desc: "Link orders through allocation, routing, shipment, and delivery with provenance at each step. Answer any question about how an order was fulfilled, start to finish.",
      tags: ["shipment", "order", "provenance"],
    },
    {
      Icon: FileText,
      title: "Carrier dispute exports",
      desc: "Generate structured evidence for SLA claims and rate disputes: routing decision inputs, constraint snapshots at commit time, and milestone timestamps with carrier event IDs.",
      tags: ["carrier_commitment", "dispute", "export"],
    },
  ],
  archHeadline: "Neotoma sits beneath your TMS, WMS, and carrier integration layer",
  archDesc:
    "Keep your existing TMS, WMS, and carrier APIs as systems of execution. Neotoma is the integrity layer that remembers every routing decision, inventory position, and constraint snapshot those systems were not designed to retain as queryable state.",
  archConfig: {
    topLabel: "Logistics operations plane",
    topDesc:
      "Routing agents, WMS feeds, and carrier APIs emit observations. Neotoma reduces them to authoritative snapshots for shipments, routes, inventory, carrier commitments, and facilities.",
    interfaces: [
      { label: "MCP tools", Icon: Plug },
      { label: "HTTP API", Icon: Layers },
      { label: "CLI & automations", Icon: Terminal },
    ],
    dataSources: [
      "TMS platforms (Oracle TMS, Blue Yonder, project44)",
      "WMS and inventory systems (Manhattan, SAP EWM)",
      "Carrier rate and capacity APIs",
      "Port and weather advisory feeds",
      "Order management and fulfillment engines",
    ],
  },
  archSteps: [
    {
      label: "Normalize entities",
      desc: "Map each shipment, route decision, inventory position, carrier commitment, and facility into typed entities with stable IDs shared across systems.",
    },
    {
      label: "Capture observations",
      desc: "Every carrier API response, inventory update, routing decision, and milestone event is stored as an append-only observation with source metadata.",
    },
    {
      label: "Compute snapshots",
      desc: "Project the latest logistics state per entity, or reconstruct historical state for any timestamp relevant to a delay investigation, dispute, or optimization review.",
    },
    {
      label: "Serve agents & analysts",
      desc: "Expose the same graph to routing agents, inventory planners, and ops analysts. No conflicting shipment reports or stale capacity assumptions.",
    },
  ],
  caseStudy: {
    headline: "How logistics teams use Neotoma as their integrity layer",
    desc:
      "AI-native logistics platforms automate carrier selection, inventory allocation, and multi-modal shipment coordination for enterprise shippers. Neotoma versions every routing decision, inventory position, and carrier commitment so you can reconstruct the constraint state at any decision point.",
    featuresHeading: "What logistics teams build",
    features: [
      "Routing agents that evaluate carrier capacity, rates, and transit times across ground, air, and ocean in real time",
      "Inventory commitment engine that allocates ATP across warehouses and forward-stock locations",
      "Multi-leg shipment coordination with automated re-routing on constraint changes",
    ],
    guarantees: [
      "Immutable observations for every carrier poll, inventory position, and routing decision",
      "Temporal snapshots so delay investigations and disputes reference the constraint state at decision time",
      "Relationship integrity between orders, shipments, routing decisions, and carrier commitments",
      "Audit-oriented exports that trace any delivery from order through allocation, routing, and each shipment leg",
    ],
    generalizesTitle: "If agents make routing and fulfillment decisions, you need reconstructable logistics state",
    generalizesDesc:
      "Any team running logistics agents for carrier selection, inventory allocation, or shipment coordination faces the same requirement: explain why a decision was made with the constraints that existed at the time. Neotoma generalizes the pattern to your supply chain stack.",
  },
  ctaHeadline: "Ship logistics agents that can explain",
  ctaHighlight: "every routing and fulfillment decision",
  ctaDesc:
    "Install Neotoma, connect your TMS and carrier APIs, and stop treating the latest dashboard as the decision record.",
  ctaFeatures: ["Open-source", "Enterprise SSO & RBAC", "Team deployment", "API compatibility guarantees"],
  agentLabel: "routing agent",
};

export function LogisticsLandingPage() {
  return <UseCaseLandingShell config={CONFIG} />;
}

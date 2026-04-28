import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type SandboxPackKind = "generic" | "empty" | "use_case";
export type SandboxSeedPolicy = "fixtures" | "none";

export interface SandboxPack {
  id: string;
  kind: SandboxPackKind;
  label: string;
  seedPolicy: SandboxSeedPolicy;
  manifestPath: string | null;
}

const FIXTURES_ROOT = path.resolve(__dirname, "..", "..", "..", "tests", "fixtures", "sandbox");

export const DEFAULT_SANDBOX_PACK_ID = "generic";

export const SANDBOX_PACKS: readonly SandboxPack[] = [
  {
    id: "generic",
    kind: "generic",
    label: "Generic starter",
    seedPolicy: "fixtures",
    manifestPath: path.join(FIXTURES_ROOT, "manifest.json"),
  },
  {
    id: "empty",
    kind: "empty",
    label: "Empty workspace",
    seedPolicy: "none",
    manifestPath: null,
  },
  {
    id: "crm",
    kind: "use_case",
    label: "CRM",
    seedPolicy: "fixtures",
    manifestPath: path.join(FIXTURES_ROOT, "use_cases", "crm", "manifest.json"),
  },
  {
    id: "financial-ops",
    kind: "use_case",
    label: "Financial ops",
    seedPolicy: "fixtures",
    manifestPath: path.join(FIXTURES_ROOT, "use_cases", "financial-ops", "manifest.json"),
  },
  {
    id: "agent-auth",
    kind: "use_case",
    label: "Agent auth",
    seedPolicy: "fixtures",
    manifestPath: path.join(FIXTURES_ROOT, "use_cases", "agent-auth", "manifest.json"),
  },
  {
    id: "personal-data",
    kind: "use_case",
    label: "Personal life",
    seedPolicy: "fixtures",
    manifestPath: path.join(FIXTURES_ROOT, "use_cases", "personal-data", "manifest.json"),
  },
  {
    id: "engineering",
    kind: "use_case",
    label: "Product engineering",
    seedPolicy: "fixtures",
    manifestPath: path.join(FIXTURES_ROOT, "use_cases", "engineering", "manifest.json"),
  },
  {
    id: "customer-development",
    kind: "use_case",
    label: "Customer development",
    seedPolicy: "fixtures",
    manifestPath: path.join(FIXTURES_ROOT, "use_cases", "customer-development", "manifest.json"),
  },
  {
    id: "content-ops",
    kind: "use_case",
    label: "Content ops",
    seedPolicy: "fixtures",
    manifestPath: path.join(FIXTURES_ROOT, "use_cases", "content-ops", "manifest.json"),
  },
  {
    id: "meetings",
    kind: "use_case",
    label: "Meetings",
    seedPolicy: "fixtures",
    manifestPath: path.join(FIXTURES_ROOT, "use_cases", "meetings", "manifest.json"),
  },
  {
    id: "personal-agent",
    kind: "use_case",
    label: "Personal agent",
    seedPolicy: "fixtures",
    manifestPath: path.join(FIXTURES_ROOT, "use_cases", "personal-agent", "manifest.json"),
  },
];

const PACK_INDEX = new Map(SANDBOX_PACKS.map((p) => [p.id, p]));

export function getSandboxPack(id: string): SandboxPack | undefined {
  return PACK_INDEX.get(id);
}

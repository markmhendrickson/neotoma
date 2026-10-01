import type { CellReport, UnexpectedSkipDiagnostic } from "./types.js";

export const UNEXPECTED_SKIP_REPAIR_ACTION =
  "Repair: record the required cassette, or if the skip is intentional add an exact meta.allowed_skips entry for kind/provider/model/cassette_id.";

export function isUnexpectedSkip(cell: CellReport): boolean {
  if (!cell.skipped || cell.skipped.kind === "quarantine") return false;
  return !cell.scenario.allowed_skips?.some(
    (allowance) =>
      allowance.kind === cell.skipped?.kind &&
      allowance.provider === cell.model.provider &&
      allowance.model === cell.model.model &&
      allowance.cassette_id === cell.model.cassette_id
  );
}

export function formatUnexpectedSkipCell(cell: CellReport): string {
  return [
    `scenario=${cell.scenario.id}`,
    `provider=${cell.model.provider}`,
    `model=${cell.model.model}`,
    `cassette_id=${cell.model.cassette_id ?? "(default)"}`,
    `kind=${cell.skipped?.kind ?? "unknown"}`,
  ].join(" ");
}

export function buildUnexpectedSkipDiagnostics(cells: CellReport[]): UnexpectedSkipDiagnostic[] {
  return cells.filter(isUnexpectedSkip).map((cell) => ({
    cell: formatUnexpectedSkipCell(cell),
    scenarioId: cell.scenario.id,
    provider: cell.model.provider,
    model: cell.model.model,
    cassetteId: cell.model.cassette_id ?? null,
    kind: cell.skipped!.kind,
    reason: cell.skipped!.reason,
  }));
}

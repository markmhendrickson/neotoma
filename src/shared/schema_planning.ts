import { z } from "zod";

/** Registry declaration only: consumers interpret strata; this grants no effects. */
export interface PlanningDeclaration {
  level: number;
  read_only?: boolean;
}

export const PLANNING_DECLARATION_HINT =
  'Use planning: {"level": <finite number>, "read_only"?: <boolean>}, or omit planning to preserve the current declaration.';

const declarationShape = z
  .object({
    level: z.number().finite(),
    read_only: z.boolean().optional(),
  })
  .strict();

/** One validator for registration, incremental updates and legacy-catalog reads. */
export const PlanningDeclarationSchema = z
  .unknown()
  .superRefine((value, ctx) => {
    if (!declarationShape.safeParse(value).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "planning must contain a finite numeric level and an optional boolean read_only",
        params: { hint: PLANNING_DECLARATION_HINT },
      });
    }
  })
  .transform((value) => value as PlanningDeclaration);

export interface SchemaRegistryCoverage {
  version: "1";
  state: "complete" | "unknown";
  source: "registry" | "code_fallback";
  reasons: string[];
  total: number | null;
  returned_count: number;
  exhausted: boolean;
  scope: { owner: "authenticated" | "global"; keyword: string | null; entity_type: string | null };
}

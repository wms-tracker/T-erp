/**
 * Calculation Engine — STUB (Phase 3: Motor / Belt / Roller / Structural / Capacity calculators).
 *
 * This package intentionally ships no formulas yet. It exists now so the module boundary is
 * real from day one: the CAD/UI layers never compute engineering results themselves, they call
 * into a `FormulaModule` from this package. Phase 3 fills in `modules/` with the actual motor
 * power, belt, roller, structural-check and capacity formulas (see the reference proposal this
 * project's demo data is based on for the formula shapes: friction force -> shaft power ->
 * service factor -> motor selection, etc.).
 */

export type CalcStatus = "PASS" | "WARNING" | "FAIL";

export interface CalculationResult {
  value: number;
  unit: string;
  status: CalcStatus;
  message?: string;
}

export interface FormulaModule<TInput extends Record<string, number> = Record<string, number>> {
  id: string;
  label: string;
  compute(input: TInput): Record<string, CalculationResult>;
}

export const CALC_MODULES: FormulaModule[] = []; // populated in Phase 3

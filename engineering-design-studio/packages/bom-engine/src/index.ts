/**
 * BOM / Cost Engine — STUB (Phase 4).
 *
 * Will walk an `Assembly`'s objects (from @eds/schema) and roll them up into BOM line items
 * (Part No. / Description / Spec / Material / Qty / Unit / Weight / Unit Price / Total Price)
 * plus a cost summary (Material/Machine/Motor/Electrical/Labor/Install/Engineering/Transport,
 * Subtotal/Contingency/VAT/Grand Total). Left empty until Phase 4 so the CAD/UI layers have a
 * real seam to call into rather than ad-hoc totals scattered in components.
 */

import type { Assembly } from "@eds/schema";

export interface BomLine {
  partNo: string;
  description: string;
  spec?: string;
  material?: string;
  qty: number;
  unit: string;
  weight?: number;
  unitPrice?: number;
  totalPrice?: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function generateBom(_assembly: Assembly): BomLine[] {
  return []; // implemented in Phase 4
}

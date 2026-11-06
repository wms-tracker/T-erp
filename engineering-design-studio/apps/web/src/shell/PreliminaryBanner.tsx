import React from "react";
import { PRELIMINARY_BANNER, PRELIMINARY_DISCLAIMER } from "@eds/schema";

export function PreliminaryBanner() {
  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border-b border-amber-500/30 text-amber-300 text-[11px]">
      <span className="font-semibold tracking-wide">{PRELIMINARY_BANNER}</span>
      <span className="text-amber-400/70">— {PRELIMINARY_DISCLAIMER}</span>
    </div>
  );
}

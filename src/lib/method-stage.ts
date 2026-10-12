export const METHOD_STAGES = ["Retention", "Selectivity", "Efficiency", "Gradient"] as const;

export type MethodStage = (typeof METHOD_STAGES)[number];

/**
 * Stage for the whole session, taken from the latest ready decision.
 * Switching run tabs does not move it. Gradient is not built, so it stays ahead.
 */
export function methodStageFromLatest(input: {
  leftSelectivity: boolean;
  phase: "retention" | "selectivity" | null;
  retentionStatus?: string | null;
  retentionReason?: string | null;
}): MethodStage {
  if (input.leftSelectivity) return "Efficiency";
  if (
    input.phase === "retention" &&
    (input.retentionStatus === "efficiency" || input.retentionReason === "efficiency")
  ) {
    return "Efficiency";
  }
  if (input.phase === "selectivity") return "Selectivity";
  return "Retention";
}

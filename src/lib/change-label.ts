import { formatPercentB, type RetentionDecision } from "@/lib/retention";
import type { SelectivityPlan, TempPath } from "@/lib/selectivity";

export const NO_CHANGE_YET = "No change yet";

/** Short name for the Next change box. The long sentence stays in Why. */
export function retentionChangeLabel(
  decision: RetentionDecision,
  percentB?: number | null,
): string {
  if (decision.nextTemperature) {
    const raw = decision.nextTemperature.trim().replace(/°\s*C$/i, "");
    return raw ? `Temperature ${raw}°C` : "Temperature";
  }
  const percent = percentB ?? decision.nextPercentB;
  if (decision.status === "recommend" && percent != null) return `%B ${formatPercentB(percent)}`;
  return NO_CHANGE_YET;
}

/** Short name for a selectivity plan. A chosen solvent or coating is included when there is one. */
export function selectivityChangeLabel(
  plan: SelectivityPlan,
  options?: { tempPath?: TempPath | null; solvent?: string; ligand?: string },
): string {
  if (plan.status !== "recommend") return NO_CHANGE_YET;
  const path = options?.tempPath ?? null;
  const solvent = options?.solvent?.trim() ?? "";
  const ligand = options?.ligand?.trim() ?? "";
  if (plan.step === "temp-choice") {
    if (path === "heat") return "Temperature 60°C";
    if (path === "ligand" || (path == null && plan.tempChoice?.other === "ligand")) {
      return ligand ? `Ligand ${ligand}` : "Ligand";
    }
    return solvent ? `Solvent ${solvent}` : "Solvent";
  }
  if (plan.step === "temp-40" || plan.step === "temp-adjust") return "Temperature 40°C";
  if (plan.step === "temp-60") return "Temperature 60°C";
  if (plan.step === "solvent") return solvent ? `Solvent ${solvent}` : "Solvent";
  if (plan.step === "ligand") return ligand ? `Ligand ${ligand}` : "Ligand";
  return NO_CHANGE_YET;
}

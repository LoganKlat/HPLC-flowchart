import { formatPercentB, type RetentionDecision } from "@/lib/retention";
import type { SelectivityPlan, TempPath } from "@/lib/selectivity";

export const NO_CHANGE_YET = "No change yet";

/** Short name for the Next change box. The long sentence stays in Why. */
export function retentionChangeLabel(
  decision: RetentionDecision,
  percentB?: number | null,
): string {
  if (decision.reason === "second-minimum") {
    const percent = percentB ?? decision.nextPercentB;
    if (percent != null) return `Run at 40°C at ${formatPercentB(percent)}% B`;
  }
  if (decision.nextTemperature) return temperatureWords(decision.nextTemperature);
  const percent = percentB ?? decision.nextPercentB;
  if (decision.status === "recommend" && percent != null) return percentWords(percent);
  return NO_CHANGE_YET;
}

function percentWords(percent: number): string {
  return `Run at ${formatPercentB(percent)}% B`;
}

function temperatureWords(value: string): string {
  const raw = value.trim().replace(/°\s*C$/i, "");
  if (!raw) return "Run at a new temperature";
  if (/ambient/i.test(raw) || /°/.test(raw)) return `Run at ${raw}`;
  return `Run at ${raw}°C`;
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
    if (path === "heat") return "Run at 60°C";
    if (path === "ligand" || (path == null && plan.tempChoice?.other === "ligand")) {
      return ligand ? `Run with ${ligand}` : "Run with a new ligand";
    }
    return solvent ? `Run with ${solvent}` : "Run with a new solvent";
  }
  if (plan.step === "temp-40" || plan.step === "temp-adjust") return "Run at 40°C";
  if (plan.step === "temp-60") return "Run at 60°C";
  if (plan.step === "solvent") {
    const raw = plan.prefill?.temperature?.trim().replace(/°\s*C$/i, "") ?? "";
    return `Change solvent, back at ${raw || "25"}°C`;
  }
  if (plan.step === "ligand") return ligand ? `Run with ${ligand}` : "Run with a new ligand";
  return NO_CHANGE_YET;
}

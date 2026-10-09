import { SOLVENTS } from "@/lib/selectivity";

/** Solvents offered in Run details and Settings. The chart uses this same list. */
export const MENU_SOLVENTS = SOLVENTS.map((solvent) => solvent.label);

export const CHART_SOLVENT_NOTE =
  "The chart covers ACN, MeOH, THF, Ethanol, IPA, Acetone, Propanol, and Butanol.";

export function solventKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Solvents offered in Run details and Settings. The nomograph still uses only ACN, MeOH, and THF. */
export const MENU_SOLVENTS = [
  "ACN",
  "MeOH",
  "THF",
  "Ethanol",
  "Isopropanol",
  "Acetone",
  "Propanol",
  "Butanol",
  "Ethyl acetate",
  "Hexane",
  "Dichloromethane",
  "Chloroform",
  "Dioxane",
] as const;

export const CHART_SOLVENT_NOTE = "The chart only covers ACN, MeOH, and THF. Pick one of those.";

export function solventKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

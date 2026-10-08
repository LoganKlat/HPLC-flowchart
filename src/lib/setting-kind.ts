export type SettingKind = "mechanical" | "chemical" | "both";

export type SettingMark = {
  id: string;
  label: string;
  kind: SettingKind;
};

/** Every setting the page names, with the kind the legend uses. */
export const SETTING_MARKS: readonly SettingMark[] = [
  { id: "flow", label: "Flow", kind: "mechanical" },
  { id: "injection", label: "Injection volume", kind: "mechanical" },
  { id: "length", label: "Column length", kind: "mechanical" },
  { id: "width", label: "Width", kind: "mechanical" },
  { id: "particle", label: "Particle size", kind: "mechanical" },
  { id: "temperature", label: "Temperature", kind: "mechanical" },
  { id: "wavelength", label: "Wavelength", kind: "mechanical" },
  { id: "pressure", label: "Back-pressure", kind: "mechanical" },
  { id: "solvent", label: "Solvent", kind: "chemical" },
  { id: "percent-b", label: "%B", kind: "chemical" },
  { id: "ligand", label: "Ligand", kind: "chemical" },
  { id: "carbon-load", label: "Carbon load", kind: "chemical" },
  { id: "pore", label: "Pore size", kind: "chemical" },
  { id: "bead", label: "Fully porous or core shell", kind: "chemical" },
];

export const PERCENT_B_SENTENCE =
  "%B is set by the pump, from 0% to 100%. It changes retention.";

export const TEMPERATURE_SENTENCE =
  "Temperature is set by the oven. This class uses about 25°C, then 40°C and 60°C. It changes selectivity and shortens retention.";

export const COATING_SENTENCE = "The coating is the ligand on the column.";

export const SELECTIVITY_ORDER =
  "The order is 40°C, then 60°C at the same %B, then the second solvent at the chart %B with those two temperatures, then the coating last. Temperature is tried before a new solvent. The coating is last because a new coating starts the %B steps over.";

export function kindLabel(kind: SettingKind): string {
  if (kind === "both") return "Mechanical and chemical";
  if (kind === "mechanical") return "Mechanical";
  return "Chemical";
}

/** Steps still allowed when the peak count matches and resolution is short. */
export function selectivitySteps(measured: number | null, spec: number | null): string[] {
  const shown = measured == null || !Number.isFinite(measured) ? "not in the file" : measured.toFixed(3);
  const against = spec == null || !Number.isFinite(spec) ? "no resolution specification" : `the specification of ${spec.toFixed(3)}`;
  const place = `Minimum resolution ${shown} against ${against}.`;
  return [
    `Temperature first, at 40°C. ${TEMPERATURE_SENTENCE} ${place}`,
    `Then 60°C at the same %B. ${TEMPERATURE_SENTENCE} ${place}`,
    `Then the other solvent at the chart %B, at those two temperatures. The solvent is in the bottles. ${PERCENT_B_SENTENCE} ${place}`,
    `Then the coating last. ${COATING_SENTENCE} It is a selectivity change. ${place}`,
  ];
}

import type { RuleInputs } from "./run-details";

// Ordered by retention series, then temperature/solvent/ligand changes.
export const DECISION_EXAMPLE_FILES = [
  "GR09-05-3-ACN-3-ISO-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
  "GR09-06-3-ACN-3-ISO-80-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
  "GR09-07-3-ACN-3-ISO-70-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
  "GR09-08-3-ACN-3-ISO-60-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
  "GR09-09-3-ACN-3-ISO-50-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
  "GR09-10-3-ACN-3-ISO-40-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
  "GR09-05-3-ACN-3-ISO-35-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.csv",
  "GR09-05-3-ACN-3-ISO-35-1.5-20-CP-0.1-C18aqP-150x4.6x5-40-254.csv",
  "GR09-05-3-ACN-3-ISO-35-1.5-20-CP-0.1-C18aqP-150x4.6x5-60-254.csv",
  "GR09-05-3-MeOH-3-ISO-50-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.csv",
  "GR09-05-3-MeOH-3-ISO-50-1.5-20-CP-0.1-C18aqP-150x4.6x5-40-254.csv",
  "GR09-05-3-MeOH-3-ISO-50-1.5-20-CP-0.1-C18aqP-150x4.6x5-60-254.csv",
  "GR41-04-5-ACN-3-ISO-90-1.5-20u-CP-0.1-BiphP-150x4.6x5-amb-254.csv",
  "GR41-06-5-ACN-3-ISO-70-1.5-20u-CP-0.1-BiphP-150x4.6x5-amb-254.csv",
  "GR41-07-5-ACN-3-ISO-60-1.5-20u-CP-0.1-BiphP-150x4.6x5-amb-254.csv",
  "GR41-08-5-ACN-3-ISO-50-1.5-20u-CP-0.1-BiphP-150x4.6x5-amb-254.csv",
  "GR41-09-5-ACN-3-ISO-40-1.5-20u-CP-0.1-BiphP-150x4.6x5-amb-254.csv",
  "GR41-11-6-ACN-3-ISO-37-1.5-20u-CP-0.1-BIPP-150x4.6x5-amb-254.csv"
] as const;

export const EXAMPLE_RULES: RuleInputs = {
  requiredPeaks: "7", minResolution: "1.5", lastPeakTimeMin: "15", maxBackPressurePsi: "4000",
};

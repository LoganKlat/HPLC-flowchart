import type { RuleInputs } from "./run-details";

// Ordered by retention series, then temperature/solvent/ligand changes.
export const DECISION_EXAMPLE_FILES = [
  "GR09-01-3-ACN-3-ISO-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
  "GR09-02-3-ACN-3-ISO-80-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
  "GR09-03-3-ACN-3-ISO-70-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
  "GR09-04-3-ACN-3-ISO-60-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
  "GR09-05-3-ACN-3-ISO-50-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
  "GR09-06-3-ACN-3-ISO-40-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
  "GR09-07-3-ACN-3-ISO-36-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.csv",
  "GR09-08-3-ACN-3-ISO-36-1.5-20-CP-0.1-C18aqP-150x4.6x5-40-254.csv",
  "GR09-09-3-ACN-3-ISO-36-1.5-20-CP-0.1-C18aqP-150x4.6x5-60-254.csv",
  "GR09-10-3-MeOH-3-ISO-50-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.csv",
  "GR09-11-3-MeOH-3-ISO-50-1.5-20-CP-0.1-C18aqP-150x4.6x5-40-254.csv",
  "GR09-12-3-MeOH-3-ISO-50-1.5-20-CP-0.1-C18aqP-150x4.6x5-60-254.csv",
  "GR09-13-5-ACN-3-ISO-90-1.5-20u-CP-0.1-BiphP-150x4.6x5-amb-254.csv",
  "GR09-15-5-ACN-3-ISO-70-1.5-20u-CP-0.1-BiphP-150x4.6x5-amb-254.csv",
  "GR09-16-5-ACN-3-ISO-60-1.5-20u-CP-0.1-BiphP-150x4.6x5-amb-254.csv",
  "GR09-17-5-ACN-3-ISO-50-1.5-20u-CP-0.1-BiphP-150x4.6x5-amb-254.csv",
  "GR09-18-5-ACN-3-ISO-40-1.5-20u-CP-0.1-BiphP-150x4.6x5-amb-254.csv",
  "GR09-19-6-ACN-3-ISO-36-1.5-20u-CP-0.1-BIPP-150x4.6x5-amb-254.csv"
] as const;

export const EXAMPLE_RULES: RuleInputs = {
  requiredPeaks: "7", minResolution: "1.5", lastPeakTimeMin: "15", maxBackPressurePsi: "4000",
};

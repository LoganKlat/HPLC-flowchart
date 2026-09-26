export type CoreShell = "" | "yes" | "no";

export type RunDetails = {
  ligand: string;
  beadType: string;
  coreShell: CoreShell;
  poreSize: string;
  carbonLoad: string;
  lengthMm: string;
  diameterMm: string;
  particleSize: string;
  solvent: string;
  percentB: string;
  flowRate: string;
  sampleConcentration: string;
  temperature: string;
  wavelength: string;
};

export type RuleInputs = {
  requiredPeaks: string;
  lastPeakTimeMin: string;
  minResolution: string;
  maxBackPressurePsi: string;
};

export function emptyRunDetails(): RunDetails {
  return {
    ligand: "",
    beadType: "",
    coreShell: "",
    poreSize: "",
    carbonLoad: "",
    lengthMm: "",
    diameterMm: "",
    particleSize: "",
    solvent: "",
    percentB: "",
    flowRate: "",
    sampleConcentration: "",
    temperature: "",
    wavelength: "",
  };
}

export function emptyRuleInputs(): RuleInputs {
  return {
    requiredPeaks: "",
    lastPeakTimeMin: "",
    minResolution: "",
    maxBackPressurePsi: "",
  };
}

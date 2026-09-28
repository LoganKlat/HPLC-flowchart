export type CoreShell = "" | "yes" | "no";

export type RunDetails = {
  ligand: string;
  coreShell: CoreShell;
  poreSize: string;
  carbonLoad: string;
  lengthMm: string;
  diameterMm: string;
  particleSize: string;
  solvent: string;
  ph: string;
  method: string;
  percentB: string;
  flowRate: string;
  injectionVolume: string;
  sampleType: string;
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
    coreShell: "",
    poreSize: "",
    carbonLoad: "",
    lengthMm: "",
    diameterMm: "",
    particleSize: "",
    solvent: "",
    ph: "",
    method: "",
    percentB: "",
    flowRate: "",
    injectionVolume: "",
    sampleType: "",
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

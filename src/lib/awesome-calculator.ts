/**
 * Awesome Rainbow Calculator
 *
 * Implements the theoretical plate count (N), Van Deemter curve (HETP),
 * column headroom (HR), and resolution floor (Rs,floor) calculations
 * from the Awesome Rainbow Calculator spreadsheet.
 */

export const VAN_DEEMTER_A = 1.5;
export const VAN_DEEMTER_B = 3.0;
export const VAN_DEEMTER_C = 0.15;
export const SPP_FACTOR_BEST = 1.5;

export type ColumnParams = {
  lengthMm?: number | null;
  diameterMm?: number | null;
  particleSize?: number | null;
  flowRate?: number | null;
  sppFactor?: number | null;
};

export type AwesomeCalculatorInputs = {
  column?: ColumnParams;
  t0Min?: number | null;
  tRMin: number;
  backPressurePsi: number;
  resolution?: number | null;
  specTimeMin: number;
  specPressurePsi: number;
  specResolution: number;
};

export type AwesomeOptimum = {
  velocityFactor: number;
  particleSizeUm: number;
  lengthMm: number;
  flowRateMlPerMin: number;
  uMmPerSec: number;
  hetpUm: number;
  n: number;
  predictedBackPressurePsi: number;
  predictedTRMin: number;
};

export type AwesomeCalculatorResult = {
  uMmPerSec: number;
  hetp1Um: number;
  n1: number;
  headroom: number;
  nMaxFpp: number;
  nMaxSpp: number;
  rsFloorFpp: number;
  rsFloorSpp: number;
  verdict: "fpp-reachable" | "spp-needed" | "impossible-selectivity-needed";
  verdictText: string;
  optimum: AwesomeOptimum;
};

export function calculateAwesomeFloor(inputs: AwesomeCalculatorInputs): AwesomeCalculatorResult {
  const L1 = inputs.column?.lengthMm && inputs.column.lengthMm > 0 ? inputs.column.lengthMm : 150;
  const ID1 = inputs.column?.diameterMm && inputs.column.diameterMm > 0 ? inputs.column.diameterMm : 4.6;
  const PS1 = inputs.column?.particleSize && inputs.column.particleSize > 0 ? inputs.column.particleSize : 5.0;
  const F1 = inputs.column?.flowRate && inputs.column.flowRate > 0 ? inputs.column.flowRate : 1.5;
  const SPP1 = inputs.column?.sppFactor && inputs.column.sppFactor > 0 ? inputs.column.sppFactor : 1.0;

  const t0 = inputs.t0Min && inputs.t0Min > 0 ? inputs.t0Min : 1.15;
  const tRspec = inputs.specTimeMin > 0 ? inputs.specTimeMin : 15;
  const BPspec = inputs.specPressurePsi > 0 ? inputs.specPressurePsi : 4000;
  const Rsspec = inputs.specResolution > 0 ? inputs.specResolution : 1.5;

  const tR1 = inputs.tRMin > 0 ? inputs.tRMin : tRspec;
  const BP1 = inputs.backPressurePsi > 0 ? inputs.backPressurePsi : 2600;

  // Linear velocity: u = L1 / (t0 * 60) in mm/s
  const u = L1 / (t0 * 60);

  // HETP1: (A * PS1 + B/u + C * PS1^2 * u) / SPP1 in µm
  const hetp1 = (VAN_DEEMTER_A * PS1 + VAN_DEEMTER_B / u + VAN_DEEMTER_C * PS1 * PS1 * u) / SPP1;

  // N1: L1 * 1000 / HETP1
  const n1 = (L1 * 1000) / hetp1;

  // Headroom HR: sqrt((BPspec / BP1) * (tRspec / tR1))
  const headroom = Math.sqrt((BPspec / BP1) * (tRspec / tR1));

  // Van Deemter minimum denominator: A + 2 * sqrt(B * C)
  const vanDeemterMin = VAN_DEEMTER_A + 2 * Math.sqrt(VAN_DEEMTER_B * VAN_DEEMTER_C);

  // Nmax FPP: 1000 * L1 * HR / (PS1 * (A + 2 * sqrt(B * C)))
  const nMaxFpp = (1000 * L1 * headroom) / (PS1 * vanDeemterMin);

  // Nmax SPP: Nmax FPP * 1.5
  const nMaxSpp = nMaxFpp * SPP_FACTOR_BEST;

  // Rs floor FPP: Rsspec * sqrt(N1 / NmaxFpp)
  const rsFloorFpp = Rsspec * Math.sqrt(n1 / nMaxFpp);

  // Rs floor SPP: Rsspec * sqrt(N1 / NmaxSpp)
  const rsFloorSpp = Rsspec * Math.sqrt(n1 / nMaxSpp);

  // Verdict at current Rs1
  let verdict: AwesomeCalculatorResult["verdict"] = "fpp-reachable";
  let verdictText = "OK, reachable with a fully porous column";
  const measuredRs =
    inputs.resolution != null && Number.isFinite(inputs.resolution) ? inputs.resolution : null;

  if (measuredRs != null) {
    if (measuredRs + 1e-9 < rsFloorSpp) {
      verdict = "impossible-selectivity-needed";
      verdictText = "IMPOSSIBLE by column geometry, must change selectivity";
    } else if (measuredRs + 1e-9 < rsFloorFpp) {
      verdict = "spp-needed";
      verdictText = "Needs an SPP bead, out of reach fully porous";
    }
  }

  // The Column that reaches Nmax
  const VF = headroom * (tR1 / tRspec);
  const PSopt = PS1 * Math.sqrt(Math.sqrt(VAN_DEEMTER_B / VAN_DEEMTER_C) / (PS1 * u * Math.max(1e-6, VF)));
  const Lopt = L1 * headroom * (PSopt / PS1);
  const Fopt = F1 * (Lopt / L1) * (tR1 / tRspec);
  const uOpt = u * (Fopt / F1);
  const hetpMin = (PSopt * vanDeemterMin) / SPP_FACTOR_BEST;
  const Nopt = (Lopt * 1000) / hetpMin;
  const predBP = BP1 * ((Lopt * Fopt) / (L1 * F1)) * ((PS1 * ID1) / (PSopt * ID1)) ** 2;
  const predTR = tR1 * (F1 / Fopt) * (Lopt / L1);

  return {
    uMmPerSec: u,
    hetp1Um: hetp1,
    n1,
    headroom,
    nMaxFpp,
    nMaxSpp,
    rsFloorFpp,
    rsFloorSpp,
    verdict,
    verdictText,
    optimum: {
      velocityFactor: VF,
      particleSizeUm: PSopt,
      lengthMm: Lopt,
      flowRateMlPerMin: Fopt,
      uMmPerSec: uOpt,
      hetpUm: hetpMin,
      n: Nopt,
      predictedBackPressurePsi: predBP,
      predictedTRMin: predTR,
    },
  };
}

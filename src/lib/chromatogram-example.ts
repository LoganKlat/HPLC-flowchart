/** Ideal Gaussian peaks for teaching. They are not measurements from an upload. */
export type TeachingPeak = { label: string; time: number; sigma: number; height: number };
export const EXAMPLE_T0 = 1;
export const EXAMPLE_BASELINE = 5;
export function teachingPeaks(spacing: number, width: number, amount: number, lastTime = 11): TeachingPeak[] {
  return [
    { label: "t₀ marker", time: EXAMPLE_T0, sigma: 0.07, height: 25 },
    { label: "A", time: 3, sigma: 0.15 * width, height: 65 / width },
    { label: "B", time: 6, sigma: 0.18 * width, height: amount / width },
    { label: "C", time: 6 + spacing, sigma: 0.20 * width, height: 65 / width },
    { label: "D", time: lastTime, sigma: 0.25 * width, height: 55 / width },
  ];
}
export function peakSignal(peak: TeachingPeak, time: number): number {
  return peak.height * Math.exp(-0.5 * ((time - peak.time) / peak.sigma) ** 2);
}
export function peakMetrics(peak: TeachingPeak) {
  return {
    baselineWidth: 4 * peak.sigma,
    fwhm: 2 * Math.sqrt(2 * Math.log(2)) * peak.sigma,
    area: peak.height * peak.sigma * Math.sqrt(2 * Math.PI),
    k: (peak.time - EXAMPLE_T0) / EXAMPLE_T0,
  };
}
export function pairResolution(left: TeachingPeak, right: TeachingPeak): number {
  return 2 * (right.time - left.time) / (peakMetrics(left).baselineWidth + peakMetrics(right).baselineWidth);
}

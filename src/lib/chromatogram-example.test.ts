import { describe, expect, it } from "vitest";
import { pairResolution, peakMetrics, teachingPeaks } from "./chromatogram-example";

describe("chromatogram teaching model", () => {
  it("widens peaks while conserving area and lowering height", () => {
    const narrow = teachingPeaks(1.2, 1, 85)[2];
    const wide = teachingPeaks(1.2, 1.5, 85)[2];
    expect(peakMetrics(wide).area).toBeCloseTo(peakMetrics(narrow).area, 10);
    expect(wide.height).toBeLessThan(narrow.height);
    expect(peakMetrics(wide).fwhm).toBeCloseTo(peakMetrics(narrow).fwhm * 1.5, 10);
  });
  it("reduces resolution with overlap and wider peaks", () => {
    const resolved = teachingPeaks(1.2, 1, 85);
    const close = teachingPeaks(0.4, 1, 85);
    const wide = teachingPeaks(1.2, 1.6, 85);
    expect(pairResolution(resolved[2], resolved[3])).toBeGreaterThan(1.5);
    expect(pairResolution(close[2], close[3])).toBeLessThan(1.5);
    expect(pairResolution(wide[2], wide[3])).toBeLessThan(pairResolution(resolved[2], resolved[3]));
  });
  it("keeps retention and resolution independent of response amount", () => {
    const low = teachingPeaks(1.2, 1, 40);
    const high = teachingPeaks(1.2, 1, 120);
    expect(peakMetrics(high[2]).k).toBe(peakMetrics(low[2]).k);
    expect(pairResolution(high[2], high[3])).toBe(pairResolution(low[2], low[3]));
    expect(peakMetrics(high[2]).area).toBeCloseTo(3 * peakMetrics(low[2]).area, 10);
  });
  it("represents the marker and last-peak time separately", () => {
    const peaks = teachingPeaks(1.2, 1, 85, 12.8);
    expect(peakMetrics(peaks[0]).k).toBe(0);
    expect(peaks[4].time).toBe(12.8);
    expect(peaks[4].time).toBeGreaterThan(12);
  });
});

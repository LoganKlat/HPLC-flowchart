import { describe, expect, it } from "vitest";
import { columnScale, formatColumnMultiple, scaleChromatogram, scalePressureTrace } from "@/lib/column-shape";

describe("column scale", () => {
  it("is 1 for the column that produced the run", () => {
    const at = columnScale(150, 4.6, 150, 4.6);
    expect(at.resolution).toBeCloseTo(1, 8);
    expect(at.retentionTime).toBeCloseTo(1, 8);
    expect(at.pressure).toBeCloseTo(1, 8);
    expect(at.peakWidth).toBeCloseTo(1, 8);
    expect(at.peakHeight).toBeCloseTo(1, 8);
    expect(formatColumnMultiple(at.resolution)).toBe("1×");
  });

  it("raises retention and pressure with length, and resolution with the square root", () => {
    const longer = columnScale(250, 4.6, 150, 4.6);
    const ratio = 250 / 150;
    expect(longer.resolution).toBeCloseTo(Math.sqrt(ratio), 8);
    expect(longer.peakWidth).toBeCloseTo(Math.sqrt(ratio), 8);
    expect(longer.retentionTime).toBeCloseTo(ratio, 8);
    expect(longer.pressure).toBeCloseTo(ratio, 8);
    expect(longer.peakHeight).toBeCloseTo(1 / Math.sqrt(ratio), 8);
  });

  it("keeps resolution the same when only the width changes", () => {
    const narrow = columnScale(150, 2.1, 150, 4.6);
    const widthRatio = 2.1 / 4.6;
    expect(narrow.resolution).toBeCloseTo(1, 8);
    expect(narrow.retentionTime).toBeCloseTo(widthRatio ** 2, 8);
    expect(narrow.peakWidth).toBeCloseTo(widthRatio ** 2, 8);
    expect(narrow.pressure).toBeCloseTo(1 / widthRatio ** 2, 8);
    expect(narrow.peakHeight).toBeCloseTo(1 / widthRatio, 8);
    expect(narrow.pressure).not.toBeCloseTo(1 / widthRatio ** 4, 0);
  });

  it("moves a peak by retention time and its width by the peak-width multiplier", () => {
    const center = 4;
    const sigma = 0.2;
    const height = 1000;
    const points = Array.from({ length: 401 }, (_, index) => {
      const timeMin = index * 0.02;
      const intensity = height * Math.exp(-0.5 * ((timeMin - center) / sigma) ** 2);
      return { timeMin, intensity };
    });
    const scale = columnScale(250, 4.6, 150, 4.6);
    const scaled = scaleChromatogram(points, [center], scale);
    const top = scaled.reduce((best, point) => (point.intensity > best.intensity ? point : best));
    expect(top.timeMin).toBeCloseTo(center * scale.retentionTime, 2);
    expect(top.intensity).toBeCloseTo(height * scale.peakHeight, 0);

    const half = top.intensity / 2;
    const above = scaled.filter((point) => point.intensity >= half);
    const width = above[above.length - 1].timeMin - above[0].timeMin;
    const originalHalf = points.filter((point) => point.intensity >= height / 2);
    const originalWidth = originalHalf[originalHalf.length - 1].timeMin - originalHalf[0].timeMin;
    expect(width / originalWidth).toBeCloseTo(scale.peakWidth, 1);
  });

  it("leaves the trace unchanged when every multiplier is 1", () => {
    const points = [
      { timeMin: 0, intensity: 1 },
      { timeMin: 1, intensity: 8 },
      { timeMin: 2, intensity: 1 },
    ];
    const scaled = scaleChromatogram(points, [1], columnScale(100, 3, 100, 3));
    expect(scaled).toEqual(points);
  });

  it("keeps the pressure trace and stretches it with the column", () => {
    const trace = [
      { timeMin: 0, pressure: 1000 },
      { timeMin: 2, pressure: 1200 },
    ];
    const same = scalePressureTrace(trace, [2], columnScale(150, 4.6, 150, 4.6));
    expect(same).toEqual(trace);
    const longer = columnScale(250, 4.6, 150, 4.6);
    const scaled = scalePressureTrace(trace, [2], longer);
    expect(scaled[1]?.timeMin).toBeCloseTo(2 * longer.retentionTime, 8);
    expect(scaled[1]?.pressure).toBeCloseTo(1200 * longer.pressure, 8);
    expect(scaled[0]?.pressure).toBeCloseTo(1000 * longer.pressure, 8);
  });
});

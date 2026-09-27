import { describe, expect, it } from "vitest";
import { axisTicks, formatAxisTick, formatPeakTime, layoutPeakLabels } from "@/components/chromatogram-chart";

describe("axis ticks", () => {
  it("numbers time on even steps such as 2, 4, 6, 8", () => {
    const ticks = axisTicks(0, 19.5);
    expect(ticks).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
    expect(ticks.map(formatAxisTick).join(" ")).not.toMatch(/\d+\.\d{3,}/);
  });

  it("numbers mAU on a round step such as 200 or 500", () => {
    const ticks = axisTicks(-180, 2200);
    expect(ticks.length).toBeGreaterThan(4);
    for (const tick of ticks) {
      expect(tick % 100).toBe(0);
      expect(formatAxisTick(tick)).not.toMatch(/\./);
    }
  });
});

describe("peak time labels", () => {
  it("shows the retention time only, to two decimals", () => {
    expect(formatPeakTime(1.952)).toBe("1.95 min");
    expect(formatPeakTime(11.593)).toBe("11.59 min");
    expect(formatPeakTime(1.101)).not.toContain("#");
  });

  it("keeps labels from sitting on top of each other when peaks are close", () => {
    const times = [1.101, 1.401, 1.511, 1.707, 1.787, 1.952];
    const placed = layoutPeakLabels(
      times.map((time, index) => ({
        text: formatPeakTime(time),
        x: 220 + index * 14,
        y: 200,
      })),
      { left: 72, right: 700 },
    );
    expect(placed.map((label) => label.text)).toEqual([
      "1.10 min",
      "1.40 min",
      "1.51 min",
      "1.71 min",
      "1.79 min",
      "1.95 min",
    ]);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const sameRow = Math.abs(placed[i].y - placed[j].y) < 16;
        const sameColumn = Math.abs(placed[i].x - placed[j].x) < 64;
        expect(sameRow && sameColumn).toBe(false);
      }
    }
  });
});
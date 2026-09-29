import { describe, expect, it } from "vitest";
import { columnMultiples } from "@/lib/column-shape";

describe("column multiples", () => {
  it("is 1× for the 150 mm × 4.6 mm column", () => {
    const at = columnMultiples(150, 4.6);
    expect(at.resolution).toBeCloseTo(1, 8);
    expect(at.retentionTime).toBeCloseTo(1, 8);
    expect(at.backPressure).toBeCloseTo(1, 8);
  });

  it("raises all three with length, resolution with the square root", () => {
    const base = columnMultiples(150, 4.6);
    const longer = columnMultiples(250, 4.6);
    const ratio = 250 / 150;
    expect(longer.resolution).toBeCloseTo(Math.sqrt(ratio), 8);
    expect(longer.retentionTime).toBeCloseTo(ratio, 8);
    expect(longer.backPressure).toBeCloseTo(ratio, 8);
    expect(longer.resolution).toBeGreaterThan(base.resolution);
    expect(longer.retentionTime).toBeGreaterThan(base.retentionTime);
    expect(longer.backPressure).toBeGreaterThan(base.backPressure);
  });

  it("raises resolution and back-pressure and lowers retention when the column is narrower", () => {
    const base = columnMultiples(150, 4.6);
    const narrow = columnMultiples(150, 2.1);
    const rawWidth = (4.6 / 2.1) ** 2;
    expect(narrow.resolution).toBeGreaterThan(1);
    expect(narrow.resolution).toBeLessThan(rawWidth);
    expect(narrow.backPressure).toBeCloseTo(rawWidth, 8);
    expect(narrow.backPressure).not.toBeCloseTo(rawWidth ** 2, 0);
    expect(narrow.retentionTime).toBeCloseTo((2.1 / 4.6) ** 2, 8);
    expect(narrow.resolution).toBeGreaterThan(base.resolution);
    expect(narrow.backPressure).toBeGreaterThan(base.backPressure);
    expect(narrow.retentionTime).toBeLessThan(base.retentionTime);
  });
});

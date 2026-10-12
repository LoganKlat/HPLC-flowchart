import { describe, expect, it } from "vitest";
import { columnExampleTrace } from "@/lib/column-example";

describe("column example trace", () => {
  it("is ready without reading the workbook", () => {
    const started = performance.now();
    const first = columnExampleTrace();
    const second = columnExampleTrace();
    expect(performance.now() - started).toBeLessThan(50);
    expect(second).toBe(first);
    expect(first.points.length).toBeGreaterThan(1000);
    expect(first.peakTimesMin).toHaveLength(6);
    expect(first.pressurePoints.length).toBeGreaterThan(100);
    expect(first.yLabel).toBe("mAU");
    expect(first.pressureUnit).toBe("psi");
  });
});

import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { readLabFile } from "@/lib/lab-file";
import { decideRetention, type RetentionRules, type RetentionSample } from "@/lib/retention";

const filePath = "C:/Users/LoganKlat/Documents/Chromatograms/GR09-05-3-ACN-3-ISO-35-1.5-20-CP-0.1-C18aqP-150x4.6x5-40-254.csv";
const fileName = "GR09-05-3-ACN-3-ISO-35-1.5-20-CP-0.1-C18aqP-150x4.6x5-40-254.csv";

describe("Test with GR09-05-3-ACN-3-ISO-35-1.5-20-CP-0.1-C18aqP-150x4.6x5-40-254.csv", () => {
  const buffer = fs.readFileSync(filePath);
  const read = readLabFile(buffer);

  it("parses the file correctly", () => {
    expect(read.peakCount).toBe(6);
    expect(read.minResolutionExcludingFirst).toBeCloseTo(2.312, 3);
    expect(read.lastPeakTimeMin).toBeCloseTo(12.07, 3);
    expect(read.maxBackPressurePsi).toBeCloseTo(1409.5, 1);
  });

  const baseSample: RetentionSample = {
    percentB: 35,
    firstPeakTimeMin: read.firstPeakTimeMin ?? 1.112,
    lastPeakTimeMin: read.lastPeakTimeMin ?? 12.07,
    peakCount: read.peakCount ?? 6,
    minResolutionExcludingFirst: read.minResolutionExcludingFirst ?? 2.312,
    maxBackPressurePsi: read.maxBackPressurePsi ?? 1409.5,
    flowRate: 1.5,
    particleSize: 5.0,
    lengthMm: 150,
    diameterMm: 4.6,
    coreShell: false,
  };

  describe("Row 1, 2, 3: Peaks < Spec (Required Peaks = 7)", () => {
    it("Row 1: tR << spec (specTime = 25 min) -> Decrease %B by 10", () => {
      // 12.070 <= 0.5 * 25 (12.5) -> tR << spec
      const rules: RetentionRules = {
        requiredPeaks: 7,
        lastPeakTimeMin: 25,
        minResolution: 1.5,
        maxBackPressurePsi: 2900,
      };
      const decision = decideRetention([baseSample], rules);
      expect(decision.status).toBe("recommend");
      expect(decision.tableAction).toBe("Decrease %B by 10");
      expect(decision.nextChange).toContain("25% B");
      expect(decision.why).toContain("Row 1 (Peaks < 7, tR ≪ spec): Decrease %B by 10%");
      expect(decision.why).toContain("Condition: (Peaks < 7, tR << spec, BP < spec)");
    });

    it("Row 2: tR < spec (specTime = 15 min) -> Min %B or 5% drop for single run", () => {
      // 7.5 < 12.070 <= 15 -> tR < spec
      const rules: RetentionRules = {
        requiredPeaks: 7,
        lastPeakTimeMin: 15,
        minResolution: 1.5,
        maxBackPressurePsi: 2900,
      };
      const decision = decideRetention([baseSample], rules);
      expect(decision.status).toBe("recommend");
      expect(decision.nextChange).toContain("30% B"); // 35 - 5 = 30% B
      expect(decision.why).toContain("Row 2 (Peaks < 7, tR < spec, single run): Lower %B by 5%");
      expect(decision.why).toContain("Condition: (Peaks < 7, tR < spec, BP < spec)");
    });

    it("Row 3: tR > spec (specTime = 10 min) -> Change selectivity (Run at 40°C)", () => {
      // 12.070 > 10 -> tR > spec
      const rules: RetentionRules = {
        requiredPeaks: 7,
        lastPeakTimeMin: 10,
        minResolution: 1.5,
        maxBackPressurePsi: 2900,
      };
      const decision = decideRetention([baseSample], rules);
      expect(decision.status).toBe("recommend");
      expect(decision.tableAction).toBe("Change selectivity (solvent, temperature, ligand) OR an intermediate %B");
      expect(decision.nextChange).toContain("40°C");
      expect(decision.why).toContain("Row 3 (Peaks < 7, tR > spec): Change selectivity");
      expect(decision.why).toContain("Condition: (Peaks < 7, tR > spec, BP < spec)");
    });
  });

  describe("Rows 4, 5, 6: Peaks = Spec (Required Peaks = 6), tR << spec (specTime = 25 min)", () => {
    it("Row 4: Rs << spec (below floor) -> Increase L (watch BP)", () => {
      const rules: RetentionRules = {
        requiredPeaks: 6,
        lastPeakTimeMin: 25,
        minResolution: 5.0,
        maxBackPressurePsi: 2000,
      };
      const decision = decideRetention([baseSample], rules);
      expect(decision.status).toBe("efficiency");
      expect(decision.tableAction).toBe("Increase L (watch BP)");
      expect(decision.nextChange).toContain("Increase L (watch BP)");
      expect(decision.why).toContain("Row 4 (Peaks = 6, tR ≪ spec, Rs < floor)");
      expect(decision.why).toContain("Action: Increase L (watch BP)");
      expect(decision.why).toContain("Condition: (Peaks = 6, tR << spec, Rs < floor, BP < spec)");
    });

    it("Row 5: floor <= Rs < spec -> Increase L (BP) OR decrease F OR decrease PS (BP) OR SPP", () => {
      const rules: RetentionRules = {
        requiredPeaks: 6,
        lastPeakTimeMin: 25,
        minResolution: 3.0,
        maxBackPressurePsi: 2900,
      };
      const decision = decideRetention([baseSample], rules);
      expect(decision.status).toBe("efficiency");
      expect(decision.tableAction).toBe("Increase L (BP) OR decrease F OR decrease PS (BP) OR SPP");
      expect(decision.nextChange).toContain("Increase L (BP) OR decrease F OR decrease PS (BP) OR SPP");
      expect(decision.why).toContain("Row 5 (Peaks = 6, tR ≪ spec, floor ≤ Rs < spec):");
      expect(decision.why).toContain("Condition: (Peaks = 6, tR << spec, floor ≤ Rs < spec, BP < spec)");
    });

    it("Row 6: Rs >= spec (specRs = 1.5) -> MET. Optionally increase F to shorten the run", () => {
      const rules: RetentionRules = {
        requiredPeaks: 6,
        lastPeakTimeMin: 25,
        minResolution: 1.5,
        maxBackPressurePsi: 2900,
      };
      const decision = decideRetention([baseSample], rules);
      expect(decision.status).toBe("specs-met");
      expect(decision.tableAction).toBe("MET. Optionally increase F to shorten the run");
      expect(decision.nextChange).toBe("The specifications are met.");
      expect(decision.why).toContain("Row 6 (Peaks = 6, tR ≪ spec, Rs ≥ spec): All specifications are met");
      expect(decision.why).toContain("Condition: (Peaks = 6, tR << spec, Rs ≥ spec, BP < spec)");
    });
  });

  describe("Rows 7, 8, 9: Peaks = Spec (Required Peaks = 6), tR < spec (specTime = 15 min)", () => {
    it("Row 7: Rs << spec (below floor) -> SELECTIVITY", () => {
      const rules: RetentionRules = {
        requiredPeaks: 6,
        lastPeakTimeMin: 15,
        minResolution: 5.0,
        maxBackPressurePsi: 2000,
      };
      const decision = decideRetention([baseSample], rules);
      expect(decision.status).toBe("recommend");
      expect(decision.tableAction).toBe("SELECTIVITY");
      expect(decision.nextChange).toContain("Run at 40°C (Change selectivity)");
      expect(decision.why).toContain("Row 7 (Peaks = 6, tR < spec, Rs < floor):");
      expect(decision.why).toContain("Action: SELECTIVITY (Run at 40°C)");
      expect(decision.why).toContain("Condition: (Peaks = 6, tR < spec, Rs < floor, BP < spec)");
    });

    it("Row 8: floor <= Rs < spec -> Decrease F OR decrease PS (BP) OR SPP", () => {
      const rules: RetentionRules = {
        requiredPeaks: 6,
        lastPeakTimeMin: 15,
        minResolution: 3.0,
        maxBackPressurePsi: 2900,
      };
      const decision = decideRetention([baseSample], rules);
      expect(decision.status).toBe("efficiency");
      expect(decision.tableAction).toBe("Decrease F OR decrease PS (BP) OR SPP");
      expect(decision.nextChange).toContain("Decrease F OR decrease PS (BP) OR SPP");
      expect(decision.why).toContain("Row 8 (Peaks = 6, tR < spec, floor ≤ Rs < spec):");
      expect(decision.why).toContain("Condition: (Peaks = 6, tR < spec, floor ≤ Rs < spec, BP < spec)");
    });

    it("Row 9: Rs >= spec (specRs = 1.5) -> MET. Optionally increase F to shorten the run", () => {
      const rules: RetentionRules = {
        requiredPeaks: 6,
        lastPeakTimeMin: 15,
        minResolution: 1.5,
        maxBackPressurePsi: 2900,
      };
      const decision = decideRetention([baseSample], rules);
      expect(decision.status).toBe("specs-met");
      expect(decision.tableAction).toBe("MET. Optionally increase F to shorten the run");
      expect(decision.nextChange).toBe("The specifications are met.");
      expect(decision.why).toContain("Row 9 (Peaks = 6, tR < spec, Rs ≥ spec): All specifications are met");
      expect(decision.why).toContain("Condition: (Peaks = 6, tR < spec, Rs ≥ spec, BP < spec)");
    });
  });

  describe("Rows 10, 11, 12: Peaks = Spec (Required Peaks = 6), tR > spec (specTime = 10 min)", () => {
    it("Row 10: Rs << spec (below floor) -> SELECTIVITY", () => {
      const rules: RetentionRules = {
        requiredPeaks: 6,
        lastPeakTimeMin: 10,
        minResolution: 5.0,
        maxBackPressurePsi: 2000,
      };
      const decision = decideRetention([baseSample], rules);
      expect(decision.status).toBe("recommend");
      expect(decision.tableAction).toBe("SELECTIVITY");
      expect(decision.nextChange).toContain("Run at 40°C (Change selectivity)");
      expect(decision.why).toContain("Row 10 (Peaks = 6, tR > spec, Rs < floor):");
      expect(decision.why).toContain("Action: SELECTIVITY (Run at 40°C)");
      expect(decision.why).toContain("Condition: (Peaks = 6, tR > spec, Rs < floor, BP < spec)");
    });

    it("Row 11: floor <= Rs < spec -> Decrease PS (BP), then increase F to shorten the run", () => {
      const rules: RetentionRules = {
        requiredPeaks: 6,
        lastPeakTimeMin: 10,
        minResolution: 3.0,
        maxBackPressurePsi: 2900,
      };
      const decision = decideRetention([baseSample], rules);
      expect(decision.status).toBe("efficiency");
      expect(decision.tableAction).toBe("Decrease PS (BP), then increase F to shorten the run");
      expect(decision.nextChange).toContain("Decrease PS (BP), then increase F to shorten the run");
      expect(decision.why).toContain("Row 11 (Peaks = 6, tR > spec, floor ≤ Rs < spec):");
      expect(decision.why).toContain("Action: Decrease PS (BP), then increase F to shorten the run");
      expect(decision.why).toContain("Condition: (Peaks = 6, tR > spec, floor ≤ Rs < spec, BP < spec)");
    });

    it("Row 12: Rs >= spec (specRs = 1.5) -> Increase F to shorten the run", () => {
      const rules: RetentionRules = {
        requiredPeaks: 6,
        lastPeakTimeMin: 10,
        minResolution: 1.5,
        maxBackPressurePsi: 2900,
      };
      const decision = decideRetention([baseSample], rules);
      expect(decision.status).toBe("efficiency");
      expect(decision.tableAction).toBe("Increase F to shorten the run");
      expect(decision.nextChange).toContain("Increase F to shorten the run");
      expect(decision.why).toContain("Row 12 (Peaks = 6, tR > spec, Rs ≥ spec):");
      expect(decision.why).toContain("Action: Increase F to shorten the run");
      expect(decision.why).toContain("Condition: (Peaks = 6, tR > spec, Rs ≥ spec, BP < spec)");
    });
  });
});

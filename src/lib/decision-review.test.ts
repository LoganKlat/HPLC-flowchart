import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { duplicateRunIndex } from "./duplicate-run";
import { evaluateRun } from "./evaluate";
import type { LabFileRead } from "./lab-file";

const exports: { fileName: string; read: LabFileRead }[] = JSON.parse(readFileSync("public/decision-example/results.json", "utf8"));
const rules = { requiredPeaks: 7, minResolution: 1.5, lastPeakTimeMin: 15, maxBackPressurePsi: 4000 };
describe("light review of supplied chromatograms", () => {
  it("identifies the three MeOH exports that repeat ACN measurements", () => {
    for (let i = 9; i <= 11; i++) {
      expect(duplicateRunIndex(exports[i].read, exports.slice(0, i).map(item => item.read))).toBe(i - 3);
    }
    expect(duplicateRunIndex(exports[5].read, exports.slice(0, 5).map(item => item.read))).toBeNull();
  });
  it("does not mark extra peaks as meeting the exact target", () => {
    const rows = evaluateRun(exports[16].read, { ...rules, requiredPeaks: 6 });
    expect(rows[0].status).toBe("not-met");
    expect(rows[0].note).toContain("More peaks than expected");
    expect(evaluateRun(exports[16].read, rules)[0].status).toBe("met");
  });
  it("keeps missing peaks at zero decision resolution", () => {
    const rows = evaluateRun(exports[5].read, rules);
    expect(rows[0].status).toBe("not-met");
    expect(rows[1].measured).toBe("0.000");
  });
});

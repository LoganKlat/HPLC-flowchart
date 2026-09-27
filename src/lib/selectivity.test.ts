import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateRun, resolutionForDecision } from "@/lib/evaluate";
import { readLabFile } from "@/lib/lab-file";
import { carryForwardIndex } from "@/lib/retention";
import {
  adjustedPercentB,
  assessHappy,
  findSolvent,
  formatMatchedPercent,
  planHistory,
  recommendLigand,
  solventChoicePercent,
  solventNomograph,
  type SelectivityRun,
  type SelectivitySetup,
} from "@/lib/selectivity";

const setup: SelectivitySetup = {
  requiredPeaks: 8,
  lastPeakTimeMin: 10,
  minResolution: 1,
  maxBackPressurePsi: 2000,
  ambientTemperatureC: 25,
  originalSolvent: "ACN",
  originalLigand: "C18",
};

function run(overrides: Partial<SelectivityRun> = {}): SelectivityRun {
  return {
    percentB: 80,
    temperatureC: 25,
    solvent: "ACN",
    ligand: "C18",
    peakCount: 4,
    lastPeakTimeMin: 10,
    firstPeakTimeMin: 1,
    minResolutionExcludingFirst: 0.4,
    maxBackPressurePsi: 500,
    ...overrides,
  };
}

describe("solvent nomograph", () => {
  it("reads 20% acetonitrile as methanol 27.5 and tetrahydrofuran 14.9", () => {
    expect(percents(20)).toEqual(["27.5", "20.0", "14.9"]);
  });

  it("reads 40% acetonitrile as methanol 51.2 and tetrahydrofuran 30.7", () => {
    expect(percents(40)).toEqual(["51.2", "40.0", "30.7"]);
  });

  it("reads 50% acetonitrile as methanol 60.6 and tetrahydrofuran 38.3", () => {
    expect(percents(50)).toEqual(["60.6", "50.0", "38.3"]);
  });

  it("reads 100% acetonitrile as methanol 100 and tetrahydrofuran 72.0", () => {
    const rows = solventNomograph(100, "acetonitrile");
    expect(rows?.map((row) => [row.percentText, row.capped])).toEqual([
      ["100", false],
      ["100", false],
      ["72.0", false],
    ]);
  });

  it("holds a reading at 100 when the line is past that scale", () => {
    const rows = solventNomograph(80, "THF");
    const methanol = rows?.find((row) => row.id === "methanol");
    expect(methanol?.capped).toBe(true);
    expect(methanol?.percentText).toBe("100");
    expect(formatMatchedPercent(100, true)).toBe("100");
  });

  it("does not invent a match for solvents that are not on the chart", () => {
    expect(solventNomograph(50, "ethanol")).toBeNull();
    expect(solventNomograph(50, "acetone")).toBeNull();
    expect(solventNomograph(50, "n-propanol")).toBeNull();
    expect(solventNomograph(50, "isopropanol")).toBeNull();
    expect(solventNomograph(50, "n-butanol")).toBeNull();
    expect(solventChoicePercent(50, "acetonitrile", "ethanol")).toBeNull();
    expect(solventChoicePercent(50, "ethanol", "methanol")).toBeNull();
    expect(findSolvent("ACN")?.id).toBe("acetonitrile");
    expect(findSolvent("MeOH")?.id).toBe("methanol");
    expect(findSolvent("2-Propanol")?.id).toBe("isopropanol");
    expect(findSolvent("1-Butanol")?.id).toBe("n-butanol");
  });
});

function percents(percent: number): string[] | undefined {
  return solventNomograph(percent, "acetonitrile")?.map((row) => row.percentText);
}

describe("selectivity checks", () => {
  it("is finished only when peaks are enough and resolution is above 70% of the typed minimum", () => {
    expect(assessHappy({ peakCount: 6, minResolutionExcludingFirst: 0.71 }, { requiredPeaks: 6, minResolution: 1 }).happy).toBe(true);
    expect(assessHappy({ peakCount: 6, minResolutionExcludingFirst: 0.7 }, { requiredPeaks: 6, minResolution: 1 }).happy).toBe(false);
    expect(assessHappy({ peakCount: 5, minResolutionExcludingFirst: 0.9 }, { requiredPeaks: 6, minResolution: 1 }).happy).toBe(false);
  });

  it("does not treat a run as finished when the resolution minimum is blank", () => {
    const check = assessHappy({ peakCount: 8, minResolutionExcludingFirst: 2 }, { requiredPeaks: 8, minResolution: null });
    expect(check.happy).toBe(false);
    expect(check.missingResolutionRule).toBe(true);
  });

  it("shifts the earlier %B line through the heated run", () => {
    const adjusted = adjustedPercentB({
      slope: -0.03,
      percentB: 40,
      t0: 1,
      lastPeakMin: 4,
      specMin: 10,
      usedPercentB: [40, 50],
    });
    expect(adjusted.method).toBe("line");
    expect(adjusted.percentB).toBe(24);
  });

  it("drops %B by 5 when there is no earlier line", () => {
    const adjusted = adjustedPercentB({
      slope: null,
      percentB: 50,
      t0: 1,
      lastPeakMin: 4,
      specMin: 10,
      usedPercentB: [],
    });
    expect(adjusted.method).toBe("drop-5");
    expect(adjusted.percentB).toBe(45);
  });
});

describe("selectivity plan", () => {
  it("starts at 40°C and the carried-forward %B when the run is not finished", () => {
    const history = planHistory([run({ peakCount: 8, minResolutionExcludingFirst: 0.4 })], setup);
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("temp-40");
    expect(history.plan.nextChange).toContain("40°C");
    expect(history.plan.prefill).toMatchObject({ percentB: "80", temperature: "40", solvent: "ACN", ligand: "C18" });
    expect(history.plan.why.toLowerCase()).not.toContain("guess");
  });

  it("finishes immediately when the carried-forward run already meets both checks", () => {
    const history = planHistory(
      [run({ peakCount: 8, minResolutionExcludingFirst: 0.8, lastPeakTimeMin: 10 })],
      setup,
    );
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.status).toBe("finished");
    expect(history.plan.prefill).toBeNull();
  });

  it("says the resolution rule is missing instead of finishing", () => {
    const history = planHistory([run({ peakCount: 8, minResolutionExcludingFirst: 2 })], {
      ...setup,
      minResolution: null,
    });
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.status).not.toBe("finished");
    expect(history.plan.why).toContain("did not type a minimum resolution");
    expect(history.plan.why.toLowerCase()).not.toContain("guess");
  });

  it("skips 60°C and shows the nomograph when 40°C does not improve the run", () => {
    const history = planHistory(
      [
        run({ peakCount: 8, minResolutionExcludingFirst: 0.4 }),
        run({ percentB: 80, temperatureC: 40, peakCount: 8, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 6 }),
        run({ percentB: 75, temperatureC: 40, peakCount: 8, minResolutionExcludingFirst: 0.3, lastPeakTimeMin: 8 }),
      ],
      setup,
    );
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("solvent");
    expect(history.plan.nextChange).toContain("Pick a new solvent you can actually use.");
    expect(history.plan.nextChange.toLowerCase()).not.toContain("methanol");
    expect(history.plan.nextChange).not.toContain("60°C");
    expect(history.plan.nomograph?.map((row) => row.percentText)).toEqual(["85.9", "80.0", "59.7"]);
    expect(history.plan.why).toContain("The old solvent is acetonitrile at 80% B.");
    expect(history.plan.why).toContain("methanol 85.9% B, acetonitrile 80.0% B, and tetrahydrofuran 59.7% B");
    expect(history.plan.why).not.toContain("The new solvent is");
    expect(history.plan.why.toLowerCase()).not.toContain("guess");
    expect(history.plan.recommendedSolventId).toBeNull();
    expect(history.plan.prefill).toMatchObject({ percentB: "", temperature: "25", solvent: "" });
  });

  it("recommends 60°C at the adjusted %B when 40°C improves the separation", () => {
    const history = planHistory(
      [
        run({ peakCount: 8, minResolutionExcludingFirst: 0.4 }),
        run({ percentB: 80, temperatureC: 40, peakCount: 8, minResolutionExcludingFirst: 0.55, lastPeakTimeMin: 6 }),
        run({ percentB: 70, temperatureC: 40, peakCount: 8, minResolutionExcludingFirst: 0.45, lastPeakTimeMin: 9 }),
      ],
      setup,
    );
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("temp-60");
    expect(history.plan.prefill).toMatchObject({ percentB: "70", temperature: "60" });
    expect(history.plan.nextChange).toContain("60°C");
  });

  it("changes the coating, returns to 100% B, and does not repeat a coating", () => {
    const cold = run({ peakCount: 8, minResolutionExcludingFirst: 0.4 });
    const heated = run({
      temperatureC: 40,
      peakCount: 8,
      minResolutionExcludingFirst: 0.4,
      lastPeakTimeMin: 6,
    });
    const adjusted = run({
      percentB: 75,
      temperatureC: 40,
      peakCount: 8,
      minResolutionExcludingFirst: 0.4,
      lastPeakTimeMin: 8,
    });
    const solventRun = run({
      percentB: 91,
      temperatureC: 25,
      solvent: "Methanol (MeOH)",
      peakCount: 8,
      minResolutionExcludingFirst: 0.4,
      lastPeakTimeMin: 10,
    });
    const again = run({
      percentB: 91,
      temperatureC: 40,
      solvent: "Methanol (MeOH)",
      peakCount: 8,
      minResolutionExcludingFirst: 0.4,
      lastPeakTimeMin: 6,
    });
    const againAdjusted = run({
      percentB: 86,
      temperatureC: 40,
      solvent: "Methanol (MeOH)",
      peakCount: 8,
      minResolutionExcludingFirst: 0.4,
      lastPeakTimeMin: 8,
    });
    const history = planHistory([cold, heated, adjusted, solventRun, again, againAdjusted], setup);
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("ligand");
    expect(history.plan.recommendedLigand).toBe("C8");
    expect(history.plan.prefill).toMatchObject({
      percentB: "100",
      temperature: "25",
      solvent: "ACN",
      ligand: "C8",
    });
    expect(history.plan.nextChange).toContain("100% B");
    expect(history.plan.why).toContain("C18");
    expect(recommendLigand(["C18", "C8"])).toBe("C4");
  });

  it("treats the 38% 40°C file as worse than the ambient 40% file and changes solvent", () => {
    const dir = path.join(process.cwd(), "fixtures/selectivity");
    const ambient = readLabFile(readFileSync(path.join(dir, "GR41-09-40-ambient.csv")));
    const hot = readLabFile(readFileSync(path.join(dir, "GR41-15-38-40C.csv")));
    expect(ambient.peakCount).toBe(7);
    expect(ambient.minResolutionExcludingFirst).toBeCloseTo(0.324, 3);
    expect(hot.peakCount).toBe(6);
    expect(hot.minResolutionExcludingFirst).toBeCloseTo(2.312, 3);
    expect(resolutionForDecision(ambient.peakCount, ambient.minResolutionExcludingFirst, 7)).toBeCloseTo(0.324, 3);
    expect(resolutionForDecision(hot.peakCount, hot.minResolutionExcludingFirst, 7)).toBe(0);

    const hotRow = evaluateRun(hot, {
      requiredPeaks: 7,
      lastPeakTimeMin: 15,
      minResolution: 1,
      maxBackPressurePsi: 4000,
    }).find((row) => row.id === "resolution");
    expect(hotRow?.measured).toBe("0.000");
    expect(hotRow?.note).toBe("Missing peaks are overlaps, so the minimum resolution is 0.");

    const carryRules = {
      requiredPeaks: 7,
      lastPeakTimeMin: 15,
      minResolution: 1,
      maxBackPressurePsi: 4000,
    };
    const carried = carryForwardIndex(
      [
        {
          percentB: 38,
          peakCount: hot.peakCount,
          lastPeakTimeMin: hot.lastPeakTimeMin,
          firstPeakTimeMin: hot.firstPeakTimeMin,
          minResolutionExcludingFirst: hot.minResolutionExcludingFirst,
          maxBackPressurePsi: hot.maxBackPressurePsi,
        },
        {
          percentB: 40,
          peakCount: ambient.peakCount,
          lastPeakTimeMin: ambient.lastPeakTimeMin,
          firstPeakTimeMin: ambient.firstPeakTimeMin,
          minResolutionExcludingFirst: ambient.minResolutionExcludingFirst,
          maxBackPressurePsi: ambient.maxBackPressurePsi,
        },
      ],
      carryRules,
    );
    expect(carried).toBe(1);

    const rules: SelectivitySetup = {
      requiredPeaks: 7,
      lastPeakTimeMin: ambient.lastPeakTimeMin,
      minResolution: 1,
      maxBackPressurePsi: 4000,
      ambientTemperatureC: 25,
      originalSolvent: "Acetonitrile",
      originalLigand: "C18",
    };
    const fromFile = (
      read: typeof ambient,
      percentB: number,
      temperatureC: number,
    ): SelectivityRun => ({
      percentB,
      temperatureC,
      solvent: "Acetonitrile",
      ligand: "C18",
      peakCount: read.peakCount,
      lastPeakTimeMin: read.lastPeakTimeMin,
      firstPeakTimeMin: read.firstPeakTimeMin,
      minResolutionExcludingFirst: read.minResolutionExcludingFirst,
      maxBackPressurePsi: read.maxBackPressurePsi,
    });
    const history = planHistory(
      [
        fromFile(ambient, 40, 25),
        fromFile(hot, 40, 40),
        fromFile(hot, 38, 40),
      ],
      rules,
    );
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("solvent");
    expect(history.plan.step).not.toBe("temp-60");
    expect(history.plan.nextChange.toLowerCase()).not.toContain("60°c");
    expect(history.plan.why).toContain("worse because it has fewer peaks");
    expect(history.plan.why).toContain("minimum resolution is 0");
    expect(history.plan.why).toContain("new solvent");
    expect(history.plan.why).toContain("The old solvent is acetonitrile at 40% B.");
    expect(history.plan.why).toContain("methanol 51.2% B, acetonitrile 40.0% B, and tetrahydrofuran 30.7% B");
    expect(history.plan.why).not.toContain("The new solvent is");
    expect(history.plan.why).not.toContain("2.312");
    expect(history.plan.nextChange).not.toMatch(/methanol|acetonitrile|tetrahydrofuran/i);
  });

  it("uses 25°C when Run 1 has no temperature", () => {
    const history = planHistory([run({ peakCount: 8, temperatureC: null, minResolutionExcludingFirst: 0.4 })], {
      ...setup,
      ambientTemperatureC: null,
    });
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.why).toContain("empty");
    expect(history.plan.why).toContain("25°C");
  });
});

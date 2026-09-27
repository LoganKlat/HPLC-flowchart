import { describe, expect, it } from "vitest";
import {
  SOLVENTS,
  adjustedPercentB,
  assessHappy,
  findSolvent,
  formatMatchedPercent,
  matchSolventPercent,
  planHistory,
  recommendLigand,
  recommendSolventId,
  solventById,
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

describe("solvent strengths", () => {
  it("uses the eight strengths, including the five corrected values", () => {
    expect(SOLVENTS.map((solvent) => [solvent.label, solvent.strength])).toEqual([
      ["Acetonitrile (ACN)", 5.8],
      ["Methanol (MeOH)", 5.1],
      ["Tetrahydrofuran (THF)", 8.0],
      ["Ethanol", 4.3],
      ["Isopropanol (2-Propanol)", 3.9],
      ["n-Propanol (1-Propanol)", 4.0],
      ["Acetone", 5.1],
      ["n-Butanol (1-Butanol)", 3.9],
    ]);
  });

  it("matches 50% acetonitrile to methanol 56.9 and tetrahydrofuran 36.3", () => {
    const rows = solventNomograph(50, "acetonitrile");
    expect(rows?.map((row) => [row.id, row.percentText, row.capped])).toEqual([
      ["methanol", "56.9", false],
      ["acetonitrile", "50.0", false],
      ["tetrahydrofuran", "36.3", false],
    ]);
  });

  it("matches the corrected strengths at one decimal", () => {
    const acetonitrile = solventById("acetonitrile")!;
    expect(matchSolventPercent(50, acetonitrile.strength, solventById("ethanol")!.strength).percent).toBe(67.4);
    expect(matchSolventPercent(50, acetonitrile.strength, solventById("acetone")!.strength).percent).toBe(56.9);
    expect(matchSolventPercent(50, acetonitrile.strength, solventById("n-propanol")!.strength).percent).toBe(72.5);
    expect(matchSolventPercent(50, acetonitrile.strength, solventById("isopropanol")!.strength).percent).toBe(74.4);
    expect(matchSolventPercent(50, acetonitrile.strength, solventById("n-butanol")!.strength).percent).toBe(74.4);
  });

  it("holds a matched %B at 100 when the formula goes past the pump", () => {
    const matched = matchSolventPercent(90, 8.0, 5.1);
    expect(matched.capped).toBe(true);
    expect(matched.percent).toBe(100);
    expect(formatMatchedPercent(matched.percent, matched.capped)).toBe("100");
    expect(matched.raw).toBeGreaterThan(100);
  });

  it("recognizes short solvent names and recommends methanol after acetonitrile", () => {
    expect(findSolvent("ACN")?.id).toBe("acetonitrile");
    expect(findSolvent("MeOH")?.id).toBe("methanol");
    expect(findSolvent("2-Propanol")?.id).toBe("isopropanol");
    expect(findSolvent("1-Butanol")?.id).toBe("n-butanol");
    expect(recommendSolventId("ACN")).toBe("methanol");
    expect(recommendSolventId("methanol")).toBe("acetonitrile");
    expect(recommendSolventId("THF")).toBe("methanol");
    expect(recommendSolventId("ethanol")).toBe("methanol");
  });
});

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
    expect(history.plan.nextChange).toContain("methanol");
    expect(history.plan.nextChange).not.toContain("60°C");
    expect(history.plan.nomograph?.map((row) => row.percentText)).toEqual(["91.0", "80.0", "58.0"]);
    expect(history.plan.why).toContain("acetonitrile");
    expect(history.plan.why).toContain("80");
    expect(history.plan.why).toContain("methanol");
    expect(history.plan.why.toLowerCase()).not.toContain("guess");
    expect(history.plan.prefill).toMatchObject({ percentB: "91.0", temperature: "25", solvent: "Methanol (MeOH)" });
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

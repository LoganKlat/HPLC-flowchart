import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateRun, resolutionForDecision } from "@/lib/evaluate";
import { readLabFile } from "@/lib/lab-file";
import { retentionChangeLabel, selectivityChangeLabel } from "@/lib/change-label";
import { nextRunFileName } from "@/lib/filename-details";
import { emptyRunDetails } from "@/lib/run-details";
import { carryForwardIndex, decideRetention, formatPercentB } from "@/lib/retention";
import {
  adjustedPercentB,
  assessHappy,
  efficiencyAsk,
  efficiencyQuestion,
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
  it("reads 20% acetonitrile from the nomogram equations", () => {
    expect(percents(20)).toEqual(["20.0", "33.0", "6.6", "15.0", "9.2", "21.0", "11.0", "4.2"]);
  });

  it("reads 40% acetonitrile from the nomogram equations", () => {
    expect(percents(40)).toEqual(["40.0", "56.0", "21.2", "33.0", "24.4", "40.0", "27.0", "18.4"]);
  });

  it("reads 50% acetonitrile from the nomogram equations", () => {
    expect(percents(50)).toEqual(["50.0", "67.5", "28.5", "42.0", "32.0", "49.5", "35.0", "25.5"]);
    expect(findSolvent("ACN")?.strength).toBe(3.2);
    expect(findSolvent("MeOH")?.strength).toBe(2.6);
    expect(findSolvent("THF")?.strength).toBe(4.5);
    expect(findSolvent("Ethanol")?.strength).toBe(3.6);
    expect(findSolvent("IPA")?.strength).toBe(4.2);
    expect(findSolvent("Acetone")?.strength).toBe(3.4);
    expect(findSolvent("Propanol")?.strength).toBe(4);
    expect(findSolvent("Butanol")?.strength).toBeNull();
  });

  it("caps methanol at 100 when 100% acetonitrile is past that scale", () => {
    const rows = solventNomograph(100, "acetonitrile");
    expect(rows?.map((row) => [row.label, row.percentText, row.capped])).toEqual([
      ["ACN", "100", false],
      ["MeOH", "100", true],
      ["THF", "65.0", false],
      ["Ethanol", "87.0", false],
      ["IPA", "70.0", false],
      ["Acetone", "97.0", false],
      ["Propanol", "75.0", false],
      ["Butanol", "61.0", false],
    ]);
  });

  it("holds a reading at 100 when the line is past that scale", () => {
    const rows = solventNomograph(80, "THF");
    const methanol = rows?.find((row) => row.id === "methanol");
    expect(methanol?.capped).toBe(true);
    expect(methanol?.percentText).toBe("100");
    expect(formatMatchedPercent(100, true)).toBe("100");
  });

  it("matches every supported solvent and does not invent one outside the list", () => {
    expect(solventNomograph(50, "ethanol")?.find((row) => row.id === "acetonitrile")?.percentText).toBe("58.9");
    expect(solventNomograph(50, "acetone")).toBeTruthy();
    expect(solventNomograph(50, "n-propanol")).toBeTruthy();
    expect(solventNomograph(50, "isopropanol")).toBeTruthy();
    expect(solventNomograph(50, "n-butanol")?.find((row) => row.id === "butanol")?.percentText).toBe("50.0");
    expect(solventChoicePercent(50, "acetonitrile", "ethanol")?.percentText).toBe("42.0");
    expect(solventChoicePercent(50, "ethanol", "methanol")?.percentText).toBe("77.7");
    expect(findSolvent("ACN")?.label).toBe("ACN");
    expect(findSolvent("MeOH")?.id).toBe("methanol");
    expect(findSolvent("THF")?.label).toBe("THF");
    expect(findSolvent("acetonitrile")?.label).toBe("ACN");
    expect(solventNomograph(40, "ACN")?.map((row) => row.label)).toEqual([
      "ACN",
      "MeOH",
      "THF",
      "Ethanol",
      "IPA",
      "Acetone",
      "Propanol",
      "Butanol",
    ]);
    expect(findSolvent("2-Propanol")?.id).toBe("isopropanol");
    expect(findSolvent("ethanol")?.id).toBe("ethanol");
    expect(solventChoicePercent(50, "ACN", "methanol")?.percentText).toBe("67.5");
    expect(solventChoicePercent(67.5, "MeOH", "acetonitrile")?.percentText).toBe("50.0");
    expect(solventChoicePercent(50, "MeOH", "tetrahydrofuran")?.percentText).toBe("17.4");
    expect(findSolvent("hexane")).toBeNull();
    expect(findSolvent("ethyl acetate")).toBeNull();
    expect(recommendLigand(["C18", "C18aq", "PFPP", "C8", "biphenyl", "IBD"])).toBeNull();
  });
});

function percents(percent: number): string[] | undefined {
  return solventNomograph(percent, "acetonitrile")?.map((row) => row.percentText);
}

describe("selectivity checks", () => {
  it("does not use the old ladder once the peak count equals the specification", () => {
    expect(efficiencyAsk({
      peakCount: 8,
      foundResolution: 0.4,
      requiredPeaks: 8,
      minResolution: 1,
      declinedThrough: null,
    })).toBeNull();
    expect(efficiencyAsk({
      peakCount: 8,
      foundResolution: 0.55,
      requiredPeaks: 8,
      minResolution: 1,
      declinedThrough: 0.4,
    })).toBeNull();
    expect(efficiencyAsk({
      peakCount: 8,
      foundResolution: 1,
      requiredPeaks: 8,
      minResolution: 1,
      declinedThrough: 0.85,
    })).toBeNull();
    expect(efficiencyQuestion(0.4, 1)).toContain("Under the specification of 1.000");
    expect(efficiencyQuestion(0.4, 1)).not.toContain("times");
    expect(efficiencyQuestion(0.4, 1)).not.toContain("you set");
    expect(efficiencyQuestion(0.4, 1)).not.toContain("benchmark");
  });

  it("sends a late run that already has the peaks to efficiency", () => {
    const workbook = path.join(
      process.cwd(),
      "fixtures/lab/GR09-14-4-ACN-3-ISO-35-1.5-20u-CP-0.1-C18aqP-150x4.6x5-amb-254_ae4e.xlsx",
    );
    const read = readLabFile(readFileSync(workbook));
    const rules = {
      requiredPeaks: 7,
      lastPeakTimeMin: 15,
      minResolution: 1.4,
      maxBackPressurePsi: 4000,
    };
    const rows = evaluateRun(read, { ...rules, maxBackPressurePsi: 2000 });
    expect(rows.find((row) => row.id === "peaks")?.status).toBe("met");
    expect(rows.find((row) => row.id === "resolution")?.status).toBe("met");
    expect(rows.find((row) => row.id === "last-peak")?.status).toBe("not-met");
    expect(read.lastPeakTimeMin).toBeCloseTo(19.854, 3);

    const decision = decideRetention(
      [
        {
          percentB: 35,
          peakCount: read.peakCount,
          lastPeakTimeMin: read.lastPeakTimeMin,
          firstPeakTimeMin: read.firstPeakTimeMin,
          minResolutionExcludingFirst: read.minResolutionExcludingFirst,
          maxBackPressurePsi: read.maxBackPressurePsi,
        },
      ],
      rules,
    );
    expect(decision.status).toBe("efficiency");
    expect(decision.nextChange).toContain("Move on to efficiency");
    expect(decision.efficiencyChoice?.continueLabel).toBe("Move on to selectivity");
    expect(decision.efficiencyChoice?.recommendedSentence).toContain("peak count equals the specification");
    expect(decision.nextPercentB).toBeNull();
    expect(decision.why).toContain("Peaks: 7. The specification is 7. Met.");
    expect(decision.why).toContain("Minimum resolution: 1.453. Above the specification of 1.400.");
    expect(decision.why).toContain("Last peak: 19.854 min. Later than the specification of 15 min. Not met.");
    expect(decision.why).toContain("Efficiency is next to bring the last peak time to the specification.");
    expect(decision.why).not.toContain("you set");
    expect(decision.why).not.toContain("benchmark");
    expect(efficiencyAsk({
      peakCount: read.peakCount,
      foundResolution: read.minResolutionExcludingFirst,
      requiredPeaks: rules.requiredPeaks,
      minResolution: rules.minResolution,
      declinedThrough: null,
    })).toBeNull();
  });

  it("recommends SELECTIVITY (Run at 40°C) when 7 peaks match and resolution is far below spec (unassessable / 0)", () => {
    const sample = {
      percentB: 40,
      temperatureC: 25,
      solvent: "ACN",
      ligand: "C18",
      peakCount: 7,
      lastPeakTimeMin: 11.6,
      firstPeakTimeMin: 1.09,
      minResolutionExcludingFirst: 0, // unassessable co-eluting worst pair
      maxBackPressurePsi: 1200,
    };
    const rules = {
      requiredPeaks: 7,
      lastPeakTimeMin: 15,
      minResolution: 1,
      maxBackPressurePsi: 4000,
      ambientTemperatureC: 25,
      originalSolvent: "ACN",
      originalLigand: "C18",
    };
    const decision = decideRetention([sample], rules);
    expect(decision.status).toBe("recommend");
    expect(decision.nextTemperature).toBe("40");
    expect(decision.nextChange).toContain("Run at 40°C (Change selectivity)");
    expect(retentionChangeLabel(decision)).toBe("Run at 40°C (Change selectivity)");
    expect(decision.why).toContain("Peaks: 7. The specification is 7. Met.");
    expect(decision.why).toContain("resolution is far below the specification");
    expect(decision.why).toContain("Selectivity is the next stage");
  });

  it("continues normal pathway when Rs < 0.5*spec and moves to efficiency (→ N) when Rs >= 0.5*spec", () => {
    const ambient = readLabFile(readFileSync(path.join(process.cwd(), "fixtures/selectivity/GR41-09-40-ambient.csv")));
    expect(ambient.peakCount).toBe(7);
    expect(ambient.minResolutionExcludingFirst).toBeCloseTo(0.324, 3);
    const sample = {
      percentB: 40,
      temperatureC: 25,
      solvent: "ACN",
      ligand: "C18",
      peakCount: ambient.peakCount,
      lastPeakTimeMin: ambient.lastPeakTimeMin,
      firstPeakTimeMin: ambient.firstPeakTimeMin,
      minResolutionExcludingFirst: ambient.minResolutionExcludingFirst,
      maxBackPressurePsi: ambient.maxBackPressurePsi,
    };
    const rules = {
      requiredPeaks: 7,
      lastPeakTimeMin: 15,
      minResolution: 1,
      maxBackPressurePsi: 4000,
      ambientTemperatureC: 25,
      originalSolvent: "ACN",
      originalLigand: "C18",
    };
    // 1. When Rs < 0.5 * spec (0.324 < 0.50), continues normal decision pathway
    const decisionUnder = decideRetention([sample], rules);
    expect(decisionUnder.status).toBe("recommend");
    expect(decisionUnder.why).toContain("significantly under the specification");
    expect(decisionUnder.why).toContain("optimise retention and selectivity first");

    // 2. When Rs >= floor (0.324 >= 0.272 with minResolution = 0.5), moves to efficiency
    const decisionOver = decideRetention([sample], { ...rules, minResolution: 0.5 });
    expect(decisionOver.status).toBe("efficiency");
    expect(decisionOver.reason).toBe("efficiency");
    expect(decisionOver.nextChange).toContain("Move on to efficiency");
    expect(retentionChangeLabel(decisionOver)).toBe("Move on to efficiency");
    expect(decisionOver.why).toContain("Peaks: 7. The specification is 7. Met.");
    expect(decisionOver.why).toContain("Efficiency is next for the resolution.");
    expect(decisionOver.why).toContain("above the Rs floor");
  });

  it("moves on to efficiency (→ N) when 7 peaks match and resolution is close to spec (not far below)", () => {
    const sample = {
      percentB: 40,
      temperatureC: 25,
      solvent: "ACN",
      ligand: "C18",
      peakCount: 7,
      lastPeakTimeMin: 11.6,
      firstPeakTimeMin: 1.09,
      minResolutionExcludingFirst: 0.75, // >= 0.5 * 1.0, can be rescued by N
      maxBackPressurePsi: 1200,
    };
    const rules = {
      requiredPeaks: 7,
      lastPeakTimeMin: 15,
      minResolution: 1,
      maxBackPressurePsi: 4000,
      ambientTemperatureC: 25,
      originalSolvent: "ACN",
      originalLigand: "C18",
    };
    const decision = decideRetention([sample], rules);
    expect(decision.status).toBe("efficiency");
    expect(decision.reason).toBe("efficiency");
    expect(decision.nextChange).toContain("Move on to efficiency");
    expect(retentionChangeLabel(decision)).toBe("Move on to efficiency");
    expect(decision.why).toContain("Efficiency is next for the resolution.");
  });

  it("recommends MET when 7 peaks match, run time is within spec, and resolution meets spec", () => {
    const sample = {
      percentB: 40,
      temperatureC: 25,
      solvent: "ACN",
      ligand: "C18",
      peakCount: 7,
      lastPeakTimeMin: 11.6,
      firstPeakTimeMin: 1.09,
      minResolutionExcludingFirst: 1.25, // >= 1.0
      maxBackPressurePsi: 1200,
    };
    const rules = {
      requiredPeaks: 7,
      lastPeakTimeMin: 15,
      minResolution: 1,
      maxBackPressurePsi: 4000,
      ambientTemperatureC: 25,
      originalSolvent: "ACN",
      originalLigand: "C18",
    };
    const decision = decideRetention([sample], rules);
    expect(decision.status).toBe("specs-met");
    expect(decision.reason).toBe("specs-met");
    expect(decision.nextChange).toContain("specifications are met");
    expect(retentionChangeLabel(decision)).toBe("MET (Method complete)");
    expect(decision.why).toContain("Method Development Complete");
  });

  it("does not ask just because a short run has 7 peaks", () => {
    expect(efficiencyAsk({
      peakCount: 7,
      foundResolution: 0.324,
      requiredPeaks: 10,
      minResolution: 1,
      declinedThrough: null,
    })).toBeNull();
    expect(efficiencyAsk({
      peakCount: 7,
      foundResolution: 0.4,
      requiredPeaks: 7,
      minResolution: 1,
      declinedThrough: null,
    })).toBeNull();
  });

  it("does not ask when peaks are short or the resolution spec is blank", () => {
    expect(efficiencyAsk({
      peakCount: 5,
      foundResolution: 0.9,
      requiredPeaks: 6,
      minResolution: 1,
      declinedThrough: null,
    })).toBeNull();
    expect(efficiencyAsk({
      peakCount: 4,
      foundResolution: 2,
      requiredPeaks: 8,
      minResolution: null,
      declinedThrough: null,
    })).toBeNull();
    const check = assessHappy({ peakCount: 4 }, { requiredPeaks: 8, minResolution: null });
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

function withHeat(runs: SelectivityRun[], rules: SelectivitySetup = setup) {
  return planHistory(runs, rules, { heat: { carryIndex: 0, seriesLength: 1 } });
}

describe("selectivity plan", () => {
  it("starts at 40°C and the carried-forward %B when the run is not finished", () => {
    const history = withHeat([run({ peakCount: 4, minResolutionExcludingFirst: 0.4 })], setup);
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("temp-40");
    expect(history.plan.nextChange).toContain("40°C");
    expect(history.plan.prefill).toMatchObject({ percentB: "80", temperature: "40", solvent: "ACN", ligand: "C18" });
    expect(history.plan.why.toLowerCase()).not.toContain("guess");
  });

  it("does not leave selectivity on its own when resolution is past 0.7 times the spec", () => {
    const history = withHeat(
      [run({ peakCount: 4, minResolutionExcludingFirst: 0.8, lastPeakTimeMin: 10 })],
      setup,
    );
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.status).not.toBe("finished");
    expect(history.plan.step).toBe("temp-40");
    expect(history.plan.nextChange).toContain("40°C");
  });

  it("says the resolution rule is missing instead of finishing", () => {
    const history = withHeat([run({ peakCount: 9, minResolutionExcludingFirst: 2 })], {
      ...setup,
      minResolution: null,
    });
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.status).not.toBe("finished");
    expect(history.plan.why).toContain("did not type a minimum resolution");
    expect(history.plan.why.toLowerCase()).not.toContain("guess");
  });

  it("changes solvent when 40°C does not improve the run (OBSERVE step: temperature did not move peaks the right way)", () => {
    const history = withHeat(
      [
        run({ peakCount: 4, minResolutionExcludingFirst: 0.4 }),
        run({ percentB: 80, temperatureC: 40, peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 6 }),
      ],
      setup,
    );
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("solvent");
    expect(history.plan.nextChange.toLowerCase()).toContain("solvent");
    expect(history.plan.showSolventChoices).toBe(true);
    expect(history.plan.nomograph).not.toBeNull();
    expect(history.plan.why).toContain("OBSERVE");
  });

  it("recommends 60°C only when the peak count went up", () => {
    const history = withHeat(
      [
        run({ peakCount: 4, minResolutionExcludingFirst: 0.4 }),
        run({ percentB: 80, temperatureC: 40, peakCount: 9, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 9 }),
      ],
      setup,
    );
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("temp-60");
    expect(history.plan.tempChoice).toBeNull();
    expect(history.plan.showSolventChoices).toBe(false);
    expect(history.plan.nextChange).toContain("60°C");
    expect(history.plan.nextChange.toLowerCase()).not.toContain("solvent");
    expect(history.plan.why).toContain("went up");
    expect(history.plan.why).toContain("A higher temperature is likely to increase separation further.");
    expect(history.plan.prefill).toMatchObject({ percentB: "80", temperature: "60" });
  });

  it("changes solvent after 60°C without lowering %B", () => {
    const history = withHeat(
      [
        run({ peakCount: 4, minResolutionExcludingFirst: 0.4 }),
        run({ percentB: 80, temperatureC: 40, peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 6 }),
        run({ percentB: 80, temperatureC: 60, peakCount: 4, minResolutionExcludingFirst: 0.3, lastPeakTimeMin: 5 }),
      ],
      setup,
    );
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("solvent");
    expect(history.plan.nextChange.toLowerCase()).toContain("solvent");
    expect(history.plan.nextChange.toLowerCase()).not.toContain("lowered");
    expect(history.plan.prefill?.percentB).not.toBe("75");
  });

  it("stays on 60°C when the peak count matches and the resolution is still under", () => {
    const history = planHistory(
      [
        run({ peakCount: 8, minResolutionExcludingFirst: 0.4 }),
        run({ percentB: 80, temperatureC: 40, peakCount: 8, minResolutionExcludingFirst: 0.55, lastPeakTimeMin: 6 }),
        run({ percentB: 70, temperatureC: 40, peakCount: 8, minResolutionExcludingFirst: 0.45, lastPeakTimeMin: 9 }),
      ],
      setup,
      { heat: { carryIndex: 0, seriesLength: 1 } },
    );
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("temp-60");
    expect(history.plan.prefill).toMatchObject({ percentB: "80", temperature: "60" });
    expect(history.plan.why.toLowerCase()).not.toContain("coating");
    expect(history.plan.why.toLowerCase()).not.toContain("other solvent");
  });

  it("changes the coating, returns to 100% B, and does not repeat a coating", () => {
    const cold = run({ peakCount: 4, minResolutionExcludingFirst: 0.4 });
    const heated = run({
      temperatureC: 40,
      peakCount: 4,
      minResolutionExcludingFirst: 0.4,
      lastPeakTimeMin: 6,
    });
    const at60 = run({
      percentB: 80,
      temperatureC: 60,
      peakCount: 4,
      minResolutionExcludingFirst: 0.4,
      lastPeakTimeMin: 5,
    });
    const solventRun = run({
      percentB: 91,
      temperatureC: 25,
      solvent: "MeOH",
      peakCount: 4,
      minResolutionExcludingFirst: 0.4,
      lastPeakTimeMin: 10,
    });
    const again = run({
      percentB: 91,
      temperatureC: 40,
      solvent: "MeOH",
      peakCount: 4,
      minResolutionExcludingFirst: 0.4,
      lastPeakTimeMin: 6,
    });
    const again60 = run({
      percentB: 91,
      temperatureC: 60,
      solvent: "MeOH",
      peakCount: 4,
      minResolutionExcludingFirst: 0.4,
      lastPeakTimeMin: 5,
    });
    const history = withHeat([cold, heated, at60, solventRun, again, again60], setup);
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("ligand");
    expect(history.plan.recommendedLigand).toBeNull();
    expect(history.plan.prefill).toMatchObject({
      percentB: "100",
      temperature: "25",
      solvent: "ACN",
      ligand: "",
    });
    expect(history.plan.nextChange).toBe(
      "Pick a new column coating from the dropdown. Go back to 100% B, 25°C, and ACN, then start the %B steps over.",
    );
    expect(history.plan.why).toContain("The previous solvent is not carried forward.");
    expect(history.plan.why).toContain("Already used: C18");
    expect(history.plan.why).not.toMatch(/C18aq|PFPP|C8|biphenyl|IBD/);
    expect(history.plan.nextChange).not.toMatch(/C18aq|PFPP|C8|biphenyl|IBD|C18/);
  });

  it("restarts a new coating at 100% B and ACN even when the previous solvent was MeOH", () => {
    const history = withHeat(
      [
        run({ solvent: "MeOH", peakCount: 4, minResolutionExcludingFirst: 0.4 }),
        run({ solvent: "MeOH", temperatureC: 40, peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 6 }),
        run({ solvent: "MeOH", temperatureC: 60, peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 5 }),
        run({ solvent: "THF", temperatureC: 25, percentB: 70, peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 10 }),
        run({ solvent: "THF", temperatureC: 40, percentB: 70, peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 6 }),
        run({ solvent: "THF", temperatureC: 60, percentB: 70, peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 5 }),
      ],
      { ...setup, originalSolvent: "MeOH", ambientTemperatureC: null },
    );
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("ligand");
    expect(history.plan.prefill).toMatchObject({
      percentB: "100",
      temperature: "ambient",
      solvent: "ACN",
      ligand: "",
    });
    expect(history.plan.nextChange).toContain("100% B, ambient, and ACN");
    expect(history.plan.nextChange).not.toContain("25°C");
    expect(history.plan.nextChange).not.toContain("MeOH");
    expect(history.plan.why).toContain("The previous solvent is not carried forward.");
    expect(history.plan.why).toContain("The temperature on Run 1 is ambient.");
    expect(history.plan.why).not.toContain("25°C");
  });

  it("says every coating was already used and does not invent another", () => {
    const ligands = ["C18", "C18aq", "PFPP", "C8", "biphenyl", "IBD"];
    const runs = ligands.flatMap((ligand) => [
      run({ ligand, peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 10, percentB: 80 }),
      run({ ligand, temperatureC: 40, peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 6, percentB: 80 }),
      run({ ligand, temperatureC: 60, peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 5, percentB: 80 }),
      run({ ligand, solvent: "MeOH", temperatureC: 25, peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 10, percentB: 90 }),
      run({ ligand, solvent: "MeOH", temperatureC: 40, peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 6, percentB: 90 }),
      run({ ligand, solvent: "MeOH", temperatureC: 60, peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 5, percentB: 90 }),
    ]);
    const history = withHeat(runs, setup);
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("blocked");
    expect(history.plan.nextChange).toBe("Every column coating in the list has already been tried.");
    expect(history.plan.why).toContain("Every coating in the list has already been used");
    expect(history.plan.recommendedLigand).toBeNull();
    expect(history.plan.prefill).toBeNull();
  });

  it("treats the 38% 40°C file as worse than the ambient 40% file and goes to 60°C", () => {
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
    const history = withHeat([fromFile(ambient, 40, 25), fromFile(hot, 40, 40)], rules);
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("solvent");
    expect(history.plan.nextChange).toContain("Change solvent");
    expect(history.plan.showSolventChoices).toBe(true);
    expect(history.plan.why).toContain("OBSERVE");
  });

  it("goes to ligand when 40°C on the new solvent does not improve (OBSERVE step)", () => {
    const history = withHeat([
      run({ peakCount: 4, minResolutionExcludingFirst: 0.4 }),
      run({ percentB: 80, temperatureC: 40, peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 6 }),
      run({ percentB: 80, temperatureC: 60, peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 5 }),
      run({ percentB: 91, temperatureC: 25, solvent: "MeOH", peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 10 }),
      run({ percentB: 91, temperatureC: 40, solvent: "MeOH", peakCount: 3, minResolutionExcludingFirst: 1.2, lastPeakTimeMin: 6 }),
    ]);
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("ligand");
    expect(history.plan.tempChoice).toBeNull();
    expect(history.plan.nextChange).toContain("Pick a new column coating");
    expect(history.plan.showLigandChoices).toBe(true);
  });

  it("goes to the ligand step after 60°C on the new solvent without lowering %B", () => {
    const history = withHeat([
      run({ peakCount: 4, minResolutionExcludingFirst: 0.4 }),
      run({ percentB: 80, temperatureC: 40, peakCount: 6, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 6 }),
      run({ percentB: 80, temperatureC: 60, peakCount: 6, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 5 }),
      run({ percentB: 91, temperatureC: 25, solvent: "MeOH", peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 10 }),
      run({ percentB: 91, temperatureC: 40, solvent: "MeOH", peakCount: 6, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 6 }),
      run({ percentB: 91, temperatureC: 60, solvent: "MeOH", peakCount: 3, minResolutionExcludingFirst: 0.2, lastPeakTimeMin: 5 }),
    ]);
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("ligand");
    expect(history.plan.nextChange.toLowerCase()).not.toContain("lowered");
    expect(history.plan.prefill).toMatchObject({ percentB: "100" });
  });

  it("calculates a new minimum %B on the ligand restart ladder", () => {
    const coating = { ligand: "C8", solvent: "ACN", temperatureC: 25 };
    const runs = [
      run({ percentB: 70, peakCount: 4, lastPeakTimeMin: 2.2 }),
      run({ percentB: 40, peakCount: 4, lastPeakTimeMin: 11 }),
      run({ percentB: 42, temperatureC: 40, peakCount: 4, lastPeakTimeMin: 6 }),
      run({ percentB: 42, temperatureC: 60, peakCount: 4, lastPeakTimeMin: 5 }),
      run({ percentB: 90, solvent: "MeOH", temperatureC: 25, peakCount: 4, lastPeakTimeMin: 3 }),
      run({ percentB: 90, solvent: "MeOH", temperatureC: 40, peakCount: 4, lastPeakTimeMin: 6 }),
      run({ percentB: 90, solvent: "MeOH", temperatureC: 60, peakCount: 4, lastPeakTimeMin: 5 }),
      run({ ...coating, percentB: 100, peakCount: 4, lastPeakTimeMin: 1.5 }),
      run({ ...coating, percentB: 90, peakCount: 5, lastPeakTimeMin: 2.2 }),
      run({ ...coating, percentB: 80, peakCount: 6, lastPeakTimeMin: 3.4 }),
      // Keep peaks under the specification so this coating still calculates a minimum %B.
      run({ ...coating, percentB: 70, peakCount: 7, lastPeakTimeMin: 7.4, minResolutionExcludingFirst: 0.4 }),
    ];
    const history = planHistory(runs, setup);
    expect(history.phase).toBe("retention");
    if (history.phase !== "retention") return;
    expect(history.segmentStart).toBe(7);
    const decision = decideRetention(
      runs.slice(history.segmentStart).map((item) => ({
        percentB: item.percentB,
        peakCount: item.peakCount,
        lastPeakTimeMin: item.lastPeakTimeMin,
        firstPeakTimeMin: item.firstPeakTimeMin,
        minResolutionExcludingFirst: item.minResolutionExcludingFirst,
        maxBackPressurePsi: item.maxBackPressurePsi,
      })),
      setup,
    );
    expect(decision.move).toBe("calculated");
    expect(decision.fit).not.toBeNull();
    expect(decision.nextTemperature).toBeUndefined();
    expect(decision.nextPercentB).not.toBeNull();
  });

  it("continues selectivity at 40°C when that choice is taken before heat", () => {
    const rules = { ...setup, requiredPeaks: 8, lastPeakTimeMin: 10 };
    const runs = [run({ peakCount: 8, percentB: 35, minResolutionExcludingFirst: 1.2, lastPeakTimeMin: 14 })];
    expect(planHistory(runs, rules).phase).toBe("retention");
    const history = planHistory(runs, rules, { continuePastEfficiency: true });
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("temp-40");
    expect(history.plan.prefill).toMatchObject({ percentB: "35", temperature: "40" });
    expect(history.plan.step).not.toBe("ligand");
    expect(history.plan.step).not.toBe("solvent");
  });

  it("takes the next heat step when continuing after temperature has started", () => {
    const runs = [
      run({ peakCount: 4, percentB: 80, minResolutionExcludingFirst: 0.4 }),
      run({ peakCount: 8, percentB: 80, temperatureC: 40, minResolutionExcludingFirst: 1.2, lastPeakTimeMin: 6 }),
    ];
    const held = planHistory(runs, setup, { heat: { carryIndex: 0, seriesLength: 1 } });
    expect(held.phase).toBe("retention");
    const history = planHistory(runs, setup, {
      heat: { carryIndex: 0, seriesLength: 1 },
      continuePastEfficiency: true,
    });
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("temp-60");
    expect(history.plan.prefill).toMatchObject({ percentB: "80", temperature: "60" });
  });

  it("changes solvent at the original temperature after 40°C and then 60°C", () => {
    const rules: SelectivitySetup = { ...setup, ambientTemperatureC: null, lastPeakTimeMin: 15 };
    const cold = run({
      percentB: 35,
      temperatureC: null,
      peakCount: 6,
      minResolutionExcludingFirst: 0.4,
      lastPeakTimeMin: 12,
    });
    const at40 = run({
      percentB: 35,
      temperatureC: 40,
      peakCount: 6,
      minResolutionExcludingFirst: 0.4,
      lastPeakTimeMin: 8,
    });
    const at60 = run({
      percentB: 60,
      temperatureC: 60,
      peakCount: 6,
      minResolutionExcludingFirst: 0.3,
      lastPeakTimeMin: 6,
    });
    const history = planHistory([cold, at40, at60], rules);
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("solvent");
    expect(selectivityChangeLabel(history.plan)).toBe("Change solvent, back at ambient");
    expect(selectivityChangeLabel(history.plan)).not.toBe("Run at 60% B");
    expect(history.plan.nextChange).toBe("Change solvent, back at ambient.");
    expect(history.plan.anchorPercentB).toBe(35);
    expect(history.plan.recommendedSolventId).toBeNull();
    expect(history.plan.showSolventChoices).toBe(true);
    expect(history.plan.why).toContain("go back to ambient");
    expect(history.plan.why).toContain("is ambient");
    expect(history.plan.why).not.toContain("25°C");
    expect(history.plan.why).toContain("retention minimum of 35% B");
    expect(history.plan.why).toContain("ACN, MeOH, THF, Ethanol, IPA, Acetone, Propanol, or Butanol");
    expect(history.plan.why).not.toContain("40°C");
    expect(history.plan.why).not.toContain("60%");
    expect(history.plan.why.toLowerCase()).not.toContain("intermediate");
    expect(history.plan.prefill).toMatchObject({ temperature: "ambient", solvent: "", percentB: "" });
    const suggested = nextRunFileName("GR41-03-5-ACN-3-ISO-60-1.5-20u-CP-0.1-C18-150x4.6x5-T60-254.csv", {
      ...emptyRunDetails(),
      solvent: "MeOH",
      ph: "3",
      method: "ISO",
      percentB: "44.1",
      flowRate: "1.5",
      injectionVolume: "20",
      sampleType: "CP",
      sampleConcentration: "0.1",
      ligand: "C18",
      lengthMm: "150",
      diameterMm: "4.6",
      particleSize: "5",
      temperature: history.plan.prefill?.temperature ?? "",
      wavelength: "254",
    });
    expect(suggested).toContain("-amb-");
    expect(suggested).not.toContain("T25");

    const matched = solventNomograph(35, "ACN")?.find((row) => row.id === "methanol");
    expect(matched).toBeTruthy();
    const chartPercent = Number(matched!.percentText);
    const solventRun = run({
      percentB: chartPercent,
      temperatureC: 25,
      solvent: "MeOH",
      peakCount: 6,
      minResolutionExcludingFirst: 0.4,
      lastPeakTimeMin: 12,
    });
    const again = planHistory([cold, at40, at60, solventRun], rules);
    expect(again.phase).toBe("selectivity");
    if (again.phase !== "selectivity") return;
    expect(again.plan.step).toBe("temp-40");
    expect(again.plan.prefill).toMatchObject({
      percentB: matched!.percentText,
      temperature: "40",
      solvent: "MeOH",
    });
    const heated = planHistory(
      [
        cold,
        at40,
        at60,
        solventRun,
        run({
          percentB: chartPercent,
          temperatureC: 40,
          solvent: "MeOH",
          peakCount: 6,
          minResolutionExcludingFirst: 0.8,
          lastPeakTimeMin: 8,
        }),
      ],
      rules,
    );
    expect(heated.phase).toBe("selectivity");
    if (heated.phase !== "selectivity") return;
    expect(heated.plan.step).toBe("temp-60");
    expect(heated.plan.prefill).toMatchObject({
      percentB: matched!.percentText,
      temperature: "60",
      solvent: "MeOH",
    });
  });

  it("keeps an ambient Run 1 as ambient instead of 25°C", () => {
    const history = withHeat([run({ peakCount: 4, temperatureC: null, minResolutionExcludingFirst: 0.4 })], {
      ...setup,
      ambientTemperatureC: null,
    });
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.why).toContain("The temperature on Run 1 is ambient.");
    expect(history.plan.why).not.toContain("25°C");
  });

  it("returns to a typed retention temperature when changing solvent", () => {
    const rules: SelectivitySetup = { ...setup, ambientTemperatureC: 30, lastPeakTimeMin: 15 };
    const cold = run({
      percentB: 35,
      temperatureC: 30,
      peakCount: 6,
      minResolutionExcludingFirst: 0.4,
      lastPeakTimeMin: 12,
    });
    const at40 = run({
      percentB: 35,
      temperatureC: 40,
      peakCount: 6,
      minResolutionExcludingFirst: 0.4,
      lastPeakTimeMin: 8,
    });
    const at60 = run({
      percentB: 60,
      temperatureC: 60,
      peakCount: 6,
      minResolutionExcludingFirst: 0.3,
      lastPeakTimeMin: 6,
    });
    const history = planHistory([cold, at40, at60], rules);
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("solvent");
    expect(selectivityChangeLabel(history.plan)).toBe("Change solvent, back at 30°C");
    expect(history.plan.nextChange).toBe("Change solvent, back at 30°C.");
    expect(history.plan.why).toContain("go back to 30°C");
    expect(history.plan.why).toContain("30°C");
    expect(history.plan.prefill).toMatchObject({ temperature: "30", solvent: "", percentB: "" });
    const suggested = nextRunFileName("GR41-03-5-ACN-3-ISO-60-1.5-20u-CP-0.1-C18-150x4.6x5-T60-254.csv", {
      ...emptyRunDetails(),
      solvent: "MeOH",
      percentB: "44.1",
      temperature: history.plan.prefill?.temperature ?? "",
    });
    expect(suggested).toContain("-T30-");
  });

  it("uses Run 1 when the carried run has no temperature number", () => {
    const rules: SelectivitySetup = { ...setup, ambientTemperatureC: 30, lastPeakTimeMin: 15 };
    const history = planHistory(
      [
        run({ percentB: 35, temperatureC: null, peakCount: 6, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 12 }),
        run({ percentB: 35, temperatureC: 40, peakCount: 6, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 8 }),
        run({ percentB: 60, temperatureC: 60, peakCount: 6, minResolutionExcludingFirst: 0.3, lastPeakTimeMin: 6 }),
      ],
      rules,
    );
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("solvent");
    expect(history.plan.prefill).toMatchObject({ temperature: "30" });
    expect(history.plan.nextChange).toBe("Change solvent, back at 30°C.");
  });

  it("starts selectivity at the typed %B after staying in retention", () => {
    const rules = { ...setup, requiredPeaks: 8, lastPeakTimeMin: 10 };
    const late = run({
      percentB: 35,
      peakCount: 8,
      minResolutionExcludingFirst: 1.2,
      lastPeakTimeMin: 14,
    });
    const sample = {
      percentB: late.percentB,
      peakCount: late.peakCount,
      lastPeakTimeMin: late.lastPeakTimeMin,
      firstPeakTimeMin: late.firstPeakTimeMin,
      minResolutionExcludingFirst: late.minResolutionExcludingFirst,
      maxBackPressurePsi: late.maxBackPressurePsi,
    };
    expect(decideRetention([sample], rules).status).toBe("efficiency");
    const stayed = decideRetention([sample], rules, { continueRetention: true });
    expect(stayed.reason).toBe("choose-percent");
    expect(stayed.fit).toBeNull();
    expect(stayed.move).toBeNull();
    const at40 = run({
      percentB: 22,
      temperatureC: 40,
      peakCount: 8,
      minResolutionExcludingFirst: 1.5,
      lastPeakTimeMin: 12,
    });
    const history = planHistory([late, at40], rules);
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.prefill).toMatchObject({ percentB: "22", temperature: "60" });
    expect(history.plan.step).not.toBe("temp-40");
  });

  it("starts selectivity at 40°C after the second minimum, using that run's %B", () => {
    const fixtureDir = path.join(process.cwd(), "fixtures/retention");
    const files = [
      { percentB: 70, name: "GR41-06-70.csv" },
      { percentB: 60, name: "GR41-07-60.csv" },
      { percentB: 50, name: "GR41-08-50.csv" },
      { percentB: 40, name: "GR41-09-40.csv" },
    ];
    const reads = files.map((file) => readLabFile(readFileSync(path.join(fixtureDir, file.name))));
    const asRun = (percentB: number, index: number, temperatureC: number): SelectivityRun => {
      const read = reads[index];
      return {
        percentB,
        temperatureC,
        solvent: "ACN",
        ligand: "C18",
        peakCount: read.peakCount,
        lastPeakTimeMin: read.lastPeakTimeMin,
        firstPeakTimeMin: read.firstPeakTimeMin,
        minResolutionExcludingFirst: read.minResolutionExcludingFirst,
        maxBackPressurePsi: read.maxBackPressurePsi,
      };
    };
    const ladder = files.map((file, index) => asRun(file.percentB, index, 25));
    const toSample = (item: SelectivityRun) => ({
      percentB: item.percentB,
      peakCount: item.peakCount,
      lastPeakTimeMin: item.lastPeakTimeMin,
      firstPeakTimeMin: item.firstPeakTimeMin,
      minResolutionExcludingFirst: item.minResolutionExcludingFirst,
      maxBackPressurePsi: item.maxBackPressurePsi,
    });
    const minimum = decideRetention(ladder.map(toSample), setup);
    expect(minimum.nextPercentB).toBe(42);
    const atMinimum = asRun(42, 3, 25);
    const second = decideRetention([...ladder, atMinimum].map(toSample), setup);
    expect(second.reason).toBe("choose-percent");
    expect(second.fit).toBeNull();
    expect(second.nextPercentB).toBeNull();
    expect(second.pickOwnPercent).toBe(true);
    const at40 = {
      ...asRun(38, 3, 40),
      minResolutionExcludingFirst: (reads[3].minResolutionExcludingFirst ?? 0.5) + 0.5,
    };
    const history = planHistory([...ladder, atMinimum, at40], setup);
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("temp-60");
    expect(history.plan.prefill).toMatchObject({
      percentB: "38",
      temperature: "60",
    });
  });
});

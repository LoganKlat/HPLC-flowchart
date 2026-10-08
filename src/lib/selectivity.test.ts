import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateRun, resolutionForDecision } from "@/lib/evaluate";
import { readLabFile } from "@/lib/lab-file";
import { carryForwardIndex, decideRetention } from "@/lib/retention";
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
    expect(findSolvent("ACN")?.label).toBe("ACN");
    expect(findSolvent("MeOH")?.id).toBe("methanol");
    expect(findSolvent("THF")?.label).toBe("THF");
    expect(findSolvent("acetonitrile")?.label).toBe("ACN");
    expect(solventNomograph(40, "ACN")?.map((row) => row.label)).toEqual(["MeOH", "ACN", "THF"]);
    expect(findSolvent("2-Propanol")).toBeNull();
    expect(findSolvent("ethanol")).toBeNull();
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
    expect(decision.efficiencyChoice?.continueLabel).toBe("Continue selectivity.");
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

  it("asks once about efficiency before the minimum %B when the peak count matches", () => {
    const ambient = readLabFile(readFileSync(path.join(process.cwd(), "fixtures/selectivity/GR41-09-40-ambient.csv")));
    expect(ambient.peakCount).toBe(7);
    expect(ambient.minResolutionExcludingFirst).toBeCloseTo(0.324, 3);
    const sample = {
      percentB: 40,
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
    };
    const decision = decideRetention([sample], rules);
    expect(decision.status).toBe("ask");
    expect(decision.efficiencyNow?.why).toBe(
      [
        "Peaks: 7. The specification is 7. Met.",
        "Minimum resolution: 0.324. Under the specification of 1.000.",
        "Last peak: 11.593 min. The specification is 15 min. Met.",
        "Back-pressure: 1516.2 psi. Under the specification of 4000 psi. Met.",
        "The peaks are there, but the worst pair is still too close. Not every specification is met. The next change is meant to pull them apart. Efficiency and gradient may still bring the resolution up to the specification.",
      ].join("\n\n"),
    );
    expect(decision.efficiencyNow?.question).toBe(
      "The peaks are there, but the worst pair is still too close. Consider whether efficiency and gradient can still bring the resolution up to the specification. Minimum resolution: 0.324. Under the specification of 1.000. The next change is meant to pull them apart. Move on to efficiency and be done with selectivity?",
    );
    expect(decision.efficiencyNow?.why).not.toContain("you set");
    expect(decision.efficiencyNow?.why).not.toContain("benchmark");
    const shown = decideRetention([sample], rules, { declinedEfficiencyNow: true });
    expect(shown.reason).toBe("cannot-calculate");
    expect(shown.nextPercentB).toBeNull();
    expect(shown.nextChange).toContain("cannot be calculated");
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

  it("goes to 60°C when 40°C does not improve the run, not to a new solvent", () => {
    const history = withHeat(
      [
        run({ peakCount: 4, minResolutionExcludingFirst: 0.4 }),
        run({ percentB: 80, temperatureC: 40, peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 6 }),
      ],
      setup,
    );
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("temp-60");
    expect(history.plan.step).not.toBe("solvent");
    expect(history.plan.tempChoice).toBeNull();
    expect(history.plan.nextChange).toContain("60°C");
    expect(history.plan.nextChange).not.toContain("Change the solvent");
    expect(history.plan.prefill).toMatchObject({ percentB: "80", temperature: "60", solvent: "ACN" });
    expect(history.plan.nextChange.toLowerCase()).not.toContain("lowered");
    expect(history.plan.why).toContain("same solvent");
    expect(history.plan.why).not.toContain("60°C is skipped");
    expect(history.plan.showSolventChoices).toBe(false);
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

  it("does not offer 60°C once the latest run already has the peak count", () => {
    const history = planHistory(
      [
        run({ peakCount: 8, minResolutionExcludingFirst: 0.4 }),
        run({ percentB: 80, temperatureC: 40, peakCount: 8, minResolutionExcludingFirst: 0.55, lastPeakTimeMin: 6 }),
        run({ percentB: 70, temperatureC: 40, peakCount: 8, minResolutionExcludingFirst: 0.45, lastPeakTimeMin: 9 }),
      ],
      setup,
      { heat: { carryIndex: 0, seriesLength: 1 } },
    );
    expect(history.phase).toBe("retention");
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
      temperature: "25",
      solvent: "ACN",
      ligand: "",
    });
    expect(history.plan.nextChange).toContain("100% B");
    expect(history.plan.nextChange).toContain("ACN");
    expect(history.plan.nextChange).not.toContain("MeOH");
    expect(history.plan.why).toContain("The previous solvent is not carried forward.");
    expect(history.plan.why).toContain("The temperature box on Run 1 is empty, so 25°C is used as the starting temperature.");
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
    expect(history.plan.step).toBe("temp-60");
    expect(history.plan.step).not.toBe("solvent");
    expect(history.plan.tempChoice).toBeNull();
    expect(history.plan.nextChange).toContain("60°C");
    expect(history.plan.nextChange).not.toContain("Change the solvent");
    expect(history.plan.prefill).toMatchObject({ percentB: "40", temperature: "60" });
    expect(history.plan.why).toContain("7 peaks");
    expect(history.plan.why).toContain("6 peaks");
    expect(history.plan.why).toContain("minimum resolution 0.000");
    expect(history.plan.why).not.toContain("2.312");
    expect(history.plan.why).not.toContain("60°C is skipped");
    expect(history.plan.nextChange.toLowerCase()).not.toContain("lowered");
    expect(history.plan.why.toLowerCase()).not.toContain("decrease");
    expect(history.plan.showSolventChoices).toBe(false);
  });

  it("goes to 60°C when 40°C on the new solvent does not improve", () => {
    const history = withHeat([
      run({ peakCount: 4, minResolutionExcludingFirst: 0.4 }),
      run({ percentB: 80, temperatureC: 40, peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 6 }),
      run({ percentB: 80, temperatureC: 60, peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 5 }),
      run({ percentB: 91, temperatureC: 25, solvent: "MeOH", peakCount: 4, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 10 }),
      run({ percentB: 91, temperatureC: 40, solvent: "MeOH", peakCount: 3, minResolutionExcludingFirst: 1.2, lastPeakTimeMin: 6 }),
    ]);
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("temp-60");
    expect(history.plan.tempChoice).toBeNull();
    expect(history.plan.nextChange).toContain("60°C");
    expect(history.plan.nextChange).not.toContain("Change the ligand");
    expect(history.plan.prefill).toMatchObject({ percentB: "91", temperature: "60", solvent: "MeOH" });
    expect(history.plan.nextChange.toLowerCase()).not.toContain("lowered");
    expect(history.plan.why.toLowerCase()).not.toContain("decrease");
    expect(history.plan.recommendedLigand).toBeNull();
    expect(history.plan.showLigandChoices).toBe(false);
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

  it("uses 25°C when Run 1 has no temperature", () => {
    const history = withHeat([run({ peakCount: 4, temperatureC: null, minResolutionExcludingFirst: 0.4 })], {
      ...setup,
      ambientTemperatureC: null,
    });
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.why).toContain("empty");
    expect(history.plan.why).toContain("25°C");
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateRun, resolutionForDecision } from "@/lib/evaluate";
import { readLabFile } from "@/lib/lab-file";
import { carryForwardIndex } from "@/lib/retention";
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
  it("asks at 0.55 after a decline at 0.4, and jumps straight to 0.7", () => {
    const base = { peakCount: 8, requiredPeaks: 8, minResolution: 1 };
    const at04 = efficiencyAsk({ ...base, foundResolution: 0.4, declinedThrough: null });
    expect(at04?.multiple).toBe(0.4);
    expect(at04?.question).toBe(efficiencyQuestion(0.4, 0.4, 1));

    const at055 = efficiencyAsk({ ...base, foundResolution: 0.55, declinedThrough: 0.4 });
    expect(at055?.multiple).toBe(0.55);
    expect(at055?.question).toContain("at least 0.55 times");

    const still04 = efficiencyAsk({ ...base, foundResolution: 0.45, declinedThrough: 0.4 });
    expect(still04).toBeNull();

    const jump = efficiencyAsk({ ...base, foundResolution: 0.8, declinedThrough: null });
    expect(jump?.multiple).toBe(0.7);
    expect(jump?.question).toContain("at least 0.7 times");
    expect(jump?.question).not.toContain("0.4 times");
    expect(jump?.question).not.toContain("0.55 times");
  });

  it("counts a resolution that lands exactly on a multiple", () => {
    expect(efficiencyAsk({
      peakCount: 6,
      foundResolution: 0.7,
      requiredPeaks: 6,
      minResolution: 1,
      declinedThrough: null,
    })?.multiple).toBe(0.7);
    expect(efficiencyAsk({
      peakCount: 6,
      foundResolution: 1,
      requiredPeaks: 6,
      minResolution: 1,
      declinedThrough: 0.85,
    })?.multiple).toBe(1);
    expect(efficiencyAsk({
      peakCount: 6,
      foundResolution: 2,
      requiredPeaks: 6,
      minResolution: 1,
      declinedThrough: 1,
    })).toBeNull();
  });

  it("asks about the last peak time when this workbook already meets resolution", () => {
    const workbook =
      "/home/ubuntu/.cursor/projects/workspace/uploads/GR09-14-4-ACN-3-ISO-35-1.5-20u-CP-0.1-C18aqP-150x4.6x5-amb-254_ae4e.xlsx";
    const read = readLabFile(readFileSync(workbook));
    const rules = {
      requiredPeaks: 7,
      lastPeakTimeMin: 15,
      minResolution: 1.4,
      maxBackPressurePsi: 2000,
    };
    const rows = evaluateRun(read, rules);
    expect(rows.find((row) => row.id === "peaks")?.status).toBe("met");
    expect(rows.find((row) => row.id === "resolution")?.status).toBe("met");
    expect(rows.find((row) => row.id === "back-pressure")?.status).toBe("met");
    expect(rows.find((row) => row.id === "last-peak")?.status).toBe("not-met");
    expect(read.lastPeakTimeMin).toBeCloseTo(19.854, 3);

    const ask = efficiencyAsk({
      peakCount: read.peakCount,
      foundResolution: read.minResolutionExcludingFirst,
      requiredPeaks: rules.requiredPeaks,
      minResolution: rules.minResolution,
      declinedThrough: null,
      lastPeakTimeMin: read.lastPeakTimeMin,
      specifiedRunTimeMin: rules.lastPeakTimeMin,
      maxBackPressurePsi: read.maxBackPressurePsi,
      maxBackPressureSpec: rules.maxBackPressurePsi,
    });
    expect(ask?.question).toBe(
      "Consider whether efficiency and gradient can still bring the last peak time to the run time you set. The last peak is at 19.854 min, later than the 15 min you set. Move on to efficiency and be done with selectivity?",
    );
    expect(ask?.question).not.toContain("bring the resolution");
    expect(ask?.why).toBe(
      [
        "Moving on to efficiency is a choice.",
        "This run has 7 peaks, and you asked for 7. Peaks are met.",
        "The minimum resolution is 1.453. The spec is 1.400. This ask is the 1 times benchmark, and the measured resolution is at least 1 times that spec, so the benchmark is met. It meets the full spec, which is 1 times 1.400.",
        "The last peak is at 19.854 min. You set 15 min. Longer than that is not met, so last peak time is not met.",
        "The highest back-pressure is 1180.5 psi. You set a max of 2000 psi. That is at or under the max, so back-pressure is met.",
        "Not every rule you set is met.",
        "Efficiency and gradient may still bring the last peak time to the 15 min you set.",
      ].join("\n\n"),
    );

    const stillShort = efficiencyAsk({
      peakCount: read.peakCount,
      foundResolution: 0.9,
      requiredPeaks: rules.requiredPeaks,
      minResolution: rules.minResolution,
      declinedThrough: null,
      lastPeakTimeMin: read.lastPeakTimeMin,
      specifiedRunTimeMin: rules.lastPeakTimeMin,
      maxBackPressurePsi: read.maxBackPressurePsi,
      maxBackPressureSpec: rules.maxBackPressurePsi,
    });
    expect(stillShort?.question).toContain("bring the resolution up to the spec");
    expect(stillShort?.question).not.toContain("last peak time");
    expect(stillShort?.why).toContain("0.55 times benchmark");
    expect(stillShort?.why).toContain("It does not meet the full spec, which is 1 times 1.400.");
    expect(stillShort?.why).toContain(
      "Efficiency and gradient may still bring the resolution up to the 1.400 you set.",
    );
    expect(stillShort?.why).not.toContain("bring the last peak time");

    const blankPressure = efficiencyAsk({
      peakCount: read.peakCount,
      foundResolution: read.minResolutionExcludingFirst,
      requiredPeaks: rules.requiredPeaks,
      minResolution: rules.minResolution,
      declinedThrough: null,
      lastPeakTimeMin: read.lastPeakTimeMin,
      specifiedRunTimeMin: rules.lastPeakTimeMin,
      maxBackPressurePsi: read.maxBackPressurePsi,
      maxBackPressureSpec: null,
    });
    expect(blankPressure?.why).toContain("Max back-pressure is blank, so it is not being checked.");
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
      peakCount: 8,
      foundResolution: 2,
      requiredPeaks: 8,
      minResolution: null,
      declinedThrough: null,
    })).toBeNull();
    const check = assessHappy({ peakCount: 8 }, { requiredPeaks: 8, minResolution: null });
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

  it("does not leave selectivity on its own when resolution is past 0.7 times the spec", () => {
    const history = planHistory(
      [run({ peakCount: 8, minResolutionExcludingFirst: 0.8, lastPeakTimeMin: 10 })],
      setup,
    );
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.status).not.toBe("finished");
    expect(history.plan.step).toBe("temp-40");
    expect(history.plan.nextChange).toContain("40°C");
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
    expect(history.plan.why).toContain("The old solvent is ACN at 80% B.");
    expect(history.plan.why).toContain("MeOH 85.9% B, ACN 80.0% B, and THF 59.7% B");
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
      solvent: "MeOH",
      peakCount: 8,
      minResolutionExcludingFirst: 0.4,
      lastPeakTimeMin: 10,
    });
    const again = run({
      percentB: 91,
      temperatureC: 40,
      solvent: "MeOH",
      peakCount: 8,
      minResolutionExcludingFirst: 0.4,
      lastPeakTimeMin: 6,
    });
    const againAdjusted = run({
      percentB: 86,
      temperatureC: 40,
      solvent: "MeOH",
      peakCount: 8,
      minResolutionExcludingFirst: 0.4,
      lastPeakTimeMin: 8,
    });
    const history = planHistory([cold, heated, adjusted, solventRun, again, againAdjusted], setup);
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
    expect(history.plan.why).toContain("Already used: C18");
    expect(history.plan.why).not.toMatch(/C18aq|PFPP|C8|biphenyl|IBD/);
    expect(history.plan.nextChange).not.toMatch(/C18aq|PFPP|C8|biphenyl|IBD|C18/);
  });

  it("says every coating was already used and does not invent another", () => {
    const ligands = ["C18", "C18aq", "PFPP", "C8", "biphenyl", "IBD"];
    const runs = ligands.flatMap((ligand) => [
      run({ ligand, peakCount: 8, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 10, percentB: 80 }),
      run({ ligand, temperatureC: 40, peakCount: 8, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 6, percentB: 80 }),
      run({ ligand, temperatureC: 40, peakCount: 8, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 8, percentB: 75 }),
      run({ ligand, solvent: "MeOH", temperatureC: 25, peakCount: 8, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 10, percentB: 90 }),
      run({ ligand, solvent: "MeOH", temperatureC: 40, peakCount: 8, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 6, percentB: 90 }),
      run({ ligand, solvent: "MeOH", temperatureC: 40, peakCount: 8, minResolutionExcludingFirst: 0.4, lastPeakTimeMin: 8, percentB: 85 }),
    ]);
    const history = planHistory(runs, setup);
    expect(history.phase).toBe("selectivity");
    if (history.phase !== "selectivity") return;
    expect(history.plan.step).toBe("blocked");
    expect(history.plan.nextChange).toBe("Every column coating in the list has already been tried.");
    expect(history.plan.why).toContain("Every coating in the list has already been used");
    expect(history.plan.recommendedLigand).toBeNull();
    expect(history.plan.prefill).toBeNull();
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
    expect(history.plan.why).toContain("The old solvent is ACN at 40% B.");
    expect(history.plan.why).toContain("MeOH 51.2% B, ACN 40.0% B, and THF 30.7% B");
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

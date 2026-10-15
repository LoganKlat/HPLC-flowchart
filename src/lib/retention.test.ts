import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { retentionChangeLabel } from "@/lib/change-label";
import { evaluateRun } from "@/lib/evaluate";
import { readLabFile, type LabFileRead } from "@/lib/lab-file";
import {
  backwardsWhy,
  carryForwardIndex,
  decideRetention,
  findBackwardsRetention,
  seriesWhileHeld,
  inBetweenPercentError,
  formatRSquared,
  lineEquation,
  minimumPercentHeading,
  minimumPercentNote,
  refitMinimumPercent,
  roundMinimumPercent,
  roundTargetPercent,
  type RetentionRules,
  type RetentionSample,
} from "@/lib/retention";
import { planHistory, type SelectivityRun } from "@/lib/selectivity";

const fixtureDir = path.join(process.cwd(), "fixtures/retention");
const files = [
  { percentB: 70, name: "GR41-06-70.csv" },
  { percentB: 60, name: "GR41-07-60.csv" },
  { percentB: 50, name: "GR41-08-50.csv" },
  { percentB: 40, name: "GR41-09-40.csv" },
] as const;

/**
 * Peak counts in these files are 6, 6, 6, and 7.
 * Max pressures are about 1040, 1226, 1390, and 1516 psi.
 * Last peaks are 1.952, 2.779, 4.918, and 11.593 min.
 * Half of 10 min is 5 min, so 70, 60, and 50 are under that line and 40 is over it.
 */
const pathRules: RetentionRules = {
  requiredPeaks: 8,
  lastPeakTimeMin: 10,
  maxBackPressurePsi: 2000,
};

const reads = files.map((file) => readLabFile(readFileSync(path.join(fixtureDir, file.name))));

describe("retention fixtures can use one last-peak time", () => {
  it("keeps 70, 60, and 50 under half of 10 min, and 40 over it", () => {
    const times = reads.map((read) => read.lastPeakTimeMin);
    const counts = reads.map((read) => read.peakCount);
    const pressures = reads.map((read) => read.maxBackPressurePsi);
    expect(times.map((time) => time?.toFixed(3))).toEqual(["1.952", "2.779", "4.918", "11.593"]);
    expect(counts).toEqual([6, 6, 6, 7]);
    for (const time of times) {
      expect(time).not.toBeNull();
    }
    expect(times[0]!).toBeLessThan(5);
    expect(times[1]!).toBeLessThan(5);
    expect(times[2]!).toBeLessThan(5);
    expect(times[3]!).toBeGreaterThan(5);
    for (const count of counts) expect(count!).toBeLessThan(8);
    for (const pressure of pressures) {
      expect(pressure!).toBeLessThan(2000);
      expect(pressure!).toBeGreaterThan(1000);
    }
    expect(reads[0].firstPeakTimeMin).toBeCloseTo(1.101, 5);
    expect(reads[1].firstPeakTimeMin).toBeCloseTo(1.088, 5);
    expect(reads[2].firstPeakTimeMin).toBeCloseTo(1.084, 5);
    expect(reads[3].firstPeakTimeMin).toBeCloseTo(1.095, 5);
  });
});

describe("retention %B along the four lab files", () => {
  const samples = files.map((file, index) => sampleFromRead(file.percentB, reads[index]));

  it("recommends 60, then 50, then 40, then a calculated %B", () => {
    const expected = [60, 50, 40, 42];
    for (let i = 0; i < samples.length; i++) {
      const decision = decideRetention(samples.slice(0, i + 1), pathRules);
      expect(decision.status).toBe("recommend");
      expect(decision.move).toBe(i < 3 ? "drop-10" : "calculated");
      expect(decision.nextPercentB).toBe(expected[i]);
      expect(decision.nextChange).toContain(`${expected[i]}%`);
    }
  });

  it("does not take another 10 points off 40%", () => {
    const decision = decideRetention(samples, pathRules);
    expect(decision.move).toBe("calculated");
    expect(decision.nextPercentB).not.toBe(30);
    expect(decision.why).not.toContain("minus 10");
  });

  it("leaves the 70% run out of the line once four chromatograms are in", () => {
    const decision = decideRetention(samples, pathRules);
    expect(decision.fit).not.toBeNull();
    expect(decision.fit!.rows.map((row) => row.percentB)).toEqual([60, 50, 40]);
    expect(decision.fit!.rows.map((row) => row.runNumber)).toEqual([2, 3, 4]);
    expect(decision.fit!.excluded.map((row) => row.percentB)).toEqual([70]);
    expect(decision.why.toLowerCase()).toContain("left out once");
    expect(decision.why.toLowerCase()).toContain("overlapping");
    expect(decision.why).toContain("still under the specification of 8");
    expect(decision.why).not.toContain("you asked for");
    expect(decision.why).not.toContain("you set");
    expect(decision.why).not.toContain("half");

    const k60 = (2.779 - 1.088) / 1.088;
    const k50 = (4.918 - 1.084) / 1.084;
    const k40 = (11.593 - 1.095) / 1.095;
    expect(decision.fit!.rows[0].k).toBeCloseTo(k60, 10);
    expect(decision.fit!.rows[1].k).toBeCloseTo(k50, 10);
    expect(decision.fit!.rows[2].k).toBeCloseTo(k40, 10);
    expect(decision.fit!.rows[0].logK).toBeCloseTo(Math.log10(k60), 10);
    expect(decision.fit!.m).toBeCloseTo(-0.03950888685102025, 8);
    expect(decision.fit!.c).toBeCloseTo(2.5493876718280926, 8);
    expect(decision.fit!.rawPercentB).toBeCloseTo(41.420785, 3);
    expect(decision.why).toContain(
      "The last peak is at 11.593 min, close to the specified run time of 10 min. Another 10% drop would make retention much longer, because retention grows quickly as %B goes down. The next %B is calculated instead.",
    );
    expect(decision.why).not.toContain("66%");
    expect(decision.why).not.toContain("0.66");
    expect(decision.why).not.toContain("80%");
    expect(decision.why).not.toContain("middle t0");

    const fit = decision.fit!;
    expect(fit.catalog.map((run) => run.included)).toEqual([false, true, true, true]);
    expect(fit.catalog[0]?.logK).not.toBeNull();
    expect(fit.specifiedTimeMin).toBe(10);
    const starting = fit.catalog.filter((run) => run.included).map((run) => run.runNumber);
    const again = refitMinimumPercent(fit.catalog, starting, fit.specifiedTimeMin, fit.usedPercentB);
    expect(again).not.toBeNull();
    expect(again!.nextPercentB).toBe(42);
    expect(again!.m).toBeCloseTo(fit.m, 10);
    expect(again!.c).toBeCloseTo(fit.c, 10);
    expect(lineEquation(again!.m, again!.c)).toBe("logK = −0.039509 × %B + 2.549388");
    expect(again!.rSquared).toBeCloseTo(0.996929, 6);
    expect(formatRSquared(again!.rSquared)).toBe("R² = 0.997");
    expect(again!.rawPercentB).toBeCloseTo(fit.rawPercentB, 8);
    expect(again!.t0Average).toBeCloseTo(1.089, 3);
    const note = minimumPercentNote(again!, fit.specifiedTimeMin, decision.fit!.qtestSentence).join("\n");
    expect(minimumPercentHeading(again!.nextPercentB)).toBe("Why 42% B is recommended");
    expect(note).toContain("k = (tR − t0) / t0, then logK = log10(k).");
    expect(note).toContain("logK = −0.039509 × %B + 2.549388");
    expect(note).toContain("The average t0 of the runs on the line is 1.089 min");
    expect(note).toContain("41.421");
    expect(note).not.toContain("middle t0");
    expect(note).not.toContain("half");
    expect(note).not.toContain("you set");
    expect(note.toLowerCase()).not.toContain("resolution");
    expect(decision.brief).toEqual([
      "Peaks: 7. The specification is 8.",
      `Back-pressure: ${reads[3].maxBackPressurePsi!.toFixed(1)} psi. The specification is 2000 psi.`,
      "Last peak: 11.593 min. The set time is 10 min.",
    ]);
    expect(refitMinimumPercent(fit.catalog, [2], fit.specifiedTimeMin, fit.usedPercentB)).toBeNull();
    const withLeftOut = refitMinimumPercent(fit.catalog, [1, 2, 3, 4], fit.specifiedTimeMin, fit.usedPercentB);
    expect(withLeftOut).not.toBeNull();
    expect(lineEquation(withLeftOut!.m, withLeftOut!.c)).not.toBe(lineEquation(again!.m, again!.c));
    expect(formatRSquared(withLeftOut!.rSquared)).toMatch(/^R² = \d\.\d{3}$/);
    expect(decideRetention(samples, pathRules).nextPercentB).toBe(42);
  });

  it("does not recommend minimum %B while two runs are still under half the set time", () => {
    const early = decideRetention(samples.slice(0, 2), pathRules);
    expect(early.move).toBe("drop-10");
    expect(early.nextPercentB).toBe(50);
    expect(early.fit).toBeNull();
    expect(early.bChoices ?? null).toBeNull();
    expect(early.nextChange).not.toContain("logK");
    expect(early.nextChange).toContain("50%");
    expect(early.nextChange).toContain("pump");
    expect(early.following).toContain("40°C");
    expect(early.following).toContain("coating");

    const past = decideRetention(
      [
        sample({
          percentB: 70,
          peakCount: 3,
          lastPeakTimeMin: 3.2,
          firstPeakTimeMin: 1,
          maxBackPressurePsi: 200,
        }),
        sample({
          percentB: 50,
          peakCount: 4,
          lastPeakTimeMin: 6.4,
          firstPeakTimeMin: 1.1,
          maxBackPressurePsi: 400,
        }),
      ],
      pathRules,
    );
    expect(past.move).toBe("calculated");
    expect(past.nextPercentB).not.toBeNull();
    expect(past.fit).not.toBeNull();
  });

  it("runs the calculated %B when a 10-point step would land below it", () => {
    const decision = decideRetention(
      [
        sample({
          percentB: 60,
          peakCount: 4,
          lastPeakTimeMin: 3,
          firstPeakTimeMin: 1,
          maxBackPressurePsi: 200,
        }),
        sample({
          percentB: 50,
          peakCount: 4,
          lastPeakTimeMin: 6,
          firstPeakTimeMin: 1,
          maxBackPressurePsi: 300,
        }),
      ],
      pathRules,
    );
    expect(decision.move).toBe("calculated");
    expect(decision.nextPercentB).not.toBe(40);
    expect(decision.nextPercentB).not.toBeNull();
    expect(decision.nextPercentB!).toBeGreaterThan(40);
    expect(decision.nextPercentB!).toBeLessThan(50);
    expect(decision.fit).not.toBeNull();
  });

  it("uses the %B saved on the run, not the percent in the file name", () => {
    const decision = decideRetention([sampleFromRead(63, reads[0])], pathRules);
    expect(decision.move).toBe("drop-10");
    expect(decision.nextPercentB).toBe(53);
  });

  it("recommends a second minimum after a run at the calculated %B even when peaks are still short", () => {
    const calculated = decideRetention(samples, pathRules);
    expect(calculated.nextPercentB).toBe(42);
    const followed = decideRetention(
      [
        ...samples,
        sample({
          percentB: 42,
          peakCount: 6,
          lastPeakTimeMin: 8.5,
          firstPeakTimeMin: 1.09,
          minResolutionExcludingFirst: 1,
          maxBackPressurePsi: 1400,
        }),
      ],
      pathRules,
    );
    expect(followed.status).toBe("recommend");
    expect(followed.reason).toBe("choose-percent");
    expect(followed.move).toBeNull();
    expect(followed.pickOwnPercent).toBe(true);
    expect(followed.choosePercent ?? false).toBe(false);
    expect(followed.nextPercentB).toBeNull();
    expect(followed.nextTemperature).toBe("40");
    expect(followed.fit).toBeNull();
    expect(followed.nextChange).toContain("40°C");
    expect(followed.why).toContain("does not calculate another minimum");
    expect(followed.why).toContain("does not refit the last-peak line");
    expect(retentionChangeLabel(followed)).toBe("Select a %B");
  });

  it("pauses for efficiency when the calculated minimum %B run itself meets the peak count", () => {
    const calculated = decideRetention(samples, pathRules);
    expect(calculated.move).toBe("calculated");
    expect(calculated.nextPercentB).toBe(42);
    const followed = decideRetention(
      [
        ...samples,
        sample({
          percentB: calculated.nextPercentB!,
          peakCount: pathRules.requiredPeaks!,
          lastPeakTimeMin: 12,
          firstPeakTimeMin: 1.09,
          minResolutionExcludingFirst: 0.85,
          maxBackPressurePsi: 1400,
        }),
      ],
      { ...pathRules, minResolution: 1 },
    );
    expect(followed.status).toBe("efficiency");
    expect(followed.reason).toBe("efficiency");
    expect(followed.nextPercentB).toBeNull();
    expect(followed.pickOwnPercent ?? false).toBe(false);
    expect(followed.nextTemperature ?? null).toBeNull();
    expect(followed.nextChange).toContain("Move on to efficiency");
    expect(followed.efficiencyChoice?.recommendedSentence).toContain("peak count equals the specification");
    expect(followed.efficiencyChoice?.continueLabel).toBe("Move on to selectivity");
    expect(followed.why).toContain(`Peaks: ${pathRules.requiredPeaks}. The specification is ${pathRules.requiredPeaks}. Met.`);
    expect(followed.why).toContain("Efficiency is next for the resolution.");
    expect(retentionChangeLabel(followed)).toBe("Move on to efficiency");
    expect(followed.why).not.toContain("does not calculate another minimum");
    expect(followed.nextChange).not.toContain("40°C");

    // When resolution < 0.5 * spec (e.g. 0.4 vs spec 1.0), continues normal pathway (selectivity at 40°C)
    const underHalf = decideRetention(
      [
        ...samples,
        sample({
          percentB: calculated.nextPercentB!,
          peakCount: pathRules.requiredPeaks!,
          lastPeakTimeMin: 12,
          firstPeakTimeMin: 1.09,
          minResolutionExcludingFirst: 0.4,
          maxBackPressurePsi: 1400,
        }),
      ],
      { ...pathRules, minResolution: 1 },
    );
    expect(underHalf.status).toBe("recommend");
    expect(underHalf.nextTemperature).toBe("40");
  });

  it("recommends a second minimum %B after the recommended minimum file, not during the 10% ladder", () => {
    const ladder = decideRetention(samples.slice(0, 2), pathRules);
    expect(ladder.reason).toBe("drop-10");
    expect(ladder.nextPercentB).toBe(50);
    expect(ladder.reason).not.toBe("second-minimum");

    const minimum = decideRetention(samples, pathRules);
    expect(minimum.move).toBe("calculated");
    expect(minimum.reason).toBe("calculated");
    expect(minimum.nextPercentB).toBe(42);

    const followed = decideRetention([...samples, sampleFromRead(42, reads[3])], pathRules);
    expect(followed.status).toBe("recommend");
    expect(followed.reason).toBe("choose-percent");
    expect(followed.move).toBeNull();
    expect(followed.fit).toBeNull();
    expect(followed.pickOwnPercent).toBe(true);
    expect(followed.nextTemperature).toBe("40");
    expect(followed.nextPercentB).toBeNull();
    expect(retentionChangeLabel(followed)).toBe("Select a %B");
    expect(retentionChangeLabel(followed, 30)).toBe("Run at 40°C at 30% B");
    expect(followed.nextChange).toContain("40°C");
    expect(followed.why).toContain("does not calculate another minimum");
    expect(followed.why).not.toContain("optimal %B");
    expect(followed.why.toLowerCase()).not.toContain("intermediate");
    expect(followed.why).not.toContain("coating");

    const stillEarly = decideRetention(
      [...samples, { ...sampleFromRead(42, reads[3]), lastPeakTimeMin: 5 }],
      pathRules,
    );
    expect(stillEarly.reason).toBe("choose-percent");
    expect(stillEarly.nextTemperature).toBe("40");
    expect(stillEarly.fit).toBeNull();
    expect(retentionChangeLabel(stillEarly)).toBe("Select a %B");

    const underHalf = decideRetention(
      [...samples, { ...sampleFromRead(42, reads[3]), lastPeakTimeMin: 4 }],
      pathRules,
    );
    expect(underHalf.reason).toBe("choose-percent");
    expect(underHalf.fit).toBeNull();
    expect(underHalf.move).toBeNull();
  });

  it("does not start the second minimum when a later file is not the recommended %B", () => {
    const minimum = decideRetention(samples, pathRules);
    expect(minimum.move).toBe("calculated");
    expect(minimum.reason).toBe("calculated");
    expect(minimum.nextPercentB).toBe(42);

    const late = sampleFromRead(40, reads[3]);
    expect(late.lastPeakTimeMin!).toBeGreaterThan(pathRules.lastPeakTimeMin!);
    expect(late.percentB).not.toBe(minimum.nextPercentB);

    const followed = decideRetention([...samples, late], pathRules);
    expect(followed.reason).not.toBe("second-minimum");
    expect(followed.nextTemperature ?? null).toBeNull();
    expect(followed.why).not.toContain("optimal %B");
    expect(followed.why).not.toContain("40°C");
  });

  it("fits one last-peak line when the recommended minimum file is uploaded", () => {
    const namedRuns = samples.map((sample) => ({
      ...sample,
      peaks: sample.peaks?.map((peak, index) => ({ ...peak, name: `compound-${index}` })),
    }));
    const followed = decideRetention(
      [...namedRuns, { ...namedRuns[3], percentB: 42 }],
      pathRules,
    );
    expect(followed.reason).toBe("choose-percent");
    expect(followed.fit).toBeNull();
    expect(followed.why).toContain("does not refit the last-peak line");
    expect(followed.why).not.toContain("Named compounds stay on their own line");
    expect(followed.why).not.toContain("optimal %B");
  });
});

describe("retention stops and keeps going", () => {
  it("does not lower %B when pressure is not under the limit", () => {
    const measured = reads[0].maxBackPressurePsi!;
    const atLimit = decideRetention([sampleFromRead(70, reads[0])], {
      ...pathRules,
      maxBackPressurePsi: measured,
    });
    expect(atLimit.reason).toBe("pressure");
    expect(atLimit.nextPercentB).toBeNull();
    expect(atLimit.nextChange.toLowerCase()).toContain("do not lower %b");
    expect(atLimit.why.toLowerCase()).toContain("too high");

    const over = decideRetention([sampleFromRead(70, reads[0])], {
      ...pathRules,
      maxBackPressurePsi: 1000,
    });
    expect(over.reason).toBe("pressure");
    expect(over.nextPercentB).toBeNull();
  });

  it("stops changing chemistry when the peak count already matches and the typed rules are met", () => {
    expect(reads[0].peakCount).toBe(6);
    const decision = decideRetention([sampleFromRead(70, reads[0])], {
      requiredPeaks: 6,
      lastPeakTimeMin: 10,
      maxBackPressurePsi: 2000,
    });
    expect(decision.status).toBe("specs-met");
    expect(decision.nextPercentB).toBeNull();
    expect(decision.nextChange).toBe("The specifications are met.");
    expect(decision.move).not.toBe("drop-10");
  });

  it("moves on to efficiency when the peak count matches and resolution is still under", () => {
    expect(reads[1].minResolutionExcludingFirst!).toBeCloseTo(0.625, 3);
    expect(reads[2].minResolutionExcludingFirst!).toBeGreaterThan(reads[1].minResolutionExcludingFirst!);
    const decision = decideRetention(
      [sampleFromRead(60, reads[1]), sampleFromRead(50, reads[2])],
      { requiredPeaks: 6, lastPeakTimeMin: 10, minResolution: 1.5, maxBackPressurePsi: 2000 },
    );
    expect(decision.status).toBe("efficiency");
    expect(decision.reason).toBe("efficiency");
    expect(decision.nextChange).toContain("Move on to efficiency");
    expect(decision.efficiencyNow ?? null).toBeNull();
    expect(decision.move).not.toBe("drop-10");
    expect(decision.nextPercentB).toBeNull();
    expect(decision.why).toContain("Efficiency is next for the resolution.");
    expect(retentionChangeLabel(decision)).toBe("Move on to efficiency");
    const rules = {
      requiredPeaks: 6,
      lastPeakTimeMin: 10,
      minResolution: 1.5,
      maxBackPressurePsi: 2000,
      ambientTemperatureC: 25,
      originalSolvent: "ACN",
      originalLigand: "C18",
    };
    const history = planHistory(
      [selectivityRun(60, reads[1]), selectivityRun(50, reads[2])],
      rules,
    );
    expect(history.phase).toBe("retention");
    const continued = planHistory(
      [selectivityRun(60, reads[1]), selectivityRun(50, reads[2])],
      rules,
      { continuePastEfficiency: true },
    );
    expect(continued.phase).toBe("selectivity");
    if (continued.phase !== "selectivity") return;
    expect(continued.plan.step).toBe("temp-40");
  });

  it("does not keep going just because resolution rose after the peak count matches", () => {
    expect(reads[1].minResolutionExcludingFirst!).toBeLessThan(reads[0].minResolutionExcludingFirst!);
    const decision = decideRetention(
      [sampleFromRead(70, reads[0]), sampleFromRead(60, reads[1])],
      { requiredPeaks: 6, lastPeakTimeMin: 10, maxBackPressurePsi: 2000 },
    );
    expect(decision.status).toBe("specs-met");
    expect(decision.reason).toBe("specs-met");
    expect(decision.nextPercentB).toBeNull();
    expect(decision.nextChange).toBe("The specifications are met.");
  });

  it("keeps going when the peak count is still short even if resolution fell", () => {
    expect(reads[1].minResolutionExcludingFirst!).toBeLessThan(reads[0].minResolutionExcludingFirst!);
    const decision = decideRetention(
      [sampleFromRead(70, reads[0]), sampleFromRead(60, reads[1])],
      pathRules,
    );
    expect(decision.status).toBe("recommend");
    expect(decision.nextPercentB).toBe(50);
  });

  it("stops when the peak count is met and the last peak is no longer under the time", () => {
    const decision = decideRetention([sampleFromRead(70, reads[0])], {
      requiredPeaks: 6,
      lastPeakTimeMin: 1.5,
      maxBackPressurePsi: 2000,
    });
    expect(reads[0].lastPeakTimeMin!).toBeGreaterThan(1.5);
    expect(reads[0].minResolutionExcludingFirst!).toBeGreaterThan(0);
    expect(decision.status).toBe("efficiency");
    expect(decision.reason).toBe("efficiency");
    expect(decision.nextPercentB).toBeNull();
    expect(decision.nextChange).toContain("Move on to efficiency");
    expect(decision.efficiencyChoice?.continueLabel).toBe("Move on to selectivity");
    expect(decision.nextChange).not.toContain("40°C");
  });

  it("counts a real resolution after an NA run as an increase", () => {
    const rules: RetentionRules = {
      requiredPeaks: 6,
      lastPeakTimeMin: 10,
      maxBackPressurePsi: 500,
    };
    const continued = decideRetention(
      [
        sample({
          percentB: 70,
          peakCount: 3,
          lastPeakTimeMin: 2,
          minResolutionExcludingFirst: 0.2,
        }),
        sample({
          percentB: 60,
          peakCount: 6,
          lastPeakTimeMin: 3,
          minResolutionExcludingFirst: 1.1,
        }),
      ],
      rules,
    );
    expect(continued.status).toBe("specs-met");
    expect(continued.nextPercentB).toBeNull();

    const stopped = decideRetention(
      [
        sample({
          percentB: 70,
          peakCount: 3,
          lastPeakTimeMin: 2,
          minResolutionExcludingFirst: 0.2,
        }),
        sample({
          percentB: 60,
          peakCount: 6,
          lastPeakTimeMin: 3,
          minResolutionExcludingFirst: null,
        }),
      ],
      rules,
    );
    expect(stopped.status).toBe("specs-met");
    expect(stopped.nextPercentB).toBeNull();
  });
});

describe("retention rule edges", () => {
  it("does not recommend a %B when a rule is blank", () => {
    const decision = decideRetention([sampleFromRead(70, reads[0])], {
      requiredPeaks: null,
      lastPeakTimeMin: null,
      maxBackPressurePsi: 2000,
    });
    expect(decision.reason).toBe("missing-rules");
    expect(decision.nextPercentB).toBeNull();
    expect(decision.why).toContain("Number of peaks to separate is blank.");
    expect(decision.why).toContain("Last peak time is blank.");
    expect(decision.why).not.toContain("Max back-pressure is blank.");
  });

  it("keeps the 10 point drop when the last peak is exactly half the time", () => {
    const spec = 10;
    const decision = decideRetention(
      [
        sample({
          percentB: 70,
          peakCount: 2,
          lastPeakTimeMin: spec / 2,
          maxBackPressurePsi: 100,
        }),
      ],
      { requiredPeaks: 8, lastPeakTimeMin: spec, maxBackPressurePsi: 500 },
    );
    expect(decision.move).toBe("drop-10");
    expect(decision.nextPercentB).toBe(60);
    expect(decision.fit).toBeNull();
    expect(decision.bChoices ?? null).toBeNull();
    expect(decision.why).toContain("Decrease %B by 10%");
    expect(decision.why).not.toContain("66%");
    expect(decision.why).not.toContain("50%");
    expect(decision.why).not.toContain("half");
    expect(decision.why).not.toContain("you set");
    expect(decision.why).not.toContain("80%");
    expect(decision.nextChange).toContain("Run the next one at 60% B");
    expect(decision.nextChange).not.toContain("5 percentage points");
  });

  it("does not lower %B when the last peak is past the time and the peak count is short", () => {
    const decision = decideRetention(
      [sample({ percentB: 70, peakCount: 2, lastPeakTimeMin: 12, firstPeakTimeMin: 1, maxBackPressurePsi: 100 })],
      { requiredPeaks: 8, lastPeakTimeMin: 10, maxBackPressurePsi: 500 },
    );
    expect(decision.nextPercentB).toBe(70);
    expect(decision.nextTemperature).toBe("40");
    expect(decision.nextChange).toContain("40°C");
    expect(decision.nextChange.toLowerCase()).toContain("do not lower %b");
    expect(decision.nextChange).toContain("overlapping peaks separate");
    expect(decision.nextChange).toContain("shortens retention");
    expect(decision.following).toContain("coating last");
  });

  it("drops 10 points at or under half the time and drops 5 once a single run is past that line", () => {
    const rules: RetentionRules = {
      requiredPeaks: 8,
      lastPeakTimeMin: 10,
      maxBackPressurePsi: 500,
    };
    const under = decideRetention(
      [sample({ percentB: 70, peakCount: 2, lastPeakTimeMin: 4.5, maxBackPressurePsi: 100 })],
      rules,
    );
    expect(under.move).toBe("drop-10");
    expect(under.nextPercentB).toBe(60);
    expect(under.why).toContain(
      "The last peak is at 4.500 min, still significantly under the specified run time of 10 min. Decrease %B by 10% to increase retention and peak separation.",
    );
    expect(under.why).not.toContain("minus 10");
    expect(under.why).not.toContain("66%");
    expect(under.why).not.toContain("0.66");
    expect(under.why).not.toContain("half");
    expect(under.why).not.toContain("you set");
    expect(under.nextChange).toContain("Run the next one at 60% B");
    expect(under.nextChange).not.toContain("minus");

    const over = decideRetention(
      [sample({ percentB: 70, peakCount: 2, lastPeakTimeMin: 6, maxBackPressurePsi: 100 })],
      rules,
    );
    expect(over.move).toBe("drop-5");
    expect(over.nextPercentB).toBe(65);
    expect(over.why).not.toContain("minus 10");
    expect(over.why).not.toContain("50%");
    expect(over.why).not.toContain("half");
  });

  it("leaves out the first run and the highest %B when they are different files", () => {
    const decision = decideRetention(
      [
        sample({ percentB: 40, peakCount: 3, lastPeakTimeMin: 2, firstPeakTimeMin: 1 }),
        sample({ percentB: 50, peakCount: 3, lastPeakTimeMin: 3, firstPeakTimeMin: 1 }),
        sample({ percentB: 60, peakCount: 3, lastPeakTimeMin: 4, firstPeakTimeMin: 1 }),
        sample({ percentB: 55, peakCount: 3, lastPeakTimeMin: 6, firstPeakTimeMin: 1 }),
      ],
      { requiredPeaks: 10, lastPeakTimeMin: 10, maxBackPressurePsi: 500 },
    );
    expect(decision.move).toBe("calculated");
    expect(decision.fit!.excluded.map((row) => row.runNumber)).toEqual([1, 3]);
    expect(decision.fit!.rows.map((row) => row.runNumber)).toEqual([2, 4]);
    expect(decision.why).toContain("Run 1 at 40% B is the first run");
    expect(decision.why).toContain("Run 3 at 60% B has the highest %B");
    expect(decision.why.toLowerCase()).toContain("overlapping");
  });

  it("keeps the first run in the fit when it meets the peak count and resolution", () => {
    const rules: RetentionRules = {
      requiredPeaks: 6,
      minResolution: 1.2,
      lastPeakTimeMin: 10,
      maxBackPressurePsi: 500,
    };
    const decision = decideRetention(
      [
        sample({
          percentB: 70,
          peakCount: 6,
          minResolutionExcludingFirst: 1.5,
          lastPeakTimeMin: 2.2,
          firstPeakTimeMin: 1,
        }),
        sample({
          percentB: 60,
          peakCount: 6,
          minResolutionExcludingFirst: 1.4,
          lastPeakTimeMin: 3.5,
          firstPeakTimeMin: 1,
        }),
        sample({
          percentB: 50,
          peakCount: 6,
          minResolutionExcludingFirst: 1.6,
          lastPeakTimeMin: 5,
          firstPeakTimeMin: 1,
        }),
        sample({
          percentB: 40,
          peakCount: 5,
          minResolutionExcludingFirst: 1.8,
          lastPeakTimeMin: 9,
          firstPeakTimeMin: 1,
        }),
      ],
      rules,
    );
    expect(decision.move).toBe("calculated");
    expect(decision.fit!.excluded).toEqual([]);
    expect(decision.fit!.rows.map((row) => row.percentB)).toEqual([70, 60, 50, 40]);
    expect(decision.why).toContain("checked once");
    expect(decision.why.toLowerCase()).toContain("kept");
    expect(decision.why).toContain("enough peaks");
    expect(decision.why).toContain("1.500");
    expect(decision.why).toContain("1.200");
  });

  it("leaves the first run out when the peak count is still short", () => {
    const rules: RetentionRules = {
      requiredPeaks: 6,
      minResolution: 1.2,
      lastPeakTimeMin: 10,
      maxBackPressurePsi: 500,
    };
    const decision = decideRetention(
      [
        sample({
          percentB: 70,
          peakCount: 4,
          minResolutionExcludingFirst: 0.8,
          lastPeakTimeMin: 2.2,
          firstPeakTimeMin: 1,
        }),
        sample({
          percentB: 60,
          peakCount: 6,
          minResolutionExcludingFirst: 1.4,
          lastPeakTimeMin: 3.5,
          firstPeakTimeMin: 1,
        }),
        sample({
          percentB: 50,
          peakCount: 6,
          minResolutionExcludingFirst: 1.6,
          lastPeakTimeMin: 5,
          firstPeakTimeMin: 1,
        }),
        sample({
          percentB: 40,
          peakCount: 5,
          minResolutionExcludingFirst: 1.8,
          lastPeakTimeMin: 9,
          firstPeakTimeMin: 1,
        }),
      ],
      rules,
    );
    expect(decision.move).toBe("calculated");
    expect(decision.fit!.excluded.map((row) => row.runNumber)).toEqual([1]);
    expect(decision.fit!.rows.map((row) => row.percentB)).toEqual([60, 50, 40]);
    expect(decision.why.toLowerCase()).toContain("left out");
    expect(decision.why.toLowerCase()).toContain("overlapping");
    expect(decision.why).toContain("left out once");
  });

  it("keeps a separated first run and leaves out a different highest %B run that is still overlapping", () => {
    const rules: RetentionRules = {
      requiredPeaks: 6,
      minResolution: 1.2,
      lastPeakTimeMin: 10,
      maxBackPressurePsi: 500,
    };
    const decision = decideRetention(
      [
        sample({
          percentB: 40,
          peakCount: 6,
          minResolutionExcludingFirst: 1.5,
          lastPeakTimeMin: 8,
          firstPeakTimeMin: 1,
        }),
        sample({
          percentB: 50,
          peakCount: 6,
          minResolutionExcludingFirst: 1.4,
          lastPeakTimeMin: 6,
          firstPeakTimeMin: 1,
        }),
        sample({
          percentB: 70,
          peakCount: 3,
          minResolutionExcludingFirst: 0.4,
          lastPeakTimeMin: 3,
          firstPeakTimeMin: 1,
        }),
        sample({
          percentB: 55,
          peakCount: 5,
          minResolutionExcludingFirst: 1.6,
          lastPeakTimeMin: 7,
          firstPeakTimeMin: 1,
        }),
      ],
      rules,
    );
    expect(decision.move).toBe("calculated");
    expect(decision.fit!.excluded.map((row) => row.runNumber)).toEqual([3]);
    expect(decision.fit!.rows.map((row) => row.runNumber)).toEqual([1, 2, 4]);
    expect(decision.why).toContain("Run 1 at 40% B is the first run");
    expect(decision.why.toLowerCase()).toContain("kept");
    expect(decision.why).toContain("Run 3 at 70% B has the highest %B");
    expect(decision.why.toLowerCase()).toContain("overlapping");
  });

  it("holds a calculated %B inside 0 to 100 and says so", () => {
    const high = decideRetention(
      [
        sample({ percentB: 50, peakCount: 2, lastPeakTimeMin: 2, firstPeakTimeMin: 1 }),
        sample({ percentB: 40, peakCount: 2, lastPeakTimeMin: 11, firstPeakTimeMin: 1 }),
      ],
      { requiredPeaks: 8, lastPeakTimeMin: 1.000001, maxBackPressurePsi: 500 },
    );
    expect(high.fit?.clamped).toBe("high");
    expect(high.nextPercentB).toBe(100);
    expect(high.nextChange.toLowerCase()).toContain("above 100");

    expect(roundTargetPercent(41.420785, [70, 60, 50, 40])).toEqual({
      value: 41,
      clamped: null,
      oneDecimal: false,
    });
    expect(roundTargetPercent(40.24, [70, 60, 50, 40])).toEqual({
      value: 40.2,
      clamped: null,
      oneDecimal: true,
    });
    expect(roundTargetPercent(-3.2, [])).toMatchObject({ value: 0, clamped: "low" });
    expect(roundMinimumPercent(45.01, [])).toEqual({ value: 46, clamped: null, oneDecimal: false });
    expect(roundMinimumPercent(45, [])).toEqual({ value: 45, clamped: null, oneDecimal: false });
    expect(roundMinimumPercent(41.420785, [70, 60, 50, 40])).toEqual({
      value: 42,
      clamped: null,
      oneDecimal: false,
    });
    expect(roundMinimumPercent(40.24, [70, 60, 50, 40])).toEqual({
      value: 41,
      clamped: null,
      oneDecimal: false,
    });
    expect(roundMinimumPercent(40.24, [70, 60, 50, 40, 41])).toEqual({
      value: 42,
      clamped: null,
      oneDecimal: false,
    });
    expect(roundMinimumPercent(99.2, [100])).toEqual({ value: 100, clamped: null, oneDecimal: false });
    expect(roundMinimumPercent(120, [])).toEqual({ value: 100, clamped: "high", oneDecimal: false });
    expect(roundMinimumPercent(-3.2, [])).toEqual({ value: 0, clamped: "low", oneDecimal: false });
  });

  it("does not finish retention just because the 5 point drop was run", () => {
    const rules: RetentionRules = {
      requiredPeaks: 8,
      lastPeakTimeMin: 10,
      maxBackPressurePsi: 500,
    };
    const first = decideRetention(
      [sample({ percentB: 70, peakCount: 2, lastPeakTimeMin: 9, firstPeakTimeMin: 1 })],
      rules,
    );
    expect(first.move).toBe("drop-5");
    expect(first.nextPercentB).toBe(65);
    const second = decideRetention(
      [
        sample({ percentB: 70, peakCount: 2, lastPeakTimeMin: 9, firstPeakTimeMin: 1 }),
        sample({ percentB: 65, peakCount: 2, lastPeakTimeMin: 9.2, firstPeakTimeMin: 1 }),
      ],
      rules,
    );
    expect(second.reason).not.toBe("finished-calculated");
    expect(second.move).toBe("calculated");
    expect(second.nextPercentB).not.toBeNull();
  });
});

describe("first-peak time outliers", () => {
  const files = [
    { percentB: 90, name: "GR41-04-90.csv" },
    { percentB: 70, name: "GR41-06-70-good.csv" },
    { percentB: 60, name: "GR41-07-60-good.csv" },
    { percentB: 50, name: "GR41-08-50-good.csv" },
    { percentB: 40, name: "GR41-09-40-good.csv" },
  ] as const;
  const reads = files.map((file) => readLabFile(readFileSync(path.join(fixtureDir, file.name))));
  const samples = files.map((file, index) => sampleFromRead(file.percentB, reads[index]));
  const rules: RetentionRules = {
    requiredPeaks: 8,
    lastPeakTimeMin: 10,
    maxBackPressurePsi: 2000,
  };

  it("leaves the 90% run out of the five-file fit and keeps 70, 60, 50, and 40", () => {
    expect(reads.map((read) => read.firstPeakTimeMin?.toFixed(3))).toEqual([
      "1.296",
      "1.101",
      "1.088",
      "1.084",
      "1.095",
    ]);
    const decision = decideRetention(samples, rules);
    expect(decision.move).toBe("calculated");
    expect(decision.fit!.rows.map((row) => row.percentB)).toEqual([70, 60, 50, 40]);
    expect(decision.fit!.rows.map((row) => row.runNumber)).toEqual([2, 3, 4, 5]);
    expect(decision.fit!.excluded.map((row) => row.percentB)).toEqual([90]);
    expect(decision.why).toContain("The Q-test left out Run 1 at 90% B (t0 peak 1.296 min).");
    expect(decision.why).toContain(
      "The calculation uses Run 2 at 70% B, Run 3 at 60% B, Run 4 at 50% B, Run 5 at 40% B.",
    );
    expect(decision.why).not.toContain("middle t0");
    expect(decision.why).not.toContain("10% cutoff");
  });

  it("leaves out a separated 90% run because its first-peak time is off, and keeps 70%", () => {
    const rules = { requiredPeaks: 8, lastPeakTimeMin: 10, maxBackPressurePsi: 500 };
    const series = [
      sample({
        percentB: 90,
        peakCount: 6,
        minResolutionExcludingFirst: 2.3,
        firstPeakTimeMin: 1.296,
        lastPeakTimeMin: 1.8,
      }),
      sample({
        percentB: 70,
        peakCount: 6,
        minResolutionExcludingFirst: 0.6,
        firstPeakTimeMin: 1.101,
        lastPeakTimeMin: 2,
      }),
      sample({
        percentB: 60,
        peakCount: 6,
        minResolutionExcludingFirst: 0.7,
        firstPeakTimeMin: 1.088,
        lastPeakTimeMin: 3,
      }),
      sample({
        percentB: 50,
        peakCount: 6,
        minResolutionExcludingFirst: 0.9,
        firstPeakTimeMin: 1.084,
        lastPeakTimeMin: 5.01, // just past half of 10 min, so the line is allowed
      }),
      sample({
        percentB: 40,
        peakCount: 6,
        minResolutionExcludingFirst: 1.2,
        firstPeakTimeMin: 1.095,
        lastPeakTimeMin: 9,
      }),
    ];
    const four = decideRetention(series.slice(0, 4), rules);
    expect(four.move).toBe("calculated");
    expect(four.fit!.rows.map((row) => row.percentB)).toEqual([70, 60, 50]);
    expect(four.fit!.excluded.map((row) => row.percentB)).toEqual([90]);
    expect(four.why).toContain("The Q-test left out Run 1 at 90% B (t0 peak 1.296 min).");
    expect(four.why).toContain("The calculation uses Run 2 at 70% B");
    expect(four.why).not.toContain("middle t0");
    expect(four.nextPercentB).toBe(40);
    const followed = decideRetention(series, rules);
    expect(followed.reason).toBe("choose-percent");
    expect(followed.move).toBeNull();
    expect(followed.nextTemperature).toBe("40");
    expect(followed.fit).toBeNull();
    expect(followed.pickOwnPercent).toBe(true);
    expect(followed.nextPercentB).toBeNull();
  });

  it("at 90% keeps 1.110 until a later run, then leaves both 1.190 and 1.110 out", () => {
    const rules = { requiredPeaks: 8, lastPeakTimeMin: 10, maxBackPressurePsi: 500 };
    const series = [
      sample({ percentB: 90, peakCount: 2, firstPeakTimeMin: 1.19, lastPeakTimeMin: 2 }),
      sample({ percentB: 80, peakCount: 2, firstPeakTimeMin: 1.11, lastPeakTimeMin: 3 }),
      sample({ percentB: 70, peakCount: 2, firstPeakTimeMin: 1.075, lastPeakTimeMin: 4 }),
      sample({ percentB: 60, peakCount: 2, firstPeakTimeMin: 1.064, lastPeakTimeMin: 5.5 }),
      sample({ percentB: 50, peakCount: 2, firstPeakTimeMin: 1.068, lastPeakTimeMin: 7 }),
      sample({ percentB: 40, peakCount: 2, firstPeakTimeMin: 1.08, lastPeakTimeMin: 9 }),
    ];
    const four = decideRetention(series.slice(0, 4), rules);
    expect(four.move).toBe("calculated");
    expect(four.fit!.rows.map((row) => row.t0)).toEqual([1.11, 1.075, 1.064]);
    expect(four.fit!.excluded.map((row) => row.percentB)).toEqual([90]);
    expect(four.why).not.toContain("t0 peak 1.110");
    expect(four.why).toContain("Run 2 at 80% B");
    expect(four.nextPercentB).toBe(45);

    const five = decideRetention(series.slice(0, 5), rules);
    expect(five.move).toBe("calculated");
    expect(five.reason).toBe("calculated");
    expect(five.fit!.rows.map((row) => row.t0)).toEqual([1.075, 1.064, 1.068]);
    expect(five.fit!.excluded.map((row) => row.percentB)).toEqual([90, 80]);
    expect(five.nextPercentB).toBe(40);
    expect(five.fit!.rawPercentB).toBeCloseTo(39.212, 2);

    const six = decideRetention(series, rules);
    expect(six.reason).toBe("choose-percent");
    expect(six.move).toBeNull();
    expect(six.nextTemperature).toBe("40");
    expect(six.fit).toBeNull();
    expect(six.why).toContain("does not refit the last-peak line");
    expect(six.why).not.toContain("middle t0");
    expect(six.why).not.toContain("95%");
    expect(six.why).not.toContain("optimal %B");
  });

  it("says the t0 peaks passed the Q-test when none is an outlier", () => {
    const decision = decideRetention(
      [
        sample({ percentB: 80, peakCount: 2, firstPeakTimeMin: 1.064, lastPeakTimeMin: 3 }),
        sample({ percentB: 60, peakCount: 2, firstPeakTimeMin: 1.068, lastPeakTimeMin: 4 }),
        sample({ percentB: 40, peakCount: 2, firstPeakTimeMin: 1.076, lastPeakTimeMin: 6 }),
      ],
      { requiredPeaks: 8, lastPeakTimeMin: 10, maxBackPressurePsi: 500 },
    );
    expect(decision.move).toBe("calculated");
    expect(decision.fit!.excluded).toEqual([]);
    expect(decision.fit!.rows.map((row) => row.t0)).toEqual([1.064, 1.068, 1.076]);
    expect(decision.why).toContain(
      "The t0 peaks passed the Q-test. The calculation uses Run 1 at 80% B, Run 2 at 60% B, Run 3 at 40% B.",
    );
    expect(decision.why).not.toContain("middle t0");
    expect(decision.why).not.toContain("The Q-test left out");
  });

  it("leaves out one extreme t0 peak when there are only three runs", () => {
    const decision = decideRetention(
      [
        sample({ percentB: 80, peakCount: 2, firstPeakTimeMin: 1, lastPeakTimeMin: 3 }),
        sample({ percentB: 60, peakCount: 2, firstPeakTimeMin: 1.01, lastPeakTimeMin: 4 }),
        sample({ percentB: 40, peakCount: 2, firstPeakTimeMin: 1.5, lastPeakTimeMin: 6 }),
      ],
      { requiredPeaks: 8, lastPeakTimeMin: 10, maxBackPressurePsi: 500 },
    );
    expect(decision.move).toBe("calculated");
    expect(decision.fit!.rows.map((row) => row.percentB)).toEqual([80, 60]);
    expect(decision.fit!.excluded.map((row) => row.percentB)).toEqual([40]);
    expect(decision.why).toContain("The Q-test left out Run 3 at 40% B (t0 peak 1.500 min).");
    expect(decision.why).toContain("The calculation uses Run 1 at 80% B, Run 2 at 60% B.");
  });

  it("does not run the Q-test on two runs", () => {
    const decision = decideRetention(
      [
        sample({ percentB: 90, peakCount: 2, firstPeakTimeMin: 1.296, lastPeakTimeMin: 8 }),
        sample({ percentB: 70, peakCount: 2, firstPeakTimeMin: 1.101, lastPeakTimeMin: 9 }),
      ],
      { requiredPeaks: 8, lastPeakTimeMin: 10, maxBackPressurePsi: 500 },
    );
    expect(decision.move).toBe("calculated");
    expect(decision.fit!.rows.map((row) => row.percentB)).toEqual([90, 70]);
    expect(decision.fit!.excluded).toEqual([]);
    expect(decision.why).toContain("The calculation uses Run 1 at 90% B, Run 2 at 70% B.");
    expect(decision.why).not.toContain("Q-test");
    expect(decision.why).not.toContain("middle t0");
    expect(decision.why.toLowerCase()).not.toContain("fewer than two");
  });
});

describe("which run to carry forward after the calculated %B", () => {
  const rules: RetentionRules = {
    requiredPeaks: 7,
    lastPeakTimeMin: 15,
    minResolution: 1.4,
    maxBackPressurePsi: 4000,
  };
  // Ask for 8 peaks so the 7-peak 40% file still calculates a minimum %B.
  const shortRules: RetentionRules = { ...rules, requiredPeaks: 8 };
  const seriesFiles = [
    { percentB: 90, name: "GR41-04-90.csv" },
    { percentB: 70, name: "GR41-06-70-good.csv" },
    { percentB: 60, name: "GR41-07-60-good.csv" },
    { percentB: 50, name: "GR41-08-50-good.csv" },
    { percentB: 40, name: "GR41-09-40-good.csv" },
  ] as const;
  const series = seriesFiles.map((file) =>
    sampleFromRead(file.percentB, readLabFile(readFileSync(path.join(fixtureDir, file.name)))),
  );
  const read40 = readLabFile(readFileSync(path.join(fixtureDir, "GR41-09-40-good.csv")));
  const read37 = readLabFile(readFileSync(path.join(fixtureDir, "GR41-10-37.csv")));

  it("uses the real 37% and 40% times, and moves on to efficiency once peaks match", () => {
    expect(read37.lastPeakTimeMin).toBeCloseTo(1.602, 3);
    expect(read37.minResolutionExcludingFirst).toBeCloseTo(0, 3);
    expect(read40.lastPeakTimeMin).toBeCloseTo(11.593, 3);
    expect(read40.minResolutionExcludingFirst).toBeCloseTo(0.324, 3);
    expect(read40.lastPeakTimeMin!).toBeLessThanOrEqual(15);
    expect(read40.minResolutionExcludingFirst!).toBeGreaterThan(read37.minResolutionExcludingFirst!);
    expect(read40.peakCount).toBe(7);

    const check = {
      requiredPeaks: 7,
      lastPeakTimeMin: 15,
      minResolution: 1.4,
      maxBackPressurePsi: 4000,
    };
    const onTime = evaluateRun(read37, check);
    expect(onTime.find((row) => row.id === "last-peak")?.status).toBe("met");
    expect(onTime.find((row) => row.id === "last-peak")?.rule).toBe("at or before 15.000 min");

    const past = evaluateRun({ ...read37, lastPeakTimeMin: 18.258 }, check);
    expect(past.find((row) => row.id === "last-peak")?.measured).toBe("18.258 min");
    expect(past.find((row) => row.id === "last-peak")?.status).toBe("not-met");

    // With 7 peaks required and Rs < floor (0.324 < floor for spec 1.4), Row 7 recommends SELECTIVITY (Run at 40°C)
    const normalPath = decideRetention(series, rules);
    expect(normalPath.status).toBe("recommend");
    expect(normalPath.tableAction).toBe("SELECTIVITY");
    expect(normalPath.nextTemperature).toBe("40");
    expect(normalPath.nextPercentB).toBe(40);
    expect(normalPath.why).toContain("Row 7");
    expect(normalPath.why).toContain("significantly under the specification");
    expect(normalPath.why).toContain("optimise retention and selectivity first");

    // Once Rs >= floor (e.g. minResolution: 0.5 where 0.324 >= floor ~0.295), moves on to efficiency (Row 8)
    const matched = decideRetention(series, { ...rules, minResolution: 0.5 });
    expect(matched.status).toBe("efficiency");
    expect(matched.nextPercentB).toBeNull();
    expect(matched.nextChange).toContain("Move on to efficiency");
    expect(retentionChangeLabel(matched)).toBe("Move on to efficiency");
    expect(matched.why).toContain("Peaks: 7. The specification is 7. Met.");
    expect(matched.why).toContain("Efficiency is next for the resolution.");
    expect(matched.why).toContain("above the resolution floor");
    expect(matched.why).toContain("above the Rs floor");

    // With peaks still short, the same series still calculates a minimum %B.
    const calculated = decideRetention(series, shortRules);
    expect(calculated.move).toBe("calculated");
    expect(calculated.nextPercentB).toBe(36);
    const followed = decideRetention(
      [...series, sampleFromRead(calculated.nextPercentB!, read37)],
      shortRules,
    );
    expect(followed.status).toBe("recommend");
    expect(followed.reason).toBe("choose-percent");
    expect(followed.move).toBeNull();
    expect(followed.nextTemperature).toBe("40");
    expect(followed.fit).toBeNull();
    expect(followed.pickOwnPercent).toBe(true);
    expect(followed.nextPercentB).toBeNull();
    expect(retentionChangeLabel(followed)).toBe("Select a %B");
    expect(followed.why).toContain("does not calculate another minimum");
    expect(followed.why).not.toContain("optimal %B");
    expect(followed.nextChange).toContain("40°C");
    expect(followed.nextChange).not.toContain("Carry forward");
    expect(followed.why).not.toContain("Carry forward");
    expect(followed.look).toBeUndefined();
  });

  it("does not let a short run with a high found resolution beat a run that has enough peaks", () => {
    const index = carryForwardIndex(
      [
        sample({
          percentB: 40,
          peakCount: 7,
          lastPeakTimeMin: 10,
          minResolutionExcludingFirst: null,
        }),
        sample({
          percentB: 38,
          peakCount: 6,
          lastPeakTimeMin: 10,
          minResolutionExcludingFirst: 2.3,
        }),
      ],
      rules,
    );
    expect(index).toBe(0);
  });

  it("still recommends a second minimum when the recommended file's last peak is past the time", () => {
    const calculated = decideRetention(series, shortRules);
    expect(calculated.nextPercentB).toBe(36);
    const followed = decideRetention(
      [
        ...series,
        {
          ...sampleFromRead(calculated.nextPercentB!, read37),
          lastPeakTimeMin: 18.258,
          peakCount: 7,
          minResolutionExcludingFirst: 2,
        },
      ],
      shortRules,
    );
    expect(followed.reason).toBe("choose-percent");
    expect(followed.move).toBeNull();
    expect(followed.nextTemperature).toBe("40");
    expect(followed.fit).toBeNull();
    expect(followed.pickOwnPercent).toBe(true);
    expect(followed.status).not.toBe("efficiency");
    expect(followed.why).toContain("does not refit the last-peak line");
    expect(followed.nextChange).toContain("40°C");
  });
});

describe("backwards retention", () => {
  it("warns when the 90% last peak is later than the 80% last peak", () => {
    const labDir = path.join(process.cwd(), "fixtures/lab");
    const higher = readLabFile(
      readFileSync(
        path.join(labDir, "GR09-05-3-ACN-3-ISO-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254_f959.xlsx"),
      ),
    );
    const lower = readLabFile(
      readFileSync(
        path.join(labDir, "GR09-06-3-ACN-3-ISO-80-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254_2191.xlsx"),
      ),
    );
    expect(higher.lastPeakTimeMin).not.toBeNull();
    expect(lower.lastPeakTimeMin).not.toBeNull();
    expect(higher.lastPeakTimeMin!).toBeGreaterThan(lower.lastPeakTimeMin!);
    const pair = findBackwardsRetention([
      { percentB: 90, lastPeakTimeMin: higher.lastPeakTimeMin, temperatureC: "ambient", solvent: "ACN", ligand: "C18" },
      { percentB: 80, lastPeakTimeMin: lower.lastPeakTimeMin, temperatureC: "ambient", solvent: "ACN", ligand: "C18" },
    ]);
    expect(pair).not.toBeNull();
    expect(pair!.higherPercentB).toBe(90);
    expect(pair!.lowerPercentB).toBe(80);
    expect(pair!.higherLastMin).toBeCloseTo(higher.lastPeakTimeMin!, 5);
    expect(pair!.lowerLastMin).toBeCloseTo(lower.lastPeakTimeMin!, 5);
    const why = backwardsWhy(pair!);
    expect(why).toContain("unexpected");
    expect(why).toContain("error likely occurred");
    expect(why).toContain("90% B");
    expect(why).toContain("80% B");
    expect(why).toContain(higher.lastPeakTimeMin!.toFixed(3));
    expect(why).toContain(lower.lastPeakTimeMin!.toFixed(3));
    expect(why.toLowerCase()).not.toContain("40°c");
    expect(why.toLowerCase()).not.toContain("coating");
  });

  it("loads the 90% then 80% workbooks without throwing", () => {
    const labDir = path.join(process.cwd(), "fixtures/lab");
    const higher = readLabFile(
      readFileSync(path.join(labDir, "GR09-05-3-ACN-3-ISO-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254_f959.xlsx")),
    );
    const lower = readLabFile(
      readFileSync(path.join(labDir, "GR09-06-3-ACN-3-ISO-80-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254_2191.xlsx")),
    );
    expect(higher.lastPeakTimeMin).not.toBeNull();
    expect(lower.lastPeakTimeMin).not.toBeNull();
    expect(higher.lastPeakTimeMin!).toBeGreaterThan(lower.lastPeakTimeMin!);
    const runs = [
      { percentB: 90, lastPeakTimeMin: higher.lastPeakTimeMin },
      { percentB: 80, lastPeakTimeMin: lower.lastPeakTimeMin },
    ];
    const pair = findBackwardsRetention(runs);
    expect(pair).not.toBeNull();
    expect(() => backwardsWhy(pair!)).not.toThrow();
    const held = seriesWhileHeld(runs, runs.length, () => true);
    expect(held).toBe(runs);
    const withEmpty = [...runs, { percentB: null, lastPeakTimeMin: null }];
    const dropped = seriesWhileHeld(withEmpty, runs.length, () => true);
    expect(dropped).toEqual(runs);
    expect(seriesWhileHeld(dropped, runs.length, () => true)).toBe(dropped);
  });
});

describe("declining selectivity after the 35% file", () => {
  const rules: RetentionRules = {
    requiredPeaks: 7,
    lastPeakTimeMin: 15,
    minResolution: 1.5,
    maxBackPressurePsi: 4000,
  };
  const times = [
    [1.11, 1.315, 1.687],
    [1.075, 1.507, 1.785, 1.916],
    [1.064, 1.837, 2.124, 2.483, 2.795],
    [1.068, 2.582, 4.259, 4.986],
    [1.08, 3.866, 4.512, 4.83, 9.897, 11.633],
    [1.134, 4.871, 6.672, 7.141, 8.013, 17.485, 19.854],
  ];
  const percents = [80, 70, 60, 50, 40, 35];
  const resolutions = [1.093, 0.841, 1.773, 3.236, 1.107, 1.453];
  const pressures = [1398.15, 1644.21, 1904.5, 2127.81, 2285.68, 1180.53];
  const samples: RetentionSample[] = percents.map((percentB, index) => ({
    percentB,
    peakCount: times[index].length,
    lastPeakTimeMin: times[index][times[index].length - 1],
    firstPeakTimeMin: times[index][0],
    minResolutionExcludingFirst: resolutions[index],
    maxBackPressurePsi: pressures[index],
    peaks: times[index].map((timeMin) => ({ timeMin, area: 1, height: 1, name: null, id: null })),
  }));

  it("keeps the selectivity offer, and staying in retention asks for a %B", () => {
    // The 35% file is the recommended minimum (raw just under ceil) and already has 7 peaks.
    const afterMinimum = decideRetention(samples, rules);
    expect(afterMinimum.status).toBe("efficiency");
    expect(afterMinimum.reason).toBe("efficiency");
    expect(afterMinimum.nextChange).toContain("Move on to efficiency");
    expect(afterMinimum.efficiencyChoice?.continueLabel).toBe("Move on to selectivity");
    expect(afterMinimum.nextPercentB).toBeNull();
    expect(afterMinimum.pickOwnPercent ?? false).toBe(false);
    expect(retentionChangeLabel(afterMinimum)).toBe("Move on to efficiency");

    const lateNotMinimum = { ...samples[5], percentB: 30 };
    const offered = decideRetention([...samples.slice(0, 5), lateNotMinimum], rules);
    expect(offered.status).toBe("efficiency");
    expect(offered.efficiencyChoice?.continueLabel).toBe("Move on to selectivity");
    expect(offered.nextPercentB).toBeNull();

    const declined = decideRetention([...samples.slice(0, 5), lateNotMinimum], rules, { continueRetention: true });
    expect(declined.status).toBe("recommend");
    expect(declined.reason).toBe("choose-percent");
    expect(declined.move).toBeNull();
    expect(declined.fit).toBeNull();
    expect(declined.nextPercentB).toBeNull();
    expect(declined.pickOwnPercent).toBe(true);
    expect(declined.nextTemperature).toBe("40");
    expect(declined.choosePercent ?? false).toBe(false);
    expect(declined.why).not.toContain("optimal %B");
    expect(declined.why).toContain("does not calculate another minimum");
    expect(declined.why).toContain("does not refit the last-peak line");
    expect(declined.nextChange).toContain("40°C");
    expect(declined.why).not.toContain("60°C");
    expect(declined.look ?? null).toBeNull();
    expect(retentionChangeLabel(declined)).toBe("Select a %B");
    expect(retentionChangeLabel(declined, 22)).toBe("Run at 40°C at 22% B");

    const firstMinimum = decideRetention(samples.slice(0, 5), rules);
    expect(firstMinimum.move).toBe("calculated");
    expect(firstMinimum.fit).not.toBeNull();
    expect(firstMinimum.nextPercentB).toBe(36);
    const offRecommendation = decideRetention(
      [
        ...samples.slice(0, 5),
        {
          percentB: 55,
          peakCount: 4,
          lastPeakTimeMin: 3,
          firstPeakTimeMin: 1.06,
          minResolutionExcludingFirst: 1,
          maxBackPressurePsi: 1500,
          peaks: [1.06, 1.4, 2.1, 3].map((timeMin) => ({ timeMin, area: 1, height: 1, name: null, id: null })),
        },
      ],
      rules,
    );
    expect(offRecommendation.reason).not.toBe("second-minimum");
    expect(offRecommendation.why).not.toContain("optimal %B");
    expect(offRecommendation.nextTemperature ?? null).toBeNull();
    const lateShort = { ...samples[5], peakCount: 6 };
    const between = {
      percentB: 55,
      peakCount: 4,
      lastPeakTimeMin: 3,
      firstPeakTimeMin: 1.06,
      minResolutionExcludingFirst: 1,
      maxBackPressurePsi: 1500,
      peaks: [1.06, 1.4, 2.1, 3].map((timeMin) => ({ timeMin, area: 1, height: 1, name: null, id: null })),
    };
    const secondTry = decideRetention([...samples.slice(0, 5), between, lateShort], rules);
    expect(secondTry.reason).not.toBe("second-minimum");
    expect(secondTry.why).not.toContain("optimal %B");

    const matched = decideRetention(
      [...samples.slice(0, 5), { ...samples[4], percentB: firstMinimum.nextPercentB! }],
      rules,
    );
    expect(matched.reason).toBe("choose-percent");
    expect(matched.pickOwnPercent).toBe(true);
    expect(matched.choosePercent ?? false).toBe(false);
    expect(matched.nextTemperature).toBe("40");
    expect(matched.fit).toBeNull();
    expect(matched.nextPercentB).toBeNull();
    expect(matched.move).toBeNull();
    expect(retentionChangeLabel(matched)).toBe("Select a %B");

    const atFloor = decideRetention(
      [
        ...samples.slice(0, 5),
        { ...samples[5], percentB: 35 },
      ],
      rules,
    );
    expect(firstMinimum.fit?.rawPercentB).toBeGreaterThan(35);
    expect(firstMinimum.fit?.rawPercentB).toBeLessThan(36);
    // Floor of the raw minimum with peaks already met → efficiency pause, not another %B.
    expect(atFloor.status).toBe("efficiency");
    expect(atFloor.reason).toBe("efficiency");
    expect(atFloor.fit).toBeNull();
    expect(atFloor.pickOwnPercent ?? false).toBe(false);
    expect(atFloor.nextPercentB).toBeNull();
    expect(atFloor.nextChange).toContain("Move on to efficiency");
    expect(atFloor.why).toContain("Peaks: 7. The specification is 7. Met.");
  });
});

function sampleFromRead(percentB: number, read: LabFileRead): RetentionSample {
  return {
    percentB,
    peakCount: read.peakCount,
    lastPeakTimeMin: read.lastPeakTimeMin,
    firstPeakTimeMin: read.firstPeakTimeMin,
    minResolutionExcludingFirst: read.minResolutionExcludingFirst,
    maxBackPressurePsi: read.maxBackPressurePsi,
    peaks: read.peaks,
  };
}

function selectivityRun(percentB: number, read: LabFileRead): SelectivityRun {
  return {
    percentB,
    temperatureC: 25,
    solvent: "ACN",
    ligand: "C18",
    peakCount: read.peakCount,
    lastPeakTimeMin: read.lastPeakTimeMin,
    firstPeakTimeMin: read.firstPeakTimeMin,
    minResolutionExcludingFirst: read.minResolutionExcludingFirst,
    maxBackPressurePsi: read.maxBackPressurePsi,
  };
}

function sample(overrides: Partial<RetentionSample> & Pick<RetentionSample, "percentB">): RetentionSample {
  return {
    percentB: overrides.percentB,
    peakCount: overrides.peakCount ?? 2,
    lastPeakTimeMin: overrides.lastPeakTimeMin ?? 2,
    firstPeakTimeMin: overrides.firstPeakTimeMin ?? 1,
    minResolutionExcludingFirst:
      overrides.minResolutionExcludingFirst === undefined ? 1 : overrides.minResolutionExcludingFirst,
    maxBackPressurePsi: overrides.maxBackPressurePsi ?? 100,
  };
}

describe("extra peaks and the in-between choice", () => {
  const rules: RetentionRules = {
    requiredPeaks: 6,
    lastPeakTimeMin: 15,
    minResolution: 1,
    maxBackPressurePsi: 4000,
  };

  it("stops on investigate and lists every peak when the count is above the specification", () => {
    const read = reads[3];
    expect(read.peakCount).toBe(7);
    expect(read.areaColumnFound).toBe(true);
    expect(read.heightColumnFound).toBe(true);
    const decision = decideRetention([sampleFromRead(40, read)], rules);
    expect(decision.status).toBe("investigate");
    expect(decision.nextPercentB).toBeNull();
    expect(decision.nextChange).toContain("Investigate");
    expect(decision.nextChange).not.toContain("40°C");
    expect(decision.why).toContain("more peaks than the specification");
    expect(decision.why).toContain("size alone cannot identify a peak");
    expect(decision.why).toContain("0.1 mg/mL");
    expect(decision.why).toContain("Retention time 1.095 min");
    expect(decision.why).toContain("Retention time 11.593 min");
    expect(decision.why).toContain("Area 8513700");
    expect(decision.why).toContain("Height 1993226");
    expect(decision.why).not.toContain("fake");
  });

  it("still investigates when area and height are missing", () => {
    const decision = decideRetention(
      [
        sample({
          percentB: 40,
          peakCount: 8,
          lastPeakTimeMin: 4,
          peaks: [
            { timeMin: 1, area: null, height: null },
            { timeMin: 4, area: null, height: null },
          ],
        }),
      ],
      { requiredPeaks: 6, lastPeakTimeMin: 15, maxBackPressurePsi: 4000 },
    );
    expect(decision.status).toBe("investigate");
    expect(decision.why).toContain("Area is missing.");
    expect(decision.why).toContain("Height is missing.");
    expect(decision.nextPercentB).toBeNull();
  });

  it("shows the run picker after an in-between file when the peak count is still short", () => {
    const series = [
      sample({ percentB: 70, peakCount: 4, lastPeakTimeMin: 2, firstPeakTimeMin: 1 }),
      sample({ percentB: 60, peakCount: 4, lastPeakTimeMin: 4, firstPeakTimeMin: 1 }),
      sample({ percentB: 41, peakCount: 4, lastPeakTimeMin: 8, firstPeakTimeMin: 1 }),
    ];
    const followed = decideRetention(
      [...series, sample({ percentB: 45, peakCount: 5, lastPeakTimeMin: 9, firstPeakTimeMin: 1 })],
      { requiredPeaks: 8, lastPeakTimeMin: 10, maxBackPressurePsi: 500 },
      { afterInBetween: true },
    );
    expect(followed.status).toBe("look");
    expect(followed.look?.mode).toBe("picker");
    expect(followed.look?.runs[0].time).toBe("met");
    expect(inBetweenPercentError("60", [70, 60, 41])).toContain("already uploaded");
    expect(inBetweenPercentError("45", [70, 60, 41])).toBeNull();
  });

  it("goes to efficiency after an in-between file once the peak count matches", () => {
    const decision = decideRetention(
      [
        sample({ percentB: 70, peakCount: 4, lastPeakTimeMin: 2, firstPeakTimeMin: 1 }),
        sample({ percentB: 55, peakCount: 8, lastPeakTimeMin: 12, minResolutionExcludingFirst: 0.7, firstPeakTimeMin: 1 }),
      ],
      { requiredPeaks: 8, lastPeakTimeMin: 10, minResolution: 1, maxBackPressurePsi: 500 },
      { afterInBetween: true },
    );
    expect(decision.status).toBe("efficiency");
    expect(decision.continueShowsLook).toBe(true);
    expect(decision.nextChange).not.toContain("40°C");
    expect(decision.why).toContain("Efficiency is next for the resolution.");
    const looked = decideRetention(
      [
        sample({ percentB: 70, peakCount: 4, lastPeakTimeMin: 2, firstPeakTimeMin: 1 }),
        sample({ percentB: 55, peakCount: 8, lastPeakTimeMin: 12, minResolutionExcludingFirst: 0.7, firstPeakTimeMin: 1 }),
      ],
      { requiredPeaks: 8, lastPeakTimeMin: 10, minResolution: 1, maxBackPressurePsi: 500 },
      { afterInBetween: true, continueToLook: true },
    );
    expect(looked.status).toBe("look");
    expect(looked.look?.mode).toBe("between-then-heat");
    expect(looked.nextChange).toBe("Look at the runs.");

    // When resolution < 0.5 * spec (0.4 < 0.5), transitions to selectivity at 40°C
    const underHalf = decideRetention(
      [
        sample({ percentB: 70, peakCount: 4, lastPeakTimeMin: 2, firstPeakTimeMin: 1 }),
        sample({ percentB: 55, peakCount: 8, lastPeakTimeMin: 12, minResolutionExcludingFirst: 0.4, firstPeakTimeMin: 1 }),
      ],
      { requiredPeaks: 8, lastPeakTimeMin: 10, minResolution: 1, maxBackPressurePsi: 500 },
      { afterInBetween: true },
    );
    expect(underHalf.status).toBe("recommend");
    expect(underHalf.nextTemperature).toBe("40");
  });

  it("continues the 10% drop or calculates Min %B when staying in retention after peaks match early", () => {
    const check: RetentionRules = {
      requiredPeaks: 7,
      lastPeakTimeMin: 15,
      minResolution: 1.5,
      maxBackPressurePsi: 4000,
    };
    const earlySeries = [
      sample({ percentB: 80, peakCount: 5, lastPeakTimeMin: 2.1, firstPeakTimeMin: 1.05 }),
      sample({ percentB: 70, peakCount: 7, lastPeakTimeMin: 3.4, firstPeakTimeMin: 1.05, minResolutionExcludingFirst: 0.8 }),
    ];
    const pausedEarly = decideRetention(earlySeries, check);
    expect(pausedEarly.status).toBe("efficiency");
    expect(pausedEarly.continueShowsLook).toBe(true);

    const continuedDrop = decideRetention(earlySeries, check, { continueRetention: true });
    expect(continuedDrop.status).toBe("recommend");
    expect(continuedDrop.move).toBe("drop-10");
    expect(continuedDrop.nextPercentB).toBe(60);

    const lookedFromPause = decideRetention(earlySeries, check, { continueToLook: true });
    expect(lookedFromPause.status).toBe("look");
    expect(lookedFromPause.look?.mode).toBe("between-then-heat");

    const pastHalfSeries = [
      ...earlySeries,
      sample({ percentB: 60, peakCount: 7, lastPeakTimeMin: 5.8, firstPeakTimeMin: 1.05, minResolutionExcludingFirst: 1.0 }),
      sample({ percentB: 50, peakCount: 7, lastPeakTimeMin: 8.9, firstPeakTimeMin: 1.05, minResolutionExcludingFirst: 1.2 }),
    ];
    const continuedCalc = decideRetention(pastHalfSeries, check, { continueRetention: true });
    expect(continuedCalc.status).toBe("recommend");
    expect(continuedCalc.move).toBe("calculated");
    expect(continuedCalc.fit).not.toBeNull();
    expect(continuedCalc.nextPercentB).not.toBeNull();
  });

  it("routes to efficiency when peakCount matches requiredPeaks but back-pressure is over the specification", () => {
    const check: RetentionRules = {
      requiredPeaks: 7,
      lastPeakTimeMin: 15,
      minResolution: 1.5,
      maxBackPressurePsi: 3000,
    };
    const overPressure = decideRetention(
      [
        sample({
          percentB: 40,
          peakCount: 7,
          lastPeakTimeMin: 10,
          minResolutionExcludingFirst: 1.8,
          maxBackPressurePsi: 3500,
        }),
      ],
      check,
    );
    expect(overPressure.status).toBe("efficiency");
    expect(overPressure.why).toContain("Back-pressure: 3500.0 psi. Over the specification of 3000 psi. Not met.");
    expect(overPressure.why).toContain("Efficiency is next to bring the back-pressure to the specification.");
  });
});

describe("12-row chromatographic decision table with dynamic resolution floor", () => {
  const tableRules: RetentionRules = {
    requiredPeaks: 7,
    lastPeakTimeMin: 15,
    minResolution: 1.5,
    maxBackPressurePsi: 4000,
  };

  it("Row 1: Peaks < 7, tR << spec -> Decrease %B by 10", () => {
    const s1 = sample({
      percentB: 80,
      peakCount: 4,
      lastPeakTimeMin: 5,
      firstPeakTimeMin: 1.1,
      minResolutionExcludingFirst: 0.5,
      maxBackPressurePsi: 2000,
    });
    const dec = decideRetention([s1], tableRules);
    expect(dec.status).toBe("recommend");
    expect(dec.move).toBe("drop-10");
    expect(dec.nextPercentB).toBe(70);
    expect(dec.tableAction).toBe("Decrease %B by 10");
    expect(dec.why).toContain("Decrease %B by 10%");
  });

  it("Row 2: Peaks < 7, tR < spec -> Min %B ... OR an intermediate %B", () => {
    const s1 = sample({
      percentB: 80,
      peakCount: 4,
      lastPeakTimeMin: 4.5,
      firstPeakTimeMin: 1.1,
      minResolutionExcludingFirst: 0.5,
      maxBackPressurePsi: 2000,
    });
    const s2 = sample({
      percentB: 60,
      peakCount: 5,
      lastPeakTimeMin: 10.0,
      firstPeakTimeMin: 1.1,
      minResolutionExcludingFirst: 0.6,
      maxBackPressurePsi: 2200,
    });
    const dec = decideRetention([s1, s2], tableRules);
    expect(dec.status).toBe("recommend");
    expect(dec.move).toBe("calculated");
    expect(dec.tableAction).toContain("Min %B");
    expect(dec.tableAction).toContain("intermediate %B");
    expect(dec.why).toContain("Linear Solvent Strength (LSS) Model");
  });

  it("Row 3: Peaks < 7, tR > spec -> Change selectivity ... OR an intermediate %B", () => {
    const s1 = sample({
      percentB: 80,
      peakCount: 4,
      lastPeakTimeMin: 4.5,
      firstPeakTimeMin: 1.1,
      minResolutionExcludingFirst: 0.5,
      maxBackPressurePsi: 2000,
    });
    const s2 = sample({
      percentB: 60,
      peakCount: 5,
      lastPeakTimeMin: 10.0,
      firstPeakTimeMin: 1.1,
      minResolutionExcludingFirst: 0.6,
      maxBackPressurePsi: 2200,
    });
    const decCalc = decideRetention([s1, s2], tableRules);
    const s3 = sample({
      percentB: decCalc.nextPercentB!,
      peakCount: 6,
      lastPeakTimeMin: 18.0,
      firstPeakTimeMin: 1.1,
      minResolutionExcludingFirst: 0.7,
      maxBackPressurePsi: 2500,
    });
    const dec = decideRetention([s1, s2, s3], tableRules);
    expect(dec.status).toBe("recommend");
    expect(dec.tableAction).toContain("Change selectivity");
    expect(dec.tableAction).toContain("intermediate %B");
    expect(dec.nextTemperature).toBe("40");
    expect(dec.why).toContain("Row 3");
  });

  it("Row 4: Peaks = 7, tR << spec, Rs < floor -> Increase L (watch BP)", () => {
    const s = sample({
      percentB: 50,
      peakCount: 7,
      lastPeakTimeMin: 5.0,
      firstPeakTimeMin: 1.1,
      minResolutionExcludingFirst: 0.4,
      maxBackPressurePsi: 2000,
    });
    const dec = decideRetention([s], tableRules);
    expect(dec.status).toBe("efficiency");
    expect(dec.tableAction).toBe("Increase L (watch BP)");
    expect(dec.why).toContain("Row 4");
    expect(dec.awesomeFloor).not.toBeNull();
    expect(dec.awesomeFloor?.verdict).toBe("impossible-selectivity-needed");
  });

  it("Row 5: Peaks = 7, tR << spec, floor <= Rs < spec -> Increase L (BP) OR decrease F OR decrease PS (BP) OR SPP", () => {
    const s = sample({
      percentB: 50,
      peakCount: 7,
      lastPeakTimeMin: 5.0,
      firstPeakTimeMin: 1.1,
      minResolutionExcludingFirst: 1.1,
      maxBackPressurePsi: 2000,
    });
    const dec = decideRetention([s], tableRules);
    expect(dec.status).toBe("efficiency");
    expect(dec.tableAction).toBe("Increase L (BP) OR decrease F OR decrease PS (BP) OR SPP");
    expect(dec.why).toContain("Row 5");
  });

  it("Row 6: Peaks = 7, tR << spec, Rs >= spec -> MET. Optionally increase F to shorten the run", () => {
    const s = sample({
      percentB: 50,
      peakCount: 7,
      lastPeakTimeMin: 5.0,
      firstPeakTimeMin: 1.1,
      minResolutionExcludingFirst: 1.6,
      maxBackPressurePsi: 2000,
    });
    const dec = decideRetention([s], tableRules);
    expect(dec.status).toBe("specs-met");
    expect(dec.tableAction).toBe("MET. Optionally increase F to shorten the run");
    expect(dec.why).toContain("Row 6");
  });

  it("Row 7: Peaks = 7, tR < spec, Rs < floor -> SELECTIVITY", () => {
    const s = sample({
      percentB: 50,
      peakCount: 7,
      lastPeakTimeMin: 10.0,
      firstPeakTimeMin: 1.1,
      minResolutionExcludingFirst: 0.4,
      maxBackPressurePsi: 2000,
    });
    const dec = decideRetention([s], tableRules);
    expect(dec.status).toBe("recommend");
    expect(dec.tableAction).toBe("SELECTIVITY");
    expect(dec.nextTemperature).toBe("40");
    expect(dec.why).toContain("Row 7");
  });

  it("Row 8: Peaks = 7, tR < spec, floor <= Rs < spec -> Decrease F OR decrease PS (BP) OR SPP", () => {
    const s = sample({
      percentB: 50,
      peakCount: 7,
      lastPeakTimeMin: 10.0,
      firstPeakTimeMin: 1.1,
      minResolutionExcludingFirst: 1.1,
      maxBackPressurePsi: 2000,
    });
    const dec = decideRetention([s], tableRules);
    expect(dec.status).toBe("efficiency");
    expect(dec.tableAction).toBe("Decrease F OR decrease PS (BP) OR SPP");
    expect(dec.why).toContain("Row 8");
  });

  it("Row 9: Peaks = 7, tR < spec, Rs >= spec -> MET. Optionally increase F to shorten the run", () => {
    const s = sample({
      percentB: 50,
      peakCount: 7,
      lastPeakTimeMin: 10.0,
      firstPeakTimeMin: 1.1,
      minResolutionExcludingFirst: 1.6,
      maxBackPressurePsi: 2000,
    });
    const dec = decideRetention([s], tableRules);
    expect(dec.status).toBe("specs-met");
    expect(dec.tableAction).toBe("MET. Optionally increase F to shorten the run");
    expect(dec.why).toContain("Row 9");
  });

  it("Row 10: Peaks = 7, tR > spec, Rs < floor -> SELECTIVITY", () => {
    const s = sample({
      percentB: 50,
      peakCount: 7,
      lastPeakTimeMin: 18.0,
      firstPeakTimeMin: 1.1,
      minResolutionExcludingFirst: 0.4,
      maxBackPressurePsi: 2000,
    });
    const dec = decideRetention([s], tableRules);
    expect(dec.status).toBe("recommend");
    expect(dec.tableAction).toBe("SELECTIVITY");
    expect(dec.nextTemperature).toBe("40");
    expect(dec.why).toContain("Row 10");
  });

  it("Row 11: Peaks = 7, tR > spec, floor <= Rs < spec -> Decrease PS (BP), then increase F to shorten the run", () => {
    const s = sample({
      percentB: 50,
      peakCount: 7,
      lastPeakTimeMin: 18.0,
      firstPeakTimeMin: 1.1,
      minResolutionExcludingFirst: 1.2,
      maxBackPressurePsi: 2000,
    });
    const dec = decideRetention([s], tableRules);
    expect(dec.status).toBe("efficiency");
    expect(dec.tableAction).toBe("Decrease PS (BP), then increase F to shorten the run");
    expect(dec.why).toContain("Row 11");
  });

  it("Row 12: Peaks = 7, tR > spec, Rs >= spec -> Increase F to shorten the run", () => {
    const s = sample({
      percentB: 50,
      peakCount: 7,
      lastPeakTimeMin: 18.0,
      firstPeakTimeMin: 1.1,
      minResolutionExcludingFirst: 1.6,
      maxBackPressurePsi: 2000,
    });
    const dec = decideRetention([s], tableRules);
    expect(dec.status).toBe("efficiency");
    expect(dec.tableAction).toBe("Increase F to shorten the run");
    expect(dec.why).toContain("Row 12");
  });
});


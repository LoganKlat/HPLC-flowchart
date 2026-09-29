import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateRun } from "@/lib/evaluate";
import { readLabFile, type LabFileRead } from "@/lib/lab-file";
import {
  carryForwardIndex,
  decideRetention,
  inBetweenPercentError,
  minimumPercentNote,
  refitMinimumPercent,
  roundTargetPercent,
  type RetentionRules,
  type RetentionSample,
} from "@/lib/retention";

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
    const expected = [60, 50, 40, 41];
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
    expect(again!.nextPercentB).toBe(41);
    expect(again!.m).toBeCloseTo(fit.m, 10);
    expect(again!.c).toBeCloseTo(fit.c, 10);
    expect(again!.rawPercentB).toBeCloseTo(fit.rawPercentB, 8);
    expect(again!.t0Average).toBeCloseTo(1.089, 3);
    const note = minimumPercentNote(again!, fit.specifiedTimeMin).join("\n");
    expect(note).toContain("t0 is the first peak’s retention time");
    expect(note).toContain("k = (last peak time − t0) / t0");
    expect(note).toContain("logK is the base-10 log of k");
    expect(note).toContain("logK = m × %B + c");
    expect(note).toContain("m =");
    expect(note).toContain("The t0 for that target is the average t0 of the runs in the line, 1.089 min");
    expect(note).toContain("logK = log10(k)");
    expect(note).toContain("%B = (that logK − c) / m");
    expect(note).toContain("The page recommends 41% B.");
    expect(note).not.toContain("middle t0");
    expect(note).not.toContain("half");
    expect(note).not.toContain("you set");
    expect(refitMinimumPercent(fit.catalog, [2], fit.specifiedTimeMin, fit.usedPercentB)).toBeNull();
    const withLeftOut = refitMinimumPercent(fit.catalog, [1, 2, 3, 4], fit.specifiedTimeMin, fit.usedPercentB);
    expect(withLeftOut).not.toBeNull();
    expect(decideRetention(samples, pathRules).nextPercentB).toBe(41);
  });

  it("uses the %B saved on the run, not the percent in the file name", () => {
    const decision = decideRetention([sampleFromRead(63, reads[0])], pathRules);
    expect(decision.move).toBe("drop-10");
    expect(decision.nextPercentB).toBe(53);
  });

  it("finishes after a run at the calculated %B even when peaks are still short", () => {
    const calculated = decideRetention(samples, pathRules);
    expect(calculated.nextPercentB).toBe(41);
    const followed = decideRetention(
      [
        ...samples,
        sample({
          percentB: 41,
          peakCount: 6,
          lastPeakTimeMin: 8.5,
          firstPeakTimeMin: 1.09,
          minResolutionExcludingFirst: 1,
          maxBackPressurePsi: 1400,
        }),
      ],
      pathRules,
    );
    expect(followed.status).toBe("look");
    expect(followed.reason).toBe("look");
    expect(followed.look?.mode).toBe("between-then-heat");
    expect(followed.nextPercentB).toBeNull();
    expect(followed.nextChange).toBe("Look at the runs.");
    expect(followed.nextChange).not.toContain("Carry forward");
    expect(followed.why).not.toContain("Carry forward");
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

  it("does not keep dropping 10 points when the peak count matches and resolution is still under", () => {
    expect(reads[1].minResolutionExcludingFirst!).toBeCloseTo(0.625, 3);
    expect(reads[2].minResolutionExcludingFirst!).toBeGreaterThan(reads[1].minResolutionExcludingFirst!);
    const decision = decideRetention(
      [sampleFromRead(60, reads[1]), sampleFromRead(50, reads[2])],
      { requiredPeaks: 6, lastPeakTimeMin: 10, minResolution: 2, maxBackPressurePsi: 2000 },
    );
    expect(decision.status).toBe("ask");
    expect(decision.move).not.toBe("drop-10");
    expect(decision.efficiencyNow?.question).toContain("bring the resolution up to the specification");
    const shown = decideRetention(
      [sampleFromRead(60, reads[1]), sampleFromRead(50, reads[2])],
      { requiredPeaks: 6, lastPeakTimeMin: 10, minResolution: 2, maxBackPressurePsi: 2000 },
      { declinedEfficiencyNow: true },
    );
    expect(shown.move).toBe("calculated");
    expect(shown.nextPercentB).not.toBeNull();
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
    expect(decision.efficiencyChoice?.continueLabel).toBe("Continue selectivity.");
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

  it("uses the calculated path, not a 10 point drop, when the last peak is exactly half the time", () => {
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
    expect(decision.move).toBe("drop-5");
    expect(decision.nextPercentB).toBe(65);
    expect(decision.why).not.toContain("66%");
    expect(decision.why).not.toContain("50%");
    expect(decision.why).not.toContain("half");
    expect(decision.why).not.toContain("you set");
    expect(decision.why).not.toContain("80%");
    expect(decision.nextChange).toContain("5 percentage points");
    expect(decision.nextChange.toLowerCase()).toContain("another run");
    expect(decision.nextChange).not.toContain("10 percentage points");
  });

  it("drops 10 points while the last peak is under half the time and switches once it reaches that line", () => {
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
      [sample({ percentB: 70, peakCount: 2, lastPeakTimeMin: 5, maxBackPressurePsi: 100 })],
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
        sample({ percentB: 40, peakCount: 3, lastPeakTimeMin: 5, firstPeakTimeMin: 1 }),
        sample({ percentB: 50, peakCount: 3, lastPeakTimeMin: 4, firstPeakTimeMin: 1 }),
        sample({ percentB: 60, peakCount: 3, lastPeakTimeMin: 3.5, firstPeakTimeMin: 1 }),
        sample({ percentB: 55, peakCount: 3, lastPeakTimeMin: 3.5, firstPeakTimeMin: 1 }),
      ],
      { requiredPeaks: 10, lastPeakTimeMin: 4, maxBackPressurePsi: 500 },
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
    const decision = decideRetention(
      [
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
          lastPeakTimeMin: 5,
        }),
        sample({
          percentB: 40,
          peakCount: 6,
          minResolutionExcludingFirst: 1.2,
          firstPeakTimeMin: 1.095,
          lastPeakTimeMin: 9,
        }),
      ],
      { requiredPeaks: 8, lastPeakTimeMin: 10, maxBackPressurePsi: 500 },
    );
    expect(decision.move).toBe("calculated");
    expect(decision.fit!.rows.map((row) => row.percentB)).toEqual([70, 60, 50, 40]);
    expect(decision.fit!.excluded.map((row) => row.percentB)).toEqual([90]);
    expect(decision.why).toContain("The Q-test left out Run 1 at 90% B (t0 peak 1.296 min).");
    expect(decision.why).toContain("The calculation uses Run 2 at 70% B");
    expect(decision.why).not.toContain("middle t0");
  });

  it("leaves out the 1.190 and 1.110 t0 peaks", () => {
    const decision = decideRetention(
      [
        sample({ percentB: 90, peakCount: 2, firstPeakTimeMin: 1.19, lastPeakTimeMin: 2 }),
        sample({ percentB: 80, peakCount: 2, firstPeakTimeMin: 1.11, lastPeakTimeMin: 3 }),
        sample({ percentB: 70, peakCount: 2, firstPeakTimeMin: 1.075, lastPeakTimeMin: 4 }),
        sample({ percentB: 60, peakCount: 2, firstPeakTimeMin: 1.064, lastPeakTimeMin: 5.5 }),
        sample({ percentB: 50, peakCount: 2, firstPeakTimeMin: 1.068, lastPeakTimeMin: 7 }),
        sample({ percentB: 40, peakCount: 2, firstPeakTimeMin: 1.08, lastPeakTimeMin: 9 }),
      ],
      { requiredPeaks: 8, lastPeakTimeMin: 10, maxBackPressurePsi: 500 },
    );
    expect(decision.move).toBe("calculated");
    expect(decision.fit!.rows.map((row) => row.t0)).toEqual([1.075, 1.064, 1.068, 1.08]);
    expect(decision.fit!.excluded.map((row) => row.percentB)).toEqual([90, 80]);
    expect(decision.why).toContain(
      "The Q-test left out Run 1 at 90% B (t0 peak 1.190 min) and Run 2 at 80% B (t0 peak 1.110 min).",
    );
    expect(decision.why).toContain(
      "The calculation uses Run 3 at 70% B, Run 4 at 60% B, Run 5 at 50% B, Run 6 at 40% B.",
    );
    expect(decision.why).not.toContain("middle t0");
    expect(decision.why).not.toContain("10% cutoff");
    expect(decision.why).not.toContain("95%");
  });

  it("says the t0 peaks passed the Q-test when none is an outlier", () => {
    const decision = decideRetention(
      [
        sample({ percentB: 80, peakCount: 2, firstPeakTimeMin: 1.064, lastPeakTimeMin: 7 }),
        sample({ percentB: 60, peakCount: 2, firstPeakTimeMin: 1.068, lastPeakTimeMin: 8 }),
        sample({ percentB: 40, peakCount: 2, firstPeakTimeMin: 1.076, lastPeakTimeMin: 9 }),
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
        sample({ percentB: 80, peakCount: 2, firstPeakTimeMin: 1, lastPeakTimeMin: 7 }),
        sample({ percentB: 60, peakCount: 2, firstPeakTimeMin: 1.01, lastPeakTimeMin: 8 }),
        sample({ percentB: 40, peakCount: 2, firstPeakTimeMin: 1.5, lastPeakTimeMin: 9 }),
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

  it("uses the real 37% and 40% times, and carries forward the 40% run", () => {
    expect(read37.lastPeakTimeMin).toBeCloseTo(1.602, 3);
    expect(read37.minResolutionExcludingFirst).toBeCloseTo(0, 3);
    expect(read40.lastPeakTimeMin).toBeCloseTo(11.593, 3);
    expect(read40.minResolutionExcludingFirst).toBeCloseTo(0.324, 3);
    expect(read40.lastPeakTimeMin!).toBeLessThanOrEqual(15);
    expect(read40.minResolutionExcludingFirst!).toBeGreaterThan(read37.minResolutionExcludingFirst!);

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

    const calculated = decideRetention(series, rules);
    expect(calculated.move).toBe("calculated");
    expect(calculated.nextPercentB).not.toBeNull();
    const followed = decideRetention(
      [...series, sampleFromRead(calculated.nextPercentB!, read37)],
      rules,
    );
    expect(followed.status).toBe("look");
    expect(followed.look?.mode).toBe("between-then-heat");
    expect(followed.look?.runs).toHaveLength(series.length + 1);
    expect(followed.nextChange).toBe("Look at the runs.");
    expect(followed.nextChange).not.toContain("Carry forward");
    expect(followed.why).not.toContain("Carry forward");
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

  it("does not carry forward a calculated run whose last peak is past the time", () => {
    const calculated = decideRetention(series, rules);
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
      rules,
    );
    expect(followed.status).toBe("efficiency");
    expect(followed.why).toContain("18.258");
    expect(followed.why).toContain("Efficiency is next to bring the last peak time to the specification.");
    expect(followed.why).not.toContain("Carry forward");
    expect(followed.nextChange).toContain("Move on to efficiency");
    expect(followed.efficiencyChoice?.continueLabel).toBe("Continue selectivity.");
    expect(followed.continueShowsLook).toBe(true);
    expect(followed.nextChange).not.toContain("40°C");
    const looked = decideRetention(
      [
        ...series,
        {
          ...sampleFromRead(calculated.nextPercentB!, read37),
          lastPeakTimeMin: 18.258,
          peakCount: 7,
          minResolutionExcludingFirst: 2,
        },
      ],
      rules,
      { continueToLook: true },
    );
    expect(looked.status).toBe("look");
    expect(looked.look?.mode).toBe("between-then-heat");
    expect(looked.nextChange).toBe("Look at the runs.");
    expect(looked.nextChange).not.toContain("40°C");
    expect(followed.nextChange).not.toContain("Carry forward");
    expect(followed.nextPercentB).toBeNull();
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
    expect(decision.why).toContain("You decide.");
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
        sample({ percentB: 55, peakCount: 8, lastPeakTimeMin: 12, minResolutionExcludingFirst: 0.4, firstPeakTimeMin: 1 }),
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
        sample({ percentB: 55, peakCount: 8, lastPeakTimeMin: 12, minResolutionExcludingFirst: 0.4, firstPeakTimeMin: 1 }),
      ],
      { requiredPeaks: 8, lastPeakTimeMin: 10, minResolution: 1, maxBackPressurePsi: 500 },
      { afterInBetween: true, continueToLook: true },
    );
    expect(looked.status).toBe("look");
    expect(looked.look?.mode).toBe("between-then-heat");
    expect(looked.nextChange).toBe("Look at the runs.");
  });
});

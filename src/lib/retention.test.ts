import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readLabFile, type LabFileRead } from "@/lib/lab-file";
import {
  decideRetention,
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
 * 0.66 × 10 min = 6.6 min, so 70, 60, and 50 are under that line and 40 is over it.
 */
const pathRules: RetentionRules = {
  requiredPeaks: 8,
  lastPeakTimeMin: 10,
  maxBackPressurePsi: 2000,
};

const reads = files.map((file) => readLabFile(readFileSync(path.join(fixtureDir, file.name))));

describe("retention fixtures can use one last-peak time", () => {
  it("keeps 70, 60, and 50 under 66% of 10 min, and 40 over it", () => {
    const times = reads.map((read) => read.lastPeakTimeMin);
    const counts = reads.map((read) => read.peakCount);
    const pressures = reads.map((read) => read.maxBackPressurePsi);
    expect(times.map((time) => time?.toFixed(3))).toEqual(["1.952", "2.779", "4.918", "11.593"]);
    expect(counts).toEqual([6, 6, 6, 7]);
    for (const time of times) {
      expect(time).not.toBeNull();
    }
    expect(times[0]!).toBeLessThan(6.6);
    expect(times[1]!).toBeLessThan(6.6);
    expect(times[2]!).toBeLessThan(6.6);
    expect(times[3]!).toBeGreaterThan(6.6);
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
    expect(decision.why).toContain("m =");
    expect(decision.why).toContain("c =");
    expect(decision.why).toContain("66%");
    expect(decision.why).not.toContain("80%");
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
    expect(followed.status).toBe("finished");
    expect(followed.reason).toBe("finished-calculated");
    expect(followed.nextPercentB).toBeNull();
    expect(followed.nextChange).toMatch(/Retention is finished/);
    expect(followed.why).toMatch(/6 peaks/);
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

  it("does not finish just because the peak count is already met", () => {
    expect(reads[0].peakCount).toBeGreaterThanOrEqual(6);
    const decision = decideRetention([sampleFromRead(70, reads[0])], {
      requiredPeaks: 6,
      lastPeakTimeMin: 10,
      maxBackPressurePsi: 2000,
    });
    expect(decision.status).toBe("recommend");
    expect(decision.move).toBe("drop-10");
    expect(decision.nextPercentB).toBe(60);
  });

  it("still recommends a %B when peaks are met, resolution rose, and the last peak is under the time", () => {
    expect(reads[1].minResolutionExcludingFirst!).toBeCloseTo(0.625, 3);
    expect(reads[2].minResolutionExcludingFirst!).toBeGreaterThan(reads[1].minResolutionExcludingFirst!);
    expect(reads[1].peakCount).toBeGreaterThanOrEqual(6);
    expect(reads[2].peakCount).toBeGreaterThanOrEqual(6);
    const decision = decideRetention(
      [sampleFromRead(60, reads[1]), sampleFromRead(50, reads[2])],
      { requiredPeaks: 6, lastPeakTimeMin: 10, maxBackPressurePsi: 2000 },
    );
    expect(decision.status).toBe("recommend");
    expect(decision.nextPercentB).toBe(40);
    expect(decision.move).toBe("drop-10");
    expect(decision.why.toLowerCase()).toContain("higher");
  });

  it("stops when the peak count is met and resolution did not rise", () => {
    expect(reads[1].minResolutionExcludingFirst!).toBeLessThan(reads[0].minResolutionExcludingFirst!);
    const decision = decideRetention(
      [sampleFromRead(70, reads[0]), sampleFromRead(60, reads[1])],
      { requiredPeaks: 6, lastPeakTimeMin: 10, maxBackPressurePsi: 2000 },
    );
    expect(decision.status).toBe("finished");
    expect(decision.reason).toBe("finished-peaks-resolution");
    expect(decision.nextPercentB).toBeNull();
    expect(decision.nextChange).toMatch(/Retention is finished/);
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
    expect(decision.reason).toBe("finished-peaks-time");
    expect(decision.nextPercentB).toBeNull();
    expect(decision.nextChange).toMatch(/Do not lower %B/);
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
    expect(continued.status).toBe("recommend");
    expect(continued.nextPercentB).toBe(50);

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
    expect(stopped.reason).toBe("finished-peaks-resolution");
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

  it("uses the calculated path, not a 10 point drop, when the last peak is exactly 66% of the time", () => {
    const spec = 10;
    const decision = decideRetention(
      [
        sample({
          percentB: 70,
          peakCount: 2,
          lastPeakTimeMin: 0.66 * spec,
          maxBackPressurePsi: 100,
        }),
      ],
      { requiredPeaks: 8, lastPeakTimeMin: spec, maxBackPressurePsi: 500 },
    );
    expect(decision.move).toBe("drop-5");
    expect(decision.nextPercentB).toBe(65);
    expect(decision.why).toContain("66%");
    expect(decision.why).not.toContain("80%");
    expect(decision.nextChange).toContain("5 percentage points");
    expect(decision.nextChange.toLowerCase()).toContain("another run");
    expect(decision.nextChange).not.toContain("10 percentage points");
  });

  it("drops 10 points under 66% of the time and switches once the last peak reaches that line", () => {
    const rules: RetentionRules = {
      requiredPeaks: 8,
      lastPeakTimeMin: 10,
      maxBackPressurePsi: 500,
    };
    const under = decideRetention(
      [sample({ percentB: 70, peakCount: 2, lastPeakTimeMin: 6.5, maxBackPressurePsi: 100 })],
      rules,
    );
    expect(under.move).toBe("drop-10");
    expect(under.nextPercentB).toBe(60);
    expect(under.why).toContain("66%");

    const over = decideRetention(
      [sample({ percentB: 70, peakCount: 2, lastPeakTimeMin: 7, maxBackPressurePsi: 100 })],
      rules,
    );
    expect(over.move).toBe("drop-5");
    expect(over.nextPercentB).toBe(65);
    expect(over.why).not.toContain("minus 10");
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

function sampleFromRead(percentB: number, read: LabFileRead): RetentionSample {
  return {
    percentB,
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

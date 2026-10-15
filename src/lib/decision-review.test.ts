import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  decisionChangeLines,
  detailsForRun,
  emptyRun,
  explainRun,
  isBlankRun,
  pickRest,
  runTabLabel,
  syncNextRun,
  type RunState,
} from "@/components/hplc-app";
import { nextRunLockedForSolvent, retentionChangeLabel, selectivityChangeLabel } from "@/lib/change-label";
import { DECISION_EXAMPLE_FILES } from "@/lib/decision-example";
import { readLabFile } from "@/lib/lab-file";
import { type RuleNumbers } from "@/lib/evaluate";
import { detailsFromFileName, parseRunFileName } from "@/lib/filename-details";
import {
  decideRetention,
  findBackwardsRetention,
  inBetweenPercentError,
  refitMinimumPercent,
  type RetentionRules,
  type RetentionSample,
} from "@/lib/retention";
import { emptyRunDetails } from "@/lib/run-details";
import {
  coatingSegmentStart,
  isRunInSelectivity,
  planHistory,
  type SelectivityRun,
  type SelectivitySetup,
} from "@/lib/selectivity";

const downloadDir = "C:/Users/LoganKlat/Downloads/drive-download-20261012T003726Z-1-001";
const hasDownloadDir = fs.existsSync(downloadDir);

// The 10 unique runs from the drive-download dataset in chronological sequence
const DRIVE_RUNS: Array<{
  name: string;
  percentB: number;
  temperatureC: number | null;
  solvent: string;
  ligand: string;
  peakCount: number;
  firstPeakTimeMin: number;
  lastPeakTimeMin: number;
  minResolutionExcludingFirst: number;
  maxBackPressurePsi: number;
}> = [
  {
    name: "GR09-05-3-ACN-3-ISO-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
    percentB: 90,
    temperatureC: null,
    solvent: "ACN",
    ligand: "C18aq",
    peakCount: 3,
    firstPeakTimeMin: 1.19,
    lastPeakTimeMin: 2.01,
    minResolutionExcludingFirst: 0.369,
    maxBackPressurePsi: 1221.82,
  },
  {
    name: "GR09-06-3-ACN-3-ISO-80-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
    percentB: 80,
    temperatureC: null,
    solvent: "ACN",
    ligand: "C18aq",
    peakCount: 3,
    firstPeakTimeMin: 1.11,
    lastPeakTimeMin: 1.687,
    minResolutionExcludingFirst: 1.093,
    maxBackPressurePsi: 1398.15,
  },
  {
    name: "GR09-07-3-ACN-3-ISO-70-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
    percentB: 70,
    temperatureC: null,
    solvent: "ACN",
    ligand: "C18aq",
    peakCount: 4,
    firstPeakTimeMin: 1.075,
    lastPeakTimeMin: 1.916,
    minResolutionExcludingFirst: 0.841,
    maxBackPressurePsi: 1644.21,
  },
  {
    name: "GR09-08-3-ACN-3-ISO-60-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
    percentB: 60,
    temperatureC: null,
    solvent: "ACN",
    ligand: "C18aq",
    peakCount: 5,
    firstPeakTimeMin: 1.064,
    lastPeakTimeMin: 2.795,
    minResolutionExcludingFirst: 1.773,
    maxBackPressurePsi: 1904.5,
  },
  {
    name: "GR09-09-3-ACN-3-ISO-50-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
    percentB: 50,
    temperatureC: null,
    solvent: "ACN",
    ligand: "C18aq",
    peakCount: 4,
    firstPeakTimeMin: 1.068,
    lastPeakTimeMin: 4.986,
    minResolutionExcludingFirst: 3.236,
    maxBackPressurePsi: 2127.81,
  },
  {
    name: "GR09-10-3-ACN-3-ISO-40-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
    percentB: 40,
    temperatureC: null,
    solvent: "ACN",
    ligand: "C18aq",
    peakCount: 6,
    firstPeakTimeMin: 1.08,
    lastPeakTimeMin: 11.633,
    minResolutionExcludingFirst: 1.107,
    maxBackPressurePsi: 2285.68,
  },
  {
    name: "GR09-14-4-ACN-3-ISO-35-1.5-20u-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
    percentB: 35,
    temperatureC: null,
    solvent: "ACN",
    ligand: "C18aq",
    peakCount: 7,
    firstPeakTimeMin: 1.134,
    lastPeakTimeMin: 19.854,
    minResolutionExcludingFirst: 1.453,
    maxBackPressurePsi: 1180.53,
  },
  {
    name: "GR09-15-4-ACN-3-ISO-35-1.5-20u-CP-0.1-C18aqP-150x4.6x5-T40-254.xlsx",
    percentB: 35,
    temperatureC: 40,
    solvent: "ACN",
    ligand: "C18aq",
    peakCount: 7,
    firstPeakTimeMin: 1.13,
    lastPeakTimeMin: 16.536,
    minResolutionExcludingFirst: 0.951,
    maxBackPressurePsi: 953.03,
  },
  {
    name: "GR09-16-4-ACN-3-ISO-35-1.5-20u-CP-0.1-C18aqP-150x4.6x5-T60-254.xlsx",
    percentB: 35,
    temperatureC: 60,
    solvent: "ACN",
    ligand: "C18aq",
    peakCount: 6,
    firstPeakTimeMin: 1.12,
    lastPeakTimeMin: 12.806,
    minResolutionExcludingFirst: 2.05,
    maxBackPressurePsi: 741.0,
  },
  {
    name: "GR11-16-6-MeOH-3-ISO-50-1.5-20u-CP-0.1-BiPH-150x4.6x5-amb-254.xlsx",
    percentB: 50,
    temperatureC: null,
    solvent: "MeOH",
    ligand: "biphenyl",
    peakCount: 3,
    firstPeakTimeMin: 1.232,
    lastPeakTimeMin: 23.132,
    minResolutionExcludingFirst: 2.893,
    maxBackPressurePsi: 2765.0,
  },
];

function toSample(r: (typeof DRIVE_RUNS)[number]): RetentionSample {
  return {
    percentB: r.percentB,
    peakCount: r.peakCount,
    firstPeakTimeMin: r.firstPeakTimeMin,
    lastPeakTimeMin: r.lastPeakTimeMin,
    minResolutionExcludingFirst: r.minResolutionExcludingFirst,
    maxBackPressurePsi: r.maxBackPressurePsi,
    peaks: Array.from({ length: r.peakCount }, (_, idx) => ({
      timeMin: idx === 0 ? r.firstPeakTimeMin : idx === r.peakCount - 1 ? r.lastPeakTimeMin : 2 + idx,
      area: 1000,
      height: 500,
    })),
  };
}

function toSelectRun(r: (typeof DRIVE_RUNS)[number]): SelectivityRun {
  return {
    percentB: r.percentB,
    temperatureC: r.temperatureC,
    solvent: r.solvent,
    ligand: r.ligand,
    peakCount: r.peakCount,
    firstPeakTimeMin: r.firstPeakTimeMin,
    lastPeakTimeMin: r.lastPeakTimeMin,
    minResolutionExcludingFirst: r.minResolutionExcludingFirst,
    maxBackPressurePsi: r.maxBackPressurePsi,
  };
}

describe("Decision engine multi-rule & user-input verification on GR09/GR11 dataset", () => {
  it("parses all 26 files in the drive-download folder including (1)/(2) suffixes and BiPH ligand", () => {
    const names = [
      ...DRIVE_RUNS.map((r) => r.name),
      "GR09-06-3-ACN-3-ISO-80-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254(1).xlsx",
      "GR09-10-3-ACN-3-ISO-40-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254(1).xlsx",
      "GR09-15-4-ACN-3-ISO-35-1.5-20u-CP-0.1-C18aqP-150x4.6x5-T40-254(1).xlsx",
      "GR09-16-4-ACN-3-ISO-35-1.5-20u-CP-0.1-C18aqP-150x4.6x5-T60-254(1).xlsx",
      "GR11-16-6-MeOH-3-ISO-50-1.5-20u-CP-0.1-BiPH-150x4.6x5-amb-254(1).xlsx",
      "GR11-16-6-MeOH-3-ISO-50-1.5-20u-CP-0.1-BiPH-150x4.6x5-amb-254(2).xlsx",
    ];
    for (const name of names) {
      const parsed = parseRunFileName(name);
      expect(parsed.ok, `Expected ${name} to parse`).toBe(true);
      if (parsed.ok) {
        expect(parsed.fields.ligand).toBeTruthy();
        expect(parsed.fields.solvent).toBeTruthy();
        expect(parsed.fields.percentB).toBeTruthy();
      }
    }

    if (hasDownloadDir) {
      for (const file of fs.readdirSync(downloadDir)) {
        const parsed = parseRunFileName(file);
        expect(parsed.ok, `Expected ${file} to parse`).toBe(true);
        if (file.endsWith(".csv")) {
          const read = readLabFile(fs.readFileSync(path.join(downloadDir, file)));
          expect(read.peakCount).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("evaluates Runs 1-10 logically under Standard rules (7 peaks, 15 min, Rs 1.5, 4000 psi)", () => {
    const rules: RetentionRules = {
      requiredPeaks: 7,
      lastPeakTimeMin: 15,
      minResolution: 1.5,
      maxBackPressurePsi: 4000,
    };
    const setup: SelectivitySetup = {
      ...rules,
      minResolution: 1.5,
      ambientTemperatureC: null,
      originalSolvent: "ACN",
      originalLigand: "C18aq",
    };

    const samples = DRIVE_RUNS.map(toSample);
    const selectRuns = DRIVE_RUNS.map(toSelectRun);

    // Run 1 (90% B): drop-10 -> 80% B
    const d1 = decideRetention(samples.slice(0, 1), rules);
    expect(d1.move).toBe("drop-10");
    expect(d1.nextPercentB).toBe(80);

    // Run 2 (80% B): backwards retention detected (2.010 min at 90% B > 1.687 min at 80% B),
    // and when "Continue steps" is chosen, drops 10% to 70% B
    const bw = findBackwardsRetention([
      { percentB: 90, lastPeakTimeMin: 2.01, temperatureC: "ambient", solvent: "ACN", ligand: "C18aq" },
      { percentB: 80, lastPeakTimeMin: 1.687, temperatureC: "ambient", solvent: "ACN", ligand: "C18aq" },
    ]);
    expect(bw).not.toBeNull();
    const d2 = decideRetention(samples.slice(0, 2), rules);
    expect(d2.move).toBe("drop-10");
    expect(d2.nextPercentB).toBe(70);

    // Runs 3, 4, 5 (70%, 60%, 50% B): drop-10 down to 40% B
    expect(decideRetention(samples.slice(0, 3), rules).nextPercentB).toBe(60);
    expect(decideRetention(samples.slice(0, 4), rules).nextPercentB).toBe(50);
    expect(decideRetention(samples.slice(0, 5), rules).nextPercentB).toBe(40);

    // Run 6 (40% B, lastPeak = 11.633 min > 0.5 * 15 = 7.5 min): calculates minimum %B = 36% B (raw ~35.69% B, so 35% B is also accepted as floor)
    // Q-test leaves out Run 1 (90% B, t0=1.190) and Run 2 (80% B, t0=1.110)
    const d6 = decideRetention(samples.slice(0, 6), rules);
    expect(d6.move).toBe("calculated");
    expect(d6.nextPercentB).toBe(36);
    expect(Math.floor(d6.fit?.rawPercentB ?? 0)).toBe(35);
    expect(d6.fit?.excluded.map((e) => e.percentB)).toEqual([90, 80]);

    // Run 7 (35% B amb, 7 peaks, Rs 1.453 < 1.5, lastPeak 19.854 > 15):
    // Pauses for efficiency with all 3 user choices:
    // 1) Move on to efficiency (Recommended)
    // 2) Move on to selectivity -> Look at the runs (between-then-heat)
    // 3) Stay in retention -> choose-percent (Select a %B of your choosing)
    const d7 = decideRetention(samples.slice(0, 7), rules);
    expect(d7.status).toBe("efficiency");
    expect(d7.continueShowsLook).toBe(true);
    expect(retentionChangeLabel(d7)).toBe("Move on to efficiency");

    const d7Look = decideRetention(samples.slice(0, 7), rules, { continueToLook: true });
    expect(d7Look.status).toBe("look");
    expect(d7Look.look?.mode).toBe("between-then-heat");

    const d7StayRetention = decideRetention(samples.slice(0, 7), rules, { continueRetention: true });
    expect(d7StayRetention.status).toBe("recommend");
    expect(d7StayRetention.reason).toBe("choose-percent");
    expect(d7StayRetention.pickOwnPercent).toBe(true);
    expect(inBetweenPercentError("35", [90, 80, 70, 60, 50, 40, 35])).toContain("already uploaded");
    expect(inBetweenPercentError("38", [90, 80, 70, 60, 50, 40, 35])).toBeNull();

    // Run 8 (35% B 40°C, 7 peaks, Rs 0.951 < 1.5, lastPeak 16.536 > 15):
    // In Selectivity: single-run check pauses on efficiency ("Move on to efficiency" / "Stay in selectivity"),
    // and when "Stay in selectivity" (continuePastEfficiency: true) is chosen, recommends 60°C at 35% B
    expect(isRunInSelectivity(selectRuns.slice(0, 8))).toBe(true);
    const d8Single = decideRetention([samples[7]], rules);
    expect(d8Single.status).toBe("efficiency");
    const h8Continued = planHistory(selectRuns.slice(0, 8), setup, { continuePastEfficiency: true });
    expect(h8Continued.phase).toBe("selectivity");
    if (h8Continued.phase === "selectivity") {
      expect(h8Continued.plan.step).toBe("solvent");
      expect(selectivityChangeLabel(h8Continued.plan)).toBe("Change solvent, back at ambient");
    }

    // Run 9 (35% B 60°C, 6 peaks < 7): recommends changing solvent back at ambient
    const h9 = planHistory(selectRuns.slice(0, 9), setup);
    expect(h9.phase).toBe("selectivity");
    if (h9.phase === "selectivity") {
      expect(h9.plan.step).toBe("solvent");
      expect(selectivityChangeLabel(h9.plan)).toBe("Change solvent, back at ambient");
      // Cannot advance with old solvent ACN; unlocks with MeOH
      expect(nextRunLockedForSolvent(h9.plan, { solvent: "ACN", percentB: "35" })).toBe(true);
      expect(nextRunLockedForSolvent(h9.plan, { solvent: "MeOH", percentB: "50.3" })).toBe(false);
    }

    // Run 10 (50% B MeOH amb BiPH, 3 peaks): treated as second-solvent selectivity step, NOT a coating restart!
    expect(coatingSegmentStart(selectRuns)).toBe(0);
    expect(isRunInSelectivity(selectRuns)).toBe(true);
    const h10 = planHistory(selectRuns, setup);
    expect(h10.phase).toBe("selectivity");
    if (h10.phase === "selectivity") {
      expect(h10.plan.step).toBe("temp-40");
      expect(h10.plan.prefill).toMatchObject({
        percentB: "50",
        temperature: "40",
        solvent: "MeOH",
        ligand: "biphenyl",
      });
    }
  });

  it("handles relaxed specs (specs-met on Run 7 or Run 8), fewer required peaks (investigate), and stricter pressure", () => {
    const samples = DRIVE_RUNS.map(toSample);
    const selectRuns = DRIVE_RUNS.map(toSelectRun);

    // 1. Relaxed specs where Run 7 (35% B amb: 7p, 19.854 min, Rs 1.453) meets ALL specifications
    const relaxed7: RetentionRules = {
      requiredPeaks: 7,
      lastPeakTimeMin: 20,
      minResolution: 1.4,
      maxBackPressurePsi: 4000,
    };
    const d7Met = decideRetention(samples.slice(0, 7), relaxed7);
    expect(d7Met.status).toBe("specs-met");
    expect(d7Met.nextChange).toBe("The specifications are met.");

    // 2. Specs where Run 8 (35% B 40°C: 7p, 16.536 min, Rs 0.951) meets ALL specifications
    const relaxed8: RetentionRules = {
      requiredPeaks: 7,
      lastPeakTimeMin: 17,
      minResolution: 0.9,
      maxBackPressurePsi: 4000,
    };
    const d8Met = decideRetention([samples[7]], relaxed8);
    expect(d8Met.status).toBe("specs-met");
    expect(d8Met.nextChange).toBe("The specifications are met.");

    // 3. Fewer required peaks (6 peaks): Run 6 (40% B, 6 peaks, 11.633 min, Rs 1.107) meets all specs under Rs 1.0,
    //    and Runs 7 & 8 (7 peaks > 6) stop on investigate!
    const sixPeakRules: RetentionRules = {
      requiredPeaks: 6,
      lastPeakTimeMin: 15,
      minResolution: 1.0,
      maxBackPressurePsi: 4000,
    };
    expect(decideRetention(samples.slice(0, 6), sixPeakRules).status).toBe("specs-met");
    expect(decideRetention([samples[6]], sixPeakRules).status).toBe("investigate");
    expect(decideRetention([samples[7]], sixPeakRules).status).toBe("investigate");

    // 4. Stricter back-pressure (2000 psi):
    //    - In Retention: Run 5 (50% B, BP 2127.8 psi) blocks lowering %B ("Do not lower %B")
    //    - In Selectivity: Run 10 (50% B MeOH amb, BP 2765.0 psi) still recommends heating to 40°C
    //      (which lowers viscosity/pressure) rather than saying "Do not lower %B"!
    const strictBPSetup: SelectivitySetup = {
      requiredPeaks: 7,
      lastPeakTimeMin: 15,
      minResolution: 1.5,
      maxBackPressurePsi: 2000,
      ambientTemperatureC: null,
      originalSolvent: "ACN",
      originalLigand: "C18aq",
    };
    const d5Strict = decideRetention(samples.slice(0, 5), strictBPSetup);
    expect(d5Strict.status).toBe("blocked");
    expect(d5Strict.reason).toBe("pressure");

    const h10Strict = planHistory(selectRuns, strictBPSetup);
    expect(h10Strict.phase).toBe("selectivity");
    if (h10Strict.phase === "selectivity") {
      expect(h10Strict.plan.step).toBe("temp-40");
      expect(h10Strict.plan.why).not.toContain("Do not lower %B");
    }
  });

  it("identifies blank runs (BLK), fills all fields, recommends the last decision point, and makes blank runs optional", () => {
    const checks = {
      requiredPeaks: 7,
      lastPeakTimeMin: 15,
      minResolution: 1.5,
      maxBackPressurePsi: 4000,
    };

    const fallbackCsv = fs.readFileSync(path.join(process.cwd(), "fixtures/synthetic-lab.csv"));
    const makeReadyRun = (fileName: string, csvPath?: string): RunState => {
      const parsed = detailsFromFileName(emptyRunDetails(), fileName);
      if (!parsed.ok) throw new Error(`Failed to parse ${fileName}`);
      const d = parsed.details;
      const read = readLabFile(csvPath && fs.existsSync(csvPath) ? fs.readFileSync(csvPath) : fallbackCsv);
      return {
        ...emptyRun(),
        status: "ready",
        fileName,
        percentB: d.percentB,
        temperature: d.temperature,
        solvent: d.solvent,
        ligand: d.ligand,
        rest: pickRest(d),
        read,
      };
    };

    const blk03Name = "GR41-03-5-ACN-3-ISO-90-1.5-20u-BLK-0.0-BiphP-150x4.6x5-amb-254_1_.csv";
    const blk10Name = "GR41-10-6-ACN-3-ISO-37-1.5-20u-BLK-0.0-BIPP-150x4.6x5-amb-254.csv";
    const blk10DupName = "GR41-10-6-ACN-3-ISO-37-1.5-20u-BLK-0.0-BIPP-150x4.6x5-amb-254(1).csv";

    const blk03Run = makeReadyRun(blk03Name, `C:/Users/LoganKlat/Downloads/${blk03Name}`);
    const blk10Run = makeReadyRun(blk10Name, `C:/Users/LoganKlat/Downloads/${blk10Name}`);
    const blk10DupRun = makeReadyRun(blk10DupName, `C:/Users/LoganKlat/Downloads/${blk10DupName}`);

    // 1. Blank run uploaded as Run 1 (before any CP run)
    const detailsFromBlk03 = detailsFromFileName(emptyRunDetails(), blk03Name);
    expect(detailsFromBlk03.ok).toBe(true);
    if (!detailsFromBlk03.ok) return;
    const runsOnlyBlk: RunState[] = [blk03Run];
    expect(isBlankRun(0, runsOnlyBlk, detailsFromBlk03.details)).toBe(true);
    expect(
      runTabLabel(0, runsOnlyBlk, detailsFromBlk03.details, checks, {
        choice: {},
        heat: null,
        continued: {},
      }),
    ).toBe("Run 1: Blank (90% B)");

    const expBlk03 = explainRun(runsOnlyBlk, 0, detailsFromBlk03.details, checks, {
      choice: {},
      heat: null,
    });
    expect(expBlk03?.kind).toBe("retention");
    if (expBlk03?.kind === "retention") {
      expect(expBlk03.decision.nextPercentB).toBe(90);
      expect(expBlk03.decision.why).toContain("blank run");
    }

    const syncedAfterBlk03 = syncNextRun(runsOnlyBlk, detailsFromBlk03.details, checks, {
      leftSelectivity: false,
      choice: {},
      heat: null,
      continuePastEfficiency: false,
      linePercent: null,
      pickedPercent: null,
    });
    expect(syncedAfterBlk03).toHaveLength(2);
    expect(syncedAfterBlk03[1].percentB).toBe("90");
    const run2Details = detailsForRun(1, syncedAfterBlk03, detailsFromBlk03.details);
    expect(run2Details.sampleType).toBe("CP");
    expect(run2Details.sampleConcentration).toBe("0.1");
    expect(run2Details.coreShell).toBe("no");
    expect(run2Details.poreSize).toBe("140");
    expect(run2Details.carbonLoad).toBe("11");

    // 2. Compare GR41 sequence WITHOUT blank runs vs WITH blank runs (GR41-03 at start, GR41-10 & GR41-10(1) before GR41-11)
    const gr41Names = DECISION_EXAMPLE_FILES.slice(12); // GR41-04, 06, 07, 08, 09, 11 (6 CP runs)
    const gr41CpRuns: RunState[] = gr41Names.map((fileName) => {
      const filePath = path.join(process.cwd(), "public/decision-example", fileName);
      const parsed = detailsFromFileName(emptyRunDetails(), fileName);
      if (!parsed.ok) throw new Error(`Failed to parse ${fileName}`);
      return {
        ...emptyRun(),
        status: "ready",
        fileName,
        percentB: parsed.details.percentB,
        temperature: parsed.details.temperature,
        solvent: parsed.details.solvent,
        ligand: parsed.details.ligand,
        rest: pickRest(parsed.details),
        read: readLabFile(fs.readFileSync(filePath)),
      };
    });

    const cpBaseDetails = detailsFromFileName(emptyRunDetails(), gr41Names[0]);
    if (!cpBaseDetails.ok) throw new Error("Failed to parse first CP run");

    // Decision at GR41-09 (40% B CP, index 4 in gr41CpRuns) with continueRetention: true -> recommends 36% B
    const expAt40NoBlanks = explainRun(gr41CpRuns.slice(0, 5), 4, cpBaseDetails.details, checks, {
      choice: { continueRetention: true },
      heat: null,
    });
    expect(expAt40NoBlanks?.kind).toBe("retention");
    if (expAt40NoBlanks?.kind === "retention") {
      expect(expAt40NoBlanks.decision.nextPercentB).toBe(36);
    }

    // Now insert GR41-03 (blank at 90% B) at start and GR41-10 + GR41-10(1) (blanks at 37% B) after GR41-09
    const runsWithBlanks: RunState[] = [
      blk03Run,
      ...gr41CpRuns.slice(0, 5),
      blk10Run,
      blk10DupRun,
      gr41CpRuns[5], // GR41-11 (37% B CP)
    ];

    // Check labels and explanations on the two 37% B blank runs (indices 6 and 7)
    for (const blkIdx of [6, 7]) {
      expect(isBlankRun(blkIdx, runsWithBlanks, detailsFromBlk03.details)).toBe(true);
      expect(
        runTabLabel(blkIdx, runsWithBlanks, detailsFromBlk03.details, checks, {
          choice: {},
          heat: null,
          continued: {},
        }),
      ).toBe(`Run ${blkIdx + 1}: Blank (37% B)`);
      expect(decisionChangeLines(blkIdx, runsWithBlanks, detailsFromBlk03.details)[0]).toBe(
        "Blank run (preparation for the next run).",
      );

      // Default choice on blank run repeats GR41-09's decision (Row 7: 40% B at 40°C)
      const expBlankDefault = explainRun(
        runsWithBlanks.slice(0, blkIdx + 1),
        blkIdx,
        detailsFromBlk03.details,
        checks,
        { choice: {}, heat: null },
      );
      expect(expBlankDefault?.kind).toBe("retention");
      if (expBlankDefault?.kind === "retention") {
        expect(expBlankDefault.decision.status).toBe("recommend");
        expect(expBlankDefault.decision.nextPercentB).toBe(40);
        expect(expBlankDefault.decision.nextTemperature).toBe("40");
        expect(expBlankDefault.decision.why).toContain("Repeating the last decision point from Run 6");
      }

      // With continueRetention: true on blank run, repeats GR41-09's 36% B recommendation
      const expBlankCont = explainRun(
        runsWithBlanks.slice(0, blkIdx + 1),
        blkIdx,
        detailsFromBlk03.details,
        checks,
        { choice: { continueRetention: true }, heat: null },
      );
      expect(expBlankCont?.kind).toBe("retention");
      if (expBlankCont?.kind === "retention") {
        expect(expBlankCont.decision.nextPercentB).toBe(36);
        expect(expBlankCont.decision.why).toContain("Repeating the last decision point from Run 6");
      }
    }

    // Check that GR41-11 (37% B CP) after the blanks produces the exact same decision as without blanks!
    const expAt37NoBlanks = explainRun(gr41CpRuns, 5, cpBaseDetails.details, checks, {
      choice: { continueRetention: true },
      heat: null,
    });
    const expAt37WithBlanks = explainRun(runsWithBlanks, 8, detailsFromBlk03.details, checks, {
      choice: { continueRetention: true },
      heat: null,
    });
    expect(expAt37NoBlanks?.kind).toBe("retention");
    expect(expAt37WithBlanks?.kind).toBe("retention");
    if (expAt37NoBlanks?.kind === "retention" && expAt37WithBlanks?.kind === "retention") {
      expect(expAt37WithBlanks.decision.nextPercentB).toBe(expAt37NoBlanks.decision.nextPercentB);
      expect(expAt37WithBlanks.decision.reason).toBe(expAt37NoBlanks.decision.reason);
    }
  });

  it("handles uploading 40°C or 60°C selectivity files directly into Run 1 (R01) and live spec changes on a single ambient run", () => {
    const checks: RuleNumbers = {
      requiredPeaks: 7,
      lastPeakTimeMin: 15,
      minResolution: 1.5,
      maxBackPressurePsi: 4000,
    };

    // 1. Upload 40°C run (GR09-05 40°C at 35% B, index 7) directly into Run 1
    const file40Name = DECISION_EXAMPLE_FILES[7];
    const file40Path = path.join(process.cwd(), "public/decision-example", file40Name);
    const parsed40 = detailsFromFileName(emptyRunDetails(), file40Name);
    expect(parsed40.ok).toBe(true);
    if (!parsed40.ok) return;

    const run40: RunState = {
      ...emptyRun(),
      status: "ready",
      fileName: file40Name,
      percentB: parsed40.details.percentB,
      temperature: parsed40.details.temperature,
      solvent: parsed40.details.solvent,
      ligand: parsed40.details.ligand,
      rest: pickRest(parsed40.details),
      read: readLabFile(fs.readFileSync(file40Path)),
    };

    const exp40 = explainRun([run40], 0, parsed40.details, checks, {
      choice: {},
      heat: null,
    });
    expect(exp40?.kind).toBe("selectivity");
    if (exp40?.kind === "selectivity") {
      expect(exp40.plan.step).toBe("temp-60");
      expect(exp40.plan.prefill).toMatchObject({ percentB: "35", temperature: "60", solvent: "ACN" });
      expect(exp40.plan.why).toContain("Run 1 is a 40°C selectivity run at 35% B");
    }

    const synced40 = syncNextRun([run40], parsed40.details, checks, {
      leftSelectivity: false,
      choice: {},
      heat: null,
      continuePastEfficiency: false,
      linePercent: null,
      pickedPercent: null,
    });
    expect(synced40).toHaveLength(2);
    expect(synced40[1].temperature).toBe("60");
    expect(synced40[1].percentB).toBe("35");

    // 2. Upload 60°C run (GR09-05 60°C at 35% B, index 8) directly into Run 1
    const file60Name = DECISION_EXAMPLE_FILES[8];
    const file60Path = path.join(process.cwd(), "public/decision-example", file60Name);
    const parsed60 = detailsFromFileName(emptyRunDetails(), file60Name);
    expect(parsed60.ok).toBe(true);
    if (!parsed60.ok) return;

    const run60: RunState = {
      ...emptyRun(),
      status: "ready",
      fileName: file60Name,
      percentB: parsed60.details.percentB,
      temperature: parsed60.details.temperature,
      solvent: parsed60.details.solvent,
      ligand: parsed60.details.ligand,
      rest: pickRest(parsed60.details),
      read: readLabFile(fs.readFileSync(file60Path)),
    };

    const exp60 = explainRun([run60], 0, parsed60.details, checks, {
      choice: {},
      heat: null,
    });
    expect(exp60?.kind).toBe("selectivity");
    if (exp60?.kind === "selectivity") {
      expect(exp60.plan.step).toBe("solvent");
      expect(selectivityChangeLabel(exp60.plan)).toBe("Change solvent, back at ambient");
      expect(exp60.plan.prefill?.temperature).toBe("ambient");
    }

    const synced60 = syncNextRun([run60], parsed60.details, checks, {
      leftSelectivity: false,
      choice: {},
      heat: null,
      continuePastEfficiency: false,
      linePercent: null,
      pickedPercent: null,
    });
    expect(synced60).toHaveLength(2);
    expect(synced60[1].temperature).toBe("ambient");

    // 3. Upload ambient 40% B run (GR09-10, tR = 11.633 min, 6 peaks) into Run 1 and test live spec changes
    const fileAmb40Name = DECISION_EXAMPLE_FILES[5]; // GR09-10 (40% B, amb, 6 peaks, tR 11.633 min)
    const fileAmb40Path = path.join(process.cwd(), "public/decision-example", fileAmb40Name);
    const parsedAmb40 = detailsFromFileName(emptyRunDetails(), fileAmb40Name);
    expect(parsedAmb40.ok).toBe(true);
    if (!parsedAmb40.ok) return;

    const runAmb40: RunState = {
      ...emptyRun(),
      status: "ready",
      fileName: fileAmb40Name,
      percentB: parsedAmb40.details.percentB,
      temperature: parsedAmb40.details.temperature,
      solvent: parsedAmb40.details.solvent,
      ligand: parsedAmb40.details.ligand,
      rest: pickRest(parsedAmb40.details),
      read: readLabFile(fs.readFileSync(fileAmb40Path)),
    };

    // At 15 min spec (half = 7.5 < 11.633 <= 15): drop-5 with Minimum %B: N/A note
    const exp15Min = explainRun([runAmb40], 0, parsedAmb40.details, checks, {
      choice: {},
      heat: null,
    });
    expect(exp15Min?.kind).toBe("retention");
    if (exp15Min?.kind === "retention") {
      expect(exp15Min.decision.reason).toBe("drop-5");
      expect(exp15Min.decision.nextPercentB).toBe(35);
      expect(exp15Min.decision.why).toContain(
        "Minimum %B: N/A (at least two runs are required to fit the logK line).",
      );
    }

    // Choosing to move directly to selectivity from single close-to-spec Run 1
    const exp15MinHeat = explainRun([runAmb40], 0, parsedAmb40.details, checks, {
      choice: {},
      heat: { carryIndex: 0, seriesLength: 1 },
    });
    expect(exp15MinHeat?.kind).toBe("selectivity");
    if (exp15MinHeat?.kind === "selectivity") {
      expect(exp15MinHeat.plan.step).toBe("temp-40");
      expect(exp15MinHeat.plan.prefill?.temperature).toBe("40");
      expect(exp15MinHeat.plan.prefill?.percentB).toBe("40");
    }

    // Live spec change to 30 min (retentionLine(30) = 15 >= 11.633 -> drop-10 to 30% B)
    const exp30Min = explainRun(
      [runAmb40],
      0,
      parsedAmb40.details,
      { ...checks, lastPeakTimeMin: 30 },
      { choice: {}, heat: null },
    );
    expect(exp30Min?.kind).toBe("retention");
    if (exp30Min?.kind === "retention") {
      expect(exp30Min.decision.reason).toBe("drop-10");
      expect(exp30Min.decision.nextPercentB).toBe(30);
    }

    // Live spec change to 60 min (retentionLine(60) = 30 >= 11.633 -> drop-10 to 30% B)
    const exp60Min = explainRun(
      [runAmb40],
      0,
      parsedAmb40.details,
      { ...checks, lastPeakTimeMin: 60 },
      { choice: {}, heat: null },
    );
    expect(exp60Min?.kind).toBe("retention");
    if (exp60Min?.kind === "retention") {
      expect(exp60Min.decision.reason).toBe("drop-10");
      expect(exp60Min.decision.nextPercentB).toBe(30);
    }
  });

  it("auto-excludes additional high-%B unseparated runs when R^2 < 0.99 and >3 runs remain", () => {
    const checks: RuleNumbers = {
      requiredPeaks: 7,
      lastPeakTimeMin: 5,
      minResolution: 1.5,
      maxBackPressurePsi: 3000,
    };

    // 5-run series: 90%, 80%, 70%, 60%, 50% B
    // Run 1 (90% B) & Run 2 (80% B) have poor separation and bend the log k line so 4-point R^2 < 0.99,
    // while Runs 3, 4, 5 (70%, 60%, 50% B) are collinear with R^2 > 0.999.
    const samples = [
      {
        percentB: 90,
        peakCount: 2,
        firstPeakTimeMin: 1.0,
        lastPeakTimeMin: 1.8, // log k = log10(0.8) = -0.0969
        minResolutionExcludingFirst: null,
        maxBackPressurePsi: 1200,
        peaks: [
          { timeMin: 1.0, area: 1000, height: 100 },
          { timeMin: 1.8, area: 5000, height: 400, resolution: 0.4 },
        ],
      },
      {
        percentB: 80,
        peakCount: 3,
        firstPeakTimeMin: 1.0,
        lastPeakTimeMin: 2.35, // log k = log10(1.35) = 0.1303 (bends 4-pt R^2 below 0.99)
        minResolutionExcludingFirst: 0.45,
        maxBackPressurePsi: 1300,
        peaks: [
          { timeMin: 1.0, area: 1000, height: 100 },
          { timeMin: 1.5, area: 2000, height: 200, resolution: 0.45 },
          { timeMin: 2.35, area: 3000, height: 250, resolution: 0.45 },
        ],
      },
      {
        percentB: 70,
        peakCount: 5,
        firstPeakTimeMin: 1.0,
        lastPeakTimeMin: 2.0, // log k = log10(1.0) = 0.000
        minResolutionExcludingFirst: 1.2,
        maxBackPressurePsi: 1400,
      },
      {
        percentB: 60,
        peakCount: 6,
        firstPeakTimeMin: 1.0,
        lastPeakTimeMin: 3.0, // log k = log10(2.0) = 0.301
        minResolutionExcludingFirst: 1.3,
        maxBackPressurePsi: 1500,
      },
      {
        percentB: 50,
        peakCount: 6,
        firstPeakTimeMin: 1.0,
        lastPeakTimeMin: 5.0, // log k = log10(4.0) = 0.602
        minResolutionExcludingFirst: 1.4,
        maxBackPressurePsi: 1600,
      },
    ];

    const decision = decideRetention(samples, checks);
    expect(decision.fit).not.toBeNull();
    if (decision.fit) {
      expect(decision.fit.excluded.map((e) => e.percentB)).toEqual([90, 80]);
      expect(decision.fit.rows.map((r) => r.percentB)).toEqual([70, 60, 50]);
      expect(decision.fit.catalog.map((c) => c.included)).toEqual([false, false, true, true, true]);
      const line = refitMinimumPercent(
        decision.fit.catalog,
        [3, 4, 5],
        decision.fit.specifiedTimeMin,
        decision.fit.usedPercentB,
      );
      expect(line?.rSquared).toBeGreaterThanOrEqual(0.99);
    }
  });
});

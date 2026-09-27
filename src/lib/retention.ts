import { formatDecimal } from "@/lib/evaluate";

/**
 * Retention step: choose the next %B, or say retention is finished.
 * Resolution on the results table is separate. The typed resolution rule is not used here.
 */

export type RetentionSample = {
  percentB: number | null;
  peakCount: number | null;
  lastPeakTimeMin: number | null;
  firstPeakTimeMin: number | null;
  minResolutionExcludingFirst: number | null;
  maxBackPressurePsi: number | null;
};

export type RetentionRules = {
  requiredPeaks: number | null;
  lastPeakTimeMin: number | null;
  maxBackPressurePsi: number | null;
};

export type RetentionFitRow = {
  runNumber: number;
  percentB: number;
  t0: number;
  tR: number;
  k: number;
  logK: number;
};

export type RetentionExclusion = {
  runNumber: number;
  percentB: number | null;
  /** Plain words, shown on screen. */
  reason: string;
};

export type RetentionFit = {
  rows: RetentionFitRow[];
  excluded: RetentionExclusion[];
  m: number;
  c: number;
  t0Average: number;
  kTarget: number;
  logKTarget: number;
  rawPercentB: number;
  nextPercentB: number;
  oneDecimal: boolean;
  clamped: "low" | "high" | null;
};

export type RetentionReason =
  | "drop-10"
  | "drop-5"
  | "calculated"
  | "finished-calculated"
  | "finished-peaks-time"
  | "finished-peaks-resolution"
  | "pressure"
  | "missing-rules"
  | "missing-measurement"
  | "missing-percent"
  | "fit-unavailable";

export type RetentionDecision = {
  status: "recommend" | "finished" | "blocked";
  reason: RetentionReason;
  move: "drop-10" | "drop-5" | "calculated" | null;
  nextPercentB: number | null;
  nextChange: string;
  why: string;
  fit: RetentionFit | null;
};

type CompleteRules = {
  requiredPeaks: number;
  lastPeakTimeMin: number;
  maxBackPressurePsi: number;
};

export function decideRetention(
  samples: RetentionSample[],
  rules: RetentionRules,
): RetentionDecision {
  const current = samples[samples.length - 1];
  if (!current) {
    return blocked(
      "missing-measurement",
      "Do not recommend a %B yet.",
      "Upload a chromatogram first.",
    );
  }

  const missingRules = blankRules(rules);
  if (missingRules.length > 0) {
    return blocked(
      "missing-rules",
      "Do not recommend a %B yet.",
      missingRules.join(" "),
    );
  }
  const complete = rules as CompleteRules;

  if (current.percentB == null) {
    return blocked(
      "missing-percent",
      "Do not recommend a %B yet.",
      "Type the %B for this run. The next %B is worked out from the %B saved on each run.",
    );
  }

  if (samples.length >= 2) {
    const prior = decideRetention(samples.slice(0, -1), complete);
    if (
      prior.move === "calculated" &&
      prior.nextPercentB != null &&
      nearly(current.percentB, prior.nextPercentB)
    ) {
      return finishedCalculated(current, complete, prior.nextPercentB);
    }
  }

  const missing = missingMeasurements(current);
  if (missing.length > 0) {
    return blocked("missing-measurement", "Do not recommend a %B.", missing.join(" "));
  }

  if (!pressureIsUnder(current.maxBackPressurePsi!, complete.maxBackPressurePsi)) {
    const measured = formatDecimal(current.maxBackPressurePsi!, 1);
    const limit = formatDecimal(complete.maxBackPressurePsi, 1);
    return blocked(
      "pressure",
      `Do not lower %B. The highest back-pressure is ${measured} psi, already at or above the ${limit} psi you set.`,
      `The pressure is already too high to lower %B. This run reached ${measured} psi, and the limit you set is ${limit} psi.`,
    );
  }

  const peaksMet = current.peakCount! >= complete.requiredPeaks;
  const timeStillShort = isBelow(current.lastPeakTimeMin!, complete.lastPeakTimeMin);

  if (peaksMet && !timeStillShort) {
    return finished(
      "finished-peaks-time",
      "Retention is finished. Do not lower %B.",
      `This run already has ${formatCount(current.peakCount!)} peaks, which meets the ${formatCount(complete.requiredPeaks)} you asked for. The last peak is at ${formatMinutes(current.lastPeakTimeMin!)} min, which is not under the ${formatMinutes(complete.lastPeakTimeMin)} min you set.`,
    );
  }

  if (peaksMet && samples.length > 1 && !resolutionIncreased(samples, complete.requiredPeaks)) {
    return finished(
      "finished-peaks-resolution",
      "Retention is finished. Do not lower %B.",
      resolutionStopWhy(samples, complete),
    );
  }

  const line = 0.8 * complete.lastPeakTimeMin;
  if (isBelow(current.lastPeakTimeMin!, line)) {
    return dropPoints(samples, complete, 10, "drop-10");
  }
  return calculatePercentB(samples, complete);
}

export function roundTargetPercent(
  raw: number,
  usedPercentB: number[],
): { value: number; clamped: "low" | "high" | null; oneDecimal: boolean } {
  let clamped: "low" | "high" | null = null;
  let working = raw;
  if (working < 0) {
    working = 0;
    clamped = "low";
  } else if (working > 100) {
    working = 100;
    clamped = "high";
  }

  const whole = roundHalfAwayFromZero(working, 0);
  const oneDecimal = usedPercentB.some((percent) => nearly(percent, whole));
  let value = oneDecimal ? roundHalfAwayFromZero(working, 1) : whole;
  if (value < 0) {
    value = 0;
    clamped = "low";
  } else if (value > 100) {
    value = 100;
    clamped = "high";
  }
  return { value, clamped, oneDecimal };
}

export function formatPercentB(value: number): string {
  const whole = roundHalfAwayFromZero(value, 0);
  if (nearly(value, whole)) return String(whole);
  const tenth = roundHalfAwayFromZero(value, 1);
  if (nearly(value, tenth)) return tenth.toFixed(1);
  return value.toFixed(2);
}

function finishedCalculated(
  current: RetentionSample,
  rules: CompleteRules,
  target: number,
): RetentionDecision {
  const percent = formatPercentB(current.percentB!);
  let why = `This chromatogram was run at ${percent}% B, the calculated %B (${formatPercentB(target)}% B) for a last peak at ${formatMinutes(rules.lastPeakTimeMin)} min. Retention is finished.`;
  if (current.peakCount != null && current.peakCount < rules.requiredPeaks) {
    why += ` It is finished even though this file has ${formatCount(current.peakCount)} peaks, still under the ${formatCount(rules.requiredPeaks)} you asked for.`;
  }
  if (
    current.maxBackPressurePsi != null &&
    !pressureIsUnder(current.maxBackPressurePsi, rules.maxBackPressurePsi)
  ) {
    why += ` The highest back-pressure is ${formatDecimal(current.maxBackPressurePsi, 1)} psi, already at or above the ${formatDecimal(rules.maxBackPressurePsi, 1)} psi you set.`;
  }
  return {
    status: "finished",
    reason: "finished-calculated",
    move: null,
    nextPercentB: null,
    nextChange: "Retention is finished.",
    why,
    fit: null,
  };
}

function dropPoints(
  samples: RetentionSample[],
  rules: CompleteRules,
  points: 5 | 10,
  reason: "drop-5" | "drop-10",
): RetentionDecision {
  const current = samples[samples.length - 1];
  const raw = current.percentB! - points;
  let next = raw;
  let clampNote = "";
  if (next < 0) {
    next = 0;
    clampNote = " That drop would go below 0, so the next %B is held at 0.";
  } else if (next > 100) {
    next = 100;
    clampNote = " That drop would go above 100, so the next %B is held at 100.";
  }

  const from = formatPercentB(current.percentB!);
  const to = formatPercentB(next);
  const nextChange =
    reason === "drop-5"
      ? `Lower %B by 5 percentage points. Run the next chromatogram at ${to}% B. Another run is needed before the %B that hits the last-peak time can be calculated.${clampNote}`
      : `Lower %B by 10 percentage points. Run the next chromatogram at ${to}% B.${clampNote}`;

  const line = 0.8 * rules.lastPeakTimeMin;
  const whyParts = situationSentences(samples, rules);
  if (reason === "drop-10") {
    whyParts.push(
      `The last peak is at ${formatMinutes(current.lastPeakTimeMin!)} min, under ${formatMinutes(line)} min (80% of the ${formatMinutes(rules.lastPeakTimeMin)} min you set). ${from}% B minus 10 percentage points is ${to}% B.`,
    );
  } else {
    whyParts.push(
      `The last peak is at ${formatMinutes(current.lastPeakTimeMin!)} min, which is not under ${formatMinutes(line)} min (80% of the ${formatMinutes(rules.lastPeakTimeMin)} min you set). This is the only chromatogram so far, so the %B that would hit ${formatMinutes(rules.lastPeakTimeMin)} min is not calculated. ${from}% B minus 5 percentage points is ${to}% B. Another run is needed before that %B can be calculated.`,
    );
  }

  return {
    status: "recommend",
    reason,
    move: reason,
    nextPercentB: next,
    nextChange,
    why: whyParts.join("\n\n"),
    fit: null,
  };
}

function calculatePercentB(samples: RetentionSample[], rules: CompleteRules): RetentionDecision {
  const current = samples[samples.length - 1];
  const line = 0.8 * rules.lastPeakTimeMin;
  const intro = [
    ...situationSentences(samples, rules),
    `The last peak is at ${formatMinutes(current.lastPeakTimeMin!)} min, which is not under ${formatMinutes(line)} min (80% of the ${formatMinutes(rules.lastPeakTimeMin)} min you set). That calls for the %B that should hit ${formatMinutes(rules.lastPeakTimeMin)} min, not a 10 percentage point drop.`,
  ];

  if (!isBelow(current.lastPeakTimeMin!, rules.lastPeakTimeMin)) {
    intro.push(
      `The last peak is already at or past ${formatMinutes(rules.lastPeakTimeMin)} min. The calculated %B still aims at that time.`,
    );
  }

  if (samples.length < 2) {
    return dropPoints(samples, rules, 5, "drop-5");
  }

  const picked = selectForLine(samples);
  const rows: RetentionFitRow[] = [];
  const skipped: string[] = [];
  for (const item of picked.kept) {
    const factor = retentionFactor(item.sample);
    if (item.sample.percentB == null) {
      skipped.push(`Run ${item.runNumber} has no %B, so it is not used.`);
      continue;
    }
    if (!factor) {
      skipped.push(
        `Run ${item.runNumber} is not used because the last peak is not after the first peak.`,
      );
      continue;
    }
    rows.push({
      runNumber: item.runNumber,
      percentB: item.sample.percentB,
      t0: item.sample.firstPeakTimeMin!,
      tR: item.sample.lastPeakTimeMin!,
      k: factor.k,
      logK: factor.logK,
    });
  }

  if (skipped.length > 0) intro.push(skipped.join(" "));

  if (rows.length < 2) {
    return blocked(
      "fit-unavailable",
      "Do not recommend a %B. The %B that would hit the last-peak time cannot be calculated from these runs.",
      [...intro, "At least two usable chromatograms are needed, and there are not enough left."].join(
        "\n\n",
      ),
    );
  }

  const lineFit = ordinaryLeastSquares(rows.map((row) => ({ x: row.percentB, y: row.logK })));
  if (!lineFit) {
    return blocked(
      "fit-unavailable",
      "Do not recommend a %B. Those runs do not draw a line from logK to %B.",
      [...intro, "The runs kept for the calculation do not give a usable m."].join("\n\n"),
    );
  }

  const t0Average = rows.reduce((sum, row) => sum + row.t0, 0) / rows.length;
  const kTarget = (rules.lastPeakTimeMin - t0Average) / t0Average;
  if (!(kTarget > 0) || !(t0Average > 0)) {
    return blocked(
      "fit-unavailable",
      "Do not recommend a %B. The last-peak time you set is not after the average first-peak time.",
      [...intro, `The average t0 of the runs used here is ${formatMinutes(t0Average)} min.`].join(
        "\n\n",
      ),
    );
  }

  const logKTarget = Math.log10(kTarget);
  const rawPercentB = (logKTarget - lineFit.c) / lineFit.m;
  if (!Number.isFinite(rawPercentB)) {
    return blocked(
      "fit-unavailable",
      "Do not recommend a %B. The line through these runs does not point to a %B.",
      intro.join("\n\n"),
    );
  }

  const usedPercentB = samples
    .map((sample) => sample.percentB)
    .filter((percent): percent is number => percent != null);
  const rounded = roundTargetPercent(rawPercentB, usedPercentB);
  const fit: RetentionFit = {
    rows,
    excluded: picked.excluded,
    m: lineFit.m,
    c: lineFit.c,
    t0Average,
    kTarget,
    logKTarget,
    rawPercentB,
    nextPercentB: rounded.value,
    oneDecimal: rounded.oneDecimal,
    clamped: rounded.clamped,
  };

  const percent = formatPercentB(rounded.value);
  let nextChange = `Run the next chromatogram at ${percent}% B. That is the %B calculated to put the last peak at ${formatMinutes(rules.lastPeakTimeMin)} min.`;
  if (rounded.clamped === "high") {
    nextChange += " The calculated value was above 100, so it is held at 100.";
  } else if (rounded.clamped === "low") {
    nextChange += " The calculated value was below 0, so it is held at 0.";
  }

  const why = [...intro, exclusionSentence(samples, fit), calculationSentence(fit)].join("\n\n");

  return {
    status: "recommend",
    reason: "calculated",
    move: "calculated",
    nextPercentB: rounded.value,
    nextChange,
    why,
    fit,
  };
}

function situationSentences(samples: RetentionSample[], rules: CompleteRules): string[] {
  const current = samples[samples.length - 1];
  const lines: string[] = [];
  const peaksMet = current.peakCount! >= rules.requiredPeaks;

  if (!peaksMet) {
    lines.push(
      `This run has ${formatCount(current.peakCount!)} peaks, still under the ${formatCount(rules.requiredPeaks)} you asked for.`,
    );
  } else if (samples.length === 1) {
    lines.push(
      `This run has ${formatCount(current.peakCount!)} peaks, which meets the ${formatCount(rules.requiredPeaks)} you asked for. This is the first run, so there is no earlier resolution to compare. The last peak is at ${formatMinutes(current.lastPeakTimeMin!)} min, still under the ${formatMinutes(rules.lastPeakTimeMin)} min you set, so the time and pressure still decide the next %B.`,
    );
  } else {
    const previous = samples[samples.length - 2];
    const previousResolution = usableResolution(previous, rules.requiredPeaks);
    const currentResolution = usableResolution(current, rules.requiredPeaks);
    const resolutionText =
      previousResolution == null
        ? `The previous run had no usable resolution, and this run’s minimum resolution is ${formatResolution(currentResolution!)}.`
        : `Minimum resolution went from ${formatResolution(previousResolution)} to ${formatResolution(currentResolution!)}, which is higher than the previous run.`;
    lines.push(
      `This run has ${formatCount(current.peakCount!)} peaks, which meets the ${formatCount(rules.requiredPeaks)} you asked for. ${resolutionText} The last peak is at ${formatMinutes(current.lastPeakTimeMin!)} min, still under the ${formatMinutes(rules.lastPeakTimeMin)} min you set, so %B can still come down.`,
    );
  }

  lines.push(
    `The highest back-pressure is ${formatDecimal(current.maxBackPressurePsi!, 1)} psi, under the ${formatDecimal(rules.maxBackPressurePsi, 1)} psi you set.`,
  );
  return lines;
}

function resolutionStopWhy(samples: RetentionSample[], rules: CompleteRules): string {
  const current = samples[samples.length - 1];
  const previous = samples[samples.length - 2];
  const previousResolution = usableResolution(previous, rules.requiredPeaks);
  const currentResolution = usableResolution(current, rules.requiredPeaks);
  const peakText = `This run already has ${formatCount(current.peakCount!)} peaks, which meets the ${formatCount(rules.requiredPeaks)} you asked for.`;

  if (previousResolution == null && currentResolution == null) {
    return `${peakText} The previous run had no usable resolution, and this run does not have one either, so resolution did not go up.`;
  }
  if (previousResolution != null && currentResolution == null) {
    return `${peakText} Minimum resolution on the previous run was ${formatResolution(previousResolution)}. This run does not have a resolution number, so it is not higher.`;
  }
  if (previousResolution == null || currentResolution == null) {
    return `${peakText} Minimum resolution did not go up from the previous run.`;
  }
  return `${peakText} Minimum resolution is ${formatResolution(currentResolution)}, which is not higher than ${formatResolution(previousResolution)} on the previous run.`;
}

function exclusionSentence(samples: RetentionSample[], fit: RetentionFit): string {
  const used = fit.rows
    .map((row) => `Run ${row.runNumber} at ${formatPercentB(row.percentB)}% B`)
    .join(", ");
  if (samples.length <= 3) {
    const howMany = samples.length === 2 ? "Both chromatograms are used" : "All three chromatograms are used";
    return `${howMany}. ${used}.`;
  }
  if (fit.excluded.length === 1) {
    const item = fit.excluded[0];
    const percent = item.percentB == null ? "" : ` at ${formatPercentB(item.percentB)}% B`;
    return `There are ${formatCount(samples.length)} chromatograms, so the first run and the run with the highest %B are left out. Those are the same run (Run ${item.runNumber}${percent}), so it is left out once. The calculation uses ${used}.`;
  }
  const leftOut = fit.excluded
    .map((item) => {
      const percent = item.percentB == null ? "" : ` at ${formatPercentB(item.percentB)}% B`;
      return `Run ${item.runNumber}${percent} (${item.reason})`;
    })
    .join("; ");
  return `There are ${formatCount(samples.length)} chromatograms, so the first run and the run with the highest %B are left out: ${leftOut}. The calculation uses ${used}.`;
}

function calculationSentence(fit: RetentionFit): string {
  const percent = formatPercentB(fit.nextPercentB);
  let rounding = `That rounds to ${percent}% B.`;
  if (fit.oneDecimal) {
    rounding = `The nearest whole percent is already a %B in these runs, so one decimal place is kept: ${percent}% B.`;
  }
  if (fit.clamped === "high") {
    rounding += " The result was above 100, so it is held at 100.";
  } else if (fit.clamped === "low") {
    rounding += " The result was below 0, so it is held at 0.";
  }
  return [
    "logK = m × %B + c.",
    `m = ${formatSlope(fit.m)}, c = ${formatSlope(fit.c)}.`,
    `Average t0 = ${formatMinutes(fit.t0Average)} min.`,
    `k at the last-peak time you set = ${formatK(fit.kTarget)}. logK for that k = ${formatLogK(fit.logKTarget)}.`,
    `%B = (logK − c) / m = ${formatSlope(fit.rawPercentB)}. ${rounding}`,
  ].join(" ");
}

type IndexedSample = {
  runNumber: number;
  sample: RetentionSample;
};

function selectForLine(samples: RetentionSample[]): {
  kept: IndexedSample[];
  excluded: RetentionExclusion[];
} {
  const indexed = samples.map((sample, index) => ({ runNumber: index + 1, sample }));
  if (samples.length <= 3) return { kept: indexed, excluded: [] };

  let highest = 0;
  for (let i = 1; i < samples.length; i++) {
    const percent = samples[i].percentB;
    const best = samples[highest].percentB;
    if (percent != null && (best == null || percent > best)) highest = i;
  }

  const excluded: RetentionExclusion[] = [];
  const kept: IndexedSample[] = [];
  indexed.forEach((item, index) => {
    if (index === 0 && index === highest) {
      excluded.push({
        runNumber: item.runNumber,
        percentB: item.sample.percentB,
        reason: "It is the first run and the highest %B, so it is left out once.",
      });
      return;
    }
    if (index === 0) {
      excluded.push({
        runNumber: item.runNumber,
        percentB: item.sample.percentB,
        reason: "It is the first run.",
      });
      return;
    }
    if (index === highest) {
      excluded.push({
        runNumber: item.runNumber,
        percentB: item.sample.percentB,
        reason: "It has the highest %B.",
      });
      return;
    }
    kept.push(item);
  });
  return { kept, excluded };
}

function retentionFactor(sample: RetentionSample): { k: number; logK: number } | null {
  const t0 = sample.firstPeakTimeMin;
  const tR = sample.lastPeakTimeMin;
  if (t0 == null || tR == null || !(t0 > 0) || !(tR > t0)) return null;
  const k = (tR - t0) / t0;
  if (!(k > 0)) return null;
  return { k, logK: Math.log10(k) };
}

function ordinaryLeastSquares(points: { x: number; y: number }[]): { m: number; c: number } | null {
  const n = points.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumX2 += point.x * point.x;
  }
  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return null;
  const m = (n * sumXY - sumX * sumY) / denominator;
  const c = (sumY - m * sumX) / n;
  if (!Number.isFinite(m) || !Number.isFinite(c) || m === 0) return null;
  return { m, c };
}

function resolutionIncreased(samples: RetentionSample[], requiredPeaks: number): boolean {
  const previous = usableResolution(samples[samples.length - 2], requiredPeaks);
  const current = usableResolution(samples[samples.length - 1], requiredPeaks);
  if (previous == null && current != null) return true;
  if (previous != null && current != null && current > previous) return true;
  return false;
}

function usableResolution(sample: RetentionSample, requiredPeaks: number): number | null {
  if (sample.peakCount == null || sample.peakCount < requiredPeaks) return null;
  const resolution = sample.minResolutionExcludingFirst;
  if (resolution == null || !Number.isFinite(resolution)) return null;
  return resolution;
}

function blankRules(rules: RetentionRules): string[] {
  const missing: string[] = [];
  if (rules.requiredPeaks == null) missing.push("Number of peaks to separate is blank.");
  if (rules.lastPeakTimeMin == null) missing.push("Last peak time is blank.");
  if (rules.maxBackPressurePsi == null) missing.push("Max back-pressure is blank.");
  return missing;
}

function missingMeasurements(sample: RetentionSample): string[] {
  const missing: string[] = [];
  if (sample.peakCount == null) missing.push("The peak count is not in this file.");
  if (sample.lastPeakTimeMin == null) missing.push("The last peak time is not in this file.");
  if (sample.maxBackPressurePsi == null) {
    missing.push("The max back-pressure is not in this file, so it is not clear the pressure is under the limit.");
  }
  return missing;
}

function pressureIsUnder(measured: number, limit: number): boolean {
  if (nearly(measured, limit)) return false;
  return measured < limit;
}

function isBelow(value: number, limit: number): boolean {
  if (nearly(value, limit)) return false;
  return value < limit;
}

function nearly(a: number, b: number): boolean {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= scale * 1e-9;
}

function finished(reason: RetentionReason, nextChange: string, why: string): RetentionDecision {
  return { status: "finished", reason, move: null, nextPercentB: null, nextChange, why, fit: null };
}

function blocked(reason: RetentionReason, nextChange: string, why: string): RetentionDecision {
  return { status: "blocked", reason, move: null, nextPercentB: null, nextChange, why, fit: null };
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function formatMinutes(value: number): string {
  return value.toFixed(3);
}

function formatResolution(value: number): string {
  return value.toFixed(3);
}

function formatK(value: number): string {
  return value.toFixed(3);
}

function formatLogK(value: number): string {
  return value.toFixed(4);
}

export function formatSlope(value: number): string {
  return value.toFixed(6);
}

function roundHalfAwayFromZero(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  const rounded = Math.sign(scaled) * Math.floor(Math.abs(scaled) + 0.5 + 1e-10);
  return rounded / factor;
}

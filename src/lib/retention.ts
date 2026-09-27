import { formatDecimal } from "@/lib/evaluate";

/**
 * Retention step: choose the next %B, or say retention is finished.
 * The typed minimum resolution does not finish this step. It is used only to
 * decide whether the first run, or the highest-%B run, can be left out of the
 * line once there are more than three chromatograms.
 *
 * A run is also left out when its first-peak time (t0) is more than 10% away
 * from the middle first-peak time of the other runs. That check runs even when
 * the peaks look separated, and even when there are three or fewer runs.
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
  /** Blank means good separation is peak count only. */
  minResolution?: number | null;
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
  minResolution: number | null;
};

type SeparationSpec = {
  requiredPeaks: number | null;
  minResolution: number | null;
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
  const complete: CompleteRules = {
    requiredPeaks: rules.requiredPeaks!,
    lastPeakTimeMin: rules.lastPeakTimeMin!,
    maxBackPressurePsi: rules.maxBackPressurePsi!,
    minResolution: rules.minResolution ?? null,
  };

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
      return finishedCalculated(samples, complete, prior.nextPercentB);
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

  const line = retentionLine(complete.lastPeakTimeMin);
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
  samples: RetentionSample[],
  rules: CompleteRules,
  target: number,
): RetentionDecision {
  const current = samples[samples.length - 1];
  const percent = formatPercentB(current.percentB!);
  const chosen = chooseCarryRun(samples, rules);
  const parts = [
    `This chromatogram was run at ${percent}% B, the calculated %B (${formatPercentB(target)}% B) for a last peak at ${formatMinutes(rules.lastPeakTimeMin)} min.`,
  ];

  if (current.lastPeakTimeMin != null && isPast(current.lastPeakTimeMin, rules.lastPeakTimeMin)) {
    parts.push(
      `Its last peak is at ${formatMinutes(current.lastPeakTimeMin)} min, past the ${formatMinutes(rules.lastPeakTimeMin)} min you set. That time is the latest the last peak may come out, so this run is not the one to carry forward.`,
    );
  }

  if (!chosen) {
    parts.push(
      "Every uploaded run has a last peak past that time, so there is no run to carry forward. Retention is finished. The next kind of change is not built yet.",
    );
    return {
      status: "finished",
      reason: "finished-calculated",
      move: null,
      nextPercentB: null,
      nextChange:
        "Retention is finished. The next kind of change is not built yet. No uploaded run is within the last-peak time you set.",
      why: parts.join(" "),
      fit: null,
    };
  }

  const chosenLabel = `Run ${chosen.index + 1} at ${formatPercentB(chosen.sample.percentB!)}% B`;
  const resolution = carryResolution(chosen.sample, rules.requiredPeaks);
  const resolutionText =
    resolution == null
      ? "it has no usable minimum resolution"
      : `its minimum resolution is ${formatResolution(resolution)}, the best among the runs still within that time`;

  if (chosen.index === samples.length - 1) {
    parts.push(
      `Its last peak is at ${formatMinutes(current.lastPeakTimeMin!)} min, at or before ${formatMinutes(rules.lastPeakTimeMin)} min, and ${resolutionText}. This is the run to carry forward.`,
    );
  } else {
    if (current.lastPeakTimeMin != null && !isPast(current.lastPeakTimeMin, rules.lastPeakTimeMin)) {
      parts.push(
        `Its last peak is at ${formatMinutes(current.lastPeakTimeMin)} min, at or before ${formatMinutes(rules.lastPeakTimeMin)} min, so the time alone does not rule it out.`,
      );
    }
    parts.push(
      `${chosenLabel} is the run to carry forward. Its last peak is at ${formatMinutes(chosen.sample.lastPeakTimeMin!)} min, still within ${formatMinutes(rules.lastPeakTimeMin)} min, and ${resolutionText}.`,
    );
  }

  if (current.peakCount != null && current.peakCount < rules.requiredPeaks) {
    parts.push(
      `This file has ${formatCount(current.peakCount)} peaks, still under the ${formatCount(rules.requiredPeaks)} you asked for.`,
    );
  }
  parts.push("Retention is finished. The next kind of change is not built yet.");

  const nextChange =
    chosen.index === samples.length - 1
      ? `Retention is finished. The next kind of change is not built yet. Carry forward this run, ${chosenLabel}.`
      : `Retention is finished. The next kind of change is not built yet. Carry forward ${chosenLabel}, not this ${percent}% B run.`;

  return {
    status: "finished",
    reason: "finished-calculated",
    move: null,
    nextPercentB: null,
    nextChange,
    why: parts.join(" "),
    fit: null,
  };
}

function chooseCarryRun(
  samples: RetentionSample[],
  rules: CompleteRules,
): { index: number; sample: RetentionSample } | null {
  const eligible = samples
    .map((sample, index) => ({ sample, index }))
    .filter(
      (item) =>
        item.sample.lastPeakTimeMin != null &&
        item.sample.percentB != null &&
        !isPast(item.sample.lastPeakTimeMin, rules.lastPeakTimeMin),
    );
  if (eligible.length === 0) return null;

  const scored = eligible.filter((item) => carryResolution(item.sample, rules.requiredPeaks) != null);
  const pool = scored.length > 0 ? scored : eligible;
  pool.sort((a, b) => {
    const aScore = carryResolution(a.sample, rules.requiredPeaks);
    const bScore = carryResolution(b.sample, rules.requiredPeaks);
    if (aScore != null && bScore != null && aScore !== bScore) return bScore - aScore;
    if (aScore != null && bScore == null) return -1;
    if (aScore == null && bScore != null) return 1;
    const aRaw = a.sample.minResolutionExcludingFirst;
    const bRaw = b.sample.minResolutionExcludingFirst;
    if (aRaw != null && bRaw != null && aRaw !== bRaw) return bRaw - aRaw;
    return b.index - a.index;
  });
  return pool[0];
}

/** Same rule as the results table: too few peaks means the resolution is not usable. */
function carryResolution(sample: RetentionSample, requiredPeaks: number): number | null {
  if (sample.peakCount == null || sample.peakCount < requiredPeaks) return null;
  const resolution = sample.minResolutionExcludingFirst;
  if (resolution == null || !Number.isFinite(resolution)) return null;
  return resolution;
}

function isPast(measured: number, spec: number): boolean {
  if (nearly(measured, spec)) return false;
  return measured > spec;
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

  const line = retentionLine(rules.lastPeakTimeMin);
  const whyParts = situationSentences(samples, rules);
  if (reason === "drop-10") {
    whyParts.push(
      `The last peak is at ${formatMinutes(current.lastPeakTimeMin!)} min, under ${formatMinutes(line)} min (${retentionPercent()} of the ${formatMinutes(rules.lastPeakTimeMin)} min you set). ${from}% B minus 10 percentage points is ${to}% B.`,
    );
  } else {
    whyParts.push(
      `The last peak is at ${formatMinutes(current.lastPeakTimeMin!)} min, which is not under ${formatMinutes(line)} min (${retentionPercent()} of the ${formatMinutes(rules.lastPeakTimeMin)} min you set). This is the only chromatogram so far, so the %B that would hit ${formatMinutes(rules.lastPeakTimeMin)} min is not calculated. ${from}% B minus 5 percentage points is ${to}% B. Another run is needed before that %B can be calculated.`,
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
  const line = retentionLine(rules.lastPeakTimeMin);
  const intro = [
    ...situationSentences(samples, rules),
    `The last peak is at ${formatMinutes(current.lastPeakTimeMin!)} min, which is not under ${formatMinutes(line)} min (${retentionPercent()} of the ${formatMinutes(rules.lastPeakTimeMin)} min you set). That calls for the %B that should hit ${formatMinutes(rules.lastPeakTimeMin)} min, not a 10 percentage point drop.`,
  ];

  if (!isBelow(current.lastPeakTimeMin!, rules.lastPeakTimeMin)) {
    intro.push(
      `The last peak is already at or past ${formatMinutes(rules.lastPeakTimeMin)} min. The calculated %B still aims at that time.`,
    );
  }

  if (samples.length < 2) {
    return dropPoints(samples, rules, 5, "drop-5");
  }

  const spec = separationSpecFrom(rules);
  const picked = selectForLine(samples, spec);
  if (picked.t0Blocked) {
    return blocked(
      "fit-unavailable",
      "Do not recommend a %B. Leaving out the runs whose first-peak time does not match the others would leave fewer than two chromatograms, so the line is not fit.",
      [...intro, t0ComparisonParagraph(samples, picked.checks, new Set()), "Leaving those runs out would leave fewer than two chromatograms, so the line is not fit."].join(
        "\n\n",
      ),
    );
  }
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

  const why = [
    ...intro,
    fitMembershipSentence(samples, fit, spec, picked.checks),
    calculationSentence(fit),
  ].join("\n\n");

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

function fitMembershipSentence(
  samples: RetentionSample[],
  fit: RetentionFit,
  spec: SeparationSpec,
  checks: T0Check[],
): string {
  const used = fit.rows
    .map((row) => `Run ${row.runNumber} at ${formatPercentB(row.percentB)}% B`)
    .join(", ");
  const far = checks.some((check) => check.far);
  if (!far && samples.length <= 3) {
    const howMany =
      samples.length === 2 ? "Both chromatograms are used" : "All three chromatograms are used";
    return `${howMany}. ${used}.`;
  }

  const parts: string[] = [];
  if (far) {
    const keptRunNumbers = new Set(fit.rows.map((row) => row.runNumber));
    parts.push(t0ComparisonParagraph(samples, checks, keptRunNumbers));
    if (samples.length > 3) {
      const separation = separationMembershipSentence(samples, spec, checks);
      if (separation) parts.push(separation);
    }
  } else {
    parts.push(`There are ${formatCount(samples.length)} chromatograms.`);
    parts.push(separationMembershipSentence(samples, spec, checks));
  }
  parts.push(`The calculation uses ${used}.`);
  return parts.join(" ");
}

function separationMembershipSentence(
  samples: RetentionSample[],
  spec: SeparationSpec,
  checks: T0Check[],
): string {
  const highest = highestPercentIndex(samples);
  const parts: string[] = [];
  if (highest === 0) {
    if (checks[0]?.far) return "";
    const verdict = separationVerdict(samples[0], spec);
    let line = `${runLabel(0, samples[0])} is the first run and also the highest %B, so that run is checked once. ${verdict.sentence}`;
    if (!verdict.keep) line += " It is left out once.";
    return line;
  }
  if (!checks[0]?.far) {
    const first = separationVerdict(samples[0], spec);
    parts.push(`${runLabel(0, samples[0])} is the first run. ${first.sentence}`);
  }
  if (!checks[highest]?.far) {
    const high = separationVerdict(samples[highest], spec);
    parts.push(`${runLabel(highest, samples[highest])} has the highest %B. ${high.sentence}`);
  }
  return parts.join(" ");
}

function runLabel(index: number, sample: RetentionSample): string {
  const percent = sample.percentB == null ? "" : ` at ${formatPercentB(sample.percentB)}% B`;
  return `Run ${index + 1}${percent}`;
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

function separationSpecFrom(rules: {
  requiredPeaks: number | null;
  minResolution?: number | null;
}): SeparationSpec {
  return {
    requiredPeaks: rules.requiredPeaks,
    minResolution: rules.minResolution ?? null,
  };
}

function highestPercentIndex(samples: RetentionSample[]): number {
  let highest = 0;
  for (let i = 1; i < samples.length; i++) {
    const percent = samples[i].percentB;
    const best = samples[highest].percentB;
    if (percent != null && (best == null || percent > best)) highest = i;
  }
  return highest;
}

function separationVerdict(
  sample: RetentionSample,
  spec: SeparationSpec,
): { keep: boolean; sentence: string } {
  if (spec.requiredPeaks == null) {
    return {
      keep: true,
      sentence:
        "It is kept because the number of peaks to separate is blank, so it is not left out for how well the peaks are split.",
    };
  }

  const count = sample.peakCount;
  const peaksOk = count != null && count >= spec.requiredPeaks;
  const askedResolution = spec.minResolution != null;
  const resolution = sample.minResolutionExcludingFirst;
  const resolutionOk =
    !askedResolution ||
    (resolution != null && Number.isFinite(resolution) && resolution >= spec.minResolution!);

  if (peaksOk && resolutionOk) {
    if (askedResolution) {
      return {
        keep: true,
        sentence: `It is kept because it has enough peaks (${formatCount(count!)} of the ${formatCount(spec.requiredPeaks)} you asked for) and the smallest resolution after the first peak (${formatResolution(resolution!)}) meets the ${formatResolution(spec.minResolution!)} you set.`,
      };
    }
    return {
      keep: true,
      sentence: `It is kept because it has enough peaks (${formatCount(count!)} of the ${formatCount(spec.requiredPeaks)} you asked for). No minimum resolution was set.`,
    };
  }

  const problems: string[] = [];
  if (!peaksOk) {
    problems.push(
      count == null
        ? `the peak count is missing, still short of the ${formatCount(spec.requiredPeaks)} you asked for, so the peaks are still overlapping`
        : `it has ${formatCount(count)} peaks, still under the ${formatCount(spec.requiredPeaks)} you asked for, so the peaks are still overlapping`,
    );
  }
  if (askedResolution && !resolutionOk) {
    problems.push(
      resolution == null || !Number.isFinite(resolution)
        ? `there is no resolution after the first peak to compare with the ${formatResolution(spec.minResolution!)} you set`
        : `the smallest resolution after the first peak is ${formatResolution(resolution)}, under the ${formatResolution(spec.minResolution!)} you set`,
    );
  }
  return {
    keep: false,
    sentence: `It is left out because ${problems.join(", and ")}.`,
  };
}

/** A run is far when its t0 is more than this fraction from the leave-one-out median. */
const T0_RELATIVE_CUTOFF = 0.1;

type T0Check = {
  index: number;
  t0: number | null;
  medianOthers: number | null;
  relative: number | null;
  far: boolean;
};

type LineSelection = {
  kept: IndexedSample[];
  excluded: RetentionExclusion[];
  checks: T0Check[];
  /** True when dropping the far t0 runs would leave fewer than two chromatograms. */
  t0Blocked: boolean;
};

function selectForLine(samples: RetentionSample[], spec: SeparationSpec): LineSelection {
  const indexed = samples.map((sample, index) => ({ runNumber: index + 1, sample }));
  const checks = t0Checks(samples);
  const t0Drop = new Set(checks.filter((check) => check.far).map((check) => check.index));
  if (t0Drop.size > 0 && samples.length - t0Drop.size < 2) {
    return {
      kept: [],
      excluded: indexed
        .filter((item) => t0Drop.has(item.runNumber - 1))
        .map((item) => ({
          runNumber: item.runNumber,
          percentB: item.sample.percentB,
          reason: t0LeaveOutSentence(checks[item.runNumber - 1]),
        })),
      checks,
      t0Blocked: true,
    };
  }

  const dropIndexes = new Set(t0Drop);
  if (samples.length > 3) {
    const highest = highestPercentIndex(samples);
    for (const index of [0, highest]) {
      if (dropIndexes.has(index)) continue;
      if (!separationVerdict(samples[index], spec).keep) dropIndexes.add(index);
    }
  }

  const excluded: RetentionExclusion[] = [];
  const kept: IndexedSample[] = [];
  indexed.forEach((item, index) => {
    if (!dropIndexes.has(index)) {
      kept.push(item);
      return;
    }
    const check = checks[index];
    excluded.push({
      runNumber: item.runNumber,
      percentB: item.sample.percentB,
      reason: check.far
        ? t0LeaveOutSentence(check)
        : separationVerdict(item.sample, spec).sentence,
    });
  });
  return { kept, excluded, checks, t0Blocked: false };
}

function t0Checks(samples: RetentionSample[]): T0Check[] {
  return samples.map((sample, index) => {
    const others = samples
      .filter((_, other) => other !== index)
      .map((item) => item.firstPeakTimeMin)
      .filter((time): time is number => time != null && time > 0);
    const medianOthers = median(others);
    const t0 = sample.firstPeakTimeMin != null && sample.firstPeakTimeMin > 0 ? sample.firstPeakTimeMin : null;
    const relative =
      t0 != null && medianOthers != null && medianOthers > 0
        ? Math.abs(t0 - medianOthers) / medianOthers
        : null;
    return {
      index,
      t0,
      medianOthers,
      relative,
      far: relative != null && relative > T0_RELATIVE_CUTOFF,
    };
  });
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function t0ComparisonParagraph(
  samples: RetentionSample[],
  checks: T0Check[],
  keptRunNumbers: Set<number>,
): string {
  const lines = [
    "Each run’s first-peak time is compared with the middle first-peak time of the other runs. A run is left out when that time is more than 10% away.",
  ];
  for (const check of checks) {
    const sample = samples[check.index];
    const label = runLabel(check.index, sample);
    if (check.far) {
      lines.push(`${label}. ${t0LeaveOutSentence(check)}`);
      continue;
    }
    if (check.t0 == null || check.medianOthers == null || check.relative == null) continue;
    if (keptRunNumbers.has(check.index + 1)) {
      lines.push(`${label}. ${t0KeepSentence(check)}`);
    } else {
      lines.push(
        `${label}. Its first-peak time is ${formatMinutes(check.t0)} min, ${formatRelative(check.relative)} from the middle of the other runs (${formatMinutes(check.medianOthers)} min), so it is not left out for that.`,
      );
    }
  }
  return lines.join(" ");
}

function t0LeaveOutSentence(check: T0Check): string {
  return `It is left out because its first-peak time (${formatMinutes(check.t0!)} min) does not match the other runs. The middle first-peak time of the other runs is ${formatMinutes(check.medianOthers!)} min, and this one is ${formatRelative(check.relative!)} away, past the 10% cutoff.`;
}

function t0KeepSentence(check: T0Check): string {
  return `It is kept. Its first-peak time is ${formatMinutes(check.t0!)} min, ${formatRelative(check.relative!)} from the middle of the other runs (${formatMinutes(check.medianOthers!)} min).`;
}

function formatRelative(value: number): string {
  return `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
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

/** Keep the 10-point drop while the last peak is under this fraction of the typed time. */
const RETENTION_TIME_FRACTION = 0.66;

function retentionLine(specMin: number): number {
  return RETENTION_TIME_FRACTION * specMin;
}

function retentionPercent(): string {
  return `${Math.round(RETENTION_TIME_FRACTION * 100)}%`;
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

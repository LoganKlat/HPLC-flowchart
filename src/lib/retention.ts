import { formatDecimal, resolutionForDecision } from "@/lib/evaluate";
import { PERCENT_B_SENTENCE, SELECTIVITY_ORDER, TEMPERATURE_SENTENCE } from "@/lib/setting-kind";
import type { PeakMeasurement } from "@/lib/lab-file";

/**
 * Retention step: choose the next %B, or say retention is finished.
 * The typed minimum resolution does not finish this step. It is used only to
 * decide whether the first run, or the highest-%B run, can be left out of the
 * line once there are more than three chromatograms.
 *
 * A run is also left out when Dixon's Q-test flags its t0 peak. That test
 * needs at least three t0 peaks, and it never leaves fewer than two runs.
 * Poor separation is a separate reason to leave a run out.
 */

export type RetentionSample = {
  percentB: number | null;
  peakCount: number | null;
  lastPeakTimeMin: number | null;
  firstPeakTimeMin: number | null;
  minResolutionExcludingFirst: number | null;
  maxBackPressurePsi: number | null;
  /** Peak table rows. Used when the peak count is above the specification. */
  peaks?: PeakMeasurement[];
};

export type RetentionChoice = {
  /** The latest file is the in-between %B the user typed. */
  afterInBetween?: boolean;
  /** The user said no to moving on, so show the minimum %B. */
  declinedEfficiencyNow?: boolean;
  /** Continue selectivity on this run, before a run has been picked to heat. */
  continueToLook?: boolean;
  /** Decline selectivity and stay on retention: one calculated intermediate %B. */
  continueRetention?: boolean;
};

export type LookMark = "met" | "not-met" | "blank";

export type LookRun = {
  index: number;
  percentB: number | null;
  peakCount: number | null;
  resolution: number | null;
  lastPeakTimeMin: number | null;
  peaks: LookMark;
  resolutionMark: LookMark;
  time: LookMark;
  pressure: LookMark;
};

export type LookStep = {
  /** between: in-between %B only. between-then-heat: then pick a run. picker: pick a run. */
  mode: "between" | "between-then-heat" | "picker";
  runs: LookRun[];
  /** Run whose temperature, solvent, and ligand are copied for an in-between %B. */
  sourceIndex: number;
};

export type EfficiencyNow = {
  question: string;
  why: string;
  steps?: string[];
};

export const EFFICIENCY_MOVE_ON =
  "Move on to efficiency. This is recommended because the peak count equals the specification.";

export const EFFICIENCY_CONTINUE = "Continue selectivity.";

export type EfficiencyChoice = {
  recommendedSentence: string;
  continueLabel: string;
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

/** One uploaded run, whether or not the starting line keeps it. */
export type FitCatalogRun = {
  runNumber: number;
  percentB: number | null;
  t0: number | null;
  /** Last peak time, in minutes. */
  tR: number | null;
  k: number | null;
  logK: number | null;
  /** True when the Q-test and the separation rules keep this run on the starting line. */
  included: boolean;
};

export type RetentionFit = {
  rows: RetentionFitRow[];
  excluded: RetentionExclusion[];
  /** Every uploaded run, in order. The starting ticks are `included`. */
  catalog: FitCatalogRun[];
  /** Last-peak time in the specification, in minutes. The target logK aims at this. */
  specifiedTimeMin: number;
  /** Q-test result for the t0 peaks. Shown once in the calculation. */
  qtestSentence: string;
  /** %B values already uploaded. The rounding rule reads this list. */
  usedPercentB: number[];
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

export type MinimumFit = {
  rows: RetentionFitRow[];
  m: number;
  c: number;
  /** Coefficient of determination for the line through the selected runs. */
  rSquared: number;
  t0Average: number;
  kTarget: number;
  logKTarget: number;
  rawPercentB: number;
  nextPercentB: number;
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
  | "fit-unavailable"
  | "investigate"
  | "specs-met"
  | "efficiency"
  | "look"
  | "intermediate"
  | "cannot-calculate";

export type PercentChoice = {
  id: "drop-10" | "minimum";
  percentB: number;
  expectedLastPeakMin: number | null;
  sentence: string;
};

export type RetentionDecision = {
  status: "recommend" | "finished" | "blocked" | "investigate" | "efficiency" | "specs-met" | "look" | "ask";
  reason: RetentionReason;
  move: "drop-10" | "drop-5" | "calculated" | null;
  nextPercentB: number | null;
  /** Set when the next run should also change temperature, instead of only %B. */
  nextTemperature?: string | null;
  nextChange: string;
  /** The step after the next one, including why the order is that way. */
  following?: string | null;
  /** Peaks, pressure, and last-peak time for a calculated %B. */
  brief?: string[] | null;
  why: string;
  fit: RetentionFit | null;
  /** Two allowed %B values when a 10-point drop and the logK line are both allowed. */
  bChoices?: PercentChoice[] | null;
  look?: LookStep;
  /** One question before the minimum %B, when the peak count already matches. */
  efficiencyNow?: EfficiencyNow | null;
  /** Two buttons when efficiency would be next. Absent when the chemistry is locked. */
  efficiencyChoice?: EfficiencyChoice | null;
  /** Continue on this run opens Look at the runs instead of heating immediately. */
  continueShowsLook?: boolean;
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
  choice?: RetentionChoice,
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
      `${missingRules.join(" ")} A next %B is not recommended until those parts of the specification are filled in.`,
    );
  }
  const complete: CompleteRules = {
    requiredPeaks: rules.requiredPeaks!,
    lastPeakTimeMin: rules.lastPeakTimeMin!,
    maxBackPressurePsi: rules.maxBackPressurePsi!,
    minResolution: rules.minResolution ?? null,
  };

  if (current.peakCount != null && current.peakCount > complete.requiredPeaks) {
    return investigateDecision(current, complete);
  }

  if (choice?.afterInBetween) {
    return afterInBetweenFile(samples, complete, choice);
  }

  if (current.percentB == null) {
    return blocked(
      "missing-percent",
      "Do not recommend a %B yet.",
      "Type the %B for this run. The next %B is worked out from the %B saved on each run. Without that number, there is nothing to compare with the specification.",
    );
  }

  if (samples.length >= 2) {
    const prior = decideRetention(samples.slice(0, -1), complete);
    const ranLong =
      current.lastPeakTimeMin != null && isPast(current.lastPeakTimeMin, complete.lastPeakTimeMin);
    if (
      prior.move === "calculated" &&
      prior.nextPercentB != null &&
      (nearly(current.percentB, prior.nextPercentB) || ranLong)
    ) {
      return afterCalculatedFile(samples, complete, choice);
    }
  }

  const missing = missingMeasurements(current);
  if (missing.length > 0) {
    return blocked(
      "missing-measurement",
      "Do not recommend a %B.",
      `${missing.join(" ")} A next %B is not recommended until this chromatogram has those measurements.`,
    );
  }

  if (current.peakCount === complete.requiredPeaks) {
    return equalPeakCount(samples, complete, choice);
  }

  if (!pressureIsUnder(current.maxBackPressurePsi!, complete.maxBackPressurePsi)) {
    const measured = formatDecimal(current.maxBackPressurePsi!, 1);
    const limit = formatDecimal(complete.maxBackPressurePsi, 1);
    return blocked(
      "pressure",
      `Do not lower %B. The highest back-pressure is ${measured} psi, already at or above the specification of ${limit} psi.`,
      `The pressure is already too high to lower %B. This run reached ${measured} psi. The specification is ${limit} psi. A lower %B is a weaker solvent, so the compounds stay on the column longer and the back-pressure usually rises. That longer stay is higher retention. Selectivity and efficiency are not why this step stops.`,
    );
  }

  if (
    current.peakCount! < complete.requiredPeaks &&
    isPast(current.lastPeakTimeMin!, complete.lastPeakTimeMin)
  ) {
    const proposed = calculatePercentB(samples, complete);
    const lowers =
      proposed.nextPercentB != null && proposed.nextPercentB < current.percentB! - 1e-6;
    if (lowers || proposed.move === "drop-5" || proposed.move === "drop-10") {
      return returnToSelectivity(samples, complete);
    }
    return proposed;
  }

  const line = retentionLine(complete.lastPeakTimeMin);
  if (!isPast(current.lastPeakTimeMin!, line)) {
    return dropPoints(samples, complete, 10, "drop-10");
  }
  return calculatePercentB(samples, complete);
}

/** Blank when the typed %B can be the next in-between run. */
export function inBetweenPercentError(raw: string, usedPercentB: number[]): string | null {
  const text = raw.trim();
  if (!text) return "Type a %B from 0 to 100.";
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > 100) return "Type a %B from 0 to 100.";
  if (usedPercentB.some((percent) => nearly(percent, value))) {
    return `A run at ${formatPercentB(value)}% B is already uploaded. Type a different %B.`;
  }
  return null;
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

/** Round a calculated minimum %B up to a whole percent that is not already a run. */
export function roundMinimumPercent(
  raw: number,
  usedPercentB: readonly number[],
): { value: number; clamped: "low" | "high" | null; oneDecimal: false } {
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
  let value = nearly(working, whole) ? whole : Math.ceil(working);
  if (value > 100) {
    value = 100;
    clamped = "high";
  }
  while (value < 100 && usedPercentB.some((percent) => nearly(percent, value))) value += 1;
  return { value, clamped, oneDecimal: false };
}

export function formatPercentB(value: number): string {
  const whole = roundHalfAwayFromZero(value, 0);
  if (nearly(value, whole)) return String(whole);
  const tenth = roundHalfAwayFromZero(value, 1);
  if (nearly(value, tenth)) return tenth.toFixed(1);
  return value.toFixed(2);
}

const INVESTIGATE_COPY =
  "This run has more peaks than the specification. Stop and investigate before changing %B, temperature, solvent, or the column. An extra peak can be a breakdown product, a peak that split in two, or sample left over from an earlier injection. Changing the method now would chase a peak that may not be one of the compounds. Compare the area and the height of the extra peak with the peaks from a 0.1 mg/mL injection. If it is nowhere near that size, it is probably not one of the compounds. You decide. Leave retention, selectivity, and efficiency as they are until that extra peak is checked. Changing them would move how long compounds stay, pull peaks apart, or narrow them for a peak that may not belong.";

function investigateDecision(sample: RetentionSample, rules: CompleteRules): RetentionDecision {
  const peaks = sample.peaks ?? [];
  const areaMissing = peaks.length === 0 || peaks.some((peak) => peak.area == null);
  const heightMissing = peaks.length === 0 || peaks.some((peak) => peak.height == null);
  const lines = [
    INVESTIGATE_COPY,
    `Peaks: ${formatCount(sample.peakCount ?? peaks.length)}. The specification is ${formatCount(rules.requiredPeaks)}.`,
  ];
  if (areaMissing) lines.push("Area is missing.");
  if (heightMissing) lines.push("Height is missing.");
  if (peaks.length === 0) {
    lines.push("The peak table rows are not available, so retention time, area, and height cannot be listed.");
  } else {
    lines.push("Every peak:");
    for (const peak of peaks) {
      const time = peak.timeMin == null ? "time missing" : `${formatMinutes(peak.timeMin)} min`;
      const area = peak.area == null ? "area missing" : String(peak.area);
      const height = peak.height == null ? "height missing" : String(peak.height);
      lines.push(`Retention time ${time}. Area ${area}. Height ${height}.`);
    }
  }
  return {
    status: "investigate",
    reason: "investigate",
    move: null,
    nextPercentB: null,
    nextChange: "Investigate. Do not change %B, temperature, solvent, or the column.",
    why: lines.join("\n\n"),
    fit: null,
  };
}

function afterCalculatedFile(
  samples: RetentionSample[],
  rules: CompleteRules,
  choice: RetentionChoice | undefined,
): RetentionDecision {
  const current = samples[samples.length - 1];
  if (current.peakCount != null && current.peakCount > rules.requiredPeaks) {
    return investigateDecision(current, rules);
  }
  if (current.peakCount === rules.requiredPeaks) {
    const judged = judgeEqualPeaks(current, rules);
    if (judged.resolutionMeets && !judged.timeLate) return specsMet(current, rules, judged);
    if (judged.timeLate && !judged.resolutionPositive) return holdLate(current, rules, judged);
    if (choice?.continueRetention) {
      const intermediate = intermediateAfterMinimum(samples, rules);
      if (intermediate) return intermediate;
    }
    if (choice?.continueToLook) return lookDecision(samples, rules, "between-then-heat");
    return efficiencyStop(current, rules, judged, true);
  }
  const intermediate = intermediateAfterMinimum(samples, rules);
  if (intermediate) return intermediate;
  return lookDecision(samples, rules, "between-then-heat");
}

function afterInBetweenFile(
  samples: RetentionSample[],
  rules: CompleteRules,
  choice: RetentionChoice | undefined,
): RetentionDecision {
  const current = samples[samples.length - 1];
  if (current.peakCount != null && current.peakCount > rules.requiredPeaks) {
    return investigateDecision(current, rules);
  }
  if (current.peakCount === rules.requiredPeaks) {
    const judged = judgeEqualPeaks(current, rules);
    if (judged.resolutionMeets && !judged.timeLate) return specsMet(current, rules, judged);
    if (choice?.continueToLook) return lookDecision(samples, rules, "between-then-heat");
    return efficiencyStop(current, rules, judged, true);
  }
  return lookDecision(samples, rules, "picker");
}

function equalPeakCount(
  samples: RetentionSample[],
  rules: CompleteRules,
  choice: RetentionChoice | undefined,
): RetentionDecision {
  const current = samples[samples.length - 1];
  const judged = judgeEqualPeaks(current, rules);
  if (judged.resolutionMeets && !judged.timeLate) return specsMet(current, rules, judged);
  if (choice?.continueRetention) {
    const intermediate = intermediateAfterMinimum(samples, rules);
    if (intermediate) return intermediate;
  }
  if (judged.timeLate && judged.resolutionPositive) return efficiencyStop(current, rules, judged);
  if (judged.timeLate) return holdLate(current, rules, judged);
  return minimumPercentOnce(samples, rules, choice);
}

type EqualJudgment = {
  resolution: number | null;
  resolutionMeets: boolean;
  resolutionPositive: boolean;
  timeLate: boolean;
};

function judgeEqualPeaks(sample: RetentionSample, rules: CompleteRules): EqualJudgment {
  const resolution = resolutionForDecision(
    sample.peakCount,
    sample.minResolutionExcludingFirst,
    rules.requiredPeaks,
  );
  const hasResolutionSpec = rules.minResolution != null && rules.minResolution > 0;
  const resolutionMeets =
    !hasResolutionSpec || (resolution != null && Number.isFinite(resolution) && resolution + 1e-9 >= rules.minResolution!);
  const timeLate = sample.lastPeakTimeMin != null && isPast(sample.lastPeakTimeMin, rules.lastPeakTimeMin);
  const resolutionPositive = resolution != null && Number.isFinite(resolution) && resolution > 0;
  return { resolution, resolutionMeets, resolutionPositive, timeLate };
}

function specsMet(sample: RetentionSample, rules: CompleteRules, judged: EqualJudgment): RetentionDecision {
  return {
    status: "specs-met",
    reason: "specs-met",
    move: null,
    nextPercentB: null,
    nextChange: "The specifications are met.",
    why: [
      ...ruleLines(sample, rules, judged),
      rules.minResolution != null && rules.minResolution > 0
        ? "The specifications are met. Do not keep going. The peaks are there, the worst pair is far enough apart, the last peak is inside the specified time, and the back-pressure is inside the specification. Retention, selectivity, and efficiency already meet the specification, so none of them is changed."
        : "The specifications are met. Do not keep going. The peaks are there, the last peak is inside the specified time, and the back-pressure is inside the specification. Retention is already inside the specified time, so it is not changed. Selectivity is not the next step either.",
    ].join("\n\n"),
    fit: null,
  };
}

function efficiencyStop(
  sample: RetentionSample,
  rules: CompleteRules,
  judged: EqualJudgment,
  continueShowsLook = false,
): RetentionDecision {
  const nextLine = judged.resolutionMeets
    ? "Efficiency is next to bring the last peak time to the specification. The peaks are already there and the worst pair is already far enough apart. Efficiency can shorten the run without changing the separation you already have."
    : "Efficiency is next for the resolution. The peaks are there, but the worst pair is still too close. The next change is meant to pull them apart.";
  return {
    status: "efficiency",
    reason: "efficiency",
    move: null,
    nextPercentB: null,
    nextChange: EFFICIENCY_MOVE_ON,
    why: [
      ...ruleLines(sample, rules, judged),
      nextLine,
      "Efficiency is not built yet. This recommendation does not change %B, temperature, solvent, or the column.",
    ].join("\n\n"),
    fit: null,
    efficiencyChoice: {
      recommendedSentence: EFFICIENCY_MOVE_ON,
      continueLabel: EFFICIENCY_CONTINUE,
    },
    continueShowsLook,
  };
}

function holdLate(sample: RetentionSample, rules: CompleteRules, judged: EqualJudgment): RetentionDecision {
  return {
    status: "blocked",
    reason: "efficiency",
    move: null,
    nextPercentB: null,
    nextChange: "Do not change %B, temperature, solvent, or the column.",
    why: [
      ...ruleLines(sample, rules, judged),
      "The minimum resolution is not above 0, so the peaks are not really separated. The last peak is later than the specification, so the run is already too long. Lowering %B would hold the compounds even longer. This run stays here.",
    ].join("\n\n"),
    fit: null,
  };
}

function minimumPercentOnce(
  samples: RetentionSample[],
  rules: CompleteRules,
  _choice: RetentionChoice | undefined,
): RetentionDecision {
  const current = samples[samples.length - 1];
  const calculated = calculatePercentB(samples, rules, "equal");
  const unusable =
    calculated.move === "drop-5" || calculated.reason === "fit-unavailable" || calculated.nextPercentB == null;
  let decision: RetentionDecision;
  if (unusable) {
    decision = {
      status: "blocked",
      reason: "cannot-calculate",
      move: null,
      nextPercentB: null,
      nextChange: "The minimum %B cannot be calculated yet. Do not change %B, temperature, solvent, or the column.",
      why: [
        ...ruleLines(current, rules, judgeEqualPeaks(current, rules)),
        "There are not enough runs to calculate the minimum %B. The peak count matches the specification, so %B is not dropped by 10%. The next %B has to come from more than one chromatogram, and this series does not have enough usable runs yet. Lowering %B would raise retention. That is not the next step until more runs can show the %B for the specified time.",
      ].join("\n\n"),
      fit: null,
    };
  } else if (nearly(current.percentB!, calculated.nextPercentB!)) {
    const intermediate = intermediateAfterMinimum(samples, rules);
    if (intermediate) return intermediate;
    return lookDecision(samples, rules, "between");
  } else {
    decision = calculated;
  }
  return decision;
}

function ruleLines(sample: RetentionSample, rules: CompleteRules, judged: EqualJudgment): string[] {
  const lines = [
    `Peaks: ${formatCount(sample.peakCount ?? 0)}. The specification is ${formatCount(rules.requiredPeaks)}. Met.`,
  ];
  if (rules.minResolution != null && rules.minResolution > 0) {
    const shown =
      judged.resolution == null || !Number.isFinite(judged.resolution)
        ? "not in this file"
        : formatResolution(judged.resolution);
    lines.push(
      `Minimum resolution: ${shown}. ${judged.resolutionMeets ? "Above" : "Under"} the specification of ${formatResolution(rules.minResolution)}.`,
    );
  }
  if (sample.lastPeakTimeMin == null) {
    lines.push(`Last peak: not in this file. The specification is ${formatTypedMinutes(rules.lastPeakTimeMin)} min. Not met.`);
  } else if (judged.timeLate) {
    lines.push(
      `Last peak: ${formatMinutes(sample.lastPeakTimeMin)} min. Later than the specification of ${formatTypedMinutes(rules.lastPeakTimeMin)} min. Not met.`,
    );
  } else {
    lines.push(
      `Last peak: ${formatMinutes(sample.lastPeakTimeMin)} min. The specification is ${formatTypedMinutes(rules.lastPeakTimeMin)} min. Met.`,
    );
  }
  if (sample.maxBackPressurePsi == null) {
    lines.push(
      `Back-pressure: not in this file. The specification is ${formatTypedPressure(rules.maxBackPressurePsi)} psi. Not met.`,
    );
  } else if (!pressureIsUnder(sample.maxBackPressurePsi, rules.maxBackPressurePsi) && !nearly(sample.maxBackPressurePsi, rules.maxBackPressurePsi)) {
    lines.push(
      `Back-pressure: ${formatDecimal(sample.maxBackPressurePsi, 1)} psi. Over the specification of ${formatTypedPressure(rules.maxBackPressurePsi)} psi. Not met.`,
    );
  } else {
    lines.push(
      `Back-pressure: ${formatDecimal(sample.maxBackPressurePsi, 1)} psi. Under the specification of ${formatTypedPressure(rules.maxBackPressurePsi)} psi. Met.`,
    );
  }
  return lines;
}

/**
 * After the minimum-%B chromatogram has been tested: the whole %B, inside the
 * tested range, where the closest logK lines are farthest apart and the
 * predicted last peak still meets the set time.
 */
function intermediateAfterMinimum(
  samples: RetentionSample[],
  rules: CompleteRules,
): RetentionDecision | null {
  const current = samples[samples.length - 1];
  if (timedPeaks(current).length < 2) return null;
  const found = optimalIntermediatePercent(samples, rules);
  if (!found) return null;
  const percent = formatPercentB(found.percentB);
  const identity = found.named
    ? "Named compounds stay on their own line, even when the elution order changes. A peak with no name uses its peak number."
    : "These files do not name the compounds, so each line uses the same peak number. If two compounds change elution order, that line is not one compound.";
  const edge = found.atEdge
    ? `${percent}% B is at the edge of the %B values already tested. One more run should confirm it.`
    : "";
  const why = [
    `logK was fit for each compound, leaving out the t0 peak. ${identity} A line is kept only when that peak shows up in at least three runs.`,
    `At each whole %B inside the tested range, the smallest gap between those lines was measured. ${percent}% B is where that gap is largest. The predicted last peak there is ${formatMinutes(found.predictedLastMin)} min, inside the set time of ${formatTypedMinutes(rules.lastPeakTimeMin)} min. That gap is not the chromatographic resolution.`,
    edge,
  ]
    .filter((paragraph) => paragraph.length > 0)
    .join("\n\n");
  return {
    status: "recommend",
    reason: "intermediate",
    move: null,
    nextPercentB: found.percentB,
    nextChange: `Run the next chromatogram at ${percent}% B. That is the intermediate %B. The closest peaks are farthest apart there, and the predicted last peak stays within the set time.`,
    why,
    fit: null,
  };
}

function optimalIntermediatePercent(
  samples: RetentionSample[],
  rules: CompleteRules,
): { percentB: number; predictedLastMin: number; atEdge: boolean; named: boolean } | null {
  const used = samples
    .map((sample) => sample.percentB)
    .filter((percent): percent is number => percent != null && Number.isFinite(percent));
  const points = new Map<string, { x: number; y: number; t0: number; run: number }[]>();
  const namedKeys = new Set<string>();
  samples.forEach((sample, run) => {
    if (sample.percentB == null || !Number.isFinite(sample.percentB)) return;
    const peaks = timedPeaks(sample);
    if (peaks.length < 2) return;
    const t0 = peaks[0].timeMin!;
    if (!(t0 > 0)) return;
    const seen = new Set<string>();
    peaks.slice(1).forEach((peak, index) => {
      const tR = peak.timeMin!;
      const k = (tR - t0) / t0;
      if (!(k > 0)) return;
      const identity = compoundKey(peak, index);
      if (seen.has(identity.key)) return;
      seen.add(identity.key);
      const line = points.get(identity.key) ?? [];
      line.push({ x: sample.percentB!, y: Math.log10(k), t0, run });
      points.set(identity.key, line);
      if (identity.named) namedKeys.add(identity.key);
    });
  });
  const fits: { m: number; c: number; named: boolean }[] = [];
  const t0ByRun = new Map<number, number>();
  for (const [key, line] of points) {
    if (line.length < 3) continue;
    const fit = slopeIntercept(line);
    if (!fit) continue;
    fits.push({ ...fit, named: namedKeys.has(key) });
    for (const point of line) t0ByRun.set(point.run, point.t0);
  }
  if (fits.length < 2 || t0ByRun.size === 0) return null;
  const percents = [...t0ByRun.keys()].map((run) => samples[run].percentB!);
  if (percents.length === 0) return null;
  const minB = Math.min(...percents);
  const maxB = Math.max(...percents);
  const low = Math.floor(minB) + 1;
  const high = Math.ceil(maxB) - 1;
  if (low > high) return null;
  const t0Values = [...t0ByRun.values()];
  const t0Average = t0Values.reduce((sum, value) => sum + value, 0) / t0Values.length;
  const middle = (minB + maxB) / 2;
  let best: { percentB: number; dMin: number; predictedLastMin: number } | null = null;
  for (let percent = low; percent <= high; percent++) {
    if (used.some((value) => nearly(value, percent))) continue;
    const logs = fits.map((fit) => fit.m * percent + fit.c);
    let dMin = Infinity;
    for (let i = 0; i < logs.length; i++) {
      for (let j = i + 1; j < logs.length; j++) {
        dMin = Math.min(dMin, Math.abs(logs[i] - logs[j]));
      }
    }
    if (!Number.isFinite(dMin)) continue;
    const predictedLast = Math.max(...logs.map((logK) => t0Average * (1 + 10 ** logK)));
    if (!Number.isFinite(predictedLast) || isPast(predictedLast, rules.lastPeakTimeMin)) continue;
    const nearer =
      best == null ||
      dMin > best.dMin + 1e-12 ||
      (Math.abs(dMin - best.dMin) <= 1e-12 && Math.abs(percent - middle) < Math.abs(best.percentB - middle) - 1e-9);
    if (nearer) best = { percentB: percent, dMin, predictedLastMin: predictedLast };
  }
  if (!best) return null;
  return {
    percentB: best.percentB,
    predictedLastMin: best.predictedLastMin,
    atEdge: best.percentB === low || best.percentB === high,
    named: fits.some((fit) => fit.named),
  };
}

function timedPeaks(sample: RetentionSample): PeakMeasurement[] {
  return (sample.peaks ?? [])
    .filter((peak) => peak.timeMin != null && Number.isFinite(peak.timeMin))
    .slice()
    .sort((a, b) => a.timeMin! - b.timeMin!);
}

function compoundKey(peak: PeakMeasurement, elutionIndex: number): { key: string; named: boolean } {
  const name = peak.name?.trim();
  if (name) return { key: `name:${name.toLowerCase()}`, named: true };
  const id = peak.id?.trim();
  if (id) return { key: `id:${id.toLowerCase()}`, named: true };
  return { key: `order:${elutionIndex}`, named: false };
}

function slopeIntercept(points: { x: number; y: number }[]): { m: number; c: number } | null {
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
  if (!Number.isFinite(m) || !Number.isFinite(c)) return null;
  return { m, c };
}

function lookDecision(
  samples: RetentionSample[],
  rules: CompleteRules,
  mode: LookStep["mode"],
): RetentionDecision {
  const sourceIndex = samples.length - 1;
  const why =
    mode === "picker"
      ? "The peak count is still under the specification, so some peaks are still overlapping. Pick which uploaded run to heat. Heat is the next change. The goal is a selectivity change so the overlapping peaks separate. A higher temperature shortens retention. The %B of the run you pick stays the same."
      : mode === "between"
        ? "Compare the runs. The calculated %B matches a run already uploaded, so another drop is not the next step. An in-between %B uses the same temperature, solvent, and ligand as this run, and it sits between %B values already tried. A no does not start temperature, solvent, or a column. An in-between %B changes retention. It does not change selectivity, because temperature, solvent, and ligand stay the same."
        : "Compare the runs before the next change. An in-between %B uses the same temperature, solvent, and ligand as the minimum %B run, and it fills a gap between %B values already tried. If that is not useful, pick which uploaded run to heat. Heat can pull overlapping peaks apart without dropping %B again. An in-between %B changes retention only. Heat is a selectivity change.";
  return {
    status: "look",
    reason: "look",
    move: null,
    nextPercentB: null,
    nextChange: "Look at the runs.",
    why,
    fit: null,
    look: { mode, runs: lookRuns(samples, rules), sourceIndex },
  };
}

function lookRuns(samples: RetentionSample[], rules: CompleteRules): LookRun[] {
  return samples.map((sample, index) => {
    const resolution = resolutionForDecision(
      sample.peakCount,
      sample.minResolutionExcludingFirst,
      rules.requiredPeaks,
    );
    const peaks: LookMark =
      sample.peakCount == null ? "blank" : sample.peakCount >= rules.requiredPeaks ? "met" : "not-met";
    const resolutionMark: LookMark =
      rules.minResolution == null || !(rules.minResolution > 0)
        ? "blank"
        : resolution == null || !Number.isFinite(resolution)
          ? "not-met"
          : resolution + 1e-9 >= rules.minResolution
            ? "met"
            : "not-met";
    const time: LookMark =
      sample.lastPeakTimeMin == null
        ? "blank"
        : isPast(sample.lastPeakTimeMin, rules.lastPeakTimeMin)
          ? "not-met"
          : "met";
    const pressure: LookMark =
      sample.maxBackPressurePsi == null
        ? "blank"
        : sample.maxBackPressurePsi <= rules.maxBackPressurePsi
          ? "met"
          : "not-met";
    return {
      index,
      percentB: sample.percentB,
      peakCount: sample.peakCount,
      resolution,
      lastPeakTimeMin: sample.lastPeakTimeMin,
      peaks,
      resolutionMark,
      time,
      pressure,
    };
  });
}

/** Index of the in-time run selectivity should start from, or null when none qualify. */
export function carryForwardIndex(samples: RetentionSample[], rules: RetentionRules): number | null {
  if (rules.requiredPeaks == null || rules.lastPeakTimeMin == null || rules.maxBackPressurePsi == null) {
    return null;
  }
  const chosen = chooseCarryRun(samples, {
    requiredPeaks: rules.requiredPeaks,
    lastPeakTimeMin: rules.lastPeakTimeMin,
    maxBackPressurePsi: rules.maxBackPressurePsi,
    minResolution: rules.minResolution ?? null,
  });
  return chosen?.index ?? null;
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

  const pool = eligible;
  pool.sort((a, b) => {
    const aMeets = meetsPeakCount(a.sample, rules.requiredPeaks);
    const bMeets = meetsPeakCount(b.sample, rules.requiredPeaks);
    if (aMeets !== bMeets) return aMeets ? -1 : 1;
    const aScore = carryResolution(a.sample, rules.requiredPeaks);
    const bScore = carryResolution(b.sample, rules.requiredPeaks);
    if (aScore != null && bScore != null && aScore !== bScore) return bScore - aScore;
    if (aScore != null && bScore == null) return -1;
    if (aScore == null && bScore != null) return 1;
    return b.index - a.index;
  });
  return pool[0];
}

function meetsPeakCount(sample: RetentionSample, requiredPeaks: number): boolean {
  return sample.peakCount != null && sample.peakCount >= requiredPeaks;
}

/** Same rule as the results table: too few peaks means the minimum resolution is 0. */
function carryResolution(sample: RetentionSample, requiredPeaks: number): number | null {
  return resolutionForDecision(sample.peakCount, sample.minResolutionExcludingFirst, requiredPeaks);
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
      ? `Lower %B by 5 percentage points. Run the next chromatogram at ${to}% B. Another run is needed before the %B that hits the last-peak time can be calculated.${clampNote} ${PERCENT_B_SENTENCE}`
      : `Run the next one at ${to}% B.${clampNote} ${PERCENT_B_SENTENCE}`;

  const whyParts = situationSentences(samples, rules);
  if (reason === "drop-10") {
    whyParts.push(
      `The last peak is at ${formatMinutes(current.lastPeakTimeMin!)} min, still significantly under the specified run time of ${formatTypedMinutes(rules.lastPeakTimeMin)} min. Decrease %B by 10% to increase retention and peak separation.`,
    );
  } else {
    whyParts.push(
      `The last peak is at ${formatMinutes(current.lastPeakTimeMin!)} min, close to the specified run time of ${formatTypedMinutes(rules.lastPeakTimeMin)} min. This is the only chromatogram so far, so the %B that would hit that time is not calculated. ${from}% B minus 5 percentage points is ${to}% B. Another run is needed before that %B can be calculated. A larger drop is not used, because retention grows quickly as %B goes down.`,
    );
  }

  return {
    status: "recommend",
    reason,
    move: reason,
    nextPercentB: next,
    nextChange,
    following: SELECTIVITY_ORDER,
    why: whyParts.join("\n\n"),
    fit: null,
  };
}

function returnToSelectivity(samples: RetentionSample[], rules: CompleteRules): RetentionDecision {
  const current = samples[samples.length - 1];
  const previous = samples.length >= 2 ? samples[samples.length - 2] : null;
  const back =
    previous?.percentB != null && previous.percentB + 1e-6 >= current.percentB!
      ? previous.percentB
      : current.percentB!;
  const percent = formatPercentB(back);
  return {
    status: "recommend",
    reason: "drop-10",
    move: null,
    nextPercentB: back,
    nextTemperature: "40",
    nextChange: `Go back to ${percent}% B and change selectivity. Run the next chromatogram at 40°C, still at ${percent}% B. The goal is to change the conditions so the selectivity changes and the overlapping peaks separate. A higher temperature shortens retention. The %B stays the same. ${TEMPERATURE_SENTENCE} Do not lower %B. The last peak is already past the time and the peak count is still short.`,
    following: SELECTIVITY_ORDER,
    why: [
      `This run has ${formatCount(current.peakCount!)} peaks, still under the specification of ${formatCount(rules.requiredPeaks)}.`,
      `The last peak is at ${formatMinutes(current.lastPeakTimeMin!)} min, later than the specification of ${formatMinutes(rules.lastPeakTimeMin)} min. A lower %B would hold the compounds even longer. Go back to ${percent}% B and change selectivity instead.`,
    ].join("\n\n"),
    fit: null,
  };
}

function closeToSpecSentence(lastPeakMin: number, specMin: number): string {
  return `The last peak is at ${formatMinutes(lastPeakMin)} min, close to the specified run time of ${formatTypedMinutes(specMin)} min. Another 10% drop would make retention much longer, because retention grows quickly as %B goes down. The next %B is calculated instead.`;
}

function resolutionChangeSentence(previous: number | null, current: number | null): string {
  if (previous == null && current == null) {
    return "Neither this run nor the previous one has a usable resolution.";
  }
  if (previous == null) {
    return `The previous run had no usable resolution, and this run’s minimum resolution is ${formatResolution(current!)}.`;
  }
  if (current == null) {
    return `Minimum resolution on the previous run was ${formatResolution(previous)}. This run does not have one.`;
  }
  if (current > previous) {
    return `Minimum resolution went from ${formatResolution(previous)} to ${formatResolution(current)}, which is higher than the previous run.`;
  }
  return `Minimum resolution went from ${formatResolution(previous)} to ${formatResolution(current)}.`;
}

function calculatePercentB(
  samples: RetentionSample[],
  rules: CompleteRules,
  mode: "ladder" | "equal" = "ladder",
): RetentionDecision {
  const current = samples[samples.length - 1];
  const intro =
    mode === "equal"
      ? equalIntro(samples, rules)
      : [
          ...situationSentences(samples, rules),
          closeToSpecSentence(current.lastPeakTimeMin!, rules.lastPeakTimeMin),
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
        `Run ${item.runNumber} is not used because the last peak is not after the t0 peak.`,
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
      [
        ...intro,
        "At least two usable chromatograms are needed, each with a last peak after the t0 peak. There are not enough left, so a next %B is not recommended. The missing piece is the %B that would set retention to the specified last-peak time. Selectivity and efficiency are not the next step.",
      ].join(
        "\n\n",
      ),
    );
  }

  const lineFit = ordinaryLeastSquares(rows.map((row) => ({ x: row.percentB, y: row.logK })));
  if (!lineFit) {
    return blocked(
      "fit-unavailable",
      "Do not recommend a %B. These runs do not point to a %B that would put the last peak on the specified time.",
      [...intro, "The runs kept for the calculation do not point to a %B that would put the last peak on the specified time."].join("\n\n"),
    );
  }

  const t0Average = rows.reduce((sum, row) => sum + row.t0, 0) / rows.length;
  const kTarget = (rules.lastPeakTimeMin - t0Average) / t0Average;
  if (!(kTarget > 0) || !(t0Average > 0)) {
    return blocked(
      "fit-unavailable",
      "Do not recommend a %B. The last-peak time in the specification is not after the average t0 peak.",
      [
        ...intro,
        `The average t0 of the runs used here is ${formatMinutes(t0Average)} min. The last peak in the specification has to come out after that t0 peak, or there is no retained peak to aim at.`,
      ].join(
        "\n\n",
      ),
    );
  }

  const logKTarget = Math.log10(kTarget);
  const rawPercentB = (logKTarget - lineFit.c) / lineFit.m;
  if (!Number.isFinite(rawPercentB)) {
    return blocked(
      "fit-unavailable",
      "Do not recommend a %B. These runs do not point to a %B that would put the last peak on the specified time.",
      [...intro, "These runs do not point to a %B that would put the last peak on the specified time."].join("\n\n"),
    );
  }

  const usedPercentB = samples
    .map((sample) => sample.percentB)
    .filter((percent): percent is number => percent != null);
  const rounded = roundMinimumPercent(rawPercentB, usedPercentB);
  const fit: RetentionFit = {
    rows,
    excluded: picked.excluded,
    catalog: catalogRuns(samples, rows),
    specifiedTimeMin: rules.lastPeakTimeMin,
    qtestSentence: qtestSentence(samples, picked.checks),
    usedPercentB,
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
  let nextChange = `Run the next chromatogram at ${percent}% B. That is the %B calculated to put the last peak at ${formatMinutes(rules.lastPeakTimeMin)} min. ${PERCENT_B_SENTENCE}`;
  if (rounded.clamped === "high") {
    nextChange += " The calculated value was above 100, so it is held at 100.";
  } else if (rounded.clamped === "low") {
    nextChange += " The calculated value was below 0, so it is held at 0.";
  }

  const why = [...intro, fitMembershipSentence(samples, fit, spec, picked.checks)].join("\n\n");

  return {
    status: "recommend",
    reason: "calculated",
    move: "calculated",
    nextPercentB: rounded.value,
    nextChange,
    following: SELECTIVITY_ORDER,
    why,
    brief: briefLines(current, rules),
    fit,
  };
}

function briefLines(sample: RetentionSample, rules: CompleteRules): string[] {
  const peaks =
    sample.peakCount == null
      ? "Peaks: not in this file."
      : `Peaks: ${formatCount(sample.peakCount)}. The specification is ${formatCount(rules.requiredPeaks)}.`;
  const pressure =
    sample.maxBackPressurePsi == null
      ? "Back-pressure: not in this file."
      : `Back-pressure: ${formatDecimal(sample.maxBackPressurePsi, 1)} psi. The specification is ${formatTypedPressure(rules.maxBackPressurePsi)} psi.`;
  const last =
    sample.lastPeakTimeMin == null
      ? "Last peak: not in this file."
      : `Last peak: ${formatMinutes(sample.lastPeakTimeMin)} min. The set time is ${formatTypedMinutes(rules.lastPeakTimeMin)} min.`;
  return [peaks, pressure, last];
}

export const MINIMUM_PERCENT_SENTENCE =
  "Reducing %B increases retention. Instead of dropping another 10%, the page calculates the %B that brings the last peak closer to the set time.";

function qtestSentence(samples: RetentionSample[], checks: T0Check[]): string {
  const leftOut = checks.filter((check) => check.far);
  if (leftOut.length === 0) return "The t0 peaks passed the Q-test.";
  return qTestLeftOutSentence(samples, leftOut);
}

function situationSentences(samples: RetentionSample[], rules: CompleteRules): string[] {
  const current = samples[samples.length - 1];
  const lines: string[] = [];
  const peaksMet = current.peakCount! >= rules.requiredPeaks;

  if (!peaksMet) {
    lines.push(
      `This run has ${formatCount(current.peakCount!)} peaks, still under the specification of ${formatCount(rules.requiredPeaks)}.`,
    );
  } else if (samples.length === 1) {
    lines.push(
      `This run has ${formatCount(current.peakCount!)} peaks, which meets the specification of ${formatCount(rules.requiredPeaks)}. This is the first run, so there is no earlier resolution to compare. The last peak is at ${formatMinutes(current.lastPeakTimeMin!)} min, still under the specification of ${formatMinutes(rules.lastPeakTimeMin)} min, so the time and pressure still decide the next %B.`,
    );
  } else {
    const previous = samples[samples.length - 2];
    const previousResolution = usableResolution(previous, rules.requiredPeaks);
    const currentResolution = usableResolution(current, rules.requiredPeaks);
    const resolutionText = resolutionChangeSentence(previousResolution, currentResolution);
    lines.push(
      `This run has ${formatCount(current.peakCount!)} peaks, which meets the specification of ${formatCount(rules.requiredPeaks)}. ${resolutionText} The last peak is at ${formatMinutes(current.lastPeakTimeMin!)} min, still under the specification of ${formatMinutes(rules.lastPeakTimeMin)} min, so %B can still come down.`,
    );
  }

  lines.push(
    `The highest back-pressure is ${formatDecimal(current.maxBackPressurePsi!, 1)} psi, under the specification of ${formatTypedPressure(rules.maxBackPressurePsi)} psi.`,
  );
  return lines;
}

function equalIntro(samples: RetentionSample[], rules: CompleteRules): string[] {
  const current = samples[samples.length - 1];
  const judged = judgeEqualPeaks(current, rules);
  const lines = ruleLines(current, rules, judged);
  const line = retentionLine(rules.lastPeakTimeMin);
  if (!isBelow(current.lastPeakTimeMin!, line)) {
    lines.push(
      closeToSpecSentence(current.lastPeakTimeMin!, rules.lastPeakTimeMin),
    );
  } else {
    lines.push(
      "The peak count matches the specification, so %B is not lowered by 10%. The peaks are there. The next %B is calculated for the specified run time. That calculation sets retention so the last peak lands on the specified time. It does not change selectivity or efficiency.",
    );
  }
  return lines;
}

function resolutionStopWhy(samples: RetentionSample[], rules: CompleteRules): string {
  const current = samples[samples.length - 1];
  const previous = samples[samples.length - 2];
  const previousResolution = usableResolution(previous, rules.requiredPeaks);
  const currentResolution = usableResolution(current, rules.requiredPeaks);
  const peakText = `This run already has ${formatCount(current.peakCount!)} peaks, which meets the specification of ${formatCount(rules.requiredPeaks)}.`;

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
  const parts: string[] = [];
  const tested = checks.filter((check) => check.t0 != null).length >= 3;
  const leftOut = checks.filter((check) => check.far);
  if (tested) {
    parts.push(leftOut.length > 0 ? qTestLeftOutSentence(samples, leftOut) : "The t0 peaks passed the Q-test.");
  }
  if (samples.length > 3) {
    const separation = separationMembershipSentence(samples, spec, checks);
    if (separation) parts.push(separation);
  }
  parts.push(`The calculation uses ${used}.`);
  return parts.join(" ");
}

function qTestLeftOutSentence(samples: RetentionSample[], leftOut: T0Check[]): string {
  const labels = leftOut.map((check) => {
    const sample = samples[check.index];
    const percent = sample.percentB == null ? "" : ` at ${formatPercentB(sample.percentB)}% B`;
    return `Run ${check.index + 1}${percent} (t0 peak ${formatMinutes(check.t0!)} min)`;
  });
  if (labels.length === 1) return `The Q-test left out ${labels[0]}.`;
  const last = labels[labels.length - 1];
  return `The Q-test left out ${labels.slice(0, -1).join(", ")} and ${last}.`;
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
  const resolution = resolutionForDecision(count, sample.minResolutionExcludingFirst, spec.requiredPeaks);
  const resolutionOk =
    !askedResolution ||
    (resolution != null && Number.isFinite(resolution) && resolution >= spec.minResolution!);

  if (peaksOk && resolutionOk) {
    if (askedResolution) {
      return {
        keep: true,
        sentence: `It is kept because it has enough peaks (${formatCount(count!)} of the specification of ${formatCount(spec.requiredPeaks)}) and the smallest resolution after the t0 peak (${formatResolution(resolution!)}) meets the specification of ${formatResolution(spec.minResolution!)}.`,
      };
    }
    return {
      keep: true,
      sentence: `It is kept because it has enough peaks (${formatCount(count!)} of the specification of ${formatCount(spec.requiredPeaks)}). No minimum resolution is in the specification.`,
    };
  }

  const problems: string[] = [];
  if (!peaksOk) {
    problems.push(
      count == null
        ? `the peak count is missing, still short of the specification of ${formatCount(spec.requiredPeaks)}, so the peaks are still overlapping`
        : `it has ${formatCount(count)} peaks, still under the specification of ${formatCount(spec.requiredPeaks)}, so the peaks are still overlapping`,
    );
  }
  if (askedResolution && !resolutionOk) {
    problems.push(
      resolution == null || !Number.isFinite(resolution)
        ? `there is no resolution after the t0 peak to compare with the specification of ${formatResolution(spec.minResolution!)}`
        : `the smallest resolution after the t0 peak is ${formatResolution(resolution)}, under the specification of ${formatResolution(spec.minResolution!)}`,
    );
  }
  return {
    keep: false,
    sentence: `It is left out because ${problems.join(", and ")}.`,
  };
}

/**
 * Dixon r10 critical values at 90% confidence (α = 0.10). Index is n.
 * One-outlier test, n = 3 through n = 30. Past n = 30, use n = 30.
 * Same form as the previous 70% table (Verma and Quiroz-Ruiz, test N7).
 */
const DIXON_Q90 = [
  Number.NaN,
  Number.NaN,
  Number.NaN,
  0.885,
  0.6789,
  0.5578,
  0.484,
  0.434,
  0.3979,
  0.3704,
  0.3492,
  0.3312,
  0.317,
  0.3045,
  0.2938,
  0.2848,
  0.2765,
  0.2691,
  0.2626,
  0.2564,
  0.2511,
  0.246,
  0.2415,
  0.2377,
  0.2337,
  0.2303,
  0.2269,
  0.2237,
  0.2208,
  0.2182,
  0.2155,
];

type T0Check = {
  index: number;
  t0: number | null;
  far: boolean;
};

type LineSelection = {
  kept: IndexedSample[];
  excluded: RetentionExclusion[];
  checks: T0Check[];
};

function selectForLine(samples: RetentionSample[], spec: SeparationSpec): LineSelection {
  const indexed = samples.map((sample, index) => ({ runNumber: index + 1, sample }));
  const checks = t0Checks(samples);
  const dropIndexes = new Set(checks.filter((check) => check.far).map((check) => check.index));
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
        ? `The Q-test left out this run (t0 peak ${formatMinutes(check.t0!)} min).`
        : separationVerdict(item.sample, spec).sentence,
    });
  });
  return { kept, excluded, checks };
}

function t0Checks(samples: RetentionSample[]): T0Check[] {
  const dropped = dixonOutliers(samples);
  return samples.map((sample, index) => {
    const time = sample.firstPeakTimeMin;
    const t0 = time != null && time > 0 ? time : null;
    return { index, t0, far: dropped.has(index) };
  });
}

function dixonCritical(n: number): number | null {
  if (n < 3) return null;
  if (n >= DIXON_Q90.length) return DIXON_Q90[DIXON_Q90.length - 1];
  return DIXON_Q90[n];
}

/** Leave out t0 peaks that fail Dixon's Q-test. Never leave fewer than two runs. */
function dixonOutliers(samples: RetentionSample[]): Set<number> {
  const pool = samples.flatMap((sample, index) => {
    const t0 = sample.firstPeakTimeMin;
    return t0 != null && t0 > 0 ? [{ index, t0 }] : [];
  });
  const dropped = new Set<number>();
  while (pool.length >= 3 && samples.length - dropped.size > 2) {
    const sorted = [...pool].sort((a, b) => a.t0 - b.t0);
    const n = sorted.length;
    const low = sorted[0];
    const high = sorted[n - 1];
    const range = high.t0 - low.t0;
    if (!(range > 0)) break;
    const lowGap = sorted[1].t0 - low.t0;
    const highGap = high.t0 - sorted[n - 2].t0;
    const critical = dixonCritical(n);
    if (critical == null) break;
    const testHigh = highGap >= lowGap;
    const q = (testHigh ? highGap : lowGap) / range;
    if (!(q > critical)) break;
    const suspect = testHigh ? high : low;
    dropped.add(suspect.index);
    const removeAt = pool.findIndex((item) => item.index === suspect.index);
    pool.splice(removeAt, 1);
  }
  return dropped;
}

function retentionFactor(sample: RetentionSample): { k: number; logK: number } | null {
  const t0 = sample.firstPeakTimeMin;
  const tR = sample.lastPeakTimeMin;
  if (t0 == null || tR == null || !(t0 > 0) || !(tR > t0)) return null;
  const k = (tR - t0) / t0;
  if (!(k > 0)) return null;
  return { k, logK: Math.log10(k) };
}

function catalogRuns(samples: RetentionSample[], rows: RetentionFitRow[]): FitCatalogRun[] {
  const kept = new Set(rows.map((row) => row.runNumber));
  return samples.map((sample, index) => {
    const factor = retentionFactor(sample);
    const runNumber = index + 1;
    return {
      runNumber,
      percentB: sample.percentB,
      t0: sample.firstPeakTimeMin,
      tR: sample.lastPeakTimeMin,
      k: factor?.k ?? null,
      logK: factor?.logK ?? null,
      included: kept.has(runNumber),
    };
  });
}

/** Line through the runs selected now. Null when those runs cannot draw a line. */
export function refitMinimumPercent(
  catalog: readonly FitCatalogRun[],
  selected: readonly number[],
  specifiedTimeMin: number,
  usedPercentB: readonly number[],
): MinimumFit | null {
  const chosen = new Set(selected);
  const rows: RetentionFitRow[] = [];
  for (const run of catalog) {
    if (!chosen.has(run.runNumber)) continue;
    if (run.percentB == null || run.t0 == null || run.tR == null || run.k == null || run.logK == null) continue;
    rows.push({
      runNumber: run.runNumber,
      percentB: run.percentB,
      t0: run.t0,
      tR: run.tR,
      k: run.k,
      logK: run.logK,
    });
  }
  if (rows.length < 2) return null;
  const lineFit = ordinaryLeastSquares(rows.map((row) => ({ x: row.percentB, y: row.logK })));
  if (!lineFit) return null;
  const t0Average = rows.reduce((sum, row) => sum + row.t0, 0) / rows.length;
  const kTarget = (specifiedTimeMin - t0Average) / t0Average;
  if (!(kTarget > 0) || !(t0Average > 0)) return null;
  const logKTarget = Math.log10(kTarget);
  const rawPercentB = (logKTarget - lineFit.c) / lineFit.m;
  if (!Number.isFinite(rawPercentB)) return null;
  const rounded = roundMinimumPercent(rawPercentB, usedPercentB);
  return {
    rows,
    m: lineFit.m,
    c: lineFit.c,
    rSquared: lineFit.rSquared,
    t0Average,
    kTarget,
    logKTarget,
    rawPercentB,
    nextPercentB: rounded.value,
    clamped: rounded.clamped,
  };
}

export function minimumPercentHeading(percent: number): string {
  return `Why ${formatPercentB(percent)}% B is recommended`;
}

/** Short calculation for the runs on the line now. The Q-test sentence stays the one from the starting line. */
export function minimumPercentNote(
  fit: MinimumFit,
  specifiedTimeMin: number,
  qtest = "The t0 peaks passed the Q-test.",
): string[] {
  const spec = formatTypedMinutes(specifiedTimeMin);
  const logKText = formatCalc(fit.logKTarget, 6);
  const mText = formatSigned(fit.m, 6);
  const cText = formatSigned(fit.c, 6);
  const rawText = formatCalc(fit.rawPercentB, 3);
  const targetT0 = formatMinutes(fit.t0Average);
  return [
    `${qtest} ${calculationUses(fit.rows)}`,
    "k = (tR − t0) / t0, then logK = log10(k).",
    `${lineEquation(fit.m, fit.c)}.`,
    `The target logK is ${logKText} for a last peak at ${spec} min. The average t0 of the runs on the line is ${targetT0} min.`,
    `%B = (${logKText} − ${cText}) / ${mText} = ${rawText}.`,
  ];
}

function calculationUses(rows: readonly { runNumber: number; percentB: number }[]): string {
  const labels = rows.map((row) => `Run ${row.runNumber} at ${formatPercentB(row.percentB)}% B`);
  if (labels.length === 0) return "The calculation uses no runs.";
  if (labels.length === 1) return `The calculation uses ${labels[0]}.`;
  const last = labels[labels.length - 1];
  return `The calculation uses ${labels.slice(0, -1).join(", ")} and ${last}.`;
}

export type BackwardsRun = {
  percentB: number | null;
  lastPeakTimeMin: number | null;
  temperatureC?: number | string | null;
  solvent?: string | null;
  ligand?: string | null;
};

export type BackwardsPair = {
  higherPercentB: number;
  higherLastMin: number;
  lowerPercentB: number;
  lowerLastMin: number;
};

/** A lower %B whose last peak is shorter than a higher %B already on the page, under the same conditions. */
export function findBackwardsRetention(runs: readonly BackwardsRun[]): BackwardsPair | null {
  const groups = new Map<string, { percentB: number; lastPeakTimeMin: number }[]>();
  for (const run of runs) {
    if (run.percentB == null || run.lastPeakTimeMin == null) continue;
    if (!Number.isFinite(run.percentB) || !Number.isFinite(run.lastPeakTimeMin)) continue;
    const key = backwardsKey(run);
    const list = groups.get(key) ?? [];
    list.push({ percentB: run.percentB, lastPeakTimeMin: run.lastPeakTimeMin });
    groups.set(key, list);
  }
  let best: BackwardsPair | null = null;
  let bestGap = 0;
  for (const list of groups.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const higher = list[i];
        const lower = list[j];
        if (!(higher.percentB > lower.percentB + 1e-9)) continue;
        if (!(higher.lastPeakTimeMin > lower.lastPeakTimeMin + 1e-6)) continue;
        const gap = higher.lastPeakTimeMin - lower.lastPeakTimeMin;
        if (gap > bestGap) {
          bestGap = gap;
          best = {
            higherPercentB: higher.percentB,
            higherLastMin: higher.lastPeakTimeMin,
            lowerPercentB: lower.percentB,
            lowerLastMin: lower.lastPeakTimeMin,
          };
        }
      }
    }
  }
  return best;
}

export function backwardsWhy(pair: BackwardsPair): string {
  const higher = formatPercentB(pair.higherPercentB);
  const lower = formatPercentB(pair.lowerPercentB);
  return `This is unexpected. An error likely occurred. The ${higher}% B run’s last peak is at ${formatMinutes(pair.higherLastMin)} min, and the ${lower}% B run’s last peak is at ${formatMinutes(pair.lowerLastMin)} min. A lower %B should hold the compounds longer.`;
}

export const BACKWARDS_REDO =
  "Replace these runs so the last peak gets longer as %B goes down.";

/**
 * While the backwards warning is up, do not keep an unedited empty run after the ready ones.
 * Return the same array when the series is already only those runs, so render can settle.
 */
export function seriesWhileHeld<T>(
  runs: readonly T[],
  readyCount: number,
  pending: (run: T) => boolean,
): readonly T[] {
  const next = runs[readyCount];
  if (next != null && pending(next) && runs.length === readyCount + 1) return runs.slice(0, readyCount);
  return runs;
}

function backwardsKey(run: BackwardsRun): string {
  return `${backwardsTemperature(run.temperatureC)}|${(run.solvent ?? "").trim().toLowerCase()}|${(run.ligand ?? "").trim().toLowerCase()}`;
}

function backwardsTemperature(value: number | string | null | undefined): string {
  if (value == null) return "ambient";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value - 25) < 0.51) return "ambient";
    return String(Math.round(value));
  }
  const text = value.trim().toLowerCase().replace(/°\s*c$/i, "");
  if (!text || text === "ambient" || text === "amb" || text === "25") return "ambient";
  const parsed = Number(text);
  if (Number.isFinite(parsed) && Math.abs(parsed - 25) < 0.51) return "ambient";
  return text;
}

function formatCalc(value: number, digits: number): string {
  return value.toFixed(digits);
}

function formatSigned(value: number, digits: number): string {
  const text = Math.abs(value).toFixed(digits);
  return value < 0 ? `−${text}` : text;
}

/** Equation written on the logK graph. m and c are the fit for the runs on the line. */
export function lineEquation(m: number, c: number): string {
  return `logK = ${formatSigned(m, 6)} × %B + ${formatSigned(c, 6)}`;
}

/** R² written under the line equation, to three decimal places. */
export function formatRSquared(rSquared: number): string {
  return `R² = ${rSquared.toFixed(3)}`;
}

function ordinaryLeastSquares(points: { x: number; y: number }[]): { m: number; c: number; rSquared: number } | null {
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
  const meanY = sumY / n;
  let total = 0;
  let residual = 0;
  for (const point of points) {
    const predicted = m * point.x + c;
    total += (point.y - meanY) ** 2;
    residual += (point.y - predicted) ** 2;
  }
  let rSquared = total === 0 ? 1 : 1 - residual / total;
  if (rSquared > 1) rSquared = 1;
  if (rSquared < 0 && rSquared > -1e-12) rSquared = 0;
  return { m, c, rSquared };
}

function resolutionIncreased(samples: RetentionSample[], requiredPeaks: number): boolean {
  const previous = usableResolution(samples[samples.length - 2], requiredPeaks);
  const current = usableResolution(samples[samples.length - 1], requiredPeaks);
  if (previous == null && current != null) return true;
  if (previous != null && current != null && current > previous) return true;
  return false;
}

function usableResolution(sample: RetentionSample, requiredPeaks: number): number | null {
  return resolutionForDecision(sample.peakCount, sample.minResolutionExcludingFirst, requiredPeaks);
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
    missing.push("The max back-pressure is not in this file, so it is not clear the pressure is under the specification.");
  }
  return missing;
}

function pressureIsUnder(measured: number, limit: number): boolean {
  if (nearly(measured, limit)) return false;
  return measured < limit;
}

/** Keep the 10-point drop while the last peak is at or under this fraction of the specified time. */
const RETENTION_TIME_FRACTION = 0.5;

function retentionLine(specMin: number): number {
  return RETENTION_TIME_FRACTION * specMin;
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

function formatTypedPressure(value: number): string {
  return Number.isInteger(value) ? String(value) : formatDecimal(value, 1);
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function formatMinutes(value: number): string {
  return value.toFixed(3);
}

function formatTypedMinutes(value: number): string {
  return String(value);
}

function formatResolution(value: number): string {
  return value.toFixed(3);
}

function roundHalfAwayFromZero(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  const rounded = Math.sign(scaled) * Math.floor(Math.abs(scaled) + 0.5 + 1e-10);
  return rounded / factor;
}

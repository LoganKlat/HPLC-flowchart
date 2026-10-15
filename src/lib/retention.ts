import { formatDecimal, resolutionForDecision } from "@/lib/evaluate";
import { PERCENT_B_SENTENCE, SELECTIVITY_ORDER, TEMPERATURE_SENTENCE } from "@/lib/setting-kind";
import type { PeakMeasurement } from "@/lib/lab-file";
import { calculateAwesomeFloor, type AwesomeCalculatorResult } from "@/lib/awesome-calculator";

export { calculateAwesomeFloor, type AwesomeCalculatorResult } from "@/lib/awesome-calculator";

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
  /** Optional 1-based UI run number when blank runs are interleaved. */
  displayRunNumber?: number;
  lengthMm?: number | null;
  diameterMm?: number | null;
  particleSize?: number | null;
  flowRate?: number | null;
  coreShell?: boolean | null;
};

export type RetentionChoice = {
  /** The latest file is the in-between %B the user typed. */
  afterInBetween?: boolean;
  /** The user said no to moving on, so show the minimum %B. */
  declinedEfficiencyNow?: boolean;
  /** Continue selectivity on this run, before a run has been picked to heat. */
  continueToLook?: boolean;
  /** Stay in retention after the efficiency offer, and pick a %B instead of another minimum. */
  continueRetention?: boolean;
};

export type LookMark = "met" | "not-met" | "blank";

export type LookRun = {
  index: number;
  displayRunNumber?: number;
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

export const EFFICIENCY_CONTINUE = "Move on to selectivity";

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
  rsFarBelowNote?: string | null;
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
  | "second-minimum"
  | "choose-percent"
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
  /** The second minimum %B: use the recommendation, or type another %B, then run at 40°C. */
  choosePercent?: boolean;
  /** The specific action string from the 12-row decision table. */
  actionText?: string;
  /** Exact rule table action name (e.g. Decrease %B by 10, Min %B ..., SELECTIVITY, Increase L (watch BP), etc.). */
  tableAction?: string;
  /** Specific efficiency action recommended for peak count met runs. */
  efficiencyAction?: string;
  /** Full calculations from the resolution floor calculator. */
  awesomeFloor?: AwesomeCalculatorResult | null;
  /** Stay in retention: ask for a %B, then start selectivity at 40°C. No new minimum is fitted. */
  pickOwnPercent?: boolean;
  /** Structured lead paragraphs for the primary Why section: Condition tag, What they mean, and Influence & Decision. */
  leadWhy?: string[];
  /** Structured detail paragraphs for the 'Do you want to know more?' toggle: calculations, theory, and checklist. */
  moreWhy?: string[];
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

  if (samples.length >= 2 && current.percentB != null) {
    const rawPrior = decideRetention(samples.slice(0, -1), complete);
    const prior =
      rawPrior.status === "efficiency"
        ? decideRetention(samples.slice(0, -1), complete, { continueRetention: true })
        : rawPrior;
    // The first calculated minimum is run once. A later file at that %B, including
    // the whole percent just under a ceiled recommendation, does not refit the line.
    // Peaks already matching the specification still pause for efficiency first.
    if (ranRecommendedMinimum(current.percentB, prior)) {
      if (current.peakCount === complete.requiredPeaks) {
        return equalPeakCount(samples, complete, choice);
      }
      if (choice?.continueToLook) {
        return lookDecision(samples, complete, "between-then-heat");
      }
      return minimumAlreadyRun(current, complete);
    }
    if (prior.reason === "second-minimum" || prior.reason === "choose-percent") return prior;
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
    const tag = buildConditionTag({
      peaks: current.peakCount,
      requiredPeaks: complete.requiredPeaks,
      tR: current.lastPeakTimeMin,
      specTime: complete.lastPeakTimeMin,
      bp: current.maxBackPressurePsi,
      specBP: complete.maxBackPressurePsi,
    });
    const leadWhy = [
      `Condition: ${tag}.\n\nWhat this means: Column back-pressure reached ${measured} psi, exceeding the system specification limit of ${limit} psi (BP > spec). Peak count is ${formatCount(current.peakCount ?? 0)} of ${formatCount(complete.requiredPeaks)}.`,
      `Influence & Decision: Pressure limit exceeded. Action: Do not lower %B. Lowering %B increases the aqueous fraction of the mobile phase, which raises mobile phase viscosity and causes column back-pressure to rise even further, risking equipment over-pressurization.`,
    ];
    const moreWhy = [
      `The pressure is already too high to lower %B. This run reached ${measured} psi. The specification is ${limit} psi. A lower %B is a weaker solvent, so the compounds stay on the column longer and the back-pressure usually rises. That longer stay is higher retention. Selectivity and efficiency are not why this step stops.`,
      `In reversed-phase HPLC, decreasing %B increases the aqueous fraction of the mobile phase. Water-organic mixtures exhibit significantly higher dynamic viscosity than pure organic solvent (viscosity reaches a maximum at intermediate water-organic ratios due to extensive hydrogen-bonding networks). According to the Darcy equation (ΔP = η·u·L / K0), column pressure drop is directly proportional to mobile phase viscosity (η). Lowering %B would therefore increase both analyte retention and column back-pressure, worsening the pressure violation and risking column packing compaction, system fitting leaks, or pump pressure cutoffs.`,
      ...ruleLines(current, complete, judgeEqualPeaks(current, complete)),
    ];
    return blocked(
      "pressure",
      `Do not lower %B. The highest back-pressure is ${measured} psi, already at or above the specification of ${limit} psi.`,
      [...leadWhy, ...moreWhy].join("\n\n"),
      leadWhy,
      moreWhy,
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
  "This run has more peaks than the specification. Pause method changes and check for impurities, carryover, degradation, or split peaks. Compare the peak table with a reference injection at 0.1 mg/mL under the same conditions, and review a blank for carryover. Area and height help compare signals, but size alone cannot identify a peak or prove that it is an impurity. Confirm which peaks belong to the sample before continuing.";

const INVESTIGATE_DETAIL =
  "Why extra peaks require investigation: Optimizing conditions when peak count exceeds the expected mixture risks tailoring the method around transient degradation products, synthetic impurities, mobile phase artifacts, or split peaks rather than true target compounds. Common root causes include: (1) chemical degradation or oxidation during sample storage, (2) autosampler needle or valve carryover from preceding runs, (3) mobile phase ghost peaks from contaminated water or additives, or (4) peak splitting caused by column head voiding or an injection solvent stronger than the initial mobile phase. Comparing peak retention times, areas, and heights against a fresh 0.1 mg/mL reference standard and a mobile phase blank ensures that method decisions reflect authentic sample components.";

function investigateDecision(sample: RetentionSample, rules: CompleteRules): RetentionDecision {
  const peaks = sample.peaks ?? [];
  const areaMissing = peaks.length === 0 || peaks.some((peak) => peak.area == null);
  const heightMissing = peaks.length === 0 || peaks.some((peak) => peak.height == null);

  const tag = buildConditionTag({
    peaks: sample.peakCount ?? peaks.length,
    requiredPeaks: rules.requiredPeaks,
    tR: sample.lastPeakTimeMin,
    specTime: rules.lastPeakTimeMin,
    bp: sample.maxBackPressurePsi,
    specBP: rules.maxBackPressurePsi,
  });

  const leadWhy = [
    `Condition: ${tag}.\n\nWhat this means: Detected peak count (${formatCount(sample.peakCount ?? peaks.length)}) exceeds the expected mixture specification of ${formatCount(rules.requiredPeaks)} peaks (Peaks > ${rules.requiredPeaks}).`,
    `Influence & Decision: Extra peaks detected. Action: Investigate. Pause method changes and check for impurities, carryover, degradation, or split peaks before making further chromatographic changes. Compare the peak table with a fresh 0.1 mg/mL reference standard and review a blank injection for carryover.`,
  ];

  const lines = [
    INVESTIGATE_COPY,
    INVESTIGATE_DETAIL,
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

  const moreWhy = lines;

  return {
    status: "investigate",
    reason: "investigate",
    move: null,
    nextPercentB: null,
    nextChange: "Investigate. Do not change %B, temperature, solvent, or the column.",
    leadWhy,
    moreWhy,
    why: [...leadWhy, ...moreWhy].join("\n\n"),
    fit: null,
  };
}

/** The uploaded %B is the first calculated minimum, so the last-peak line is not fit again. */
function ranRecommendedMinimum(percentB: number, prior: RetentionDecision): boolean {
  if (prior.move !== "calculated" || prior.nextPercentB == null) return false;
  if (nearly(percentB, prior.nextPercentB)) return true;
  const raw = prior.fit?.rawPercentB;
  if (raw == null || !Number.isFinite(raw)) return false;
  const below = Math.floor(raw + 1e-9);
  return nearly(percentB, below) && percentB < prior.nextPercentB - 1e-9;
}

function minimumAlreadyRun(sample?: RetentionSample, rules?: CompleteRules): RetentionDecision {
  const tableAction = "Change selectivity (solvent, temperature, ligand) OR an intermediate %B";
  const req = rules?.requiredPeaks ?? 7;
  const tag = rules && sample ? buildConditionTag({
    peaks: sample.peakCount,
    requiredPeaks: req,
    tR: sample.lastPeakTimeMin,
    specTime: rules.lastPeakTimeMin,
    rs: sample.peakCount != null ? usableResolution(sample, req) : null,
    specRs: rules.minResolution,
    bp: sample.maxBackPressurePsi,
    specBP: rules.maxBackPressurePsi,
  }) : `(Peaks < ${req}, tR > spec, BP < spec)`;

  const leadWhy = [
    `Condition: ${tag}.\n\nWhat this means: The minimum %B from the last-peak line has already been evaluated. Peak count is ${sample?.peakCount != null ? formatCount(sample.peakCount) : "short"} of ${formatCount(req)} required peaks (Peaks < ${req}), and retention adjustments alone cannot resolve the remaining overlapping peaks.`,
    `Influence & Decision: Row 3 (Peaks < ${req}, tR > spec): Change selectivity (solvent, temperature, ligand). Staying in retention does not calculate another minimum %B, and it does not refit the last-peak line. Action: Select a %B of your choosing and proceed to selectivity at 40°C at that %B.`,
  ];

  const moreWhy = [
    `Row 3 (Peaks < ${req}, tR > spec): Change selectivity (solvent, temperature, ligand).`,
    "The minimum %B from the last-peak line has already been run.",
    "Staying in retention does not calculate another minimum %B, and it does not refit the last-peak line.",
    "Select a %B of your choosing. With that %B, selectivity starts at 40°C.",
    sample && rules ? ruleLines(sample, rules, judgeEqualPeaks(sample, rules)).join("\n\n") : "",
  ].filter(Boolean);

  return {
    status: "recommend",
    reason: "choose-percent",
    move: null,
    nextPercentB: null,
    nextTemperature: "40",
    pickOwnPercent: true,
    actionText: "Run at 40°C (Change selectivity)",
    tableAction,
    nextChange: "Select a %B of your choosing. The next run is selectivity at 40°C at that %B.",
    following: SELECTIVITY_ORDER,
    leadWhy,
    moreWhy,
    why: [...leadWhy, ...moreWhy].join("\n\n"),
    fit: null,
  };
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
    return equalPeakCount(samples, rules, choice, true);
  }
  return lookDecision(samples, rules, "picker");
}

export function isResolutionFarBelow(
  resolution: number | null,
  spec: number | null,
  sample?: RetentionSample,
  rules?: RetentionRules,
): boolean {
  if (spec == null || !(spec > 0)) return false;
  if (resolution == null || !Number.isFinite(resolution)) return true;
  if (sample && rules && rules.lastPeakTimeMin && rules.maxBackPressurePsi) {
    const calc = calculateAwesomeFloor({
      column: {
        lengthMm: sample.lengthMm,
        diameterMm: sample.diameterMm,
        particleSize: sample.particleSize,
        flowRate: sample.flowRate,
        sppFactor: sample.coreShell ? 1.5 : 1.0,
      },
      t0Min: sample.firstPeakTimeMin,
      tRMin: sample.lastPeakTimeMin ?? rules.lastPeakTimeMin,
      backPressurePsi: sample.maxBackPressurePsi ?? rules.maxBackPressurePsi,
      resolution,
      specTimeMin: rules.lastPeakTimeMin,
      specPressurePsi: rules.maxBackPressurePsi,
      specResolution: spec,
    });
    return resolution + 1e-9 < calc.rsFloorSpp;
  }
  return resolution + 1e-9 < 0.5 * spec;
}

export function buildConditionTag(params: {
  peaks?: number | null;
  requiredPeaks: number;
  tR?: number | null;
  specTime: number;
  rs?: number | null;
  specRs?: number | null;
  rsFloor?: number | null;
  bp?: number | null;
  specBP: number;
  stagePrefix?: string;
}): string {
  const parts: string[] = [];

  if (params.stagePrefix) {
    parts.push(params.stagePrefix);
  }

  if (params.peaks != null) {
    if (params.peaks === params.requiredPeaks) {
      parts.push(`Peaks = ${params.requiredPeaks}`);
    } else if (params.peaks < params.requiredPeaks) {
      parts.push(`Peaks < ${params.requiredPeaks}`);
    } else {
      parts.push(`Peaks > ${params.requiredPeaks}`);
    }
  }

  if (params.tR != null) {
    if (params.tR <= 0.5 * params.specTime) {
      parts.push("tR << spec");
    } else if (params.tR <= params.specTime) {
      parts.push("tR < spec");
    } else {
      parts.push("tR > spec");
    }
  }

  if (params.peaks == null || params.peaks >= params.requiredPeaks) {
    if (params.rs != null && params.specRs != null && params.specRs > 0) {
      const floor = params.rsFloor ?? (0.5 * params.specRs);
      if (params.rs + 1e-9 < floor) {
        parts.push("Rs < floor");
      } else if (params.rs + 1e-9 < params.specRs) {
        parts.push("floor ≤ Rs < spec");
      } else {
        parts.push("Rs ≥ spec");
      }
    }
  }

  if (params.bp != null) {
    if (params.bp <= params.specBP) {
      parts.push("BP < spec");
    } else {
      parts.push("BP > spec");
    }
  }

  return `(${parts.join(", ")})`;
}

export function rsFarBelowExplanation(
  peaks: number,
  resolution: number | null,
  spec: number,
  calc?: AwesomeCalculatorResult,
): string {
  const measuredRs =
    resolution != null && Number.isFinite(resolution) ? formatResolution(resolution) : "not assessable";
  const specRs = formatResolution(spec);
  const floorRs = calc ? formatResolution(calc.rsFloorSpp) : formatResolution(0.5 * spec);
  const fppFloorRs = calc ? formatResolution(calc.rsFloorFpp) : null;
  const fppText = fppFloorRs ? ` (FPP floor = ${fppFloorRs}, SPP floor = ${floorRs})` : "";
  return `All ${formatCount(peaks)} peaks are detected, but critical pair resolution (${measuredRs}) is below the resolution floor (${floorRs}${fppText}, spec = ${specRs}). When resolution is below the resolution floor, efficiency levers alone (particle size, column length, flow rate) cannot mathematically rescue separation within practical constraints. Therefore, selectivity must be optimized first.`;
}

function sevenPeaksSelectivity(
  sample: RetentionSample,
  rules: CompleteRules,
  judged: EqualJudgment,
  calc?: AwesomeCalculatorResult,
  rowNumber: 7 | 10 = 7,
): RetentionDecision {
  const percent = sample.percentB != null ? formatPercentB(sample.percentB) : "the current";
  const measuredRs =
    judged.resolution != null && Number.isFinite(judged.resolution)
      ? formatResolution(judged.resolution)
      : "not assessable";
  const specRs = rules.minResolution != null ? formatResolution(rules.minResolution) : "spec";
  const floorRs = calc ? formatResolution(calc.rsFloorSpp) : (rules.minResolution != null ? formatResolution(0.5 * rules.minResolution) : "floor");
  const floorFppRs = calc ? formatResolution(calc.rsFloorFpp) : null;
  const fppText = floorFppRs ? ` (FPP floor = ${floorFppRs}, SPP floor = ${floorRs})` : ` (${floorRs})`;

  const actionText = "Run at 40°C (Change selectivity)";
  const nextChange = `Run at 40°C (Change selectivity). Resolution (${measuredRs}) is below the resolution floor${fppText}, so selectivity must be changed before efficiency. Run the next chromatogram at 40°C, still at ${percent}% B.`;

  const tag = buildConditionTag({
    peaks: sample.peakCount,
    requiredPeaks: rules.requiredPeaks,
    tR: sample.lastPeakTimeMin,
    specTime: rules.lastPeakTimeMin,
    rs: judged.resolution,
    specRs: rules.minResolution,
    rsFloor: calc?.rsFloorSpp,
    bp: sample.maxBackPressurePsi,
    specBP: rules.maxBackPressurePsi,
  });

  const rowDescription =
    rowNumber === 7
      ? `Row 7 (Peaks = ${rules.requiredPeaks}, tR < spec, Rs < floor):`
      : `Row 10 (Peaks = ${rules.requiredPeaks}, tR > spec, Rs < floor):`;

  const timeDesc =
    rowNumber === 7
      ? `The last peak elutes at ${formatMinutes(sample.lastPeakTimeMin!)} min, inside the specified run time of ${formatTypedMinutes(rules.lastPeakTimeMin)} min (tR < spec).`
      : `The last peak elutes at ${formatMinutes(sample.lastPeakTimeMin!)} min, later than the specification of ${formatMinutes(rules.lastPeakTimeMin)} min (tR > spec).`;

  const leadWhy = [
    `Condition: ${tag}.\n\nWhat this means: All ${formatCount(sample.peakCount ?? rules.requiredPeaks)} peaks are detected (meeting the specification of ${formatCount(rules.requiredPeaks)}). ${timeDesc} However, critical pair resolution (${measuredRs}) is significantly under the specification (${specRs}, below the resolution floor of ${floorRs}, Rs < floor). Back-pressure is ${formatDecimal(sample.maxBackPressurePsi ?? 0, 1)} psi, safely below the ${formatTypedPressure(rules.maxBackPressurePsi)} psi limit (BP < spec).`,
    `Influence & Decision: ${rowDescription} All ${formatCount(sample.peakCount ?? rules.requiredPeaks)} peaks are detected, but critical pair resolution (${measuredRs}) is significantly under the specification. Because resolution is below the resolution floor, efficiency levers alone cannot mathematically rescue separation within practical constraints (resolution is far below the specification). Therefore, we must optimise retention and selectivity first before moving to efficiency. Selectivity is the next stage because resolution is far below the specification. Action: SELECTIVITY (Run at 40°C). Elevating temperature shifts critical pair spacing (α) while maintaining ${percent}% B${rowNumber === 10 ? " and accelerating elution to shorten run time" : ""}.`,
  ];

  const moreWhy = [
    calc
      ? `Theoretical plate count & resolution floor analysis: With current theoretical plates N1 = ${Math.round(calc.n1)}, the maximum theoretical plates achievable within run time and pressure limits are Nmax,FPP = ${Math.round(calc.nMaxFpp)} (fully porous) and Nmax,SPP = ${Math.round(calc.nMaxSpp)} (superficially porous). Headroom HR = ${calc.headroom.toFixed(3)}. The minimum resolution required to reach the specification via efficiency levers is Rs,floor,SPP = ${floorRs}. Verdict: ${calc.verdictText}.`
      : `Resolution scaling analysis: When critical pair resolution is below the resolution floor, efficiency levers alone cannot mathematically rescue separation within practical constraints.`,
    `Thermal selectivity mechanism: In reversed-phase chromatography, changing column temperature from ambient to 40°C alters standard transfer enthalpies (ΔH°) differently for each analyte, shifting overlapping peak positions relative to each other (selectivity factor α = k2/k1) while simultaneously decreasing mobile phase viscosity and accelerating elution.`,
    ...ruleLines(sample, rules, judged),
  ];

  return {
    status: "recommend",
    reason: "drop-10",
    move: null,
    nextPercentB: sample.percentB ?? null,
    nextTemperature: "40",
    actionText,
    tableAction: "SELECTIVITY",
    nextChange,
    following: SELECTIVITY_ORDER,
    leadWhy,
    moreWhy,
    why: [...leadWhy, ...moreWhy].join("\n\n"),
    fit: null,
    awesomeFloor: calc ?? null,
  };
}

function efficiencyDecision(
  sample: RetentionSample,
  rules: CompleteRules,
  judged: EqualJudgment,
  calc: AwesomeCalculatorResult,
  rowNumber: 4 | 5 | 8 | 11 | 12,
  continueShowsLook = false,
): RetentionDecision {
  const measuredRs =
    judged.resolution != null && Number.isFinite(judged.resolution)
      ? formatResolution(judged.resolution)
      : "not assessable";
  const specRs = rules.minResolution != null ? formatResolution(rules.minResolution) : "spec";
  const floorRs = formatResolution(calc.rsFloorSpp);
  const floorFppRs = formatResolution(calc.rsFloorFpp);

  let actionText = "";
  let rowHeading = "";
  let timeDesc = "";
  let rsDesc = "";
  let decisionWhy = "";

  const pressureDesc =
    sample.maxBackPressurePsi != null &&
    pressureIsUnder(sample.maxBackPressurePsi, rules.maxBackPressurePsi)
      ? `safely below the ${formatTypedPressure(rules.maxBackPressurePsi)} psi limit (BP < spec)`
      : `over the ${formatTypedPressure(rules.maxBackPressurePsi)} psi limit (BP > spec)`;

  switch (rowNumber) {
    case 4:
      rowHeading = `Row 4 (Peaks = ${rules.requiredPeaks}, tR ≪ spec, Rs < floor):`;
      actionText = "Increase L (watch BP)";
      timeDesc = `The last peak elutes at ${formatMinutes(sample.lastPeakTimeMin!)} min, substantially under the specification limit of ${formatTypedMinutes(rules.lastPeakTimeMin)} min (tR ≪ spec).`;
      rsDesc = `Critical pair resolution (${measuredRs}) is below the standard resolution floor (${floorRs}), but the extensive run-time headroom allows column length to be increased.`;
      decisionWhy = `Although critical pair resolution (${measuredRs}) is below the standard resolution floor for the current column length, the substantial run-time headroom allows increasing column length (L). Increasing L increases theoretical plates (N) and resolution (Rs) while run time remains safely within specification, provided column back-pressure is monitored.`;
      break;
    case 5:
      rowHeading = `Row 5 (Peaks = ${rules.requiredPeaks}, tR ≪ spec, floor ≤ Rs < spec):`;
      actionText = "Increase L (BP) OR decrease F OR decrease PS (BP) OR SPP";
      timeDesc = `The last peak elutes at ${formatMinutes(sample.lastPeakTimeMin!)} min, substantially under the specification limit of ${formatTypedMinutes(rules.lastPeakTimeMin)} min (tR ≪ spec).`;
      rsDesc = `Critical pair resolution (${measuredRs}) is at or above the resolution floor (${floorRs} ≤ Rs < ${specRs}), meaning column efficiency can mathematically achieve baseline separation.`;
      decisionWhy = `Multiple efficiency levers can reach the target resolution: increase column length (L) while watching back-pressure, decrease flow rate (F) toward the Van Deemter optimum, decrease particle size (PS) while watching back-pressure, or switch to a superficially porous (SPP / core-shell) column (verdict: ${calc.verdictText}).`;
      break;
    case 8:
      rowHeading = `Row 8 (Peaks = ${rules.requiredPeaks}, tR < spec, floor ≤ Rs < spec):`;
      actionText = "Decrease F OR decrease PS (BP) OR SPP";
      timeDesc = `The last peak elutes at ${formatMinutes(sample.lastPeakTimeMin!)} min, within the specified run time of ${formatTypedMinutes(rules.lastPeakTimeMin)} min (tR < spec).`;
      rsDesc = `Critical pair resolution (${measuredRs}) is at or above the resolution floor (${floorRs} ≤ Rs < ${specRs}), meaning column efficiency can mathematically achieve baseline separation.`;
      decisionWhy = `Run time is approaching the specification limit (${formatTypedMinutes(rules.lastPeakTimeMin)} min, tR < spec), so column length cannot be increased without exceeding the run-time ceiling. Reach target resolution using efficiency levers that do not increase column length: decrease flow rate (F), decrease particle size (PS) while monitoring back-pressure, or switch to a superficially porous (SPP / core-shell) column (verdict: ${calc.verdictText}).`;
      break;
    case 11:
      rowHeading = `Row 11 (Peaks = ${rules.requiredPeaks}, tR > spec, floor ≤ Rs < spec):`;
      actionText = "Decrease PS (BP), then increase F to shorten the run";
      timeDesc = `The last peak elutes at ${formatMinutes(sample.lastPeakTimeMin!)} min, exceeding the specified run time limit of ${formatTypedMinutes(rules.lastPeakTimeMin)} min (tR > spec).`;
      rsDesc = `Critical pair resolution (${measuredRs}) is below specification but at or above the resolution floor (${floorRs} ≤ Rs < ${specRs}).`;
      decisionWhy = `To simultaneously gain resolution and recover run-time throughput: decrease particle size (PS) to generate the required theoretical plates, watching back-pressure limits, then increase flow rate (F) to accelerate elution and shorten run time back inside the specification window.`;
      break;
    case 12:
      rowHeading = `Row 12 (Peaks = ${rules.requiredPeaks}, tR > spec, Rs ≥ spec):`;
      actionText = "Increase F to shorten the run";
      timeDesc = `The last peak elutes at ${formatMinutes(sample.lastPeakTimeMin!)} min, exceeding the throughput limit of ${formatTypedMinutes(rules.lastPeakTimeMin)} min (tR > spec).`;
      rsDesc = `Critical pair resolution (${measuredRs}) meets or exceeds the target specification (${specRs}, Rs ≥ spec).`;
      decisionWhy = `Because separation chemistry is already satisfactory, increase flow rate (F) to shorten analysis time and bring the run inside the throughput limit without altering retention chemistry.`;
      break;
  }

  const tag = buildConditionTag({
    peaks: sample.peakCount,
    requiredPeaks: rules.requiredPeaks,
    tR: sample.lastPeakTimeMin,
    specTime: rules.lastPeakTimeMin,
    rs: judged.resolution,
    specRs: rules.minResolution,
    rsFloor: calc.rsFloorSpp,
    bp: sample.maxBackPressurePsi,
    specBP: rules.maxBackPressurePsi,
  });

  const nextChange = `${EFFICIENCY_MOVE_ON} ${actionText}`;

  const leadLine = !judged.resolutionMeets
    ? `Efficiency is next for the resolution. The peak count meets the specification (${formatCount(sample.peakCount ?? rules.requiredPeaks)} peaks), and the resolution (${measuredRs}) is above the resolution floor (${floorRs}). Because resolution is high enough to be rescued by efficiency (above the Rs floor), we move to efficiency (→ N) to optimize column efficiency rather than continuing retention or selectivity changes.`
    : judged.timeLate && judged.pressureOver
      ? "Efficiency is next to bring the last peak time and the back-pressure to the specification. The peaks are already there and the worst pair is already far enough apart."
      : judged.pressureOver
        ? "Efficiency is next to bring the back-pressure to the specification. The peaks are already there, the worst pair is already far enough apart, and the last peak is inside the specified time."
        : "Efficiency is next to bring the last peak time to the specification. The peaks are already there and the worst pair is already far enough apart. Efficiency can shorten the run without changing the separation you already have.";

  const leadWhy = [
    `Condition: ${tag}.\n\nWhat this means: All ${formatCount(sample.peakCount ?? rules.requiredPeaks)} peaks are detected (meeting the specification of ${formatCount(rules.requiredPeaks)}). ${timeDesc} ${rsDesc} Back-pressure is ${formatDecimal(sample.maxBackPressurePsi ?? 0, 1)} psi (${pressureDesc}).`,
    `Influence & Decision: ${rowHeading} All ${formatCount(sample.peakCount ?? rules.requiredPeaks)} peaks are detected. Action: ${actionText}. ${decisionWhy}`,
  ];

  const moreWhy = [
    `Theoretical plate count & resolution floor analysis: With current theoretical plates N1 = ${Math.round(calc.n1)}, achievable plates within limits are Nmax,FPP = ${Math.round(calc.nMaxFpp)} (fully porous) and Nmax,SPP = ${Math.round(calc.nMaxSpp)} (superficially porous). Headroom HR = ${calc.headroom.toFixed(3)}. Resolution floor Rs,floor,SPP = ${floorRs}, Rs,floor,FPP = ${floorFppRs}. Verdict: ${calc.verdictText}.`,
    `Column efficiency mechanism: Retention (k) and selectivity (α) are established once all peaks are present and detected. Further reducing %B would yield diminishing returns on retention while prolonging run time. Adjusting column efficiency (theoretical plate count N) via flow velocity along the van Deemter curve, smaller particle size packing, column length, or superficially porous particles achieves baseline resolution or shorter run times without altering retention chemistry.`,
    leadLine,
    ...ruleLines(sample, rules, judged),
  ];

  return {
    status: "efficiency",
    reason: "efficiency",
    move: null,
    nextPercentB: null,
    actionText,
    tableAction: actionText,
    efficiencyAction: actionText,
    nextChange,
    leadWhy,
    moreWhy,
    why: [...leadWhy, ...moreWhy].join("\n\n"),
    fit: null,
    awesomeFloor: calc,
    efficiencyChoice: {
      recommendedSentence: `${EFFICIENCY_MOVE_ON} Action: ${actionText}`,
      continueLabel: EFFICIENCY_CONTINUE,
    },
    continueShowsLook,
  };
}

function efficiencyStop(
  sample: RetentionSample,
  rules: CompleteRules,
  judged: EqualJudgment,
  continueShowsLook = false,
): RetentionDecision {
  const calc = calculateAwesomeFloor({
    column: {
      lengthMm: sample.lengthMm,
      diameterMm: sample.diameterMm,
      particleSize: sample.particleSize,
      flowRate: sample.flowRate,
      sppFactor: sample.coreShell ? 1.5 : 1.0,
    },
    t0Min: sample.firstPeakTimeMin,
    tRMin: sample.lastPeakTimeMin ?? rules.lastPeakTimeMin,
    backPressurePsi: sample.maxBackPressurePsi ?? rules.maxBackPressurePsi,
    resolution: judged.resolution,
    specTimeMin: rules.lastPeakTimeMin,
    specPressurePsi: rules.maxBackPressurePsi,
    specResolution: rules.minResolution ?? 1.5,
  });
  return efficiencyDecision(sample, rules, judged, calc, 8, continueShowsLook);
}

function equalPeakCount(
  samples: RetentionSample[],
  rules: CompleteRules,
  choice: RetentionChoice | undefined,
  continueShowsLook = false,
): RetentionDecision {
  const current = samples[samples.length - 1];
  const judged = judgeEqualPeaks(current, rules);

  if (choice?.continueToLook) return lookDecision(samples, rules, "between-then-heat");
  if (choice?.continueRetention) {
    const rawPrior = samples.length >= 2 ? decideRetention(samples.slice(0, -1), rules) : null;
    const prior =
      rawPrior && rawPrior.status === "efficiency"
        ? decideRetention(samples.slice(0, -1), rules, { continueRetention: true })
        : rawPrior;
    const alreadyRanMin =
      prior != null &&
      current.percentB != null &&
      ranRecommendedMinimum(current.percentB, prior);
    if (
      !judged.timeLate &&
      !alreadyRanMin &&
      current.lastPeakTimeMin != null &&
      current.maxBackPressurePsi != null &&
      pressureIsUnder(current.maxBackPressurePsi, rules.maxBackPressurePsi)
    ) {
      const line = retentionLine(rules.lastPeakTimeMin);
      if (!isPast(current.lastPeakTimeMin, line)) {
        return dropPoints(samples, rules, 10, "drop-10");
      }
      if (samples.length >= 2) {
        return calculatePercentB(samples, rules);
      }
    }
    return chooseOwnPercentDecision(current, rules);
  }

  const calc = calculateAwesomeFloor({
    column: {
      lengthMm: current.lengthMm,
      diameterMm: current.diameterMm,
      particleSize: current.particleSize,
      flowRate: current.flowRate,
      sppFactor: current.coreShell ? 1.5 : 1.0,
    },
    t0Min: current.firstPeakTimeMin,
    tRMin: current.lastPeakTimeMin ?? rules.lastPeakTimeMin,
    backPressurePsi: current.maxBackPressurePsi ?? rules.maxBackPressurePsi,
    resolution: judged.resolution,
    specTimeMin: rules.lastPeakTimeMin,
    specPressurePsi: rules.maxBackPressurePsi,
    specResolution: rules.minResolution ?? 1.5,
  });

  const timeSpec = rules.lastPeakTimeMin;
  const timeMeasured = current.lastPeakTimeMin ?? 0;
  // tR << spec: at or under 0.5 * spec
  const timeUnderHalf = !isPast(timeMeasured, retentionLine(timeSpec));
  // tR > spec: later than spec
  const timePastSpec = isPast(timeMeasured, timeSpec);
  // tR < spec: between 0.5 * spec and spec
  const timeUnderSpec = !timeUnderHalf && !timePastSpec;

  const hasResSpec = rules.minResolution != null && rules.minResolution > 0;
  const resMeets = judged.resolutionMeets;
  const rsFloor = calc.rsFloorSpp;
  const resBelowFloor = hasResSpec && (judged.resolution == null || judged.resolution + 1e-9 < rsFloor);
  const resFloorToSpec = hasResSpec && !resMeets && !resBelowFloor;

  // 1. tR << spec
  if (timeUnderHalf) {
    if (resBelowFloor) {
      // Row 4: Increase L (watch BP)
      return efficiencyDecision(current, rules, judged, calc, 4, continueShowsLook || samples.length > 1);
    }
    if (resFloorToSpec) {
      // Row 5: Increase L (BP) OR decrease F OR decrease PS (BP) OR SPP
      return efficiencyDecision(current, rules, judged, calc, 5, continueShowsLook || samples.length > 1);
    }
    // Row 6: MET. Optionally increase F to shorten the run (unless pressure is over)
    if (judged.pressureOver) {
      return efficiencyDecision(current, rules, judged, calc, 5, continueShowsLook || samples.length > 1);
    }
    return specsMet(current, rules, judged, calc, 6);
  }

  // 2. tR < spec
  if (timeUnderSpec) {
    if (resBelowFloor) {
      // Row 7: SELECTIVITY
      return sevenPeaksSelectivity(current, rules, judged, calc, 7);
    }
    if (resFloorToSpec) {
      // Row 8: Decrease F OR decrease PS (BP) OR SPP
      return efficiencyDecision(current, rules, judged, calc, 8, continueShowsLook || samples.length > 1);
    }
    // Row 9: MET. Optionally increase F to shorten the run (unless pressure is over)
    if (judged.pressureOver) {
      return efficiencyDecision(current, rules, judged, calc, 8, continueShowsLook || samples.length > 1);
    }
    return specsMet(current, rules, judged, calc, 9);
  }

  // 3. tR > spec
  if (timePastSpec) {
    if (resBelowFloor) {
      // Row 10: SELECTIVITY
      return sevenPeaksSelectivity(current, rules, judged, calc, 10);
    }
    if (resFloorToSpec) {
      // Row 11: Decrease PS (BP), then increase F to shorten the run
      return efficiencyDecision(current, rules, judged, calc, 11, continueShowsLook || samples.length > 1);
    }
    // Row 12: Increase F to shorten the run
    return efficiencyDecision(current, rules, judged, calc, 12, continueShowsLook || samples.length > 1);
  }

  if (resMeets && !judged.pressureOver) {
    return specsMet(current, rules, judged, calc, 9);
  }
  return efficiencyDecision(current, rules, judged, calc, 8, continueShowsLook || samples.length > 1);
}

type EqualJudgment = {
  resolution: number | null;
  resolutionMeets: boolean;
  resolutionPositive: boolean;
  timeLate: boolean;
  pressureOver: boolean;
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
  const pressureOver =
    sample.maxBackPressurePsi != null &&
    !pressureIsUnder(sample.maxBackPressurePsi, rules.maxBackPressurePsi) &&
    !nearly(sample.maxBackPressurePsi, rules.maxBackPressurePsi);
  return { resolution, resolutionMeets, resolutionPositive, timeLate, pressureOver };
}

function specsMet(
  sample: RetentionSample,
  rules: CompleteRules,
  judged: EqualJudgment,
  calc?: AwesomeCalculatorResult,
  rowNumber: 6 | 9 = 9,
): RetentionDecision {
  const rowHeading =
    rowNumber === 6
      ? `Row 6 (Peaks = ${rules.requiredPeaks}, tR ≪ spec, Rs ≥ spec):`
      : `Row 9 (Peaks = ${rules.requiredPeaks}, tR < spec, Rs ≥ spec):`;
  const actionText = "MET. Optionally increase F to shorten the run";
  const nextChange = "The specifications are met.";

  const tag = buildConditionTag({
    peaks: sample.peakCount,
    requiredPeaks: rules.requiredPeaks,
    tR: sample.lastPeakTimeMin,
    specTime: rules.lastPeakTimeMin,
    rs: judged.resolution,
    specRs: rules.minResolution,
    rsFloor: calc?.rsFloorSpp,
    bp: sample.maxBackPressurePsi,
    specBP: rules.maxBackPressurePsi,
  });

  const leadWhy = [
    `Condition: ${tag}.\n\nWhat this means: All ${formatCount(sample.peakCount ?? rules.requiredPeaks)} peaks are detected (meeting the specification of ${formatCount(rules.requiredPeaks)}). The last peak elutes at ${formatMinutes(sample.lastPeakTimeMin!)} min, within the specified run time of ${formatTypedMinutes(rules.lastPeakTimeMin)} min (${rowNumber === 6 ? "tR ≪ spec" : "tR < spec"}). Critical pair resolution (${judged.resolution != null ? formatResolution(judged.resolution) : "spec"}) meets or exceeds the specification (${rules.minResolution != null ? formatResolution(rules.minResolution) : "spec"}, Rs ≥ spec). Back-pressure is ${formatDecimal(sample.maxBackPressurePsi ?? 0, 1)} psi, safely below the ${formatTypedPressure(rules.maxBackPressurePsi)} psi limit (BP < spec).`,
    `Influence & Decision: ${rowHeading} All specifications are met. Action: ${actionText}. Every analytical performance requirement is satisfied under these isocratic conditions. Further modifications to mobile phase composition, temperature, or column chemistry are unnecessary. Optionally, you may increase flow rate (F) to shorten the run time if faster throughput is desired.`,
  ];

  const moreWhy = [
    calc
      ? `Theoretical plate count & resolution floor analysis: Headroom HR = ${calc.headroom.toFixed(3)}. Current plates N1 = ${Math.round(calc.n1)}. Verdict: ${calc.verdictText}.`
      : "",
    "Method Development Complete: Every analytical performance requirement is satisfied under these isocratic conditions. All expected sample components are fully separated, the critical pair resolution exceeds the specification threshold, total analysis time is within the target throughput window, and column back-pressure operates safely below system pressure limits. Further modifications to mobile phase composition, temperature, or column chemistry are unnecessary. Optionally, you may increase flow rate (F) to shorten the run time if faster throughput is desired.",
    ...ruleLines(sample, rules, judged),
  ].filter(Boolean);

  return {
    status: "specs-met",
    reason: "specs-met",
    move: null,
    nextPercentB: null,
    actionText,
    tableAction: actionText,
    nextChange,
    leadWhy,
    moreWhy,
    why: [...leadWhy, ...moreWhy].join("\n\n"),
    fit: null,
    awesomeFloor: calc ?? null,
  };
}

function chooseOwnPercentDecision(sample: RetentionSample, rules: CompleteRules): RetentionDecision {
  const tag = buildConditionTag({
    peaks: sample.peakCount,
    requiredPeaks: rules.requiredPeaks,
    tR: sample.lastPeakTimeMin,
    specTime: rules.lastPeakTimeMin,
    rs: usableResolution(sample, rules.requiredPeaks),
    specRs: rules.minResolution,
    bp: sample.maxBackPressurePsi,
    specBP: rules.maxBackPressurePsi,
  });

  const leadWhy = [
    `Condition: ${tag}.\n\nWhat this means: The retention space has been explored, but peaks remain unresolved (${formatCount(sample.peakCount ?? 0)} of ${formatCount(rules.requiredPeaks)} peaks). Staying in retention does not calculate another minimum %B, and it does not refit the last-peak line.`,
    `Influence & Decision: Row 3 (Peaks < ${rules.requiredPeaks}): Change selectivity (solvent, temperature, ligand). Action: Select a %B of your choosing. With that %B, selectivity starts at 40°C.`,
  ];

  const moreWhy = [
    ...ruleLines(sample, rules, judgeEqualPeaks(sample, rules)),
    "Staying in retention does not calculate another minimum %B, and it does not refit the last-peak line.",
    "Select a %B of your choosing. With that %B, selectivity starts at 40°C.",
  ];

  return {
    status: "recommend",
    reason: "choose-percent",
    move: null,
    nextPercentB: null,
    nextTemperature: "40",
    pickOwnPercent: true,
    nextChange: "Select a %B of your choosing. The next run is selectivity at 40°C at that %B.",
    following: SELECTIVITY_ORDER,
    leadWhy,
    moreWhy,
    why: [...leadWhy, ...moreWhy].join("\n\n"),
    fit: null,
  };
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

function lookDecision(
  samples: RetentionSample[],
  rules: CompleteRules,
  mode: LookStep["mode"],
): RetentionDecision {
  const sourceIndex = samples.length - 1;
  const why =
    mode === "picker"
      ? "The peak count is still under the specification, so some peaks are still overlapping. Pick which uploaded run to heat. Heat is the next change. The goal is a selectivity change so the overlapping peaks separate. A higher temperature shortens retention. The %B of the run you pick stays the same.\n\nStacked Chromatogram Comparison: Reviewing the aligned retention traces tracks how peak spacing evolves across isocratic %B conditions. Selecting the most promising run as your baseline gives temperature elevation (40°C) the optimal starting point to exploit differential retention enthalpies and resolve overlapping peaks."
      : mode === "between"
        ? "Compare the runs. The calculated %B matches a run already uploaded, so another drop is not the next step. An in-between %B uses the same temperature, solvent, and ligand as this run, and it sits between %B values already tried. A no does not start temperature, solvent, or a column. An in-between %B changes retention. It does not change selectivity, because temperature, solvent, and ligand stay the same.\n\nEvaluating an intermediate composition explores whether co-eluting peaks resolve at a specific solvent strength without altering the fundamental mobile phase or column chemistry."
        : "Compare the runs before the next change. An in-between %B uses the same temperature, solvent, and ligand as the minimum %B run, and it fills a gap between %B values already tried. If that is not useful, pick which uploaded run to heat. Heat can pull overlapping peaks apart without dropping %B again. An in-between %B changes retention only. Heat is a selectivity change.\n\nReviewing the aligned retention traces helps identify whether peaks cross over or whether thermal selectivity is required to resolve the critical co-eluting pair.";
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
      sample.peakCount == null ? "blank" : sample.peakCount === rules.requiredPeaks ? "met" : "not-met";
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
      displayRunNumber: sample.displayRunNumber,
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
  const isFarUnder =
    current.peakCount != null &&
    current.peakCount >= rules.requiredPeaks &&
    rules.minResolution != null &&
    rules.minResolution > 0 &&
    isResolutionFarBelow(usableResolution(current, rules.requiredPeaks), rules.minResolution);
  const rsExplanation = isFarUnder
    ? `${rsFarBelowExplanation(rules.requiredPeaks, usableResolution(current, rules.requiredPeaks), rules.minResolution!)} `
    : "";

  const tag = buildConditionTag({
    peaks: current.peakCount,
    requiredPeaks: rules.requiredPeaks,
    tR: current.lastPeakTimeMin,
    specTime: rules.lastPeakTimeMin,
    rs: usableResolution(current, rules.requiredPeaks),
    specRs: rules.minResolution,
    bp: current.maxBackPressurePsi,
    specBP: rules.maxBackPressurePsi,
  });

  const leadWhy = [
    `Condition: ${tag}.\n\nWhat this means: Peak count is ${formatCount(current.peakCount ?? 0)} of ${formatCount(rules.requiredPeaks)} required peaks (${current.peakCount != null && current.peakCount === rules.requiredPeaks ? `Peaks = ${rules.requiredPeaks}` : `Peaks < ${rules.requiredPeaks}`}). The last peak elutes at ${formatMinutes(current.lastPeakTimeMin!)} min, ${reason === "drop-10" ? "significantly under the specified run time" : "close to the specified run time"} of ${formatTypedMinutes(rules.lastPeakTimeMin)} min (${reason === "drop-10" ? "tR ≪ spec" : "tR < spec"}). Back-pressure is ${formatDecimal(current.maxBackPressurePsi ?? 0, 1)} psi, safely below the ${formatTypedPressure(rules.maxBackPressurePsi)} psi limit (BP < spec).`,
    reason === "drop-10"
      ? `Influence & Decision: Row 1 (Peaks < ${rules.requiredPeaks}, tR ≪ spec): Decrease %B by 10%. With the last peak eluting significantly under the run time ceiling, there is extensive retention headroom. Action: Decrease %B by 10%. Run the next chromatogram at ${to}% B to increase retention and expand peak separation.`
      : `Influence & Decision: Row 2 (Peaks < ${rules.requiredPeaks}, tR < spec, single run): Lower %B by 5%. Because this is the first chromatogram, at least two runs are required to fit the log k retention line to calculate the minimum %B. Action: Lower %B by 5 percentage points (${from}% B to ${to}% B). A conservative 5% drop safely increases retention without overshooting the run-time limit, providing the second isocratic data point needed to calculate the target %B.`,
  ];

  const moreWhy: string[] = [];
  if (reason === "drop-10") {
    moreWhy.push(
      `${rsExplanation}The last peak is at ${formatMinutes(current.lastPeakTimeMin!)} min, still significantly under the specified run time of ${formatTypedMinutes(rules.lastPeakTimeMin)} min. Decrease %B by 10% to increase retention and peak separation.`,
      `In reversed-phase HPLC, solvent B is the strong organic eluent (such as acetonitrile). Decreasing %B increases the aqueous proportion, strengthening hydrophobic partitioning between the analytes and the stationary phase. This increases retention factors (k) across all peaks, expanding the total retention window so closely eluting or overlapping peaks have more column residence time to resolve. Because the final peak eluted well under the specified run time and column pressure is comfortably below the limit, a standard 10 percentage point reduction systematically scouts the retention space without risking exceeding the run time or back-pressure specifications.`,
    );
  } else {
    moreWhy.push(
      `${rsExplanation}The last peak is at ${formatMinutes(current.lastPeakTimeMin!)} min, close to the specified run time of ${formatTypedMinutes(rules.lastPeakTimeMin)} min. Minimum %B: N/A (at least two runs are required to fit the logK line). This is the only chromatogram so far, so the %B that would hit that time is not calculated. ${from}% B minus 5 percentage points is ${to}% B. Another run is needed before that %B can be calculated. A larger drop is not used, because retention grows quickly as %B goes down.`,
      `In reversed-phase systems, retention factor (k) increases exponentially as %B decreases (log k varies linearly with mobile phase composition). Because the last peak is already approaching the specified run time limit, taking another 10% reduction could push the final peak beyond the ${formatTypedMinutes(rules.lastPeakTimeMin)} min ceiling or generate excessive column back-pressure. A conservative 5 percentage point reduction safely increases retention while providing the second distinct isocratic data point required to establish a Linear Solvent Strength (LSS) calibration line.`,
    );
  }
  moreWhy.push(...whyParts);

  return {
    status: "recommend",
    reason,
    move: reason,
    nextPercentB: next,
    nextChange,
    tableAction: reason === "drop-10" ? "Decrease %B by 10" : undefined,
    following: SELECTIVITY_ORDER,
    leadWhy,
    moreWhy,
    why: [...leadWhy, ...moreWhy].join("\n\n"),
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
  const samePercent = nearly(back, current.percentB!);
  const lead = samePercent ? `Stay at ${percent}% B` : `Go back to ${percent}% B`;

  const tag = buildConditionTag({
    peaks: current.peakCount,
    requiredPeaks: rules.requiredPeaks,
    tR: current.lastPeakTimeMin,
    specTime: rules.lastPeakTimeMin,
    rs: usableResolution(current, rules.requiredPeaks),
    specRs: rules.minResolution,
    bp: current.maxBackPressurePsi,
    specBP: rules.maxBackPressurePsi,
  });

  const leadWhy = [
    `Condition: ${tag}.\n\nWhat this means: Peak count is ${formatCount(current.peakCount!)} of ${formatCount(rules.requiredPeaks)} required peaks (Peaks < ${rules.requiredPeaks}). The last peak elutes at ${formatMinutes(current.lastPeakTimeMin!)} min, exceeding the specified run time of ${formatMinutes(rules.lastPeakTimeMin)} min (tR > spec). Back-pressure is ${formatDecimal(current.maxBackPressurePsi ?? 0, 1)} psi, safely below the ${formatTypedPressure(rules.maxBackPressurePsi)} psi limit (BP < spec).`,
    `Influence & Decision: Row 3 (Peaks < ${rules.requiredPeaks}, tR > spec): Change selectivity (solvent, temperature, ligand). Lowering %B further cannot resolve the mixture because the run time already exceeds the specification. Action: SELECTIVITY (Run at 40°C). ${lead} and change selectivity. Elevating column temperature to 40°C alters relative analyte retention (α = k2/k1) to separate overlapping peaks while simultaneously accelerating elution and reducing mobile phase viscosity.`,
  ];

  const moreWhy = [
    `This run has ${formatCount(current.peakCount!)} peaks, still under the specification of ${formatCount(rules.requiredPeaks)}.`,
    `The last peak is at ${formatMinutes(current.lastPeakTimeMin!)} min, later than the specification of ${formatMinutes(rules.lastPeakTimeMin)} min. A lower %B would hold the compounds even longer. ${lead} and change selectivity instead.`,
    `Retention adjustments alone cannot resolve this mixture. Lowering %B further would only prolong elution beyond the ${formatMinutes(rules.lastPeakTimeMin)} min specification. Because the peak count (${formatCount(current.peakCount!)}) is still below the mixture specification (${formatCount(rules.requiredPeaks)}), the unresolved peaks are co-eluting due to identical hydrophobic partition coefficients under ambient conditions. Elevating column temperature to 40°C alters standard transfer enthalpies (ΔH°) differently for each analyte, allowing overlapping peaks to shift relative to each other (changing selectivity factor α = k2/k1) while simultaneously shortening retention time and reducing mobile phase viscosity.`,
  ];

  return {
    status: "recommend",
    reason: "drop-10",
    move: null,
    nextPercentB: back,
    nextTemperature: "40",
    actionText: "Run at 40°C (Change selectivity)",
    tableAction: "Change selectivity (solvent, temperature, ligand) OR an intermediate %B",
    nextChange: `${lead} and change selectivity. Run the next chromatogram at 40°C, still at ${percent}% B. The goal is to change the conditions so the selectivity changes and the overlapping peaks separate. A higher temperature shortens retention. The %B stays the same. ${TEMPERATURE_SENTENCE} Do not lower %B. The last peak is already past the time and the peak count is still short.`,
    following: SELECTIVITY_ORDER,
    leadWhy,
    moreWhy,
    why: [...leadWhy, ...moreWhy].join("\n\n"),
    fit: null,
  };
}

function closeToSpecSentence(lastPeakMin: number, specMin: number, rsNote = ""): string {
  const prefix = rsNote ? `${rsNote} ` : "";
  return `${prefix}The last peak is at ${formatMinutes(lastPeakMin)} min, close to the specified run time of ${formatTypedMinutes(specMin)} min. Another 10% drop would make retention much longer, because retention grows quickly as %B goes down. The next %B is calculated instead.`;
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

function calculatePercentB(samples: RetentionSample[], rules: CompleteRules): RetentionDecision {
  const current = samples[samples.length - 1];
  const isFarUnder =
    current.peakCount != null &&
    current.peakCount >= rules.requiredPeaks &&
    rules.minResolution != null &&
    rules.minResolution > 0 &&
    isResolutionFarBelow(usableResolution(current, rules.requiredPeaks), rules.minResolution);

  const rsNote = isFarUnder
    ? rsFarBelowExplanation(rules.requiredPeaks, usableResolution(current, rules.requiredPeaks), rules.minResolution!)
    : "";

  const intro = [
    ...situationSentences(samples, rules),
    closeToSpecSentence(current.lastPeakTimeMin!, rules.lastPeakTimeMin, rsNote),
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
    rsFarBelowNote: rsNote || null,
  };

  const percent = formatPercentB(rounded.value);
  let nextChange = `Run the next chromatogram at ${percent}% B. That is the %B calculated to put the last peak at ${formatMinutes(rules.lastPeakTimeMin)} min. ${PERCENT_B_SENTENCE}`;
  if (rounded.clamped === "high") {
    nextChange += " The calculated value was above 100, so it is held at 100.";
  } else if (rounded.clamped === "low") {
    nextChange += " The calculated value was below 0, so it is held at 0.";
  }

  const kTargetFormatted = formatCalc(kTarget, 3);
  intro.push(
    `Linear Solvent Strength (LSS) Model: In reversed-phase chromatography, isocratic retention adheres to log10(k) = log10(kw) − S × (%B / 100), where kw represents retention in pure aqueous mobile phase and S is the solvent sensitivity parameter. Fitting log10(k) of the last peak against %B across qualifying runs yields the slope and intercept needed to solve for the exact %B targeting k = ${kTargetFormatted}, aligning the final peak precisely at the specified run time of ${formatTypedMinutes(rules.lastPeakTimeMin)} min. This maximizes total chromatographic capacity and resolution across the run time window without exceeding specifications.`,
  );

  const tag = buildConditionTag({
    peaks: current.peakCount,
    requiredPeaks: rules.requiredPeaks,
    tR: current.lastPeakTimeMin,
    specTime: rules.lastPeakTimeMin,
    rs: usableResolution(current, rules.requiredPeaks),
    specRs: rules.minResolution,
    bp: current.maxBackPressurePsi,
    specBP: rules.maxBackPressurePsi,
  });

  const leadWhy = [
    `Condition: ${tag}.\n\nWhat this means: Peak count is ${formatCount(current.peakCount ?? 0)} of ${formatCount(rules.requiredPeaks)} required peaks (${current.peakCount != null && current.peakCount === rules.requiredPeaks ? `Peaks = ${rules.requiredPeaks}` : `Peaks < ${rules.requiredPeaks}`}). The last peak elutes at ${formatMinutes(current.lastPeakTimeMin!)} min, approaching the specified run time of ${formatTypedMinutes(rules.lastPeakTimeMin)} min (tR < spec). Back-pressure is ${formatDecimal(current.maxBackPressurePsi ?? 0, 1)} psi, safely below the ${formatTypedPressure(rules.maxBackPressurePsi)} psi limit (BP < spec).`,
    `Influence & Decision: Row 2 (Peaks < ${rules.requiredPeaks}, tR < spec): Calculate minimum %B. The last peak is approaching the specified run time ceiling. Action: Run at ${percent}% B. Instead of taking another fixed drop, the Linear Solvent Strength (LSS) model calculates the exact %B (${percent}% B) that targets the specified run time of ${formatTypedMinutes(rules.lastPeakTimeMin)} min, maximizing the retention window for peak separation.`,
  ];

  const moreWhy = [...intro, fitMembershipSentence(samples, fit, spec, picked.checks, picked.r2Dropped)];
  const why = [...leadWhy, ...moreWhy].join("\n\n");

  return {
    status: "recommend",
    reason: "calculated",
    move: "calculated",
    nextPercentB: rounded.value,
    nextChange,
    tableAction: "Min %B (the value that puts the last peak exactly at the spec) OR an intermediate %B",
    following: SELECTIVITY_ORDER,
    leadWhy,
    moreWhy,
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
  const lines = [peaks, pressure, last];
  if (
    sample.peakCount != null &&
    sample.peakCount >= rules.requiredPeaks &&
    rules.minResolution != null &&
    rules.minResolution > 0 &&
    isResolutionFarBelow(usableResolution(sample, rules.requiredPeaks), rules.minResolution)
  ) {
    lines.push(
      rsFarBelowExplanation(rules.requiredPeaks, usableResolution(sample, rules.requiredPeaks), rules.minResolution),
    );
  }
  return lines;
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


function fitMembershipSentence(
  samples: RetentionSample[],
  fit: RetentionFit,
  spec: SeparationSpec,
  checks: T0Check[],
  r2Dropped: number[] = [],
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
    const separation = separationMembershipSentence(samples, spec, checks, r2Dropped);
    if (separation) parts.push(separation);
  }
  parts.push(`The calculation uses ${used}.`);
  return parts.join(" ");
}

function qTestLeftOutSentence(samples: RetentionSample[], leftOut: T0Check[]): string {
  const labels = leftOut.map((check) => {
    const sample = samples[check.index];
    const percent = sample.percentB == null ? "" : ` at ${formatPercentB(sample.percentB)}% B`;
    return `Run ${sample.displayRunNumber ?? check.index + 1}${percent} (t0 peak ${formatMinutes(check.t0!)} min)`;
  });
  if (labels.length === 1) return `The Q-test left out ${labels[0]}.`;
  const last = labels[labels.length - 1];
  return `The Q-test left out ${labels.slice(0, -1).join(", ")} and ${last}.`;
}

function separationMembershipSentence(
  samples: RetentionSample[],
  spec: SeparationSpec,
  checks: T0Check[],
  r2Dropped: number[] = [],
): string {
  const highest = highestPercentIndex(samples);
  const parts: string[] = [];
  if (highest === 0) {
    if (!checks[0]?.far) {
      const verdict = separationVerdict(samples[0], spec);
      let line = `${runLabel(0, samples[0])} is the first run and also the highest %B, so that run is checked once. ${verdict.sentence}`;
      if (!verdict.keep) line += " It is left out once.";
      parts.push(line);
    }
  } else {
    if (!checks[0]?.far) {
      const first = separationVerdict(samples[0], spec);
      parts.push(`${runLabel(0, samples[0])} is the first run. ${first.sentence}`);
    }
    if (!checks[highest]?.far) {
      const high = separationVerdict(samples[highest], spec);
      parts.push(`${runLabel(highest, samples[highest])} has the highest %B. ${high.sentence}`);
    }
  }
  for (const idx of r2Dropped) {
    const extra = separationVerdict(samples[idx], spec);
    parts.push(`${runLabel(idx, samples[idx])} is also left out to improve R² toward 0.99. ${extra.sentence}`);
  }
  return parts.join(" ");
}

function runLabel(index: number, sample: RetentionSample): string {
  const percent = sample.percentB == null ? "" : ` at ${formatPercentB(sample.percentB)}% B`;
  return `Run ${sample.displayRunNumber ?? index + 1}${percent}`;
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
  r2Dropped: number[];
};

function selectForLine(samples: RetentionSample[], spec: SeparationSpec): LineSelection {
  const indexed = samples.map((sample, index) => ({ runNumber: sample.displayRunNumber ?? index + 1, sample }));
  const checks = t0Checks(samples);
  const dropIndexes = new Set(checks.filter((check) => check.far).map((check) => check.index));
  const r2Dropped: number[] = [];
  if (samples.length > 3) {
    const highest = highestPercentIndex(samples);
    for (const index of [0, highest]) {
      if (dropIndexes.has(index)) continue;
      if (!separationVerdict(samples[index], spec).keep) dropIndexes.add(index);
    }
    while (true) {
      const activeIndices: number[] = [];
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i < samples.length; i++) {
        if (dropIndexes.has(i)) continue;
        const pct = samples[i].percentB;
        const factor = retentionFactor(samples[i]);
        if (pct == null || !factor) continue;
        activeIndices.push(i);
        points.push({ x: pct, y: factor.logK });
      }
      if (activeIndices.length <= 3) break;
      const fit = ordinaryLeastSquares(points);
      if (!fit || fit.rSquared >= 0.99) break;
      let candidateIdx = -1;
      let candidatePct = -Infinity;
      for (const idx of activeIndices) {
        const pct = samples[idx].percentB!;
        if (pct > candidatePct) {
          candidatePct = pct;
          candidateIdx = idx;
        }
      }
      if (candidateIdx < 0 || separationVerdict(samples[candidateIdx], spec).keep) break;
      const withoutPoints = points.filter((_, pos) => activeIndices[pos] !== candidateIdx);
      const nextFit = ordinaryLeastSquares(withoutPoints);
      if (!nextFit || !(nextFit.rSquared > fit.rSquared + 1e-6)) break;
      dropIndexes.add(candidateIdx);
      r2Dropped.push(candidateIdx);
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
  return { kept, excluded, checks, r2Dropped };
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
    const runNumber = sample.displayRunNumber ?? index + 1;
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
  return [
    `This is unexpected. An error likely occurred. The ${higher}% B run’s last peak is at ${formatMinutes(pair.higherLastMin)} min, and the ${lower}% B run’s last peak is at ${formatMinutes(pair.lowerLastMin)} min. A lower %B should hold the compounds longer.`,
    `Thermodynamic Retention Violation: In reversed-phase chromatography, lowering strong solvent concentration (%B) increases analyte retention factor (k = (tR − t0) / t0) because the mobile phase becomes more polar, strengthening hydrophobic partitioning into the stationary phase. A shorter retention time at lower %B indicates an experimental issue: swapped solvent lines (channels A and B reversed), incorrect file naming or %B entry, pump proportioning valve failure, column contamination, or sample vial misplacement. Review the raw data and rerun these conditions before basing further method decisions on them.`,
  ].join("\n\n");
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

function blocked(
  reason: RetentionReason,
  nextChange: string,
  why: string,
  leadWhy?: string[],
  moreWhy?: string[],
): RetentionDecision {
  return { status: "blocked", reason, move: null, nextPercentB: null, nextChange, why, leadWhy, moreWhy, fit: null };
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

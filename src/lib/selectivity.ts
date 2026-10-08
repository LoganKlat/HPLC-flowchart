import { resolutionForDecision } from "@/lib/evaluate";
import { COATING_SENTENCE, PERCENT_B_SENTENCE, SELECTIVITY_ORDER, TEMPERATURE_SENTENCE } from "@/lib/setting-kind";
import { carryForwardIndex, decideRetention, formatPercentB, roundTargetPercent, type RetentionRules, type RetentionSample } from "@/lib/retention";

/**
 * Selectivity starts after retention has picked a run to carry forward.
 * Temperature is tried first, then a solvent read from the nomograph,
 * then a new column coating that sends retention back to the beginning.
 */

export type Solvent = {
  id: string;
  label: string;
  /** Name used in sentences. */
  name: string;
  aliases: string[];
};

export const SOLVENTS: readonly Solvent[] = [
  { id: "acetonitrile", label: "ACN", name: "ACN", aliases: ["acn", "acetonitrile", "acetonitrile (acn)"] },
  { id: "methanol", label: "MeOH", name: "MeOH", aliases: ["meoh", "methanol", "methanol (meoh)"] },
  { id: "tetrahydrofuran", label: "THF", name: "THF", aliases: ["thf", "tetrahydrofuran", "tetrahydrofuran (thf)"] },
];

/** Percent, then the nomograph x of that tick. Piecewise linear between ticks. */
const CHART_TICKS = {
  methanol: [
    [0, 26],
    [10, 64.5],
    [20, 122.5],
    [30, 177.5],
    [40, 239.5],
    [50, 292.5],
    [60, 365.5],
    [70, 431.5],
    [80, 515.5],
    [90, 617.5],
    [100, 713.5],
  ],
  acetonitrile: [
    [0, 26],
    [100, 713.5],
  ],
  tetrahydrofuran: [
    [0, 26],
    [10, 116.5],
    [20, 211.5],
    [30, 294.5],
    [40, 385.5],
    [50, 477.5],
    [60, 579],
    [70, 693.5],
    [80, 794.5],
    [90, 894.5],
    [100, 991.5],
  ],
} as const;

const NOMOGRAPH_IDS = ["methanol", "acetonitrile", "tetrahydrofuran"] as const;

export const CHART_X_MIN = 26;
export const CHART_X_MAX = 991.5;

export const LIGANDS = ["C18", "C18aq", "PFPP", "C8", "biphenyl", "IBD"] as const;

export type SelectivityRun = {
  percentB: number | null;
  temperatureC: number | null;
  solvent: string;
  ligand: string;
  peakCount: number | null;
  lastPeakTimeMin: number | null;
  firstPeakTimeMin: number | null;
  minResolutionExcludingFirst: number | null;
  maxBackPressurePsi: number | null;
};

export type SelectivitySetup = {
  requiredPeaks: number | null;
  lastPeakTimeMin: number | null;
  minResolution: number | null;
  maxBackPressurePsi: number | null;
  /** Null when the Run 1 temperature box is empty. 25°C is used in that case. */
  ambientTemperatureC: number | null;
  originalSolvent: string;
  originalLigand: string;
};

export type NomographEntry = {
  id: string;
  label: string;
  percentText: string;
  capped: boolean;
};

export type SelectivityPrefill = {
  percentB: string;
  temperature: string;
  solvent: string;
  ligand: string;
};

export type SelectivityStep =
  | "temp-40"
  | "temp-adjust"
  | "temp-choice"
  | "temp-60"
  | "solvent"
  | "ligand"
  | "finished"
  | "blocked";

export type TempPath = "solvent" | "heat" | "ligand";

export type TempChoice = {
  recommendedSentence: string;
  heatLabel: string;
  heatNextChange: string;
  heatPrefill: SelectivityPrefill;
  solventNextChange: string;
  solventPrefill: SelectivityPrefill;
  /** The recommended button. Solvent on the first chemistry, ligand after a solvent change. */
  other: "solvent" | "ligand";
};

/** Shown when 40°C did not improve separation. Solvent is the recommended path. */
export const TEMP_CHOICE_RECOMMENDED =
  "Change the solvent. This is recommended because the temperature increase did not help, so a higher temperature is unlikely to increase separation.";

/** Shown when 40°C on the new solvent did not improve separation. Ligand is the recommended path. */
export const LIGAND_CHOICE_RECOMMENDED =
  "Change the ligand. This is recommended because the temperature increase did not help, so a higher temperature is unlikely to increase separation.";

export type SelectivityPlan = {
  status: "recommend" | "finished" | "blocked";
  step: SelectivityStep;
  nextChange: string;
  /** The step after this one, and why the order is 40°C, then 60°C, then solvent, then coating. */
  following?: string;
  why: string;
  prefill: SelectivityPrefill | null;
  nomograph: NomographEntry[] | null;
  showSolventChoices: boolean;
  showLigandChoices: boolean;
  recommendedSolventId: string | null;
  recommendedLigand: string | null;
  anchorPercentB: number | null;
  oldSolvent: string | null;
  tempChoice: TempChoice | null;
};

export type HistoryPlan =
  | { phase: "retention"; segmentStart: number }
  | { phase: "selectivity"; segmentStart: number; plan: SelectivityPlan };

export type HappyCheck = {
  enoughPeaks: boolean;
  missingResolutionRule: boolean;
};

/** Highest multiple first is the one we ask about. A run asks only at that one. */
export const RESOLUTION_MULTIPLES = [0.4, 0.55, 0.7, 0.85, 1] as const;

export type EfficiencyAsk = {
  /** Set for a resolution-benchmark ask. Null for the one-time 7-peak ask. */
  multiple: number | null;
  peakCount: number;
  measured: number;
  spec: number;
  question: string;
  why: string;
};

export function findSolvent(value: string): Solvent | null {
  const key = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;
  return SOLVENTS.find((solvent) => solvent.id === key || solvent.aliases.includes(key) || solvent.label.toLowerCase() === key) ?? null;
}

export function solventById(id: string): Solvent | null {
  return SOLVENTS.find((solvent) => solvent.id === id) ?? null;
}

export function formatMatchedPercent(percent: number, capped: boolean): string {
  if (capped || percent === 100) return "100";
  return percent.toFixed(1);
}

type ChartTicks = readonly (readonly [number, number])[];

function chartTicks(solventId: string): ChartTicks | null {
  if (solventId === "methanol" || solventId === "acetonitrile" || solventId === "tetrahydrofuran") {
    return CHART_TICKS[solventId];
  }
  return null;
}

function percentToX(ticks: ChartTicks, percent: number): number {
  const clamped = Math.min(100, Math.max(0, percent));
  for (let index = 0; index < ticks.length - 1; index++) {
    const [startPercent, startX] = ticks[index];
    const [endPercent, endX] = ticks[index + 1];
    if (clamped <= endPercent) {
      const span = endPercent - startPercent;
      const t = span === 0 ? 0 : (clamped - startPercent) / span;
      return startX + t * (endX - startX);
    }
  }
  return ticks[ticks.length - 1][1];
}

function xToPercent(ticks: ChartTicks, x: number): { percent: number; capped: boolean } {
  const lastX = ticks[ticks.length - 1][1];
  const firstX = ticks[0][1];
  if (x > lastX) return { percent: 100, capped: true };
  if (x <= firstX) return { percent: 0, capped: false };
  for (let index = 0; index < ticks.length - 1; index++) {
    const [startPercent, startX] = ticks[index];
    const [endPercent, endX] = ticks[index + 1];
    if (x <= endX) {
      const span = endX - startX;
      const t = span === 0 ? 0 : (x - startX) / span;
      const raw = startPercent + t * (endPercent - startPercent);
      const percent = Math.min(100, Math.max(0, roundTenths(raw)));
      return { percent, capped: false };
    }
  }
  return { percent: 100, capped: true };
}

export function chartX(solventId: string, percent: number): number | null {
  const ticks = chartTicks(solventId);
  if (!ticks) return null;
  return percentToX(ticks, percent);
}

export function solventNomograph(oldPercent: number, oldSolvent: string): NomographEntry[] | null {
  const current = findSolvent(oldSolvent);
  if (!current || !chartTicks(current.id)) return null;
  const x = percentToX(chartTicks(current.id)!, oldPercent);
  return NOMOGRAPH_IDS.map((id) => {
    const solvent = solventById(id)!;
    const matched = xToPercent(chartTicks(id)!, x);
    return {
      id,
      label: solvent.label,
      percentText: formatMatchedPercent(matched.percent, matched.capped),
      capped: matched.capped,
    };
  });
}

export function solventChoicePercent(
  anchorPercentB: number,
  oldSolvent: string,
  newSolventId: string,
): { percentText: string; capped: boolean } | null {
  const rows = solventNomograph(anchorPercentB, oldSolvent);
  const row = rows?.find((entry) => entry.id === newSolventId);
  if (!row) return null;
  return { percentText: row.percentText, capped: row.capped };
}

export function recommendLigand(tried: string[]): string | null {
  const used = new Set(tried.map(ligandKey).filter((key) => key.length > 0));
  return LIGANDS.find((name) => !used.has(ligandKey(name))) ?? null;
}

export function assessHappy(
  run: { peakCount: number | null },
  rules: { requiredPeaks: number | null; minResolution: number | null },
): HappyCheck {
  const enoughPeaks =
    rules.requiredPeaks != null && run.peakCount != null && run.peakCount >= rules.requiredPeaks;
  if (rules.minResolution == null) {
    return { enoughPeaks, missingResolutionRule: true };
  }
  return { enoughPeaks, missingResolutionRule: false };
}

export function efficiencyAsk(input: {
  peakCount: number | null;
  foundResolution: number | null;
  requiredPeaks: number | null;
  minResolution: number | null;
  declinedThrough: number | null;
  lastPeakTimeMin?: number | null;
  specifiedRunTimeMin?: number | null;
  maxBackPressurePsi?: number | null;
  maxBackPressureSpec?: number | null;
}): EfficiencyAsk | null {
  if (input.minResolution == null || !(input.minResolution > 0)) return null;
  if (input.peakCount == null) return null;
  const measured = resolutionForDecision(input.peakCount, input.foundResolution, input.requiredPeaks);
  if (measured == null || !Number.isFinite(measured)) return null;

  const peaksMeetSpec = input.requiredPeaks != null && input.peakCount === input.requiredPeaks;
  if (peaksMeetSpec) return null;
  if (input.requiredPeaks != null && input.peakCount > input.requiredPeaks) return null;
  const multiple = input.requiredPeaks != null && input.peakCount >= input.requiredPeaks
    ? highestMultiple(measured, input.minResolution)
    : null;
  if (multiple != null) {
    if (input.declinedThrough != null && multiple <= input.declinedThrough + 1e-9) return null;
    return finishEfficiencyAsk(input, measured, multiple);
  }
  return null;
}

function finishEfficiencyAsk(
  input: {
    peakCount: number | null;
    requiredPeaks: number | null;
    minResolution: number | null;
    lastPeakTimeMin?: number | null;
    specifiedRunTimeMin?: number | null;
    maxBackPressurePsi?: number | null;
    maxBackPressureSpec?: number | null;
  },
  measured: number,
  multiple: number | null,
): EfficiencyAsk {
  const spec = input.minResolution!;
  const peakCount = input.peakCount!;
  const lastPeak = input.lastPeakTimeMin ?? null;
  const specified = input.specifiedRunTimeMin ?? null;
  const resolutionMeets = measured + 1e-9 >= spec;
  const lastPeakLate =
    lastPeak != null && specified != null && Number.isFinite(lastPeak) && Number.isFinite(specified) && isLater(lastPeak, specified);
  return {
    multiple,
    peakCount,
    measured,
    spec,
    question:
      resolutionMeets && lastPeakLate
        ? runtimeQuestion(lastPeak, specified)
        : efficiencyQuestion(measured, spec),
    why: efficiencyWhy({
      peakCount,
      requiredPeaks: input.requiredPeaks,
      measured,
      spec,
      lastPeakTimeMin: lastPeak,
      specifiedRunTimeMin: specified,
      maxBackPressurePsi: input.maxBackPressurePsi ?? null,
      maxBackPressureSpec: input.maxBackPressureSpec ?? null,
    }),
  };
}

export function efficiencyQuestion(measured: number, spec: number): string {
  const comparison =
    measured + 1e-9 >= spec
      ? `Above the specification of ${formatResolution(spec)}.`
      : `Under the specification of ${formatResolution(spec)}.`;
  const lead =
    measured + 1e-9 >= spec
      ? "The worst pair already meets the specification. Consider moving on to efficiency."
      : "The peaks are there, but the worst pair is still too close. Consider whether efficiency and gradient can still bring the resolution up to the specification.";
  const follow =
    measured + 1e-9 >= spec
      ? "Efficiency can shorten the run without changing the separation you already have."
      : "The next change is meant to pull them apart.";
  return `${lead} Minimum resolution: ${formatResolution(measured)}. ${comparison} ${follow} Move on to efficiency and be done with selectivity?`;
}

function runtimeQuestion(lastPeakMin: number, specifiedMin: number): string {
  return `The peaks are already there and there is a real separation. Consider whether efficiency and gradient can still bring the last peak time to the specification. The last peak is at ${formatMinutes(lastPeakMin)} min, later than the specification of ${formatTypedMinutes(specifiedMin)} min. Efficiency can shorten the run without changing the separation you already have. Move on to efficiency and be done with selectivity?`;
}

function efficiencyWhy(input: {
  peakCount: number;
  requiredPeaks: number | null;
  measured: number;
  spec: number;
  lastPeakTimeMin: number | null;
  specifiedRunTimeMin: number | null;
  maxBackPressurePsi: number | null;
  maxBackPressureSpec: number | null;
}): string {
  const resolutionMet = input.measured + 1e-9 >= input.spec;
  const lastPeakLate =
    input.lastPeakTimeMin != null &&
    input.specifiedRunTimeMin != null &&
    isLater(input.lastPeakTimeMin, input.specifiedRunTimeMin);
  const lastPeakChecked = input.specifiedRunTimeMin != null;
  const lastPeakMet = lastPeakChecked && input.lastPeakTimeMin != null && !lastPeakLate;
  const pressureChecked = input.maxBackPressureSpec != null;
  const pressureMet =
    pressureChecked &&
    input.maxBackPressurePsi != null &&
    Number.isFinite(input.maxBackPressurePsi) &&
    !isOver(input.maxBackPressurePsi, input.maxBackPressureSpec!);
  const requiredPeaks = input.requiredPeaks;
  const peaksChecked = requiredPeaks != null;
  const peaksMet = requiredPeaks != null && input.peakCount != null && input.peakCount >= requiredPeaks;
  const everySpecificationMet =
    (!peaksChecked || peaksMet) &&
    resolutionMet &&
    (!lastPeakChecked || lastPeakMet) &&
    (!pressureChecked || pressureMet);

  const parts = [
    "Moving on to efficiency is a choice.",
    peakLine(input.peakCount, input.requiredPeaks),
    `Minimum resolution: ${formatResolution(input.measured)}. ${resolutionMet ? "Above" : "Under"} the specification of ${formatResolution(input.spec)}.`,
    lastPeakSentence(input.lastPeakTimeMin, input.specifiedRunTimeMin),
    pressureSentence(input.maxBackPressurePsi, input.maxBackPressureSpec),
  ];
  if (!resolutionMet) {
    parts.push(
      "The peaks are there, but the worst pair is still too close. Not every specification is met. The next change is meant to pull them apart. Efficiency and gradient may still bring the resolution up to the specification.",
    );
  } else if (lastPeakLate && input.specifiedRunTimeMin != null) {
    parts.push(
      "The peaks are already there and the worst pair is already far enough apart. Not every specification is met because the last peak is late. Efficiency can shorten the run without changing the separation you already have.",
    );
  } else if (!everySpecificationMet) {
    parts.push(
      "Not every specification is met. The measurements above are what still has to be brought inside the specification. Moving on would use efficiency, which narrows peaks or shortens the run, instead of another selectivity change.",
    );
  } else {
    parts.push(
      "Every specification is met. Another selectivity change is not needed. Efficiency is not required either, because the peaks are already far enough apart and the run is already inside the time.",
    );
  }
  return parts.join("\n\n");
}

function peakLine(count: number, spec: number | null): string {
  if (spec == null) return `Peaks: ${formatCount(count)}. The specification is blank, so it is not checked.`;
  return `Peaks: ${formatCount(count)}. The specification is ${formatCount(spec)}. ${count >= spec ? "Met." : "Not met."}`;
}

function lastPeakSentence(measured: number | null, spec: number | null): string {
  if (spec == null) return "Last peak: the specification is blank, so it is not checked.";
  const typed = formatTypedMinutes(spec);
  if (measured == null || !Number.isFinite(measured)) {
    return `Last peak: not in this file. The specification is ${typed} min. Not met.`;
  }
  if (isLater(measured, spec)) {
    return `Last peak: ${formatMinutes(measured)} min. Later than the specification of ${typed} min. Not met.`;
  }
  return `Last peak: ${formatMinutes(measured)} min. The specification is ${typed} min. Met.`;
}

function pressureSentence(measured: number | null, spec: number | null): string {
  if (spec == null) return "Back-pressure: the specification is blank, so it is not checked.";
  const typed = formatTypedNumber(spec);
  if (measured == null || !Number.isFinite(measured)) {
    return `Back-pressure: not in this file. The specification is ${typed} psi. Not met.`;
  }
  const shown = formatPressure(measured);
  if (isOver(measured, spec)) {
    return `Back-pressure: ${shown} psi. Over the specification of ${typed} psi. Not met.`;
  }
  if (isUnder(measured, spec)) {
    return `Back-pressure: ${shown} psi. Under the specification of ${typed} psi. Met.`;
  }
  return `Back-pressure: ${shown} psi. The specification is ${typed} psi. Met.`;
}

function isOver(measured: number, spec: number): boolean {
  const scale = Math.max(1, Math.abs(measured), Math.abs(spec));
  if (Math.abs(measured - spec) <= scale * 1e-9) return false;
  return measured > spec;
}

function isUnder(measured: number, spec: number): boolean {
  const scale = Math.max(1, Math.abs(measured), Math.abs(spec));
  if (Math.abs(measured - spec) <= scale * 1e-9) return false;
  return measured < spec;
}

function formatPressure(value: number): string {
  return value.toFixed(1);
}

function formatTypedNumber(value: number): string {
  return String(value);
}

function isLater(measured: number, spec: number): boolean {
  const scale = Math.max(1, Math.abs(measured), Math.abs(spec));
  if (Math.abs(measured - spec) <= scale * 1e-9) return false;
  return measured > spec;
}

function formatTypedMinutes(value: number): string {
  return String(value);
}

function highestMultiple(measured: number, spec: number): number | null {
  let reached: number | null = null;
  for (const multiple of RESOLUTION_MULTIPLES) {
    if (measured + 1e-9 >= multiple * spec) reached = multiple;
  }
  return reached;
}

export function adjustedPercentB(input: {
  slope: number | null;
  percentB: number;
  t0: number | null;
  lastPeakMin: number | null;
  specMin: number | null;
  usedPercentB: number[];
}): { percentB: number; method: "line" | "drop-5"; clamped: "low" | "high" | null } {
  const dropped = roundTargetPercent(input.percentB - 5, input.usedPercentB);
  const drop = { percentB: dropped.value, method: "drop-5" as const, clamped: dropped.clamped };
  if (input.slope == null || input.slope === 0 || input.specMin == null) return drop;
  const t0 = input.t0;
  const tR = input.lastPeakMin;
  if (t0 == null || tR == null || !(t0 > 0) || !(tR > t0) || !(input.specMin > t0)) return drop;
  const k = (tR - t0) / t0;
  const kTarget = (input.specMin - t0) / t0;
  if (!(k > 0) || !(kTarget > 0)) return drop;
  const logK = Math.log10(k);
  const logKTarget = Math.log10(kTarget);
  const intercept = logK - input.slope * input.percentB;
  const raw = (logKTarget - intercept) / input.slope;
  if (!Number.isFinite(raw)) return drop;
  const rounded = roundTargetPercent(raw, input.usedPercentB);
  return { percentB: rounded.value, method: "line", clamped: rounded.clamped };
}

export type HeatStart = {
  /** Uploaded run the user picked to heat. */
  carryIndex: number;
  /** How many runs were already uploaded when that pick was made. Later runs are the temperature path. */
  seriesLength: number;
};

export function planHistory(
  runs: SelectivityRun[],
  setup: SelectivitySetup,
  options?: { heat?: HeatStart | null; continuePastEfficiency?: boolean },
): HistoryPlan {
  const tried: string[] = [];
  if (setup.originalLigand.trim()) tried.push(setup.originalLigand);
  const continuePast = options?.continuePastEfficiency === true;

  let start = 0;
  let forced: { finishedOffset: number; carryIndex: number } | null = null;
  const heat = options?.heat;
  if (
    heat &&
    heat.carryIndex >= 0 &&
    heat.carryIndex < runs.length &&
    heat.seriesLength > heat.carryIndex &&
    heat.seriesLength <= runs.length &&
    (continuePast || !peaksMatchSpec(runs[runs.length - 1], setup))
  ) {
    forced = { finishedOffset: heat.seriesLength - 1, carryIndex: heat.carryIndex };
  }
  while (start < runs.length) {
    const segment = runs.slice(start);
    const rules = retentionRules(setup);
    let finishedOffset = -1;
    let carryIndex: number | null = null;
    if (forced && start === 0) {
      finishedOffset = forced.finishedOffset;
      carryIndex = forced.carryIndex;
      forced = null;
    } else if (forced && start > 0) {
      finishedOffset = 0;
      carryIndex = 0;
      forced = null;
    } else {
      for (let count = 1; count <= segment.length; count++) {
        const decision = decideRetention(segment.slice(0, count).map(toRetentionSample), rules);
        if (decision.status === "finished") {
          finishedOffset = count - 1;
          break;
        }
      }
      if (finishedOffset >= 0) {
        carryIndex = carryForwardIndex(segment.slice(0, finishedOffset + 1).map(toRetentionSample), rules);
      }
    }
    if (finishedOffset < 0) {
      if (continuePast) return heatLatest(runs, setup, tried);
      return { phase: "retention", segmentStart: start };
    }
    if (peaksMatchSpec(runs[runs.length - 1], setup) && !continuePast) {
      return { phase: "retention", segmentStart: start };
    }

    const window = segment.slice(0, finishedOffset + 1);
    const later = segment.slice(finishedOffset + 1);
    const outcome = walkSelectivity({
      carry: carryIndex == null ? null : window[carryIndex],
      later,
      slope: slopeOf(window, rules),
      usedPercentB: percentsOf(window),
      setup,
      triedLigands: tried,
      carryRunNumber: carryIndex == null ? null : start + carryIndex + 1,
      firstLaterRunNumber: start + finishedOffset + 2,
    });
    if (outcome.kind === "plan") {
      return { phase: "selectivity", segmentStart: start, plan: outcome.plan };
    }
    const restart = later[outcome.ligandRunOffset];
    if (restart?.ligand.trim()) tried.push(restart.ligand);
    const nextStart = start + finishedOffset + 1 + outcome.ligandRunOffset;
    const nextSegment = runs.slice(nextStart);
    const first = nextSegment[0];
    const second = nextSegment[1];
    const looksLikeHeat =
      first?.temperatureC != null &&
      second?.temperatureC != null &&
      second.temperatureC > first.temperatureC + 0.5;
    if (
      nextSegment.length > 1 &&
      looksLikeHeat &&
      (continuePast || !peaksMatchSpec(nextSegment[nextSegment.length - 1], setup))
    ) {
      forced = { finishedOffset: 0, carryIndex: 0 };
      start = nextStart;
      continue;
    }
    if (continuePast) return heatLatest(runs, setup, tried);
    return { phase: "retention", segmentStart: nextStart };
  }
  return { phase: "retention", segmentStart: start };
}

function heatLatest(runs: SelectivityRun[], setup: SelectivitySetup, tried: string[]): HistoryPlan {
  const index = runs.length - 1;
  const carry = runs[index];
  if (!carry || carry.percentB == null) return { phase: "retention", segmentStart: Math.max(0, index) };
  const outcome = walkSelectivity({
    carry,
    later: [],
    slope: slopeOf(runs, retentionRules(setup)),
    usedPercentB: percentsOf(runs),
    setup,
    triedLigands: tried,
    carryRunNumber: index + 1,
    firstLaterRunNumber: index + 2,
  });
  if (outcome.kind !== "plan") return { phase: "retention", segmentStart: index };
  return { phase: "selectivity", segmentStart: index, plan: outcome.plan };
}

function peaksMatchSpec(run: SelectivityRun | undefined, setup: SelectivitySetup): boolean {
  return (
    run != null &&
    setup.requiredPeaks != null &&
    run.peakCount != null &&
    run.peakCount === setup.requiredPeaks
  );
}

type WalkResult = { kind: "plan"; plan: SelectivityPlan } | { kind: "restart"; ligandRunOffset: number };

function walkSelectivity(args: {
  carry: SelectivityRun | null;
  later: SelectivityRun[];
  slope: number | null;
  usedPercentB: number[];
  setup: SelectivitySetup;
  triedLigands: string[];
  carryRunNumber: number | null;
  firstLaterRunNumber: number;
}): WalkResult {
  const ambient = ambientOf(args.setup);
  if (!args.carry || args.carry.percentB == null || args.carryRunNumber == null) {
    return {
      kind: "plan",
      plan: blockedPlan(
        "Retention is finished, but no uploaded run is within the last-peak time in the specification, so selectivity has no %B to start from.",
        "Every uploaded run in this %B series has a last peak past the specification. Selectivity starts from a run that is still inside that time.",
      ),
    };
  }

  let offset = 0;
  let baseline = args.carry;
  let baselineNumber = args.carryRunNumber;
  let cycle: 0 | 1 = 0;
  let solventName = baseline.solvent || args.setup.originalSolvent;

  while (cycle < 2) {
    const pending = args.later.slice(offset);
    const baseNumber = args.firstLaterRunNumber + offset;
    const temperature = walkTemperature({
      baseline,
      baselineNumber,
      pending,
      baseNumber,
      slope: args.slope,
      usedPercentB: [...args.usedPercentB, ...percentsOf(args.later.slice(0, offset))],
      setup: args.setup,
      ambient,
      solventName,
      ligandName: baseline.ligand || args.setup.originalLigand,
      triedLigands: args.triedLigands,
      offerChoice: cycle === 0,
    });
    if (temperature.type === "plan") return { kind: "plan", plan: temperature.plan };

    if (cycle === 0) {
      if (pending.length === temperature.consumed) {
        return {
          kind: "plan",
          plan: solventPlan({
            anchor: args.carry,
            anchorNumber: args.carryRunNumber,
            setup: args.setup,
            ambient,
            ligandName: baseline.ligand || args.setup.originalLigand,
            skipped60: !temperature.did60,
            heated: pending.slice(0, temperature.consumed),
          }),
        };
      }
      const solventRun = pending[temperature.consumed];
      offset += temperature.consumed + 1;
      baseline = solventRun;
      baselineNumber = args.firstLaterRunNumber + offset - 1;
      solventName = solventRun.solvent || solventName;
      cycle = 1;
      continue;
    }

    if (pending.length === temperature.consumed) {
      return {
        kind: "plan",
        plan: ligandPlan({
          setup: args.setup,
          ambient,
          triedLigands: args.triedLigands,
        }),
      };
    }
    return { kind: "restart", ligandRunOffset: offset + temperature.consumed };
  }

  return {
    kind: "plan",
    plan: ligandPlan({ setup: args.setup, ambient, triedLigands: args.triedLigands }),
  };
}

function walkTemperature(args: {
  baseline: SelectivityRun;
  baselineNumber: number;
  pending: SelectivityRun[];
  baseNumber: number;
  slope: number | null;
  usedPercentB: number[];
  setup: SelectivitySetup;
  ambient: Ambient;
  solventName: string;
  ligandName: string;
  triedLigands: string[];
  offerChoice: boolean;
}): { type: "plan"; plan: SelectivityPlan } | { type: "advance"; consumed: number; did60: boolean } {
  const startPercent = args.baseline.percentB!;
  const solvent = args.solventName;
  const ligand = args.ligandName;

  if (args.pending.length === 0) {
    return { type: "plan", plan: plan40(args, startPercent, solvent, ligand) };
  }

  const hot = args.pending[0];
  const heated = [hot];
  const better = separationImproved(args.baseline, hot, args.setup.requiredPeaks);
  const percent = hot.percentB ?? startPercent;
  const at60 = args.pending[1] != null && isSixty(args.pending[1]);

  if (better.ok) {
    if (!at60) {
      return { type: "plan", plan: plan60(args, percent, solvent, ligand, better, heated) };
    }
    return { type: "advance", consumed: 2, did60: true };
  }

  if (!at60) {
    if (args.pending.length === 1) {
      const plan = args.offerChoice
        ? planTempChoice(args, percent, solvent, ligand, heated)
        : planLigandHeatChoice(args, percent, solvent, ligand, heated);
      return { type: "plan", plan };
    }
    return { type: "advance", consumed: 1, did60: false };
  }

  return { type: "advance", consumed: 2, did60: true };
}

function isSixty(run: SelectivityRun): boolean {
  return run.temperatureC != null && Math.abs(run.temperatureC - 60) < 0.51;
}

function planTempChoice(
  args: {
    baseline: SelectivityRun;
    baselineNumber: number;
    setup: SelectivitySetup;
    ambient: Ambient;
  },
  percentB: number,
  solvent: string,
  ligand: string,
  heated: SelectivityRun[],
): SelectivityPlan {
  const percent = formatPercentB(percentB);
  const heatLabel = `Increase the temperature anyway, to 60°C at ${percent}% B.`;
  const solventStep = solventPlan({
    anchor: args.baseline,
    anchorNumber: args.baselineNumber,
    setup: args.setup,
    ambient: args.ambient,
    ligandName: ligand,
    skipped60: true,
    heated,
  });
  return {
    status: "recommend",
    step: "temp-choice",
    nextChange: TEMP_CHOICE_RECOMMENDED,
    why: [
      TEMP_CHOICE_RECOMMENDED,
      heatLabel,
      compareSentence(args.baseline, args.baselineNumber, heated, args.setup.requiredPeaks),
      "40°C did not pull the peaks apart. More heat at the same %B is unlikely to help, because the compounds already had a chance to spend less time on the coating and the separation did not improve. The other button changes the solvent. A different solvent changes which compounds prefer the coating, which can separate a pair that heat did not. That solvent change is a selectivity change, not an efficiency change. The matched %B keeps the retention time similar.",
    ].join(" "),
    prefill: null,
    nomograph: solventStep.nomograph,
    showSolventChoices: false,
    showLigandChoices: false,
    recommendedSolventId: null,
    recommendedLigand: null,
    anchorPercentB: solventStep.anchorPercentB,
    oldSolvent: solventStep.oldSolvent,
    tempChoice: {
      recommendedSentence: TEMP_CHOICE_RECOMMENDED,
      heatLabel,
      heatNextChange: `Run the next chromatogram at 60°C, at ${percent}% B.`,
      heatPrefill: { percentB: percent, temperature: "60", solvent, ligand },
      solventNextChange: solventStep.nextChange,
      solventPrefill: solventStep.prefill ?? {
        percentB: "",
        temperature: String(args.ambient.celsius),
        solvent: "",
        ligand,
      },
      other: "solvent",
    },
  };
}

function planLigandHeatChoice(
  args: {
    baseline: SelectivityRun;
    baselineNumber: number;
    setup: SelectivitySetup;
    ambient: Ambient;
    triedLigands: string[];
  },
  percentB: number,
  solvent: string,
  ligand: string,
  heated: SelectivityRun[],
): SelectivityPlan {
  const percent = formatPercentB(percentB);
  const heatLabel = `Go to 60°C anyway, at ${percent}% B.`;
  const ligandStep = ligandPlan({
    setup: args.setup,
    ambient: args.ambient,
    triedLigands: args.triedLigands,
  });
  const fallbackPrefill: SelectivityPrefill = {
    percentB: "100",
    temperature: String(args.ambient.celsius),
    solvent: "",
    ligand: "",
  };
  return {
    status: "recommend",
    step: "temp-choice",
    nextChange: LIGAND_CHOICE_RECOMMENDED,
    why: [
      LIGAND_CHOICE_RECOMMENDED,
      heatLabel,
      compareSentence(args.baseline, args.baselineNumber, heated, args.setup.requiredPeaks),
      "40°C on this solvent did not pull the peaks apart. More heat is unlikely to help, because the warmer column was already tried and the separation did not improve. The other button changes the column coating. The coating is last, because temperature and solvent were already tried. A new coating starts the %B ladder again. A new ligand is a selectivity change: peaks can pull apart or change order.",
    ].join(" "),
    prefill: null,
    nomograph: null,
    showSolventChoices: false,
    showLigandChoices: false,
    recommendedSolventId: null,
    recommendedLigand: null,
    anchorPercentB: null,
    oldSolvent: null,
    tempChoice: {
      recommendedSentence: LIGAND_CHOICE_RECOMMENDED,
      heatLabel,
      heatNextChange: `Run the next chromatogram at 60°C, at ${percent}% B.`,
      heatPrefill: { percentB: percent, temperature: "60", solvent, ligand },
      solventNextChange: ligandStep.nextChange,
      solventPrefill: ligandStep.prefill ?? fallbackPrefill,
      other: "ligand",
    },
  };
}

function plan40(
  args: {
    baseline: SelectivityRun;
    baselineNumber: number;
    setup: SelectivitySetup;
    ambient: Ambient;
  },
  percentB: number,
  solvent: string,
  ligand: string,
): SelectivityPlan {
  const percent = formatPercentB(percentB);
  return {
    status: "recommend",
    step: "temp-40",
    nextChange: `Run the next chromatogram at 40°C, still at ${percent}% B. The goal is to change the conditions so the selectivity changes and the overlapping peaks separate. A higher temperature shortens retention. The %B stays the same. ${TEMPERATURE_SENTENCE}`,
    following: `After 40°C, the next step is 60°C at the same %B. ${SELECTIVITY_ORDER}`,
    why: [
      `Selectivity starts from Run ${args.baselineNumber} at ${percent}% B.`,
      checksSentence(args.baseline, args.baselineNumber, args.setup),
      `The peaks are not separated well enough to stop. The next chromatogram is 40°C, still at ${percent}% B. The goal is to change the conditions so the selectivity changes and the overlapping peaks separate. A higher temperature shortens retention. The %B stays the same.`,
      args.ambient.sentence,
    ].join(" "),
    prefill: {
      percentB: percent,
      temperature: "40",
      solvent,
      ligand,
    },
    nomograph: null,
    showSolventChoices: false,
    showLigandChoices: false,
    recommendedSolventId: null,
    recommendedLigand: null,
    anchorPercentB: percentB,
    oldSolvent: solvent,
    tempChoice: null,
  };
}

function plan60(
  args: {
    baseline: SelectivityRun;
    baselineNumber: number;
    setup: SelectivitySetup;
  },
  percentB: number,
  solvent: string,
  ligand: string,
  better: { peaks: boolean; resolution: boolean; ok: boolean },
  heated: SelectivityRun[],
): SelectivityPlan {
  const percent = formatPercentB(percentB);
  const what = better.peaks && better.resolution
    ? "The peak count and the minimum resolution both went up"
    : better.peaks
      ? "The peak count went up"
      : "The minimum resolution went up";
  return {
    status: "recommend",
    step: "temp-60",
    nextChange: `Run the next chromatogram at 60°C, at ${percent}% B. Stay at this %B because heat already helped. ${TEMPERATURE_SENTENCE} A higher temperature shortens retention. The %B stays the same.`,
    following: `After 60°C, the next step is the second solvent at the chart %B, tried at 40°C and 60°C, then the coating last. ${SELECTIVITY_ORDER}`,
    why: [
      `${what} at 40°C compared with Run ${args.baselineNumber}, the run from before the temperature change.`,
      compareSentence(args.baseline, args.baselineNumber, heated, args.setup.requiredPeaks),
      `Heat helped, so 60°C at the same ${percent}% B is next. A higher temperature shortens retention. The %B stays the same. The point of the heat is a selectivity change so overlapping peaks can separate.`,
      "A higher temperature is likely to increase separation further.",
    ].join(" "),
    prefill: { percentB: percent, temperature: "60", solvent, ligand },
    nomograph: null,
    showSolventChoices: false,
    showLigandChoices: false,
    recommendedSolventId: null,
    recommendedLigand: null,
    anchorPercentB: percentB,
    oldSolvent: solvent,
    tempChoice: null,
  };
}

function solventPlan(args: {
  anchor: SelectivityRun;
  anchorNumber: number;
  setup: SelectivitySetup;
  ambient: Ambient;
  ligandName: string;
  skipped60: boolean;
  heated: SelectivityRun[];
}): SelectivityPlan {
  const anchorPercent = args.anchor.percentB!;
  const typed = args.setup.originalSolvent.trim();
  const recognized = findSolvent(typed);
  const nomograph = recognized ? solventNomograph(anchorPercent, recognized.name) : null;
  const oldName = recognized?.label ?? typed;
  const pick = "Pick a new solvent you can actually use.";
  const oldSentence = typed ? `The old solvent is ${oldName} at ${formatPercentB(anchorPercent)}% B.` : "";
  const readings = nomograph
    ? `The chart reads ${nomograph[0].label} ${nomograph[0].percentText}% B, ${nomograph[1].label} ${nomograph[1].percentText}% B, and ${nomograph[2].label} ${nomograph[2].percentText}% B.`
    : "The chart covers only MeOH, ACN, and THF.";
  const cap = nomograph?.some((entry) => entry.capped)
    ? " A reading past a scale’s 100% end is held at 100. That is the strongest the pump can mix."
    : "";
  return {
    status: "recommend",
    step: "solvent",
    nextChange: `Go back to ${args.ambient.celsius}°C and change the solvent. ${pick} The solvent is in the bottles. ${PERCENT_B_SENTENCE}`,
    following: `After the solvent, try 40°C and then 60°C at the chart %B. ${SELECTIVITY_ORDER}`,
    why: [
      solventLead(args),
      [oldSentence, pick, readings].filter(Boolean).join(" ") + cap,
      "The matched %B is there so the retention time stays similar when the solvent changes. Pick the solvent you can actually use. The chart does not choose it. Changing the solvent is a selectivity change: peaks can pull apart or change order. It is not an efficiency change.",
      args.ambient.sentence,
    ].join(" "),
    prefill: {
      percentB: "",
      temperature: String(args.ambient.celsius),
      solvent: "",
      ligand: args.ligandName,
    },
    nomograph,
    showSolventChoices: true,
    showLigandChoices: false,
    recommendedSolventId: null,
    recommendedLigand: null,
    anchorPercentB: anchorPercent,
    oldSolvent: typed || null,
    tempChoice: null,
  };
}

function ligandPlan(args: {
  setup: SelectivitySetup;
  ambient: Ambient;
  triedLigands: string[];
}): SelectivityPlan {
  const unused = recommendLigand(args.triedLigands);
  const triedText = uniqueLabels(args.triedLigands);
  const original = findSolvent(args.setup.originalSolvent);
  const solventWords = original?.label ?? (args.setup.originalSolvent.trim() || "the original solvent");
  const solventField = original?.label ?? args.setup.originalSolvent.trim();
  if (!unused) {
    return blockedPlan(
      "Every column coating in the list has already been tried.",
      `Temperature and a solvent change still do not meet the selectivity checks. Stop here. Every coating in the list has already been used: ${triedText}. There is no further coating to try, so the method is not changed again from this list. With no coating left, there is no further selectivity change from this list, so retention and efficiency are left as they are.`,
    );
  }
  const pick = "Pick a new column coating from the dropdown.";
  return {
    status: "recommend",
    step: "ligand",
    nextChange: `${pick} Go back to 100% B, ${args.ambient.celsius}°C, and ${solventWords}, then start the %B steps over.`,
    following: `${COATING_SENTENCE} ${SELECTIVITY_ORDER}`,
    why: [
      "The coating is last. Temperature is tried first, then a new solvent, because a new coating means starting over. The temperature steps and the solvent change still do not meet the peak count and the resolution check. A new ligand is a selectivity change: peaks can pull apart or change order. It is the last one.",
      `${pick} Already used: ${triedText}.`,
      `The ladder starts again at 100% B, the starting temperature (${args.ambient.celsius}°C), and the original solvent (${solventWords}). A strong solvent brings the compounds off the new coating quickly, and the %B steps bring the last peak back toward the specified time.`,
      args.ambient.sentence,
    ].join(" "),
    prefill: {
      percentB: "100",
      temperature: String(args.ambient.celsius),
      solvent: solventField,
      ligand: "",
    },
    nomograph: null,
    showSolventChoices: false,
    showLigandChoices: true,
    recommendedSolventId: null,
    recommendedLigand: null,
    anchorPercentB: 100,
    oldSolvent: args.setup.originalSolvent,
    tempChoice: null,
  };
}

function blockedPlan(nextChange: string, why: string): SelectivityPlan {
  return {
    status: "blocked",
    step: "blocked",
    nextChange,
    why,
    prefill: null,
    nomograph: null,
    showSolventChoices: false,
    showLigandChoices: false,
    recommendedSolventId: null,
    recommendedLigand: null,
    anchorPercentB: null,
    oldSolvent: null,
    tempChoice: null,
  };
}

function checksSentence(run: SelectivityRun, runNumber: number, setup: SelectivitySetup): string {
  const check = assessHappy(run, setup);
  return `${peakSentence(run, setup, check)} ${resolutionSentence(run, setup, check)} Run ${runNumber} does not end selectivity on its own, because the peak count and the resolution are not both at the specification. The next change is meant to pull the peaks apart.`;
}

function peakSentence(run: SelectivityRun, setup: SelectivitySetup, check: HappyCheck): string {
  if (setup.requiredPeaks == null) return "The peak-count rule is empty, so enough peaks cannot be judged.";
  if (run.peakCount == null) return "The peak count is missing.";
  if (check.enoughPeaks) {
    return `It has ${formatCount(run.peakCount)} peaks, which meets the specification of ${formatCount(setup.requiredPeaks)}.`;
  }
  return `It has ${formatCount(run.peakCount)} peaks, under the specification of ${formatCount(setup.requiredPeaks)}.`;
}

function resolutionSentence(run: SelectivityRun, setup: SelectivitySetup, check: HappyCheck): string {
  if (
    setup.requiredPeaks != null &&
    run.peakCount != null &&
    run.peakCount < setup.requiredPeaks
  ) {
    return "It has fewer peaks than the specification, so its minimum resolution is 0. Missing peaks are overlaps.";
  }
  if (check.missingResolutionRule || setup.minResolution == null) {
    return "You did not type a minimum resolution, so how close the worst pair is cannot be judged against the specification and the run is not treated as finished.";
  }
  const decision = resolutionForDecision(
    run.peakCount,
    run.minResolutionExcludingFirst,
    setup.requiredPeaks,
  );
  if (decision == null) return "Its minimum resolution is missing.";
  return `Its minimum resolution is ${formatResolution(decision)}.`;
}

function solventLead(args: {
  anchor: SelectivityRun;
  anchorNumber: number;
  setup: SelectivitySetup;
  skipped60: boolean;
  heated: SelectivityRun[];
}): string {
  if (!args.skipped60) {
    return "The runs at 40°C and 60°C still do not meet both checks, so the solvent is changed. More heat is not next, because 60°C was already tried and the separation still does not meet the specification. A new solvent changes which compounds prefer the coating.";
  }
  const hot = args.heated[args.heated.length - 1];
  const short =
    hot != null &&
    args.setup.requiredPeaks != null &&
    hot.peakCount != null &&
    hot.peakCount < args.setup.requiredPeaks;
  const fewerThanBefore =
    hot != null &&
    args.anchor.peakCount != null &&
    hot.peakCount != null &&
    hot.peakCount < args.anchor.peakCount;
  const compared = compareSentence(args.anchor, args.anchorNumber, args.heated, args.setup.requiredPeaks);
  if (short) {
    return `The 40°C run is worse because it has fewer peaks, so its minimum resolution is 0. The next step is a new solvent. ${compared}`;
  }
  if (fewerThanBefore) {
    return `The 40°C run is worse because it has fewer peaks than Run ${args.anchorNumber}. 60°C is skipped. The next step is a new solvent. ${compared}`;
  }
  return `The 40°C runs did not raise the peak count or the minimum resolution compared with Run ${args.anchorNumber}. 60°C is skipped. ${compareSentence(args.anchor, args.anchorNumber, args.heated, args.setup.requiredPeaks)}`;
}

function compareSentence(
  baseline: SelectivityRun,
  baselineNumber: number,
  heated: SelectivityRun[],
  requiredPeaks: number | null,
): string {
  const before = measurementPhrase(baseline, requiredPeaks);
  const after = heated.map((run) => measurementPhrase(run, requiredPeaks)).join("; ");
  return `Run ${baselineNumber} had ${before}. The 40°C runs had ${after}.`;
}

function measurementPhrase(run: SelectivityRun, requiredPeaks: number | null): string {
  const peaks = run.peakCount == null ? "no peak count" : `${formatCount(run.peakCount)} peaks`;
  const resolution = resolutionForDecision(run.peakCount, run.minResolutionExcludingFirst, requiredPeaks);
  const resolutionText =
    resolution == null ? "no minimum resolution" : `minimum resolution ${formatResolution(resolution)}`;
  return `${peaks}, ${resolutionText}`;
}

/**
 * Improved when the peak count went up, or the judged run already has at least
 * as many peaks as typed and its minimum resolution went up. A short peak
 * count makes that resolution 0, so a larger raw number does not count.
 */
function separationImproved(
  baseline: SelectivityRun,
  hot: SelectivityRun,
  requiredPeaks: number | null,
): { ok: boolean; peaks: boolean; resolution: boolean } {
  const peaksUp =
    baseline.peakCount != null && hot.peakCount != null && hot.peakCount > baseline.peakCount;
  const peaksDown =
    baseline.peakCount != null && hot.peakCount != null && hot.peakCount < baseline.peakCount;
  const atSpec = requiredPeaks != null && hot.peakCount != null && hot.peakCount >= requiredPeaks;
  const baseRes = resolutionForDecision(
    baseline.peakCount,
    baseline.minResolutionExcludingFirst,
    requiredPeaks,
  );
  const hotRes = resolutionForDecision(hot.peakCount, hot.minResolutionExcludingFirst, requiredPeaks);
  const resolutionUp = !peaksDown && atSpec && baseRes != null && hotRes != null && hotRes > baseRes;
  return { ok: peaksUp || resolutionUp, peaks: peaksUp, resolution: resolutionUp };
}

type Ambient = { celsius: number; assumed: boolean; sentence: string };

function ambientOf(setup: SelectivitySetup): Ambient {
  if (setup.ambientTemperatureC == null) {
    return {
      celsius: 25,
      assumed: true,
      sentence: "The temperature box on Run 1 is empty, so 25°C is used as the starting temperature.",
    };
  }
  return {
    celsius: setup.ambientTemperatureC,
    assumed: false,
    sentence: `The starting temperature is ${formatTemperature(setup.ambientTemperatureC)}°C, from Run 1.`,
  };
}

function savedCelsius(run: SelectivityRun, fallback: number): number {
  return run.temperatureC == null ? fallback : run.temperatureC;
}

function slopeOf(window: SelectivityRun[], rules: RetentionRules): number | null {
  const samples = window.map(toRetentionSample);
  let slope: number | null = null;
  for (let count = 1; count <= samples.length; count++) {
    const decision = decideRetention(samples.slice(0, count), rules);
    if (decision.fit) slope = decision.fit.m;
  }
  return slope;
}

function retentionRules(setup: SelectivitySetup): RetentionRules {
  return {
    requiredPeaks: setup.requiredPeaks,
    lastPeakTimeMin: setup.lastPeakTimeMin,
    maxBackPressurePsi: setup.maxBackPressurePsi,
    minResolution: setup.minResolution,
  };
}

function toRetentionSample(run: SelectivityRun): RetentionSample {
  return {
    percentB: run.percentB,
    peakCount: run.peakCount,
    lastPeakTimeMin: run.lastPeakTimeMin,
    firstPeakTimeMin: run.firstPeakTimeMin,
    minResolutionExcludingFirst: run.minResolutionExcludingFirst,
    maxBackPressurePsi: run.maxBackPressurePsi,
  };
}

function percentsOf(runs: SelectivityRun[]): number[] {
  return runs.map((run) => run.percentB).filter((percent): percent is number => percent != null);
}

function ligandKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function uniqueLabels(values: string[]): string {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = ligandKey(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    labels.push(trimmed);
  }
  return labels.length > 0 ? labels.join(", ") : "none";
}

function roundTenths(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.floor(Math.abs(value) * 10 + 0.5 + 1e-10)) / 10;
}

function formatMinutes(value: number): string {
  return value.toFixed(3);
}

function formatResolution(value: number): string {
  return value.toFixed(3);
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function formatTemperature(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

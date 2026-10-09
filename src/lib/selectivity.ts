import { resolutionForDecision } from "@/lib/evaluate";
import { COATING_SENTENCE, PERCENT_B_SENTENCE, SELECTIVITY_ORDER } from "@/lib/setting-kind";
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
  /** RP solvent strength parameter S. Null when the table gives no number. */
  strength: number | null;
  /** %B that matches 50% ACN. A range in the table is stored as its midpoint. */
  match50Acn: number;
};

const MEOH_MATCH_50 = (61.5 + 64.4) / 2;
const THF_MATCH_50 = (33 + 37) / 2;
const BUTANOL_MATCH_50 = (20 + 25) / 2;

export const SOLVENTS: readonly Solvent[] = [
  { id: "acetonitrile", label: "ACN", name: "ACN", aliases: ["acn", "acetonitrile", "acetonitrile (acn)"], strength: 3.2, match50Acn: 50 },
  { id: "methanol", label: "MeOH", name: "MeOH", aliases: ["meoh", "methanol", "methanol (meoh)"], strength: 2.6, match50Acn: MEOH_MATCH_50 },
  { id: "tetrahydrofuran", label: "THF", name: "THF", aliases: ["thf", "tetrahydrofuran", "tetrahydrofuran (thf)"], strength: 4.5, match50Acn: THF_MATCH_50 },
  { id: "ethanol", label: "Ethanol", name: "Ethanol", aliases: ["ethanol", "etoh"], strength: 3.6, match50Acn: 44 },
  { id: "isopropanol", label: "IPA", name: "IPA", aliases: ["ipa", "isopropanol", "isopropanol (ipa)", "2-propanol"], strength: 4.2, match50Acn: 35 },
  { id: "acetone", label: "Acetone", name: "Acetone", aliases: ["acetone"], strength: 3.4, match50Acn: 40 },
  { id: "propanol", label: "Propanol", name: "Propanol", aliases: ["propanol", "n-propanol", "1-propanol"], strength: 4.0, match50Acn: 37 },
  { id: "butanol", label: "Butanol", name: "Butanol", aliases: ["butanol", "n-butanol", "1-butanol"], strength: null, match50Acn: BUTANOL_MATCH_50 },
];

/** Scale that lines up every solvent’s 50% ACN match on one vertical line. */
const CHART_SCALE = 100;

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

function isoeluotropicPercent(
  anchorPercent: number,
  from: Solvent,
  to: Solvent,
): { percent: number; capped: boolean } {
  const raw = (anchorPercent * to.match50Acn) / from.match50Acn;
  if (raw > 100) return { percent: 100, capped: true };
  const percent = Math.min(100, Math.max(0, roundTenths(raw)));
  return { percent, capped: false };
}

export function chartX(solventId: string, percent: number): number | null {
  const solvent = solventById(solventId);
  if (!solvent || !(solvent.match50Acn > 0)) return null;
  const clamped = Math.min(100, Math.max(0, percent));
  return (clamped / solvent.match50Acn) * CHART_SCALE;
}

export function solventNomograph(oldPercent: number, oldSolvent: string): NomographEntry[] | null {
  const current = findSolvent(oldSolvent);
  if (!current) return null;
  return SOLVENTS.map((solvent) => {
    const matched = isoeluotropicPercent(oldPercent, current, solvent);
    return {
      id: solvent.id,
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

export function recommendLigand(tried: string[], ligands: readonly string[] = LIGANDS): string | null {
  const used = new Set(tried.map(ligandKey).filter((key) => key.length > 0));
  return ligands.find((name) => !used.has(ligandKey(name))) ?? null;
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
  options?: { heat?: HeatStart | null; continuePastEfficiency?: boolean; ligands?: readonly string[] },
): HistoryPlan {
  const ligands = options?.ligands ?? LIGANDS;
  const tried: string[] = [];
  if (setup.originalLigand.trim()) tried.push(setup.originalLigand);
  const latest = runs[runs.length - 1];
  const autoShort = latest != null && resolutionStillShort(latest, setup);
  const continuePast = options?.continuePastEfficiency === true || autoShort;

  let start = 0;
  let forced: { finishedOffset: number; carryIndex: number } | null = null;
  let explicitHeat = false;
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
    explicitHeat = true;
  }
  if (!forced && autoShort) {
    const anchor = selectivityAnchor(runs, setup);
    if (anchor >= 0) forced = { finishedOffset: anchor, carryIndex: anchor };
  }
  while (start < runs.length) {
    const segment = runs.slice(start);
    const rules = retentionRules(setup);
    let finishedOffset = -1;
    let carryIndex: number | null = null;
    const raise = segment.findIndex((run) => isForty(run) || isSixty(run));
    const ovenSplit = !explicitHeat && raise > 0 && (continuePast || sameSolventHeatPair(segment));
    const fortyAt = segment.findIndex((run) => isForty(run));
    const beforeHeat =
      fortyAt > 0 ? decideRetention(segment.slice(0, fortyAt).map(toRetentionSample), rules) : null;
    const secondMinThenHeat = !explicitHeat && !ovenSplit && beforeHeat?.reason === "second-minimum";
    const ownPercentThenHeat = !explicitHeat && !ovenSplit && beforeHeat?.status === "efficiency";
    if (ovenSplit || secondMinThenHeat || ownPercentThenHeat) {
      const splitAt = ovenSplit ? raise : fortyAt;
      finishedOffset = splitAt - 1;
      carryIndex = splitAt - 1;
      forced = null;
    } else if (forced && start === 0) {
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
      if (continuePast) return heatLatest(runs, setup, tried, ligands);
      return { phase: "retention", segmentStart: start };
    }
    if (!ovenSplit && !ownPercentThenHeat && peaksMatchSpec(runs[runs.length - 1], setup) && !continuePast) {
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
      ligands,
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
    if (continuePast) return heatLatest(runs, setup, tried, ligands);
    return { phase: "retention", segmentStart: nextStart };
  }
  return { phase: "retention", segmentStart: start };
}

function heatLatest(
  runs: SelectivityRun[],
  setup: SelectivitySetup,
  tried: string[],
  ligands: readonly string[],
): HistoryPlan {
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
    ligands,
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

/** Where selectivity starts. Extra %B runs at the same temperature stay in front of the 40°C step. */
function selectivityAnchor(runs: SelectivityRun[], setup: SelectivitySetup): number {
  const first = runs.findIndex((run) => resolutionStillShort(run, setup));
  if (first < 0) return -1;
  const changed = runs.slice(first + 1).some((run, offset) => selectivityConditionsChanged(runs[first + offset], run));
  return changed ? first : runs.length - 1;
}

function selectivityConditionsChanged(previous: SelectivityRun, next: SelectivityRun): boolean {
  if (
    previous.temperatureC != null &&
    next.temperatureC != null &&
    Math.abs(next.temperatureC - previous.temperatureC) > 0.5
  ) {
    return true;
  }
  if ((previous.solvent || "").trim().toLowerCase() !== (next.solvent || "").trim().toLowerCase()) return true;
  if ((previous.ligand || "").trim().toLowerCase() !== (next.ligand || "").trim().toLowerCase()) return true;
  return false;
}

/** Peaks match and the worst pair is still under the specification, with the last peak still inside the set time. */
function resolutionStillShort(run: SelectivityRun, setup: SelectivitySetup): boolean {
  if (!peaksMatchSpec(run, setup)) return false;
  if (setup.minResolution == null || !(setup.minResolution > 0)) return false;
  if (setup.lastPeakTimeMin != null && run.lastPeakTimeMin != null && isLater(run.lastPeakTimeMin, setup.lastPeakTimeMin)) {
    return false;
  }
  const resolution = resolutionForDecision(run.peakCount, run.minResolutionExcludingFirst, setup.requiredPeaks);
  return resolution == null || !Number.isFinite(resolution) || resolution + 1e-9 < setup.minResolution;
}

type WalkResult = { kind: "plan"; plan: SelectivityPlan } | { kind: "restart"; ligandRunOffset: number };

function walkSelectivity(args: {
  carry: SelectivityRun | null;
  later: SelectivityRun[];
  slope: number | null;
  usedPercentB: number[];
  setup: SelectivitySetup;
  triedLigands: string[];
  ligands: readonly string[];
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
            ambient: temperatureBeforeOven(args.carry),
            ligandName: baseline.ligand || args.setup.originalLigand,
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
          ligands: args.ligands,
        }),
      };
    }
    return { kind: "restart", ligandRunOffset: offset + temperature.consumed };
  }

  return {
    kind: "plan",
    plan: ligandPlan({ setup: args.setup, ambient, triedLigands: args.triedLigands, ligands: args.ligands }),
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
      return { type: "plan", plan: plan60Despite(args, percent, solvent, ligand, heated) };
    }
    return { type: "advance", consumed: 1, did60: false };
  }

  return { type: "advance", consumed: 2, did60: true };
}

/** 40°C and a later 60°C on that same solvent, so the next step is not another %B or another 60°C. */
function sameSolventHeatPair(runs: SelectivityRun[]): boolean {
  for (let index = 0; index < runs.length; index++) {
    if (!isForty(runs[index])) continue;
    const solvent = (runs[index].solvent || "").trim().toLowerCase();
    for (let later = index + 1; later < runs.length; later++) {
      const nextSolvent = (runs[later].solvent || "").trim().toLowerCase();
      if (solvent && nextSolvent && nextSolvent !== solvent) break;
      if (isSixty(runs[later])) return true;
    }
  }
  return false;
}

function isForty(run: SelectivityRun): boolean {
  return run.temperatureC != null && Math.abs(run.temperatureC - 40) < 0.51;
}

function isSixty(run: SelectivityRun): boolean {
  return run.temperatureC != null && Math.abs(run.temperatureC - 60) < 0.51;
}

function plan60Despite(
  args: {
    baseline: SelectivityRun;
    baselineNumber: number;
    setup: SelectivitySetup;
    offerChoice: boolean;
  },
  percentB: number,
  solvent: string,
  ligand: string,
  heated: SelectivityRun[],
): SelectivityPlan {
  const percent = formatPercentB(percentB);
  return {
    status: "recommend",
    step: "temp-60",
    nextChange: `Run the next chromatogram at 60°C, still at ${percent}% B. 40°C did not improve the separation. Stay on the same solvent and the same %B. A higher temperature shortens retention. The %B stays the same.`,
    following: args.offerChoice
      ? `After 60°C, the next step is the second solvent at the chart %B, tried at 40°C and 60°C, then the coating last. ${SELECTIVITY_ORDER}`
      : `After 60°C on this solvent, the next step is a new coating. ${SELECTIVITY_ORDER}`,
    why: [
      `40°C did not improve the separation compared with Run ${args.baselineNumber}.`,
      compareSentence(args.baseline, args.baselineNumber, heated, args.setup.requiredPeaks),
      `The next chromatogram is still 60°C, at ${percent}% B, on the same solvent. The %B stays the same.`,
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
    nextChange: `Run the next chromatogram at 40°C, still at ${percent}% B. The %B stays the same.`,
    following: `After 40°C, the next step is 60°C at the same %B. ${SELECTIVITY_ORDER}`,
    why: [
      `The next chromatogram is 40°C, still at ${percent}% B.`,
      onceChecks(args.baseline, args.setup),
      onceReason(args.baseline, args.setup),
      args.ambient.assumed ? args.ambient.sentence : "",
    ]
      .filter((line) => line.trim().length > 0)
      .join("\n\n"),
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
    nextChange: `Run the next chromatogram at 60°C, at ${percent}% B. Stay at this %B because heat already helped. A higher temperature shortens retention. The %B stays the same.`,
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
}): SelectivityPlan {
  const anchorPercent = args.anchor.percentB!;
  const typed = args.anchor.solvent.trim() || args.setup.originalSolvent.trim();
  const recognized = findSolvent(typed);
  const nomograph = recognized ? solventNomograph(anchorPercent, recognized.name) : null;
  const back = formatTemperature(args.ambient.celsius);
  const minimum = formatPercentB(anchorPercent);
  return {
    status: "recommend",
    step: "solvent",
    nextChange: `Change solvent, back at ${back}°C.`,
    following: `After the solvent, try 40°C and then 60°C at the chart %B. ${SELECTIVITY_ORDER}`,
    why: [
      `Change the solvent and go back to ${back}°C. ${args.ambient.sentence}`,
      `Pick ACN, MeOH, THF, Ethanol, IPA, Acetone, Propanol, or Butanol. The %B comes from the chart for the solvent you pick, matched to the retention minimum of ${minimum}% B. The chart does not choose the solvent.`,
    ].join("\n\n"),
    prefill: {
      percentB: "",
      temperature: back,
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
  ligands: readonly string[];
}): SelectivityPlan {
  const unused = recommendLigand(args.triedLigands, args.ligands);
  const triedText = uniqueLabels(args.triedLigands);
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
    nextChange: `${pick} Go back to 100% B, ${args.ambient.celsius}°C, and ACN, then start the %B steps over.`,
    following: `${COATING_SENTENCE} ${SELECTIVITY_ORDER}`,
    why: [
      "The coating is last. Temperature is tried first, then a new solvent, because a new coating means starting over. The temperature steps and the solvent change still do not meet the peak count and the resolution check. A new ligand is a selectivity change: peaks can pull apart or change order. It is the last one. You pick the coating.",
      `${pick} Already used: ${triedText}.`,
      `The ladder starts again at 100% B with ACN, at ${args.ambient.celsius}°C. The previous solvent is not carried forward. A strong solvent brings the compounds off the new coating quickly, and the %B steps bring the last peak back toward the specified time.`,
      args.ambient.sentence,
    ].join(" "),
    prefill: {
      percentB: "100",
      temperature: String(args.ambient.celsius),
      solvent: "ACN",
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

function onceChecks(run: SelectivityRun, setup: SelectivitySetup): string {
  const peaks =
    setup.requiredPeaks == null
      ? "The peak-count rule is empty."
      : run.peakCount == null
        ? "Peaks: not in this file."
        : `Peaks: ${formatCount(run.peakCount)}. The specification is ${formatCount(setup.requiredPeaks)}.`;
  const last =
    setup.lastPeakTimeMin == null
      ? "Last peak: the set time is blank."
      : run.lastPeakTimeMin == null
        ? "Last peak: not in this file."
        : `Last peak: ${formatMinutes(run.lastPeakTimeMin)} min. The set time is ${formatTypedMinutes(setup.lastPeakTimeMin)} min.`;
  const pressure =
    setup.maxBackPressurePsi == null
      ? "Back-pressure: the specification is blank."
      : run.maxBackPressurePsi == null
        ? "Back-pressure: not in this file."
        : `Back-pressure: ${run.maxBackPressurePsi.toFixed(1)} psi. The specification is ${formatTypedNumber(setup.maxBackPressurePsi)} psi.`;
  return [peaks, resolutionOnce(run, setup), last, pressure].join("\n\n");
}

function resolutionOnce(run: SelectivityRun, setup: SelectivitySetup): string {
  if (setup.requiredPeaks != null && run.peakCount != null && run.peakCount < setup.requiredPeaks) {
    return "Minimum resolution: 0. The file has fewer peaks than the specification.";
  }
  if (setup.minResolution == null || !(setup.minResolution > 0)) {
    return "You did not type a minimum resolution, so how close the worst pair is cannot be judged against the specification.";
  }
  const decision = resolutionForDecision(run.peakCount, run.minResolutionExcludingFirst, setup.requiredPeaks);
  if (decision == null || !Number.isFinite(decision)) return "Minimum resolution: not in this file.";
  const place = decision + 1e-9 >= setup.minResolution ? "Above" : "Under";
  return `Minimum resolution: ${formatResolution(decision)}. ${place} the specification of ${formatResolution(setup.minResolution)}.`;
}

function onceReason(run: SelectivityRun, setup: SelectivitySetup): string {
  const resolution = resolutionForDecision(run.peakCount, run.minResolutionExcludingFirst, setup.requiredPeaks);
  const under =
    setup.minResolution != null &&
    setup.minResolution > 0 &&
    (resolution == null || !Number.isFinite(resolution) || resolution + 1e-9 < setup.minResolution);
  if (peaksMatchSpec(run, setup) && under) {
    return "The peaks are there and the worst pair is still under the specification.";
  }
  if (setup.requiredPeaks != null && run.peakCount != null && run.peakCount < setup.requiredPeaks) {
    return "The peak count is still under the specification.";
  }
  return "";
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

function temperatureBeforeOven(run: SelectivityRun): Ambient {
  if (run.temperatureC == null || !Number.isFinite(run.temperatureC)) {
    return {
      celsius: 25,
      assumed: true,
      sentence: "The temperature from before the oven was raised was blank, so 25°C is used.",
    };
  }
  return {
    celsius: run.temperatureC,
    assumed: false,
    sentence: "That is the temperature from before the oven was raised.",
  };
}

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

import { resolutionForDecision } from "@/lib/evaluate";
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

export type SelectivityStep = "temp-40" | "temp-adjust" | "temp-60" | "solvent" | "ligand" | "finished" | "blocked";

export type SelectivityPlan = {
  status: "recommend" | "finished" | "blocked";
  step: SelectivityStep;
  nextChange: string;
  why: string;
  prefill: SelectivityPrefill | null;
  nomograph: NomographEntry[] | null;
  showSolventChoices: boolean;
  showLigandChoices: boolean;
  recommendedSolventId: string | null;
  recommendedLigand: string | null;
  anchorPercentB: number | null;
  oldSolvent: string | null;
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
  multiple: number;
  measured: number;
  spec: number;
  question: string;
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
}): EfficiencyAsk | null {
  if (input.minResolution == null || !(input.minResolution > 0)) return null;
  if (input.requiredPeaks == null || input.peakCount == null || input.peakCount < input.requiredPeaks) return null;
  const measured = resolutionForDecision(input.peakCount, input.foundResolution, input.requiredPeaks);
  if (measured == null || !Number.isFinite(measured)) return null;
  const multiple = highestMultiple(measured, input.minResolution);
  if (multiple == null) return null;
  if (input.declinedThrough != null && multiple <= input.declinedThrough + 1e-9) return null;
  return {
    multiple,
    measured,
    spec: input.minResolution,
    question: efficiencyQuestion(multiple, measured, input.minResolution),
  };
}

export function efficiencyQuestion(multiple: number, measured: number, spec: number): string {
  return `Consider whether efficiency and gradient can still bring the resolution up to the spec. The minimum resolution is ${formatResolution(measured)}, which is at least ${formatMultiple(multiple)} times the ${formatResolution(spec)} you set. Move on to efficiency and be done with selectivity?`;
}

function highestMultiple(measured: number, spec: number): number | null {
  let reached: number | null = null;
  for (const multiple of RESOLUTION_MULTIPLES) {
    if (measured + 1e-9 >= multiple * spec) reached = multiple;
  }
  return reached;
}

function formatMultiple(value: number): string {
  if (value === 1) return "1";
  return value === 0.55 || value === 0.85 ? value.toFixed(2) : value.toFixed(1);
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

export function planHistory(runs: SelectivityRun[], setup: SelectivitySetup): HistoryPlan {
  const tried: string[] = [];
  if (setup.originalLigand.trim()) tried.push(setup.originalLigand);

  let start = 0;
  while (start < runs.length) {
    const segment = runs.slice(start);
    const rules = retentionRules(setup);
    let finishedOffset = -1;
    for (let count = 1; count <= segment.length; count++) {
      const decision = decideRetention(segment.slice(0, count).map(toRetentionSample), rules);
      if (decision.status === "finished") {
        finishedOffset = count - 1;
        break;
      }
    }
    if (finishedOffset < 0) return { phase: "retention", segmentStart: start };

    const window = segment.slice(0, finishedOffset + 1);
    const later = segment.slice(finishedOffset + 1);
    const carryIndex = carryForwardIndex(window.map(toRetentionSample), rules);
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
    start = start + finishedOffset + 1 + outcome.ligandRunOffset;
  }
  return { phase: "retention", segmentStart: start };
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
        "Retention is finished, but no uploaded run is within the last-peak time you set, so selectivity has no %B to start from.",
        "Every uploaded run in this %B series has a last peak past the time you set. Selectivity starts from a run that is still inside that time.",
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
            skipped60: temperature.consumed === 2,
            heated: pending.slice(0, 2),
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
}): { type: "plan"; plan: SelectivityPlan } | { type: "advance"; consumed: number } {
  const startPercent = args.baseline.percentB!;
  const solvent = args.solventName;
  const ligand = args.ligandName;

  if (args.pending.length === 0) {
    return { type: "plan", plan: plan40(args, startPercent, solvent, ligand) };
  }

  const step1 = args.pending[0];
  if (args.pending.length === 1) {
    return { type: "plan", plan: planAdjust(args, step1, args.baseNumber, savedCelsius(step1, 40), solvent, ligand) };
  }

  const step2 = args.pending[1];
  const better = hotRunHelped(args.baseline, step2, args.setup.requiredPeaks);
  if (!better.ok) {
    return { type: "advance", consumed: 2 };
  }
  if (args.pending.length === 2) {
    const percent = step2.percentB ?? startPercent;
    return {
      type: "plan",
      plan: plan60(args, percent, solvent, ligand, better, [step1, step2]),
    };
  }

  const step3 = args.pending[2];
  if (args.pending.length === 3) {
    return { type: "plan", plan: planAdjust(args, step3, args.baseNumber + 2, savedCelsius(step3, 60), solvent, ligand) };
  }

  return { type: "advance", consumed: 4 };
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
    nextChange: `Run the next chromatogram at 40°C, still at ${percent}% B.`,
    why: [
      `Selectivity starts from Run ${args.baselineNumber} at ${percent}% B.`,
      checksSentence(args.baseline, args.baselineNumber, args.setup),
      `The next run stays at ${percent}% B and the column temperature goes to 40°C.`,
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
  };
}

function planAdjust(
  args: {
    slope: number | null;
    usedPercentB: number[];
    setup: SelectivitySetup;
    pending: SelectivityRun[];
  },
  run: SelectivityRun,
  runNumber: number,
  celsius: number,
  solvent: string,
  ligand: string,
): SelectivityPlan {
  const current = run.percentB;
  if (current == null || args.setup.lastPeakTimeMin == null) {
    return blockedPlan(
      "Type the %B and the last-peak time before the next %B can be worked out.",
      "The heated run needs a saved %B, and the last-peak time rule needs a number, before the next %B is chosen.",
    );
  }
  const used = [...args.usedPercentB, ...percentsOf(args.pending)];
  const adjusted = adjustedPercentB({
    slope: args.slope,
    percentB: current,
    t0: run.firstPeakTimeMin,
    lastPeakMin: run.lastPeakTimeMin,
    specMin: args.setup.lastPeakTimeMin,
    usedPercentB: used,
  });
  const from = formatPercentB(current);
  const to = formatPercentB(adjusted.percentB);
  const spec = formatMinutes(args.setup.lastPeakTimeMin);
  const clamp =
    adjusted.clamped === "high"
      ? " The result was above 100, so it is held at 100."
      : adjusted.clamped === "low"
        ? " The result was below 0, so it is held at 0."
        : "";
  const method =
    adjusted.method === "line"
      ? `The earlier %B runs drew a line for how retention changes with %B. That line is shifted so it passes through this ${celsius}°C run at ${from}% B. The %B on the shifted line that should put the last peak at ${spec} min is ${to}% B.${clamp}`
      : args.slope == null
        ? `There is no earlier line of %B against retention, so %B is lowered by 5 points, from ${from}% B to ${to}% B.${clamp}`
        : `This run cannot be placed on the earlier %B line, so %B is lowered by 5 points, from ${from}% B to ${to}% B.${clamp}`;
  return {
    status: "recommend",
    step: "temp-adjust",
    nextChange: `Stay at ${celsius}°C and run the next chromatogram at ${to}% B, so the last peak comes back to ${spec} min.`,
    why: [`Run ${runNumber} is the ${celsius}°C chromatogram.`, method].join(" "),
    prefill: { percentB: to, temperature: String(celsius), solvent, ligand },
    nomograph: null,
    showSolventChoices: false,
    showLigandChoices: false,
    recommendedSolventId: null,
    recommendedLigand: null,
    anchorPercentB: current,
    oldSolvent: solvent,
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
    nextChange: `Run the next chromatogram at 60°C, at ${percent}% B.`,
    why: [
      `${what} at 40°C compared with Run ${args.baselineNumber}, the run from before the temperature change.`,
      compareSentence(args.baseline, args.baselineNumber, heated, args.setup.requiredPeaks),
      `The next run stays at ${percent}% B and the column temperature goes to 60°C.`,
    ].join(" "),
    prefill: { percentB: percent, temperature: "60", solvent, ligand },
    nomograph: null,
    showSolventChoices: false,
    showLigandChoices: false,
    recommendedSolventId: null,
    recommendedLigand: null,
    anchorPercentB: percentB,
    oldSolvent: solvent,
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
    nextChange: `Go back to ${args.ambient.celsius}°C and change the solvent. ${pick}`,
    why: [solventLead(args), [oldSentence, pick, readings].filter(Boolean).join(" ") + cap, args.ambient.sentence].join(" "),
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
      `Temperature and a solvent change still do not meet the selectivity checks. Every coating in the list has already been used: ${triedText}.`,
    );
  }
  const pick = "Pick a new column coating from the dropdown.";
  return {
    status: "recommend",
    step: "ligand",
    nextChange: `${pick} Go back to 100% B, ${args.ambient.celsius}°C, and ${solventWords}, then start the %B steps over.`,
    why: [
      "The temperature steps and the solvent change still do not meet the peak count and the resolution check.",
      `${pick} Already used: ${triedText}.`,
      `Go back to 100% B, the starting temperature (${args.ambient.celsius}°C), and the original solvent (${solventWords}), then start the %B steps over.`,
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
  };
}

function checksSentence(run: SelectivityRun, runNumber: number, setup: SelectivitySetup): string {
  const check = assessHappy(run, setup);
  return `${peakSentence(run, setup, check)} ${resolutionSentence(run, setup, check)} Run ${runNumber} does not end selectivity on its own.`;
}

function peakSentence(run: SelectivityRun, setup: SelectivitySetup, check: HappyCheck): string {
  if (setup.requiredPeaks == null) return "The peak-count rule is empty, so enough peaks cannot be judged.";
  if (run.peakCount == null) return "The peak count is missing.";
  if (check.enoughPeaks) {
    return `It has ${formatCount(run.peakCount)} peaks, which meets the ${formatCount(setup.requiredPeaks)} you asked for.`;
  }
  return `It has ${formatCount(run.peakCount)} peaks, under the ${formatCount(setup.requiredPeaks)} you asked for.`;
}

function resolutionSentence(run: SelectivityRun, setup: SelectivitySetup, check: HappyCheck): string {
  if (
    setup.requiredPeaks != null &&
    run.peakCount != null &&
    run.peakCount < setup.requiredPeaks
  ) {
    return "It has fewer peaks than you asked for, so its minimum resolution is 0. Missing peaks are overlaps.";
  }
  if (check.missingResolutionRule || setup.minResolution == null) {
    return "You did not type a minimum resolution, so resolution cannot be judged and the run is not treated as finished.";
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
    return "The runs at 40°C and 60°C still do not meet both checks, so the solvent is changed.";
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

/** 60°C only if the lower-%B 40°C run actually helped versus the run from before the heat. */
function hotRunHelped(
  baseline: SelectivityRun,
  hot: SelectivityRun,
  requiredPeaks: number | null,
): { ok: boolean; peaks: boolean; resolution: boolean } {
  const dropped =
    baseline.peakCount != null && hot.peakCount != null && hot.peakCount < baseline.peakCount;
  const short = requiredPeaks != null && hot.peakCount != null && hot.peakCount < requiredPeaks;
  const peaksUp =
    baseline.peakCount != null && hot.peakCount != null && hot.peakCount > baseline.peakCount;
  const baseRes = resolutionForDecision(
    baseline.peakCount,
    baseline.minResolutionExcludingFirst,
    requiredPeaks,
  );
  const hotRes = resolutionForDecision(hot.peakCount, hot.minResolutionExcludingFirst, requiredPeaks);
  const resolutionUp = baseRes != null && hotRes != null && hotRes > baseRes;
  const ok = !dropped && !short && (peaksUp || resolutionUp);
  return { ok, peaks: ok && peaksUp, resolution: ok && resolutionUp };
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

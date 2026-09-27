import { resolutionForDecision } from "@/lib/evaluate";
import { carryForwardIndex, decideRetention, formatPercentB, roundTargetPercent, type RetentionRules, type RetentionSample } from "@/lib/retention";

/**
 * Selectivity starts after retention has picked a run to carry forward.
 * Temperature is tried first, then a solvent matched by solvent strength,
 * then a new column coating that sends retention back to the beginning.
 */

export type Solvent = {
  id: string;
  label: string;
  /** Name used in sentences. */
  name: string;
  strength: number;
  aliases: string[];
};

export const SOLVENTS: readonly Solvent[] = [
  { id: "acetonitrile", label: "Acetonitrile (ACN)", name: "acetonitrile", strength: 5.8, aliases: ["acn", "acetonitrile", "acetonitrile (acn)"] },
  { id: "methanol", label: "Methanol (MeOH)", name: "methanol", strength: 5.1, aliases: ["meoh", "methanol", "methanol (meoh)"] },
  { id: "tetrahydrofuran", label: "Tetrahydrofuran (THF)", name: "tetrahydrofuran", strength: 8.0, aliases: ["thf", "tetrahydrofuran", "tetrahydrofuran (thf)"] },
  { id: "ethanol", label: "Ethanol", name: "ethanol", strength: 4.3, aliases: ["ethanol", "etoh"] },
  { id: "isopropanol", label: "Isopropanol (2-Propanol)", name: "isopropanol", strength: 3.9, aliases: ["isopropanol", "2-propanol", "ipa", "isopropanol (2-propanol)"] },
  { id: "n-propanol", label: "n-Propanol (1-Propanol)", name: "n-propanol", strength: 4.0, aliases: ["n-propanol", "1-propanol", "propanol", "n-propanol (1-propanol)"] },
  { id: "acetone", label: "Acetone", name: "acetone", strength: 5.1, aliases: ["acetone"] },
  { id: "n-butanol", label: "n-Butanol (1-Butanol)", name: "n-butanol", strength: 3.9, aliases: ["n-butanol", "1-butanol", "butanol", "n-butanol (1-butanol)"] },
];

const NOMOGRAPH_IDS = ["methanol", "acetonitrile", "tetrahydrofuran"] as const;
const RECOMMEND_IDS = ["methanol", "acetonitrile", "tetrahydrofuran"] as const;

export const LIGANDS = ["C18", "C8", "C4", "Phenyl", "Phenyl-hexyl", "Biphenyl", "PFP", "Cyano"] as const;

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
  happy: boolean;
  enoughPeaks: boolean;
  missingResolutionRule: boolean;
  cutoff: number | null;
};

export function findSolvent(value: string): Solvent | null {
  const key = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;
  return SOLVENTS.find((solvent) => solvent.id === key || solvent.aliases.includes(key) || solvent.label.toLowerCase() === key) ?? null;
}

export function solventById(id: string): Solvent | null {
  return SOLVENTS.find((solvent) => solvent.id === id) ?? null;
}

export function matchSolventPercent(
  oldPercent: number,
  oldStrength: number,
  newStrength: number,
): { percent: number; capped: boolean; raw: number } {
  const raw = oldPercent * (oldStrength / newStrength);
  if (!Number.isFinite(raw)) return { percent: oldPercent, capped: false, raw };
  if (raw > 100) return { percent: 100, capped: true, raw };
  const percent = Math.min(100, Math.max(0, roundTenths(raw)));
  return { percent, capped: false, raw };
}

export function formatMatchedPercent(percent: number, capped: boolean): string {
  if (capped) return "100";
  return percent.toFixed(1);
}

export function solventNomograph(oldPercent: number, oldSolvent: string): NomographEntry[] | null {
  const current = findSolvent(oldSolvent);
  if (!current) return null;
  return NOMOGRAPH_IDS.map((id) => {
    const solvent = solventById(id)!;
    const matched = matchSolventPercent(oldPercent, current.strength, solvent.strength);
    return {
      id,
      label: solvent.label,
      percentText: formatMatchedPercent(matched.percent, matched.capped),
      capped: matched.capped,
    };
  });
}

export function recommendSolventId(currentSolvent: string): string {
  const current = findSolvent(currentSolvent);
  for (const id of RECOMMEND_IDS) {
    if (current?.id !== id) return id;
  }
  return "methanol";
}

export function solventChoicePercent(
  anchorPercentB: number,
  oldSolvent: string,
  newSolventId: string,
): { percentText: string; capped: boolean } | null {
  const old = findSolvent(oldSolvent);
  const next = solventById(newSolventId);
  if (!old || !next) return null;
  const matched = matchSolventPercent(anchorPercentB, old.strength, next.strength);
  return { percentText: formatMatchedPercent(matched.percent, matched.capped), capped: matched.capped };
}

export function recommendLigand(tried: string[]): string | null {
  const used = new Set(tried.map(ligandKey).filter((key) => key.length > 0));
  return LIGANDS.find((name) => !used.has(ligandKey(name))) ?? null;
}

export function assessHappy(
  run: { peakCount: number | null; minResolutionExcludingFirst: number | null },
  rules: { requiredPeaks: number | null; minResolution: number | null },
): HappyCheck {
  const enoughPeaks =
    rules.requiredPeaks != null && run.peakCount != null && run.peakCount >= rules.requiredPeaks;
  if (rules.minResolution == null) {
    return { happy: false, enoughPeaks, missingResolutionRule: true, cutoff: null };
  }
  const cutoff = 0.7 * rules.minResolution;
  const resolution = run.minResolutionExcludingFirst;
  const resolved = resolution != null && Number.isFinite(resolution) && resolution > cutoff;
  return { happy: enoughPeaks && resolved, enoughPeaks, missingResolutionRule: false, cutoff };
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

  if (assessHappy(args.carry, args.setup).happy) {
    return { kind: "plan", plan: finishedPlan(args.carry, args.carryRunNumber, args.setup) };
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
            currentSolvent: solventName || args.setup.originalSolvent,
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
      if (assessHappy(baseline, args.setup).happy) {
        return { kind: "plan", plan: finishedPlan(baseline, baselineNumber, args.setup) };
      }
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
  if (assessHappy(step1, args.setup).happy) {
    return { type: "plan", plan: finishedPlan(step1, args.baseNumber, args.setup) };
  }
  if (args.pending.length === 1) {
    return { type: "plan", plan: planAdjust(args, step1, args.baseNumber, savedCelsius(step1, 40), solvent, ligand) };
  }

  const step2 = args.pending[1];
  if (assessHappy(step2, args.setup).happy) {
    return { type: "plan", plan: finishedPlan(step2, args.baseNumber + 1, args.setup) };
  }
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
  if (assessHappy(step3, args.setup).happy) {
    return { type: "plan", plan: finishedPlan(step3, args.baseNumber + 2, args.setup) };
  }
  if (args.pending.length === 3) {
    return { type: "plan", plan: planAdjust(args, step3, args.baseNumber + 2, savedCelsius(step3, 60), solvent, ligand) };
  }

  const step4 = args.pending[3];
  if (assessHappy(step4, args.setup).happy) {
    return { type: "plan", plan: finishedPlan(step4, args.baseNumber + 3, args.setup) };
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
  currentSolvent: string;
  setup: SelectivitySetup;
  ambient: Ambient;
  ligandName: string;
  skipped60: boolean;
  heated: SelectivityRun[];
}): SelectivityPlan {
  const anchorPercent = args.anchor.percentB!;
  const current = findSolvent(args.currentSolvent);
  const recommendedId = recommendSolventId(args.currentSolvent);
  const recommended = solventById(recommendedId)!;
  const nomograph = current ? solventNomograph(anchorPercent, current.name) : null;
  const matched = current ? matchSolventPercent(anchorPercent, current.strength, recommended.strength) : null;
  const percentText = matched ? formatMatchedPercent(matched.percent, matched.capped) : "";
  const oldName = current?.name ?? (args.currentSolvent.trim() || "the solvent on Run 1");
  const three = nomograph
    ? nomograph.map((entry) => `${entry.label} ${entry.percentText}% B`).join(", ")
    : "";
  const formula = current
    ? `The old solvent is ${oldName} at ${formatPercentB(anchorPercent)}% B. The new solvent is ${recommended.name}. New %B = old %B × (strength of the old solvent / strength of the new solvent). ${oldName} strength ${formatStrength(current.strength)}, ${recommended.name} strength ${formatStrength(recommended.strength)}. Matched %B: ${three}.`
    : `The solvent “${args.currentSolvent.trim() || "blank"}” is not one of the eight solvents, so a matched %B cannot be calculated. Pick one of the eight in the list.`;
  const cap = matched?.capped
    ? ` The matched %B for ${recommended.name} is above 100, so it is held at 100. That is the strongest the pump can mix.`
    : "";
  const prefill = matched
    ? {
        percentB: percentText,
        temperature: String(args.ambient.celsius),
        solvent: recommended.label,
        ligand: args.ligandName,
      }
    : {
        percentB: "",
        temperature: String(args.ambient.celsius),
        solvent: recommended.label,
        ligand: args.ligandName,
      };
  return {
    status: "recommend",
    step: "solvent",
    nextChange: matched
      ? `Go back to ${args.ambient.celsius}°C and change the solvent to ${recommended.name} at ${percentText}% B.`
      : `Go back to ${args.ambient.celsius}°C and change the solvent. Pick the new solvent from the list.`,
    why: [
      solventLead(args),
      formula + cap,
      args.ambient.sentence,
    ].join(" "),
    prefill,
    nomograph,
    showSolventChoices: true,
    showLigandChoices: false,
    recommendedSolventId: recommended.id,
    recommendedLigand: null,
    anchorPercentB: anchorPercent,
    oldSolvent: args.currentSolvent,
  };
}

function ligandPlan(args: {
  setup: SelectivitySetup;
  ambient: Ambient;
  triedLigands: string[];
}): SelectivityPlan {
  const next = recommendLigand(args.triedLigands);
  const triedText = uniqueLabels(args.triedLigands);
  const original = findSolvent(args.setup.originalSolvent);
  const solventWords = original?.name ?? (args.setup.originalSolvent.trim() || "the original solvent");
  const solventField = args.setup.originalSolvent.trim();
  if (!next) {
    return blockedPlan(
      "Every column coating in the list has already been tried.",
      `Temperature and a solvent change still do not meet the selectivity checks, and every coating has been used (${triedText}). There is no unused coating to recommend.`,
    );
  }
  return {
    status: "recommend",
    step: "ligand",
    nextChange: `Change the column coating to ${next}. Go back to 100% B, ${args.ambient.celsius}°C, and ${solventWords}, then start the %B steps over.`,
    why: [
      "The temperature steps and the solvent change still do not meet the peak count and the resolution check.",
      `Use a coating that has not been tried yet. Already tried: ${triedText}.`,
      `The next run is 100% B, the starting temperature (${args.ambient.celsius}°C), and the original solvent (${solventWords}). The %B steps then start over from that run.`,
      args.ambient.sentence,
    ].join(" "),
    prefill: {
      percentB: "100",
      temperature: String(args.ambient.celsius),
      solvent: solventField,
      ligand: next,
    },
    nomograph: null,
    showSolventChoices: false,
    showLigandChoices: true,
    recommendedSolventId: null,
    recommendedLigand: next,
    anchorPercentB: 100,
    oldSolvent: args.setup.originalSolvent,
  };
}

function finishedPlan(run: SelectivityRun, runNumber: number, setup: SelectivitySetup): SelectivityPlan {
  const percent = run.percentB == null ? "the saved" : `${formatPercentB(run.percentB)}%`;
  return {
    status: "finished",
    step: "finished",
    nextChange: `Selectivity is finished. Carry forward Run ${runNumber} at ${percent} B.`,
    why: checksSentence(run, runNumber, setup),
    prefill: null,
    nomograph: null,
    showSolventChoices: false,
    showLigandChoices: false,
    recommendedSolventId: null,
    recommendedLigand: null,
    anchorPercentB: run.percentB,
    oldSolvent: run.solvent,
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
  const peakPart = peakSentence(run, setup, check);
  const resolutionPart = resolutionSentence(run, setup, check);
  const ending = check.happy
    ? `Run ${runNumber} meets both checks, so selectivity is finished.`
    : `Run ${runNumber} does not meet both checks, so selectivity is not finished.`;
  return `${peakPart} ${resolutionPart} ${ending}`;
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
  if (check.missingResolutionRule || setup.minResolution == null || check.cutoff == null) {
    return "You did not type a minimum resolution, so resolution cannot be judged and the run is not treated as finished.";
  }
  const cutoff = formatResolution(check.cutoff);
  const asked = formatResolution(setup.minResolution);
  const decision = resolutionForDecision(
    run.peakCount,
    run.minResolutionExcludingFirst,
    setup.requiredPeaks,
  );
  if (decision == null) {
    return `Its minimum resolution is missing. It needs to be above ${cutoff} (70% of the ${asked} you set).`;
  }
  const measured = formatResolution(decision);
  if (decision > check.cutoff) {
    return `Its minimum resolution is ${measured}, above ${cutoff} (70% of the ${asked} you set).`;
  }
  return `Its minimum resolution is ${measured}. It needs to be above ${cutoff} (70% of the ${asked} you set).`;
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

function formatStrength(value: number): string {
  return value.toFixed(1);
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

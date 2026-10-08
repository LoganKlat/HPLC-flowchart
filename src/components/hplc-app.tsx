"use client";

import { useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Gauge, GitBranch, Info, type LucideIcon } from "lucide-react";
import { FileDrop } from "@/components/file-drop";
import { AboutPanel } from "@/components/about-panel";
import { EfficiencyChoiceView, LeaveSelectivityAsk, LeaveSelectivityDone } from "@/components/leave-selectivity";
import { LookAtRuns } from "@/components/look-at-runs";
import { LaterChangeNote, RetentionDecisionView, StartHighBNote } from "@/components/retention-decision";
import { ResultsPanel } from "@/components/results-panel";
import { RunForm } from "@/components/run-form";
import { SelectivityDecisionView } from "@/components/selectivity-decision";
import { type ColumnRunTrace } from "@/components/column-diagram";
import { EquipmentPanel } from "@/components/equipment-panel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { evaluateRun, parseUserCount, parseUserNumber, type RuleNumbers } from "@/lib/evaluate";
import { parseRunFileName } from "@/lib/filename-details";
import { readLabFile, type LabFileRead } from "@/lib/lab-file";
import {
  decideRetention,
  formatPercentB,
  inBetweenPercentError,
  type RetentionChoice,
  type RetentionDecision,
  type RetentionSample,
} from "@/lib/retention";
import { emptyRuleInputs, emptyRunDetails, type RuleInputs, type RunDetails } from "@/lib/run-details";
import {
  LIGANDS,
  SOLVENTS,
  findSolvent,
  planHistory,
  type HeatStart,
  solventById,
  solventChoicePercent,
  type SelectivityPlan,
  type SelectivityPrefill,
  type SelectivityRun,
  type TempPath,
} from "@/lib/selectivity";

type RestKey = Exclude<keyof RunDetails, "percentB" | "temperature" | "solvent" | "ligand">;
type RestDetails = Pick<RunDetails, RestKey>;

const REST_KEYS: readonly RestKey[] = [
  "coreShell",
  "poreSize",
  "carbonLoad",
  "lengthMm",
  "diameterMm",
  "particleSize",
  "ph",
  "method",
  "flowRate",
  "injectionVolume",
  "sampleType",
  "sampleConcentration",
  "wavelength",
];

type RunState = {
  percentB: string;
  percentEdited: boolean;
  temperature: string;
  temperatureEdited: boolean;
  solvent: string;
  solventEdited: boolean;
  ligand: string;
  ligandEdited: boolean;
  /** Fields this run changed itself. Unedited fields stay with the earlier run. */
  rest: Partial<RestDetails>;
  afterRetention: boolean;
  status: "empty" | "reading" | "ready" | "error";
  fileName: string | null;
  read: LabFileRead | null;
  message: string | null;
};

function emptyRun(): RunState {
  return {
    percentB: "",
    percentEdited: false,
    temperature: "",
    temperatureEdited: false,
    solvent: "",
    solventEdited: false,
    ligand: "",
    ligandEdited: false,
    rest: {},
    afterRetention: false,
    status: "empty",
    fileName: null,
    read: null,
    message: null,
  };
}

const sections: readonly { id: "decision-engine" | "equipment" | "about"; label: string; icon: LucideIcon }[] = [
  { id: "decision-engine", label: "Decision engine", icon: GitBranch },
  { id: "equipment", label: "Equipment", icon: Gauge },
  { id: "about", label: "About", icon: Info },
];

function pickRest(details: RunDetails): RestDetails {
  return {
    coreShell: details.coreShell,
    poreSize: details.poreSize,
    carbonLoad: details.carbonLoad,
    lengthMm: details.lengthMm,
    diameterMm: details.diameterMm,
    particleSize: details.particleSize,
    ph: details.ph,
    method: details.method,
    flowRate: details.flowRate,
    injectionVolume: details.injectionVolume,
    sampleType: details.sampleType,
    sampleConcentration: details.sampleConcentration,
    wavelength: details.wavelength,
  };
}

function applyRest(rest: RestDetails, over: Partial<RestDetails> | undefined) {
  if (!over) return;
  for (const key of REST_KEYS) {
    const value = over[key];
    if (value !== undefined) Object.assign(rest, { [key]: value });
  }
}

function inheritedRest(index: number, runs: RunState[], base: RunDetails): RestDetails {
  const rest = pickRest(base);
  for (let i = 1; i < index; i++) applyRest(rest, runs[i]?.rest);
  return rest;
}

function detailsForRun(index: number, runs: RunState[], base: RunDetails): RunDetails {
  if (index <= 0) return base;
  const run = runs[index];
  if (!run) return base;
  const rest = inheritedRest(index, runs, base);
  applyRest(rest, run.rest);
  return {
    ...base,
    ...rest,
    percentB: run.percentB,
    temperature: run.temperature,
    solvent: run.solvent,
    ligand: run.ligand,
  };
}

function percentWords(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "%B";
  const value = parseUserNumber(trimmed);
  return value == null ? `${trimmed}% B` : `${formatPercentB(value)}% B`;
}

function degreeWords(text: string): string {
  const trimmed = text.trim().replace(/°\s*C$/i, "");
  return trimmed ? `${trimmed}°C` : "°C";
}

/** Short name for the decision that opened this run. Run 1 is only its %B. */
function runTabLabel(
  index: number,
  runs: RunState[],
  details: RunDetails,
  checks: RuleNumbers,
  options: {
    choice: RetentionChoice;
    heat: HeatStart | null;
    continued: Record<number, boolean>;
  },
): string {
  if (index <= 0) {
    return `Run 1: ${percentWords(details.percentB || runs[0]?.percentB || "")}`;
  }
  const flags = selectivityFlags(index - 1, options.heat, options.continued);
  const explanation = explainRun(runs, index - 1, details, checks, {
    choice: options.choice,
    heat: options.heat,
    continuePastEfficiency: flags.continuePast,
    continueToLook: flags.continueToLook,
  });
  const named = explanation ? decisionTabLabel(explanation, runs[index]) : null;
  return `Run ${index + 1}: ${named ?? openedRunFallback(index, runs, details)}`;
}

function decisionTabLabel(explanation: Explanation, run: RunState | undefined): string | null {
  if (explanation.kind === "retention") {
    const decision = explanation.decision;
    if (decision.nextTemperature) return degreeWords(decision.nextTemperature);
    if (decision.nextPercentB != null) return percentWords(run?.percentB || String(decision.nextPercentB));
    if (decision.status === "investigate" || decision.reason === "investigate") return "investigate";
    if (decision.status === "efficiency" || decision.reason === "efficiency") return "efficiency";
    return null;
  }
  const plan = explanation.plan;
  if (plan.step === "temp-40" || plan.step === "temp-adjust") return "40°C";
  if (plan.step === "temp-60") return "60°C";
  if (plan.step === "ligand") return "new coating";
  if (plan.step === "solvent") return run?.solvent.trim() || "solvent";
  if (plan.step === "temp-choice") {
    if (run?.temperature.trim() === "60") return "60°C";
    if (run?.ligand.trim()) return "new coating";
    if (run?.solvent.trim()) return run.solvent.trim();
    return plan.tempChoice?.other === "ligand" ? "new coating" : "60°C";
  }
  return null;
}

function openedRunFallback(index: number, runs: RunState[], details: RunDetails): string {
  const run = runs[index];
  if (!run) return "%B";
  const prev = runs[index - 1];
  const prevTemp = (index === 1 ? details.temperature : prev?.temperature || details.temperature).trim();
  const prevSolvent = (index === 1 ? details.solvent : prev?.solvent || details.solvent).trim();
  const prevLigand = (index === 1 ? details.ligand : prev?.ligand || details.ligand).trim();
  if (run.temperature.trim() && run.temperature.trim() !== prevTemp) return degreeWords(run.temperature);
  if (run.solvent.trim() && run.solvent.trim() !== prevSolvent) return run.solvent.trim();
  if (run.ligand.trim() && run.ligand.trim() !== prevLigand) return "new coating";
  if (run.percentB.trim()) return percentWords(run.percentB);
  return "%B";
}

function runTabStyle(selected: boolean, hovered: boolean): CSSProperties {
  if (selected && hovered) {
    return { backgroundColor: "#a9d4c4", borderColor: "#0a5644", color: "#144237", fontWeight: 600 };
  }
  if (selected) {
    return { backgroundColor: "#cfe8df", borderColor: "#0f6b56", color: "#144237", fontWeight: 600 };
  }
  if (hovered) {
    return { backgroundColor: "#efe6c4", borderColor: "#b0893e", color: "#3d3416", fontWeight: 600 };
  }
  return {
    backgroundColor: "var(--background)",
    borderColor: "var(--border)",
    color: "var(--foreground)",
    fontWeight: 500,
  };
}

export function HplcApp() {
  const [active, setActive] = useState(0);
  const [section, setSection] = useState<(typeof sections)[number]["id"]>("decision-engine");
  const [navOpen, setNavOpen] = useState(false);
  const [details, setDetails] = useState<RunDetails>(emptyRunDetails);
  const [rules, setRules] = useState<RuleInputs>(emptyRuleInputs);
  const [runs, setRuns] = useState<RunState[]>([emptyRun()]);
  const [declinedEfficiencyNow, setDeclinedEfficiencyNow] = useState(false);
  const [efficiencyChosen, setEfficiencyChosen] = useState(false);
  const [continuedSelectivity, setContinuedSelectivity] = useState<Record<number, boolean>>({});
  const [inBetween, setInBetween] = useState<{ percent: number; sourceIndex: number } | null>(null);
  const [heatChoice, setHeatChoice] = useState<HeatStart | null>(null);
  const [betweenAnswer, setBetweenAnswer] = useState<"yes" | "no" | null>(null);
  const [betweenText, setBetweenText] = useState("");
  const [betweenError, setBetweenError] = useState<string | null>(null);
  const [leftSelectivity, setLeftSelectivity] = useState(false);
  const [tempPathByRun, setTempPathByRun] = useState<Record<number, TempPath>>({});
  const [hoveredRun, setHoveredRun] = useState<number | null>(null);
  const [linePercent, setLinePercent] = useState<number | null>(null);
  const [pickedPercent, setPickedPercent] = useState<number | null>(null);
  const reportLinePercent = useCallback((percent: number | null) => {
    setLinePercent((current) => (current === percent ? current : percent));
  }, []);
  const [fillFromFileName, setFillFromFileName] = useState(false);
  const [fileNameNote, setFileNameNote] = useState<string | null>(null);
  const detailsRef = useRef(details);
  const fillFromFileNameRef = useRef(fillFromFileName);
  detailsRef.current = details;
  fillFromFileNameRef.current = fillFromFileName;

  const checks = useMemo(() => toRuleNumbers(rules), [rules]);
  const choice = useMemo<RetentionChoice>(
    () => ({
      declinedEfficiencyNow,
      afterInBetween: inBetweenMatches(runs, inBetween),
    }),
    [declinedEfficiencyNow, runs, inBetween],
  );
  const readyCount = readyPrefix(runs);
  const latestFlags = selectivityFlags(readyCount - 1, heatChoice, continuedSelectivity);
  const syncedRuns = syncNextRun(runs, details, checks, {
    leftSelectivity: leftSelectivity || efficiencyChosen,
    choice: { ...choice, continueToLook: latestFlags.continueToLook },
    heat: heatChoice,
    continuePastEfficiency: latestFlags.continuePast,
    linePercent,
    pickedPercent,
  });
  if (syncedRuns !== runs) {
    setRuns(syncedRuns);
  }
  const columnRuns = useMemo<ColumnRunTrace[]>(() => {
    return syncedRuns.flatMap((run, index) => {
      if (run.status !== "ready" || !run.read?.chromatogram || run.read.chromatogramMissingMessage) return [];
      const info = detailsForRun(index, syncedRuns, details);
      const parsed = run.fileName ? parseRunFileName(run.fileName) : null;
      const named = parsed?.ok ? parsed.fields : {};
      const lengthMm = parseUserNumber(info.lengthMm) ?? parseUserNumber(named.lengthMm ?? "") ?? 150;
      const widthMm = parseUserNumber(info.diameterMm) ?? parseUserNumber(named.diameterMm ?? "") ?? 4.6;
      return [
        {
          id: `run-${index}`,
          tabLabel: runTabLabel(index, syncedRuns, details, checks, {
            choice,
            heat: heatChoice,
            continued: continuedSelectivity,
          }),
          fileName: run.fileName ?? `Run ${index + 1}`,
          points: run.read.chromatogram,
          peakTimesMin: run.read.peakTimesMin,
          yLabel: run.read.chromatogramYAxis,
          pressurePoints: run.read.pressureTrace ?? [],
          pressureUnit: run.read.pressureUnits,
          baselineLengthMm: lengthMm,
          baselineWidthMm: widthMm,
        },
      ];
    });
  }, [syncedRuns, details, checks, choice, heatChoice, continuedSelectivity]);
  const shown = Math.min(active, Math.max(0, syncedRuns.length - 1));

  function onDetails(next: RunDetails) {
    setDetails(next);
    setRuns((current) => {
      if (current[0].percentB === next.percentB) return current;
      const copy = current.slice();
      copy[0] = { ...copy[0], percentB: next.percentB, percentEdited: true };
      return copy;
    });
  }

  function onShownDetails(next: RunDetails) {
    if (shown <= 0) {
      onDetails(next);
      return;
    }
    setRuns((current) => {
      const run = current[shown];
      if (!run) return current;
      const inherited = inheritedRest(shown, current, details);
      const rest: Partial<RestDetails> = { ...run.rest };
      for (const key of REST_KEYS) {
        if (next[key] === inherited[key]) delete rest[key];
        else Object.assign(rest, { [key]: next[key] });
      }
      const copy = current.slice();
      copy[shown] = {
        ...run,
        percentB: next.percentB,
        percentEdited: next.percentB !== run.percentB ? true : run.percentEdited,
        temperature: next.temperature,
        temperatureEdited: next.temperature !== run.temperature ? true : run.temperatureEdited,
        solvent: next.solvent,
        solventEdited: next.solvent !== run.solvent ? true : run.solventEdited,
        ligand: next.ligand,
        ligandEdited: next.ligand !== run.ligand ? true : run.ligandEdited,
        rest,
      };
      return copy;
    });
  }

  function setRunLigand(index: number, value: string) {
    setRuns((current) => {
      if (!current[index]) return current;
      const copy = current.slice();
      copy[index] = { ...copy[index], ligand: value, ligandEdited: true };
      return copy;
    });
  }

  function chooseTempPath(decisionIndex: number, path: TempPath) {
    setTempPathByRun((current) => ({ ...current, [decisionIndex]: path }));
    setRuns((current) => {
      const count = readyPrefix(current);
      const history = planHistory(
        current.slice(0, count).map((run, runIndex) => toSelectivityRun(run, runIndex, detailsRef.current)),
        setupFrom(detailsRef.current, checks),
        {
          heat: heatChoice,
          continuePastEfficiency: selectivityFlags(count - 1, heatChoice, continuedSelectivity).continuePast,
        },
      );
      const choice = history.phase === "selectivity" ? history.plan.tempChoice : null;
      if (!choice) return current;
      const prefill = path === "heat" ? choice.heatPrefill : choice.solventPrefill;
      const copy = current.slice();
      const slot = decisionIndex + 1;
      const existing = copy[slot];
      if (existing && existing.status !== "empty") return current;
      const base = existing ?? emptyRun();
      copy[slot] = {
        ...base,
        percentB: prefill.percentB,
        temperature: prefill.temperature,
        solvent: prefill.solvent,
        ligand: prefill.ligand,
        percentEdited: path !== "solvent",
        temperatureEdited: true,
        solventEdited: path !== "solvent",
        ligandEdited: true,
      };
      return copy;
    });
  }

  function chooseNextSolvent(index: number, solventId: string) {
    setRuns((current) => {
      const count = readyPrefix(current);
      const history = planHistory(
        current.slice(0, count).map((run, runIndex) => toSelectivityRun(run, runIndex, details)),
        setupFrom(details, checks),
        {
          heat: heatChoice,
          continuePastEfficiency: selectivityFlags(count - 1, heatChoice, continuedSelectivity).continuePast,
        },
      );
      const solvent = solventId ? solventById(solventId) : null;
      const matched =
        solvent && history.phase === "selectivity" && history.plan.anchorPercentB != null && history.plan.oldSolvent
          ? solventChoicePercent(history.plan.anchorPercentB, history.plan.oldSolvent, solventId)
          : null;
      const copy = current.slice();
      const run = copy[index] ?? emptyRun();
      copy[index] = {
        ...run,
        solvent: solvent?.label ?? "",
        solventEdited: true,
        percentB: matched ? matched.percentText : "",
        percentEdited: true,
      };
      return copy;
    });
  }

  function patchRun(index: number, patch: Partial<RunState>) {
    setRuns((current) => {
      const copy = current.slice();
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  }

  function applyFileName(fileName: string) {
    const parsed = parseRunFileName(fileName);
    if (!parsed.ok) {
      setFileNameNote(parsed.message);
      return;
    }
    setFileNameNote(null);
    onDetails({ ...detailsRef.current, ...parsed.fields });
  }

  function onToggleFillFromFileName(checked: boolean) {
    setFillFromFileName(checked);
    if (!checked) {
      setFileNameNote(null);
      return;
    }
    const name = runs[0]?.fileName;
    if (name) applyFileName(name);
  }

  function beginRead(index: number, fileName: string) {
    patchRun(index, { status: "reading", fileName, read: null, message: null });
  }

  async function acceptBuffer(index: number, fileName: string, buffer: ArrayBuffer) {
    if (index === 0 && fillFromFileNameRef.current) applyFileName(fileName);
    patchRun(index, { status: "reading", fileName, read: null, message: null });
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const read = readLabFile(buffer);
      if (read.blockingMessage) {
        patchRun(index, { status: "error", fileName, read: null, message: read.blockingMessage });
        return;
      }
      patchRun(index, { status: "ready", fileName, read, message: null });
    } catch {
      patchRun(index, {
        status: "error",
        fileName,
        read: null,
        message: "This file could not be read.",
      });
    }
  }

  function acceptProblem(index: number, fileName: string, message: string) {
    patchRun(index, { status: "error", fileName, read: null, message });
  }

  function removeFile(index: number) {
    setActive((current) => Math.min(current, index));
    setRuns((current) => {
      const next = current.slice(0, index + 1);
      const run = next[index];
      next[index] = {
        ...emptyRun(),
        percentB: run.percentB,
        percentEdited: run.percentEdited,
        temperature: run.temperature,
        temperatureEdited: run.temperatureEdited,
        solvent: run.solvent,
        solventEdited: run.solventEdited,
        ligand: run.ligand,
        ligandEdited: run.ligandEdited,
        rest: run.rest,
      };
      return next;
    });
  }

  return (
    <div
      className={
        section === "decision-engine"
          ? "flex h-dvh max-h-dvh w-full flex-none flex-col overflow-hidden p-3 sm:p-4 md:flex-row md:items-stretch"
          : "flex min-h-dvh flex-1 flex-col md:flex-row"
      }
    >
      <AppSidebar
        open={navOpen}
        section={section}
        onClose={() => setNavOpen(false)}
        onSelect={(id) => {
          setSection(id);
          setNavOpen(false);
        }}
      />
      {section === "about" || section === "equipment" ? (
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
      <Watermark />
      {section === "about" ? <AboutPanel onOpenNav={() => setNavOpen(true)} /> : null}
      {section === "equipment" ? (
        <EquipmentPanel onOpenNav={() => setNavOpen(true)} columnRuns={columnRuns} />
      ) : null}
      </div>
      ) : null}

      {section === "decision-engine" ? (
      <Tabs
        value={String(shown)}
        onValueChange={(value) => {
          const index = Number(value);
          if (index >= 0 && index < syncedRuns.length) setActive(index);
        }}
        className="flex! h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
      >
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden pl-4 sm:pl-5">
      <div id="decision-layout" className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:grid lg:grid-cols-[22.25rem_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)_auto] lg:gap-x-5 lg:gap-y-3">
      <header className="order-2 flex shrink-0 items-start justify-between gap-4 lg:col-span-2 lg:col-start-1 lg:row-start-1">
        <div className="min-w-0">
        <div className="mb-3 md:hidden">
          <Button type="button" variant="outline" className="h-10 px-3" onClick={() => setNavOpen(true)}>
            Sections
          </Button>
        </div>
        <p className="text-xs tracking-[0.16em] text-[#0f6b56] uppercase">Composite sample</p>
        <h1 className="mt-1 font-heading text-3xl text-foreground sm:text-4xl">HPLC run check</h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          See whether this chromatogram meets the specification. While retention or selectivity is
          the step, the page says what to change next.
        </p>
        </div>
        <Watermark className="mt-1" />
      </header>
      <div className="order-3 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:col-start-2 lg:row-start-2">
        {syncedRuns.map((run, index) => (
          <TabsContent key={index} value={String(index)} className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <RunPane
              index={index}
              run={run}
              runs={syncedRuns}
              details={details}
              rules={rules}
              checks={checks}
              onChooseSolvent={(solventId) => chooseNextSolvent(index + 1, solventId)}
              onChooseLigand={(value) => setRunLigand(index + 1, value)}
              tempPath={tempPathByRun[index] ?? null}
              onTempPath={(path) => chooseTempPath(index, path)}
              onBegin={beginRead}
              onBuffer={acceptBuffer}
              onProblem={acceptProblem}
              onRemove={removeFile}
              onOpen={(next) => setActive(next)}
              leftSelectivity={leftSelectivity || efficiencyChosen}
              efficiencyContinued={continuedSelectivity[index] === true}
              onContinueSelectivity={() => {
                const flags = selectivityFlags(index, heatChoice, continuedSelectivity);
                const explanation = explainRun(syncedRuns, index, details, checks, {
                  choice,
                  heat: heatChoice,
                  continuePastEfficiency: flags.continuePast,
                  continueToLook: flags.continueToLook,
                });
                const showsLook =
                  explanation?.kind === "retention" && explanation.decision.continueShowsLook === true;
                setContinuedSelectivity((current) => ({ ...current, [index]: true }));
                if (!showsLook) {
                  setHeatChoice((current) => current ?? { carryIndex: index, seriesLength: index + 1 });
                }
              }}
              onLeave={() => setEfficiencyChosen(true)}
              onDeclineEfficiency={() => setDeclinedEfficiencyNow(true)}
              betweenAnswer={betweenAnswer}
              betweenText={betweenText}
              betweenError={betweenError}
              onBetweenAnswer={(answer) => {
                setBetweenAnswer(answer);
                setBetweenError(null);
                if (answer === "no") {
                  const flags = selectivityFlags(index, heatChoice, {
                    ...continuedSelectivity,
                    [index]: true,
                  });
                  const explanation = explainRun(syncedRuns, index, details, checks, {
                    choice: { ...choice, continueToLook: flags.continueToLook },
                    heat: heatChoice,
                    continuePastEfficiency: flags.continuePast,
                    continueToLook: flags.continueToLook,
                  });
                  const look = explanation?.kind === "retention" ? explanation.decision.look : null;
                  if (look?.mode === "between") setEfficiencyChosen(true);
                }
              }}
              onBetweenText={(value) => {
                setBetweenText(value);
                setBetweenError(null);
              }}
              onUseBetween={() => {
                const flags = selectivityFlags(index, heatChoice, continuedSelectivity);
                const explanation = explainRun(syncedRuns, index, details, checks, {
                  choice: { ...choice, continueToLook: true },
                  heat: heatChoice,
                  continuePastEfficiency: flags.continuePast,
                  continueToLook: true,
                });
                const decision = explanation?.kind === "retention" ? explanation.decision : null;
                const used = syncedRuns
                  .filter((run) => run.status === "ready")
                  .map((run) => parseUserNumber(run.percentB))
                  .filter((percent): percent is number => percent != null);
                const error = inBetweenPercentError(betweenText, used);
                if (error || !decision?.look) {
                  setBetweenError(error ?? "Type a %B from 0 to 100.");
                  return;
                }
                const percent = Number(betweenText.trim());
                const sourceIndex = decision.look.sourceIndex;
                setInBetween({ percent, sourceIndex });
                setBetweenError(null);
                setRuns((current) => {
                  const copy = current.slice();
                  const source = copy[sourceIndex];
                  const slot = sourceIndex + 1;
                  const existing = copy[slot] ?? emptyRun();
                  if (existing.status !== "empty" && copy[slot]) return current;
                  const inherited = inheritedConditions(source ?? emptyRun(), sourceIndex, details);
                  copy[slot] = {
                    ...(copy[slot] ?? emptyRun()),
                    percentB: formatPercentB(percent),
                    temperature: inherited.temperature,
                    solvent: inherited.solvent,
                    ligand: inherited.ligand,
                    percentEdited: true,
                    temperatureEdited: true,
                    solventEdited: true,
                    ligandEdited: true,
                  };
                  return copy;
                });
                setActive(sourceIndex + 1);
              }}
              onPickRun={(pickIndex) => {
                const count = readyPrefix(syncedRuns);
                setHeatChoice({ carryIndex: pickIndex, seriesLength: count });
                setBetweenAnswer("no");
              }}
              choice={choice}
              heat={heatChoice}
              onLinePercent={index === readyCount - 1 ? reportLinePercent : undefined}
              onPickPercent={index === readyCount - 1 ? setPickedPercent : undefined}
              pickedPercent={pickedPercent}
              runTabs={
                index === shown ? (
                  <div
                    id="run-tabs"
                    className="order-1 flex shrink-0 border-b border-border bg-card lg:order-2 lg:w-max lg:min-h-0 lg:shrink lg:flex-col lg:self-stretch lg:overflow-y-auto lg:border-b-0 lg:border-l"
                  >
                    <div className="overflow-x-auto lg:overflow-visible">
                      <TabsList className="flex! h-auto! w-max flex-row! items-stretch justify-start gap-0! rounded-none bg-transparent p-0! group-data-horizontal/tabs:h-auto! lg:w-full! lg:flex-col!">
                        {syncedRuns.map((_, tabIndex) => (
                          <TabsTrigger
                            key={tabIndex}
                            value={String(tabIndex)}
                            className="h-10! w-auto! flex-none! rounded-none! border-0! border-r border-solid px-3 text-sm shadow-none! transition-none! after:hidden! last:border-r-0 lg:w-full! lg:border-r-0 lg:border-b lg:px-2 lg:last:border-b-0"
                            style={runTabStyle(tabIndex === shown, hoveredRun === tabIndex)}
                            onMouseEnter={() => setHoveredRun(tabIndex)}
                            onMouseLeave={() => setHoveredRun((current) => (current === tabIndex ? null : current))}
                          >
                            {runTabLabel(tabIndex, syncedRuns, details, checks, {
                              choice,
                              heat: heatChoice,
                              continued: continuedSelectivity,
                            })}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </div>
                  </div>
                ) : null
              }
            />
          </TabsContent>
        ))}
      </div>
      <footer className="order-4 mt-3 shrink-0 border-t border-border pt-3 text-xs text-muted-foreground lg:col-start-2 lg:row-start-3">
        Built by Logan Klat
      </footer>
      <aside
        id="setup-column"
        className="order-1 flex min-h-0 w-full shrink-0 flex-col overflow-y-auto overscroll-y-contain max-lg:max-h-[40vh] lg:col-start-1 lg:row-start-2 lg:h-full lg:max-h-full lg:w-auto"
      >
        <RunForm
          title={runTabLabel(shown, syncedRuns, details, checks, {
            choice,
            heat: heatChoice,
            continued: continuedSelectivity,
          })}
          details={detailsForRun(shown, syncedRuns, details)}
          rules={rules}
          onDetails={onShownDetails}
          onRules={setRules}
          fileNameFill={
            shown === 0
              ? {
                  checked: fillFromFileName,
                  note: fileNameNote,
                  onToggle: onToggleFillFromFileName,
                }
              : null
          }
        />
      </aside>
      </div>
      </div>
      </Tabs>
      ) : null}
    </div>
  );
}

function Watermark({ className = "mb-3" }: { className?: string }) {
  return (
    <div id="watermark" className={`pointer-events-none flex shrink-0 justify-end ${className}`}>
      <div className="flex items-center gap-1.5 text-[#144237]/40">
        <svg viewBox="0 0 64 28" className="h-5 w-11" aria-hidden="true">
          <path
            d="M2 22 H8 C11 22 12 14 15 14 C18 14 19 22 22 22 H26 C29 22 30 6 35 6 C40 6 41 22 44 22 H48 C51 22 52 16 55 16 C58 16 59 22 62 22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="font-heading text-sm tracking-wide">Logan Klat</span>
      </div>
    </div>
  );
}

function sectionTabStyle(selected: boolean, hovered: boolean): CSSProperties {
  if (selected && hovered) {
    return { backgroundColor: "#b7d8cb", borderColor: "#0f6b56", color: "#144237", fontWeight: 600 };
  }
  if (selected) {
    return { backgroundColor: "#e7f3ee", borderColor: "#c5ddd2", color: "#144237", fontWeight: 600 };
  }
  if (hovered) {
    return { backgroundColor: "#efe6c4", borderColor: "#b0893e", color: "#3d3416", fontWeight: 600 };
  }
  return {
    backgroundColor: "var(--background)",
    borderColor: "transparent",
    color: "var(--foreground)",
    fontWeight: 500,
  };
}

function AppSidebar({
  open,
  section,
  onClose,
  onSelect,
}: {
  open: boolean;
  section: (typeof sections)[number]["id"];
  onClose: () => void;
  onSelect: (id: (typeof sections)[number]["id"]) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const nav = (
    <nav aria-label="Sections" className="flex flex-col gap-1">
      <p className="px-3 pb-2 text-xs tracking-[0.14em] text-muted-foreground uppercase">Sections</p>
      {sections.map((item) => {
        const selected = item.id === section;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={selected ? "page" : undefined}
            className="flex items-center gap-2 rounded-lg border border-solid px-3 py-2 text-left text-sm transition-none"
            style={sectionTabStyle(selected, hovered === item.id)}
            onMouseEnter={() => setHovered(item.id)}
            onMouseLeave={() => setHovered((current) => (current === item.id ? null : current))}
            onClick={() => onSelect(item.id)}
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside
        className={
          section === "decision-engine"
            ? "hidden h-full min-h-0 w-60 shrink-0 flex-col self-stretch border-r border-border bg-card md:flex"
            : "hidden w-60 shrink-0 border-r border-border bg-card md:block"
        }
      >
        <div className={section === "decision-engine" ? "px-3 py-4" : "sticky top-0 px-3 py-6"}>{nav}</div>
      </aside>
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close sections"
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
          />
          <aside className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-card px-3 py-4 shadow-lg">
            <div className="mb-4 flex justify-end">
              <Button type="button" variant="outline" className="h-9 px-3" onClick={onClose}>
                Close
              </Button>
            </div>
            {nav}
          </aside>
        </div>
      ) : null}
    </>
  );
}

function RunPane({
  index,
  run,
  runs,
  details,
  rules,
  checks,
  onChooseSolvent,
  onChooseLigand,
  tempPath,
  onTempPath,
  onBegin,
  onBuffer,
  onProblem,
  onRemove,
  onOpen,
  leftSelectivity,
  efficiencyContinued,
  onContinueSelectivity,
  onLeave,
  onDeclineEfficiency,
  betweenAnswer,
  betweenText,
  betweenError,
  onBetweenAnswer,
  onBetweenText,
  onUseBetween,
  onPickRun,
  choice,
  heat,
  onLinePercent,
  onPickPercent,
  pickedPercent,
  runTabs,
}: {
  index: number;
  run: RunState;
  runs: RunState[];
  details: RunDetails;
  rules: RuleInputs;
  checks: RuleNumbers;
  onChooseSolvent: (solventId: string) => void;
  onChooseLigand: (value: string) => void;
  tempPath: TempPath | null;
  onTempPath: (path: TempPath) => void;
  onBegin: (index: number, fileName: string) => void;
  onBuffer: (index: number, fileName: string, buffer: ArrayBuffer) => void;
  onProblem: (index: number, fileName: string, message: string) => void;
  onRemove: (index: number) => void;
  onOpen: (index: number) => void;
  leftSelectivity: boolean;
  efficiencyContinued: boolean;
  onContinueSelectivity: () => void;
  onLeave: () => void;
  onDeclineEfficiency: () => void;
  betweenAnswer: "yes" | "no" | null;
  betweenText: string;
  betweenError: string | null;
  onBetweenAnswer: (answer: "yes" | "no") => void;
  onBetweenText: (value: string) => void;
  onUseBetween: () => void;
  onPickRun: (index: number) => void;
  choice: RetentionChoice;
  heat: HeatStart | null;
  onLinePercent?: (percent: number | null) => void;
  onPickPercent?: (percent: number) => void;
  pickedPercent?: number | null;
  runTabs?: ReactNode;
}) {
  if (run.afterRetention) {
    const prior = index > 0 ? explainRun(runs, index - 1, details, checks, { choice, heat }) : null;
    return (
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border-2 border-solid border-border bg-card lg:flex-row lg:items-stretch">
        <div className="order-2 min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-5 lg:order-1" data-chromatogram-scroll="">
          <LaterChangeNote decision={prior?.kind === "retention" ? prior.decision : null} />
        </div>
        {runTabs}
      </section>
    );
  }

  const flags = selectivityFlags(index, heat, efficiencyContinued ? { [index]: true } : {});
  const explanation = explainRun(runs, index, details, checks, {
    choice: { ...choice, continueToLook: flags.continueToLook },
    heat,
    continuePastEfficiency: flags.continuePast,
    continueToLook: flags.continueToLook,
  });
  const rows = run.read ? evaluateRun(run.read, checks) : null;
  const next = runs[index + 1];
  const selectivity = explanation?.kind === "selectivity" ? explanation.plan : null;
  const retention = explanation?.kind === "retention" ? explanation.decision : null;
  const ask =
    !leftSelectivity && retention?.status === "ask" && retention.efficiencyNow
      ? retention.efficiencyNow
      : null;

  return (
    <>
      {index === 0 && run.status === "empty" ? (
        <div className="shrink-0">
          <StartHighBNote />
        </div>
      ) : null}
      {index === 0 ? null : (
        <div className="shrink-0">
        <RunSummary index={index} runs={runs} details={details} />
        </div>
      )}

      <section
        className={
          "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border-2 bg-card lg:flex-row lg:items-stretch " +
          (run.status === "ready" ? "border-solid border-border" : "border-dashed border-border")
        }
      >
        <div
          className="order-2 flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-5 lg:order-1"
          data-chromatogram-scroll=""
        >
        {run.status === "ready" && run.read && rows && run.fileName ? (
          <>
            <ResultsPanel
              fileName={run.fileName}
              onRemove={() => onRemove(index)}
              read={run.read}
              rows={rows}
              aside={
                leftSelectivity ? (
                  <LeaveSelectivityDone duringRetention={explanation?.kind === "retention"} />
                ) : ask ? (
                  <LeaveSelectivityAsk
                    ask={ask}
                    onYes={onLeave}
                    onNo={() => onDeclineEfficiency()}
                  />
                ) : retention?.status === "efficiency" && retention.efficiencyChoice && !efficiencyContinued ? (
                  <EfficiencyChoiceView
                    why={retention.why}
                    onEfficiency={onLeave}
                    onContinue={onContinueSelectivity}
                  />
                ) : retention?.status === "look" && retention.look && !heat ? (
                  <LookAtRuns
                    look={retention.look}
                    betweenAnswer={betweenAnswer}
                    betweenText={betweenText}
                    betweenError={betweenError}
                    onAnswer={onBetweenAnswer}
                    onBetweenText={onBetweenText}
                    onUseBetween={onUseBetween}
                    onPickRun={onPickRun}
                  />
                ) : (
                  <>
                    {retention ? (
                      <RetentionDecisionView
                        decision={retention}
                        onLinePercent={onLinePercent}
                        onPickPercent={onPickPercent}
                        pickedPercent={pickedPercent}
                      />
                    ) : null}
                    {selectivity ? (
                      <SelectivityDecisionView
                        plan={selectivity}
                        solventId={findSolvent(next?.solvent ?? "")?.id ?? selectivity.recommendedSolventId ?? ""}
                        ligand={next?.ligand || selectivity.recommendedLigand || ""}
                        onSolvent={onChooseSolvent}
                        onLigand={onChooseLigand}
                        tempPath={tempPath}
                        onTempPath={onTempPath}
                      />
                    ) : null}
                  </>
                )
              }
            />
            {next && !ask && !leftSelectivity ? (
              <div className="mt-auto flex flex-col gap-2">
                <Button
                  type="button"
                  className="h-16 w-full text-lg font-semibold tracking-wide"
                  onClick={() => onOpen(index + 1)}
                >
                  NEXT RUN
                </Button>
                <p className="text-center text-xs text-muted-foreground">{nextRunCaption(index + 2, next)}</p>
              </div>
            ) : null}
          </>
        ) : (
          <div aria-live="polite" className="flex flex-1 flex-col gap-4">
            <FileDrop
              prompt={
                index === 0
                  ? "Drop in the lab file from the first run."
                  : run.temperature.trim()
                    ? "Drop in the lab file from the run at this temperature and %B."
                    : "Drop in the lab file from the run at this %B."
              }
              reading={run.status === "reading"}
              onBegin={(fileName) => onBegin(index, fileName)}
              onBuffer={(fileName, buffer) => void onBuffer(index, fileName, buffer)}
              onProblem={(fileName, message) => onProblem(index, fileName, message)}
            />
            {run.status === "empty" && runSettingLine(run) ? (
              <p className="text-center text-sm text-muted-foreground">
                This run is set to {runSettingLine(run)}. Change it if the file you upload was run
                differently.
              </p>
            ) : null}
            {run.status === "reading" ? (
              <p className="text-center text-sm text-foreground" role="status">
                Reading the file…
              </p>
            ) : null}
            {run.status === "error" && run.message ? (
              <div
                className="rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-950 ring-1 ring-orange-200"
                role="alert"
              >
                {run.fileName ? <span className="mb-1 block font-medium">{run.fileName}</span> : null}
                {run.message}
              </div>
            ) : null}
          </div>
        )}
        </div>
        {runTabs}
      </section>
    </>
  );
}

function RunSummary({ index, runs, details }: { index: number; runs: RunState[]; details: RunDetails }) {
  const lines = decisionChangeLines(index, runs, details);
  if (lines.length === 0) return null;
  return (
    <section id="run-context" className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
      {lines.map((line) => (
        <p key={line} className="text-base font-medium text-foreground">
          {line}
        </p>
      ))}
    </section>
  );
}

function decisionChangeLines(index: number, runs: RunState[], details: RunDetails): string[] {
  const before = runConditions(index - 1, runs, details);
  const after = runConditions(index, runs, details);
  const lines: string[] = [];
  if (before.percentB !== after.percentB) {
    lines.push(`Change %B: ${percentMark(before.percentB)} → ${percentMark(after.percentB)}`);
  }
  if (before.temperature !== after.temperature) {
    lines.push(`Change temperature: ${temperatureMark(before.temperature)} → ${temperatureMark(after.temperature)}`);
  }
  if (before.solvent !== after.solvent) {
    lines.push(`Change solvent: ${plainMark(before.solvent)} → ${plainMark(after.solvent)}`);
  }
  if (before.ligand !== after.ligand) {
    lines.push(`Change ligand: ${plainMark(before.ligand)} → ${plainMark(after.ligand)}`);
  }
  return lines;
}

function runConditions(index: number, runs: RunState[], details: RunDetails) {
  if (index <= 0) {
    const run = runs[0];
    return {
      percentB: (details.percentB || run?.percentB || "").trim(),
      temperature: details.temperature.trim(),
      solvent: details.solvent.trim(),
      ligand: details.ligand.trim(),
    };
  }
  const run = runs[index];
  return {
    percentB: (run?.percentB || "").trim(),
    temperature: (run?.temperature || "").trim() || details.temperature.trim(),
    solvent: (run?.solvent || "").trim() || details.solvent.trim(),
    ligand: (run?.ligand || "").trim() || details.ligand.trim(),
  };
}

function percentMark(value: string): string {
  if (!value) return "—";
  return value.endsWith("%") ? value : `${value}%`;
}

function temperatureMark(value: string): string {
  if (!value) return "—";
  if (/ambient/i.test(value) || /°/.test(value)) return value;
  return `${value}°C`;
}

function plainMark(value: string): string {
  return value || "—";
}

type Explanation =
  | { kind: "retention"; decision: RetentionDecision }
  | { kind: "selectivity"; plan: SelectivityPlan };

function explainRun(
  runs: RunState[],
  index: number,
  details: RunDetails,
  checks: RuleNumbers,
  options: {
    choice: RetentionChoice;
    heat: HeatStart | null;
    continuePastEfficiency?: boolean;
    continueToLook?: boolean;
  },
): Explanation | null {
  const run = runs[index];
  if (!run || run.status !== "ready" || !run.read) return null;
  for (let i = 0; i < index; i++) {
    if (runs[i].status !== "ready" || !runs[i].read) return null;
  }
  const prefix = runs.slice(0, index + 1);
  const history = planHistory(
    prefix.map((item, itemIndex) => toSelectivityRun(item, itemIndex, details)),
    setupFrom(details, checks),
    { heat: options.heat, continuePastEfficiency: options.continuePastEfficiency },
  );
  if (history.phase === "selectivity") return { kind: "selectivity", plan: history.plan };
  const segment = prefix.slice(history.segmentStart);
  const onLatest = index === prefix.length - 1;
  return {
    kind: "retention",
    decision: decideRetention(
      segment.map(toSample),
      checks,
      onLatest ? { ...options.choice, continueToLook: options.continueToLook } : undefined,
    ),
  };
}

function syncNextRun(
  runs: RunState[],
  details: RunDetails,
  checks: RuleNumbers,
  options: {
    leftSelectivity: boolean;
    choice: RetentionChoice;
    heat: HeatStart | null;
    continuePastEfficiency: boolean;
    linePercent: number | null;
    pickedPercent: number | null;
  },
): RunState[] {
  const count = readyPrefix(runs);
  if (options.leftSelectivity) {
    const next = runs[count];
    if (next && next.status === "empty" && !runWasEdited(next) && runs.length === count + 1) {
      return runs.slice(0, count);
    }
    return runs;
  }
  if (count === 0) return runs;
  const ready = runs.slice(0, count);
  const history = planHistory(
    ready.map((run, index) => toSelectivityRun(run, index, details)),
    setupFrom(details, checks),
    { heat: options.heat, continuePastEfficiency: options.continuePastEfficiency },
  );
  const next = runs[count];
  const prefill = prefillFor(
    ready,
    history,
    details,
    checks,
    options.choice,
    options.linePercent,
    options.pickedPercent,
  );

  if (!prefill) {
    if (!next || next.status !== "empty" || runWasEdited(next)) return runs;
    if (runs.length !== count + 1) return runs;
    return runs.slice(0, count);
  }

  if (!next) {
    if (runs.length !== count) return runs;
    return [...runs, { ...emptyRun(), ...prefill }];
  }
  if (next.status !== "empty") return runs;
  const merged = mergePrefill(next, prefill);
  if (merged === next) return runs;
  const copy = runs.slice();
  copy[count] = merged;
  return copy;
}

function prefillFor(
  ready: RunState[],
  history: ReturnType<typeof planHistory>,
  details: RunDetails,
  checks: RuleNumbers,
  choice: RetentionChoice,
  linePercent: number | null,
  pickedPercent: number | null,
): SelectivityPrefill | null {
  if (history.phase === "selectivity") {
    return history.plan.status === "recommend" ? history.plan.prefill : null;
  }
  const decision = decideRetention(ready.slice(history.segmentStart).map(toSample), checks, choice);
  if (decision.status !== "recommend" || decision.nextPercentB == null) return null;
  const picked =
    pickedPercent != null && decision.bChoices?.some((item) => item.percentB === pickedPercent)
      ? pickedPercent
      : null;
  const percent =
    picked ??
    (decision.move === "calculated" && linePercent != null ? linePercent : decision.nextPercentB);
  const lastIndex = ready.length - 1;
  const inherited = inheritedConditions(ready[lastIndex], lastIndex, details);
  return {
    percentB: formatPercentB(percent),
    temperature: decision.nextTemperature ?? inherited.temperature,
    solvent: inherited.solvent,
    ligand: inherited.ligand,
  };
}

function inheritedConditions(run: RunState, index: number, details: RunDetails) {
  if (index <= 0) {
    return {
      temperature: details.temperature.trim(),
      solvent: details.solvent.trim(),
      ligand: details.ligand.trim(),
    };
  }
  return {
    temperature: run.temperature.trim() || details.temperature.trim(),
    solvent: run.solvent.trim() || details.solvent.trim(),
    ligand: run.ligand.trim() || details.ligand.trim(),
  };
}

function mergePrefill(run: RunState, prefill: SelectivityPrefill): RunState {
  const percentB = run.percentEdited ? run.percentB : prefill.percentB;
  const temperature = run.temperatureEdited ? run.temperature : prefill.temperature;
  const solvent = run.solventEdited ? run.solvent : prefill.solvent;
  const ligand = run.ligandEdited ? run.ligand : prefill.ligand;
  if (
    run.percentB === percentB &&
    run.temperature === temperature &&
    run.solvent === solvent &&
    run.ligand === ligand &&
    !run.afterRetention
  ) {
    return run;
  }
  return { ...run, percentB, temperature, solvent, ligand, afterRetention: false };
}

function runWasEdited(run: RunState): boolean {
  return run.percentEdited || run.temperatureEdited || run.solventEdited || run.ligandEdited;
}

function setupFrom(details: RunDetails, checks: RuleNumbers) {
  return {
    requiredPeaks: checks.requiredPeaks,
    lastPeakTimeMin: checks.lastPeakTimeMin,
    minResolution: checks.minResolution,
    maxBackPressurePsi: checks.maxBackPressurePsi,
    ambientTemperatureC: parseUserNumber(details.temperature),
    originalSolvent: details.solvent.trim(),
    originalLigand: details.ligand.trim(),
  };
}

function toSelectivityRun(run: RunState, index: number, details: RunDetails): SelectivityRun {
  const temperatureText = index === 0 ? details.temperature : run.temperature.trim() || details.temperature;
  const solvent = index === 0 ? details.solvent : run.solvent.trim() || details.solvent;
  const ligand = index === 0 ? details.ligand : run.ligand.trim() || details.ligand;
  const percentText = index === 0 ? details.percentB || run.percentB : run.percentB;
  return {
    percentB: parseUserNumber(percentText),
    temperatureC: parseUserNumber(temperatureText),
    solvent: solvent.trim(),
    ligand: ligand.trim(),
    peakCount: run.read?.peakCount ?? null,
    lastPeakTimeMin: run.read?.lastPeakTimeMin ?? null,
    firstPeakTimeMin: run.read?.firstPeakTimeMin ?? null,
    minResolutionExcludingFirst: run.read?.minResolutionExcludingFirst ?? null,
    maxBackPressurePsi: run.read?.maxBackPressurePsi ?? null,
  };
}

function nextRunCaption(runNumber: number, next: RunState): string {
  const bits = [
    next.temperature.trim() ? `${next.temperature}°C` : "",
    next.percentB.trim() ? `${next.percentB}% B` : "",
    next.solvent.trim(),
    next.ligand.trim(),
  ].filter(Boolean);
  if (bits.length === 0) return `Run ${runNumber} is ready for a file.`;
  return `Run ${runNumber} opens with ${bits.join(", ")} filled in.`;
}

function runSettingLine(run: RunState): string {
  return [
    run.temperature.trim() ? `${run.temperature}°C` : "",
    run.percentB.trim() ? `${run.percentB}% B` : "",
    run.solvent.trim(),
    run.ligand.trim(),
  ]
    .filter(Boolean)
    .join(", ");
}

function selectivityFlags(
  runIndex: number,
  heat: HeatStart | null,
  continued: Record<number, boolean>,
): { continueToLook: boolean; continuePast: boolean } {
  const heatApplies =
    heat != null &&
    runIndex >= 0 &&
    heat.carryIndex >= 0 &&
    heat.carryIndex <= runIndex &&
    heat.seriesLength > heat.carryIndex &&
    heat.seriesLength <= runIndex + 1;
  const continuedHere = continued[runIndex] === true;
  return {
    continueToLook: continuedHere && !heatApplies,
    continuePast: continuedHere && heatApplies,
  };
}

function readyPrefix(runs: RunState[]): number {
  let count = 0;
  for (const run of runs) {
    if (run.status !== "ready" || !run.read) break;
    count += 1;
  }
  return count;
}

function toSample(run: RunState): RetentionSample {
  return {
    percentB: parseUserNumber(run.percentB),
    peakCount: run.read?.peakCount ?? null,
    lastPeakTimeMin: run.read?.lastPeakTimeMin ?? null,
    firstPeakTimeMin: run.read?.firstPeakTimeMin ?? null,
    minResolutionExcludingFirst: run.read?.minResolutionExcludingFirst ?? null,
    maxBackPressurePsi: run.read?.maxBackPressurePsi ?? null,
    peaks: run.read?.peaks ?? [],
  };
}

function inBetweenMatches(
  runs: RunState[],
  picked: { percent: number; sourceIndex: number } | null,
): boolean {
  if (!picked) return false;
  const run = runs[picked.sourceIndex + 1];
  if (!run || run.status !== "ready" || !run.read) return false;
  const percent = parseUserNumber(run.percentB);
  if (percent == null) return false;
  return Math.abs(percent - picked.percent) <= 1e-9;
}

function toRuleNumbers(rules: RuleInputs): RuleNumbers {
  return {
    requiredPeaks: parseUserCount(rules.requiredPeaks),
    lastPeakTimeMin: parseUserNumber(rules.lastPeakTimeMin),
    minResolution: parseUserNumber(rules.minResolution),
    maxBackPressurePsi: parseUserNumber(rules.maxBackPressurePsi),
  };
}

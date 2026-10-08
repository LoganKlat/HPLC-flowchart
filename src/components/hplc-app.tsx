"use client";

import { useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Gauge, GitBranch, Info, type LucideIcon } from "lucide-react";
import { ChoiceSelect } from "@/components/choice-select";
import { FileDrop } from "@/components/file-drop";
import { AboutPanel } from "@/components/about-panel";
import { EfficiencyChoiceView, LeaveSelectivityAsk, LeaveSelectivityDone } from "@/components/leave-selectivity";
import { LookAtRuns } from "@/components/look-at-runs";
import { LaterChangeNote, RetentionDecisionView, StartHighBNote } from "@/components/retention-decision";
import { ResultsPanel } from "@/components/results-panel";
import { RunForm } from "@/components/run-form";
import { SelectivityDecisionView } from "@/components/selectivity-decision";
import { EquipmentPanel } from "@/components/equipment-panel";
import { MeasurementGroups } from "@/components/measurement-groups";
import { NotePop } from "@/components/note-pop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { evaluateRun, parseUserCount, parseUserNumber, type RuleNumbers } from "@/lib/evaluate";
import { FILE_NAME_CHECKBOX_LABEL, FILE_NAME_STRUCTURE_NOTE, parseRunFileName } from "@/lib/filename-details";
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

type RunState = {
  percentB: string;
  percentEdited: boolean;
  temperature: string;
  temperatureEdited: boolean;
  solvent: string;
  solventEdited: boolean;
  ligand: string;
  ligandEdited: boolean;
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
  if (index <= 0) return percentWords(details.percentB || runs[0]?.percentB || "");
  const flags = selectivityFlags(index - 1, options.heat, options.continued);
  const explanation = explainRun(runs, index - 1, details, checks, {
    choice: options.choice,
    heat: options.heat,
    continuePastEfficiency: flags.continuePast,
    continueToLook: flags.continueToLook,
  });
  const named = explanation ? decisionTabLabel(explanation, runs[index]) : null;
  if (named) return named;
  return openedRunFallback(index, runs, details);
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

  function setRunPercent(index: number, value: string) {
    setRuns((current) => {
      const copy = current.slice();
      copy[index] = { ...copy[index], percentB: value, percentEdited: true };
      return copy;
    });
  }

  function setRunTemperature(index: number, value: string) {
    setRuns((current) => {
      const copy = current.slice();
      copy[index] = { ...copy[index], temperature: value, temperatureEdited: true };
      return copy;
    });
  }

  function setRunSolvent(index: number, value: string) {
    setRuns((current) => {
      const copy = current.slice();
      copy[index] = { ...copy[index], solvent: value, solventEdited: true };
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
      };
      return next;
    });
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col md:flex-row">
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
      {section === "equipment" ? <EquipmentPanel onOpenNav={() => setNavOpen(true)} /> : null}
      </div>
      ) : null}

      {section === "decision-engine" ? (
      <Tabs
        value={String(shown)}
        onValueChange={(value) => {
          const index = Number(value);
          if (index >= 0 && index < syncedRuns.length) setActive(index);
        }}
        className="flex! min-h-dvh w-full min-w-0 flex-1 flex-col lg:flex-row!"
      >
      <div className="order-2 mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8 lg:order-1 lg:max-w-none">
      <Watermark />
      <div id="decision-layout" className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="order-2 flex min-w-0 flex-1 flex-col">
      <header className="mb-5">
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
      </header>
        {syncedRuns.map((run, index) => (
          <TabsContent key={index} value={String(index)} className="flex flex-col gap-5">
            <RunPane
              index={index}
              run={run}
              runs={syncedRuns}
              details={details}
              rules={rules}
              checks={checks}
              onPercent={(value) => setRunPercent(index, value)}
              onTemperature={(value) => setRunTemperature(index, value)}
              onSolvent={(value) => setRunSolvent(index, value)}
              onLigand={(value) => setRunLigand(index, value)}
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
              fillFromFileName={fillFromFileName}
              fileNameNote={fileNameNote}
              onToggleFillFromFileName={onToggleFillFromFileName}
              onLinePercent={index === readyCount - 1 ? reportLinePercent : undefined}
              onPickPercent={index === readyCount - 1 ? setPickedPercent : undefined}
            />
          </TabsContent>
        ))}
      <footer className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
        Built by Logan Klat
      </footer>
      </div>
      <aside
        id="setup-column"
        className="order-1 w-full shrink-0 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:w-80 lg:overflow-y-auto"
      >
        <RunForm details={details} rules={rules} onDetails={onDetails} onRules={setRules} />
      </aside>
      </div>
      </div>
      <div
        id="run-tabs"
        className="order-1 sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur lg:order-2 lg:sticky lg:top-0 lg:z-20 lg:h-dvh lg:w-28 lg:shrink-0 lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-l lg:bg-card lg:backdrop-blur-none"
      >
        <div className="overflow-x-auto lg:overflow-visible">
          <TabsList className="flex! h-auto! w-max min-w-full flex-row! items-stretch justify-start gap-2 rounded-none bg-transparent p-2 group-data-horizontal/tabs:h-auto! lg:w-full! lg:flex-col! lg:p-3">
            {syncedRuns.map((_, index) => (
              <TabsTrigger
                key={index}
                value={String(index)}
                className="h-10! w-auto! flex-none! rounded-md border border-solid px-3 text-sm shadow-none! transition-none! after:hidden! lg:w-full! lg:px-2"
                style={runTabStyle(index === shown, hoveredRun === index)}
                onMouseEnter={() => setHoveredRun(index)}
                onMouseLeave={() => setHoveredRun((current) => (current === index ? null : current))}
              >
                {runTabLabel(index, syncedRuns, details, checks, {
                  choice,
                  heat: heatChoice,
                  continued: continuedSelectivity,
                })}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </div>
      </Tabs>
      ) : null}
    </div>
  );
}

function Watermark() {
  return (
    <div id="watermark" className="pointer-events-none mb-3 flex justify-end">
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
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:block">
        <div className="sticky top-0 px-3 py-6">{nav}</div>
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
  onPercent,
  onTemperature,
  onSolvent,
  onLigand,
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
  fillFromFileName,
  fileNameNote,
  onToggleFillFromFileName,
  onLinePercent,
  onPickPercent,
}: {
  index: number;
  run: RunState;
  runs: RunState[];
  details: RunDetails;
  rules: RuleInputs;
  checks: RuleNumbers;
  onPercent: (value: string) => void;
  onTemperature: (value: string) => void;
  onSolvent: (value: string) => void;
  onLigand: (value: string) => void;
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
  fillFromFileName: boolean;
  fileNameNote: string | null;
  onToggleFillFromFileName: (checked: boolean) => void;
  onLinePercent?: (percent: number | null) => void;
  onPickPercent?: (percent: number) => void;
}) {
  if (run.afterRetention) {
    const prior = index > 0 ? explainRun(runs, index - 1, details, checks, { choice, heat }) : null;
    return <LaterChangeNote decision={prior?.kind === "retention" ? prior.decision : null} />;
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
        <StartHighBNote />
      ) : null}
      {index === 0 ? null : (
        <RunSummary
          index={index}
          rules={rules}
          run={run}
          onPercent={onPercent}
          onTemperature={onTemperature}
          onSolvent={onSolvent}
          onLigand={onLigand}
        />
      )}

      <section
        className={
          "flex min-h-[28rem] flex-col gap-4 rounded-xl border-2 bg-card p-4 sm:p-5 " +
          (run.status === "ready" ? "border-solid border-border" : "border-dashed border-border")
        }
      >
        {index === 0 ? (
          <div id="filename-fill" className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <label
                htmlFor="fill-from-filename"
                className="flex items-start gap-3 text-sm leading-relaxed text-foreground"
              >
                <input
                  id="fill-from-filename"
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-[#0f6b56]"
                  checked={fillFromFileName}
                  onChange={(event) => onToggleFillFromFileName(event.target.checked)}
                />
                <span>{FILE_NAME_CHECKBOX_LABEL}</span>
              </label>
              <NotePop text={FILE_NAME_STRUCTURE_NOTE} label="Autofill from file name" />
            </div>
            {fileNameNote ? (
              <p className="text-sm text-orange-950" role="status">
                {fileNameNote}
              </p>
            ) : null}
          </div>
        ) : null}
        {run.status === "ready" && run.read && rows && run.fileName ? (
          <>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-10 px-4"
                onClick={() => onRemove(index)}
              >
                Remove file
              </Button>
            </div>
            <ResultsPanel fileName={run.fileName} read={run.read} rows={rows} />
            <MeasurementGroups read={run.read} minimumPercentB={retention?.fit?.nextPercentB ?? null} />
            {leftSelectivity ? (
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
            )}
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
      </section>
    </>
  );
}

function RunSummary({
  index,
  rules,
  run,
  onPercent,
  onTemperature,
  onSolvent,
  onLigand,
}: {
  index: number;
  rules: RuleInputs;
  run: RunState;
  onPercent: (value: string) => void;
  onTemperature: (value: string) => void;
  onSolvent: (value: string) => void;
  onLigand: (value: string) => void;
}) {
  const ruleLine = [
    rules.requiredPeaks.trim() ? `${rules.requiredPeaks.trim()} peaks` : "peak count not set",
    rules.lastPeakTimeMin.trim()
      ? `last peak at or before ${rules.lastPeakTimeMin.trim()} min`
      : "last peak time not set",
    rules.minResolution.trim()
      ? `resolution at least ${rules.minResolution.trim()}`
      : "resolution not set",
    rules.maxBackPressurePsi.trim()
      ? `back-pressure at or below ${rules.maxBackPressurePsi.trim()} psi`
      : "back-pressure not set",
  ].join(" · ");

  return (
    <section id="run-context" className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
      <p className="text-sm text-muted-foreground">Starting details stay on Run 1.</p>
      <p className="mt-1 text-sm leading-snug text-foreground">
        <span className="font-medium">Rules. </span>
        {ruleLine}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Temperature (°C)" id={`run-${index + 1}-temperature`}>
          <Input
            id={`run-${index + 1}-temperature`}
            value={run.temperature}
            inputMode="decimal"
            className="h-10"
            onChange={(event) => onTemperature(event.target.value)}
          />
        </Field>
        <Field label="%B" id={`run-${index + 1}-percent-b`}>
          <Input
            id={`run-${index + 1}-percent-b`}
            value={run.percentB}
            inputMode="decimal"
            className="h-10"
            onChange={(event) => onPercent(event.target.value)}
          />
        </Field>
        <Field label="Solvent" id={`run-${index + 1}-solvent`}>
          <ChoiceSelect
            id={`run-${index + 1}-solvent`}
            value={run.solvent}
            placeholder="Choose a solvent"
            options={SOLVENTS.map((solvent) => ({ value: solvent.label, label: solvent.label }))}
            onChange={onSolvent}
          />
        </Field>
        <Field label="Ligand" id={`run-${index + 1}-ligand`}>
          <ChoiceSelect
            id={`run-${index + 1}-ligand`}
            value={run.ligand}
            placeholder="select a ligand"
            options={LIGANDS.map((name) => ({ value: name, label: name }))}
            onChange={onLigand}
          />
        </Field>
      </div>
    </section>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
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

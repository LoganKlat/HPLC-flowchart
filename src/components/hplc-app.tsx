"use client";

import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChoiceSelect } from "@/components/choice-select";
import { FileDrop } from "@/components/file-drop";
import { LeaveSelectivityAsk, LeaveSelectivityDone } from "@/components/leave-selectivity";
import { LaterChangeNote, RetentionDecisionView, StartHighBNote } from "@/components/retention-decision";
import { ResultsPanel } from "@/components/results-panel";
import { RunForm } from "@/components/run-form";
import { SelectivityDecisionView } from "@/components/selectivity-decision";
import { EquipmentPanel } from "@/components/equipment-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { evaluateRun, parseUserCount, parseUserNumber, type RuleNumbers } from "@/lib/evaluate";
import { FILE_NAME_CHECKBOX_LABEL, parseRunFileName } from "@/lib/filename-details";
import { readLabFile, type LabFileRead } from "@/lib/lab-file";
import { decideRetention, formatPercentB, type RetentionDecision, type RetentionSample } from "@/lib/retention";
import { emptyRuleInputs, emptyRunDetails, type RuleInputs, type RunDetails } from "@/lib/run-details";
import {
  LIGANDS,
  SOLVENTS,
  efficiencyAsk,
  findSolvent,
  planHistory,
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

const sections = [
  { id: "decision-engine", label: "Decision engine" },
  { id: "equipment", label: "Equipment" },
  { id: "about", label: "About" },
] as const;

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
  const [declinedThrough, setDeclinedThrough] = useState<number | null>(null);
  const [leftSelectivity, setLeftSelectivity] = useState(false);
  const [tempPathByRun, setTempPathByRun] = useState<Record<number, TempPath>>({});
  const [hoveredRun, setHoveredRun] = useState<number | null>(null);
  const [fillFromFileName, setFillFromFileName] = useState(false);
  const [fileNameNote, setFileNameNote] = useState<string | null>(null);
  const detailsRef = useRef(details);
  const fillFromFileNameRef = useRef(fillFromFileName);
  detailsRef.current = details;
  fillFromFileNameRef.current = fillFromFileName;

  const checks = useMemo(() => toRuleNumbers(rules), [rules]);
  const syncedRuns = syncNextRun(runs, details, checks, leftSelectivity);
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
        percentEdited: path === "heat",
        temperatureEdited: true,
        solventEdited: path === "heat",
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
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
      {section === "about" ? (
        <div className="md:hidden">
          <Button type="button" variant="outline" className="h-10 px-3" onClick={() => setNavOpen(true)}>
            Sections
          </Button>
        </div>
      ) : null}

      {section === "equipment" ? <EquipmentPanel onOpenNav={() => setNavOpen(true)} /> : null}

      {section === "decision-engine" ? (
      <>
      <header className="mb-5">
        <div className="mb-3 md:hidden">
          <Button type="button" variant="outline" className="h-10 px-3" onClick={() => setNavOpen(true)}>
            Sections
          </Button>
        </div>
        <p className="text-xs tracking-[0.16em] text-[#0f6b56] uppercase">Composite sample</p>
        <h1 className="mt-1 font-heading text-3xl text-foreground sm:text-4xl">HPLC run check</h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          See whether this chromatogram meets the rules you set. While retention or selectivity is
          the step, the page says what to change next.
        </p>
      </header>
      <Tabs
        value={String(shown)}
        onValueChange={(value) => {
          const index = Number(value);
          if (index >= 0 && index < syncedRuns.length) setActive(index);
        }}
      >
        <div id="run-tabs" className="sticky top-0 z-20 -mx-4 mb-5 bg-background/95 px-4 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="overflow-x-auto py-1">
            <TabsList className="h-auto! w-max min-w-0 items-stretch justify-start gap-2 rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-auto!">
              {syncedRuns.map((_, index) => (
                <TabsTrigger
                  key={index}
                  value={String(index)}
                  className="h-10! flex-none! rounded-md border border-solid px-4 text-sm shadow-none! transition-none! after:hidden!"
                  style={runTabStyle(index === shown, hoveredRun === index)}
                  onMouseEnter={() => setHoveredRun(index)}
                  onMouseLeave={() => setHoveredRun((current) => (current === index ? null : current))}
                >
                  Run {index + 1}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        {syncedRuns.map((run, index) => (
          <TabsContent key={index} value={String(index)} className="flex flex-col gap-5">
            <RunPane
              index={index}
              run={run}
              runs={syncedRuns}
              details={details}
              rules={rules}
              checks={checks}
              onDetails={onDetails}
              onRules={setRules}
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
              declinedThrough={declinedThrough}
              leftSelectivity={leftSelectivity}
              onDecline={(multiple) => setDeclinedThrough(multiple)}
              onLeave={() => setLeftSelectivity(true)}
              fillFromFileName={fillFromFileName}
              fileNameNote={fileNameNote}
              onToggleFillFromFileName={onToggleFillFromFileName}
            />
          </TabsContent>
        ))}
      </Tabs>
      <footer className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
        Work for Logan Klat.
      </footer>
      </>
      ) : null}
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
            className="rounded-lg border border-solid px-3 py-2 text-left text-sm transition-none"
            style={sectionTabStyle(selected, hovered === item.id)}
            onMouseEnter={() => setHovered(item.id)}
            onMouseLeave={() => setHovered((current) => (current === item.id ? null : current))}
            onClick={() => onSelect(item.id)}
          >
            {item.label}
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
  onDetails,
  onRules,
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
  declinedThrough,
  leftSelectivity,
  onDecline,
  onLeave,
  fillFromFileName,
  fileNameNote,
  onToggleFillFromFileName,
}: {
  index: number;
  run: RunState;
  runs: RunState[];
  details: RunDetails;
  rules: RuleInputs;
  checks: RuleNumbers;
  onDetails: (details: RunDetails) => void;
  onRules: (rules: RuleInputs) => void;
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
  declinedThrough: number | null;
  leftSelectivity: boolean;
  onDecline: (multiple: number) => void;
  onLeave: () => void;
  fillFromFileName: boolean;
  fileNameNote: string | null;
  onToggleFillFromFileName: (checked: boolean) => void;
}) {
  if (run.afterRetention) {
    const prior = index > 0 ? explainRun(runs, index - 1, details, checks) : null;
    return <LaterChangeNote decision={prior?.kind === "retention" ? prior.decision : null} />;
  }

  const explanation = explainRun(runs, index, details, checks);
  const rows = run.read ? evaluateRun(run.read, checks) : null;
  const next = runs[index + 1];
  const selectivity = explanation?.kind === "selectivity" ? explanation.plan : null;
  const ask =
    !leftSelectivity && run.status === "ready" && run.read
      ? efficiencyAsk({
          peakCount: run.read.peakCount,
          foundResolution: run.read.minResolutionExcludingFirst,
          requiredPeaks: checks.requiredPeaks,
          minResolution: checks.minResolution,
          declinedThrough,
          lastPeakTimeMin: run.read.lastPeakTimeMin,
          specifiedRunTimeMin: checks.lastPeakTimeMin,
          maxBackPressurePsi: run.read.maxBackPressurePsi,
          maxBackPressureSpec: checks.maxBackPressurePsi,
        })
      : null;

  return (
    <>
      {index === 0 && run.status === "empty" ? (
        <StartHighBNote />
      ) : null}
      {index === 0 ? (
        <RunForm details={details} rules={rules} onDetails={onDetails} onRules={onRules} />
      ) : (
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
            {leftSelectivity ? (
              <LeaveSelectivityDone duringRetention={explanation?.kind === "retention"} />
            ) : ask ? (
              <LeaveSelectivityAsk
                ask={ask}
                onYes={onLeave}
                onNo={() => onDecline(ask.multiple)}
              />
            ) : (
              <>
                {explanation?.kind === "retention" ? <RetentionDecisionView decision={explanation.decision} /> : null}
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
  );
  if (history.phase === "selectivity") return { kind: "selectivity", plan: history.plan };
  const segment = prefix.slice(history.segmentStart);
  return { kind: "retention", decision: decideRetention(segment.map(toSample), checks) };
}

function syncNextRun(
  runs: RunState[],
  details: RunDetails,
  checks: RuleNumbers,
  leftSelectivity: boolean,
): RunState[] {
  const count = readyPrefix(runs);
  if (leftSelectivity) {
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
  );
  const next = runs[count];
  const prefill = prefillFor(ready, history, details, checks);

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
): SelectivityPrefill | null {
  if (history.phase === "selectivity") {
    return history.plan.status === "recommend" ? history.plan.prefill : null;
  }
  const decision = decideRetention(ready.slice(history.segmentStart).map(toSample), checks);
  if (decision.status !== "recommend" || decision.nextPercentB == null) return null;
  const lastIndex = ready.length - 1;
  const inherited = inheritedConditions(ready[lastIndex], lastIndex, details);
  return {
    percentB: formatPercentB(decision.nextPercentB),
    temperature: inherited.temperature,
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
  };
}

function toRuleNumbers(rules: RuleInputs): RuleNumbers {
  return {
    requiredPeaks: parseUserCount(rules.requiredPeaks),
    lastPeakTimeMin: parseUserNumber(rules.lastPeakTimeMin),
    minResolution: parseUserNumber(rules.minResolution),
    maxBackPressurePsi: parseUserNumber(rules.maxBackPressurePsi),
  };
}

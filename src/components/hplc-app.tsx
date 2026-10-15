"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, Gauge, GitBranch, Info, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sliders, Sun, TableProperties, Trash2, UploadCloud, type LucideIcon } from "lucide-react";
import { RunDataPanel } from "@/components/run-data-panel";
import { FileDrop, type DroppedFile } from "@/components/file-drop";
import { AboutPanel } from "@/components/about-panel";
import { SettingsPanel } from "@/components/settings-panel";
import { BackwardsChoiceButtons, BackwardsRetentionView, EfficiencyChoiceButtons, EfficiencyChoiceView, LeaveSelectivityAsk, LeaveSelectivityButtons, LeaveSelectivityDone } from "@/components/leave-selectivity";
import { LookAtRuns, PickRunToHeatControls, type AlignedRunTrace } from "@/components/look-at-runs";
import { MethodProgress } from "@/components/method-progress";
import { LaterChangeNote, PercentChoiceButtons, PickOwnPercent, RetentionDecisionView, SecondPercentChoice, SingleRunCloseToSpecChoices, StartHighBNote } from "@/components/retention-decision";
import { ResultsPanel } from "@/components/results-panel";
import { RunForm } from "@/components/run-form";
import { SelectivityDecisionView, SelectivityNextControls, selectivityShowsChoices } from "@/components/selectivity-decision";
import { type ColumnRunTrace } from "@/components/column-diagram";
import { EquipmentPanel } from "@/components/equipment-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { evaluateRun, parseUserCount, parseUserNumber, type RuleNumbers } from "@/lib/evaluate";
import { detailsFromFileNameIfEnabled, parseInjectionNumber, parseRunFileName, sortFilesByInjection } from "@/lib/filename-details";
import { type LabFileRead } from "@/lib/lab-file";
import {
  decideRetention,
  findBackwardsRetention,
  formatPercentB,
  seriesWhileHeld,
  type BackwardsPair,
  type RetentionChoice,
  type RetentionDecision,
  type RetentionSample,
} from "@/lib/retention";
import { coatingsFromColumns, columnKey, isUltraColumn, parseColumnSpec, ultraOnlyPick, type ColumnSpec, type SizePick } from "@/lib/column-catalog";
import { SHEET_COLUMNS } from "@/lib/sheet-columns";
import { emptyRuleInputs, emptyRunDetails, type RuleInputs, type RunDetails } from "@/lib/run-details";
import {
  coatingSegmentStart,
  findSolvent,
  isRunInSelectivity,
  planHistory,
  type HeatStart,
  solventChoicePercent,
  type SelectivityPlan,
  type SelectivityPrefill,
  type SelectivityRun,
  type TempPath,
} from "@/lib/selectivity";
import {
  nextRunLockedForLigand,
  nextRunLockedForSolvent,
  NO_CHANGE_YET,
  retentionChangeLabel,
  selectivityChangeLabel,
} from "@/lib/change-label";
import { MENU_SOLVENTS, solventKey } from "@/lib/solvent-menu";
import { methodStageFromLatest, type MethodStage } from "@/lib/method-stage";

import { DECISION_EXAMPLE_FILES, EXAMPLE_RULES } from "@/lib/decision-example";

import { readLabFileAsync } from "@/lib/read-lab-file-async";

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

export type RunState = {
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

export function emptyRun(): RunState {
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

const sections: readonly { id: "decision-engine" | "run-data" | "equipment" | "settings" | "about"; label: string; icon: LucideIcon }[] = [
  { id: "decision-engine", label: "Decision engine", icon: GitBranch },
  { id: "run-data", label: "Run data", icon: TableProperties },
  { id: "equipment", label: "Equipment", icon: Gauge },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "about", label: "About", icon: Info },
];

export function pickRest(details: RunDetails): RestDetails {
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
  if (rest.sampleType === "BLANK") {
    rest.sampleType = "CP";
    if (!rest.sampleConcentration || Number(rest.sampleConcentration) === 0) {
      rest.sampleConcentration = "0.1";
    }
  }
  for (let i = 1; i < index; i++) {
    const over = runs[i]?.rest;
    if (!over) continue;
    applyRest(rest, over);
    if (over.sampleType === "BLANK") {
      rest.sampleType = "CP";
      if (!rest.sampleConcentration || Number(rest.sampleConcentration) === 0) {
        rest.sampleConcentration = "0.1";
      }
    }
  }
  return rest;
}

function columnMatches(details: RunDetails, spec: ColumnSpec): boolean {
  const pore = spec.poreA == null ? "" : String(spec.poreA);
  const core = spec.coreShell ?? "";
  const carbon = spec.carbonLoad == null ? "" : String(spec.carbonLoad);
  return (
    details.ligand === spec.coating &&
    details.lengthMm === String(spec.lengthMm) &&
    details.diameterMm === String(spec.diameterMm) &&
    details.particleSize === String(spec.particleUm) &&
    (details.poreSize === pore || details.poreSize === "") &&
    (details.coreShell === core || details.coreShell === "") &&
    (details.carbonLoad === carbon || details.carbonLoad === "")
  );
}

function clearColumn(details: RunDetails): RunDetails {
  return {
    ...details,
    ligand: "",
    lengthMm: "",
    diameterMm: "",
    particleSize: "",
    poreSize: "",
    coreShell: "",
    carbonLoad: "",
  };
}

function sizePickOf(details: RunDetails): SizePick {
  return {
    coating: details.ligand,
    lengthMm: details.lengthMm,
    diameterMm: details.diameterMm,
    particleUm: details.particleSize,
    poreA: details.poreSize,
    coreShell: details.coreShell,
    carbonLoad: details.carbonLoad,
  };
}

/** A file name or a menu cannot leave the run on a column that is Ultra. */
function withoutUltraColumn(details: RunDetails, list: readonly ColumnSpec[]): RunDetails {
  return ultraOnlyPick(list, sizePickOf(details)) ? clearColumn(details) : details;
}

export function detailsForRun(index: number, runs: RunState[], base: RunDetails): RunDetails {
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

export function isBlankRun(index: number, runs: RunState[], details: RunDetails): boolean {
  const run = runs[index];
  if (!run) return false;
  const info = detailsForRun(index, runs, details);
  if (info.sampleType === "BLANK") return true;
  if (info.sampleType === "CP") return false;
  if (run.fileName) {
    const parsed = parseRunFileName(run.fileName);
    if (parsed.ok && parsed.fields.sampleType === "BLANK") return true;
  }
  return false;
}

function activeIndicesUpTo(runs: RunState[], maxIndex: number, details: RunDetails): number[] {
  const indices: number[] = [];
  const limit = Math.min(maxIndex, runs.length - 1);
  for (let i = 0; i <= limit; i++) {
    if (runs[i]?.status === "ready" && runs[i]?.read && !isBlankRun(i, runs, details)) {
      indices.push(i);
    }
  }
  return indices;
}

function activePosAt(runs: RunState[], index: number, details: RunDetails): number {
  return activeIndicesUpTo(runs, index, details).length - 1;
}

function lastNonBlankBefore(index: number, runs: RunState[], details: RunDetails): number | null {
  for (let i = index - 1; i >= 0; i--) {
    if (!isBlankRun(i, runs, details)) return i;
  }
  return null;
}

function percentWords(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "%B";
  const value = parseUserNumber(trimmed);
  return value == null ? `${trimmed}% B` : `${formatPercentB(value)}% B`;
}

function degreeWords(text: string): string {
  const trimmed = text.trim().replace(/°\s*C$/i, "");
  if (!trimmed) return "°C";
  if (/^(amb|ambient)$/i.test(trimmed)) return "ambient";
  return `${trimmed}°C`;
}

/** Short name for the decision that opened this run. Run 1 is only its %B. */
export function runTabLabel(
  index: number,
  runs: RunState[],
  details: RunDetails,
  checks: RuleNumbers,
  options: {
    choice: RetentionChoice;
    heat: HeatStart | null;
    continued: Record<number, boolean>;
    ligands?: readonly string[];
  },
): string {
  if (index <= 0) {
    const pct = percentWords(details.percentB || runs[0]?.percentB || "");
    if (isBlankRun(0, runs, details)) {
      return pct === "%B" ? "Run 1: Blank" : `Run 1: Blank (${pct})`;
    }
    return `Run 1: ${pct}`;
  }
  if (isBlankRun(index, runs, details)) {
    const fallback = openedRunFallback(index, runs, details);
    return fallback === "%B" ? `Run ${index + 1}: Blank` : `Run ${index + 1}: Blank (${fallback})`;
  }
  if (runs[index]?.status === "ready") return `Run ${index + 1}: ${openedRunFallback(index, runs, details)}`;
  const prevActivePos = activePosAt(runs, index - 1, details);
  const inSelectivity = isSelectivityAt(runs, index - 1, details);
  const segStart = segmentStartAt(runs, index - 1, details);
  const flags = selectivityFlags(prevActivePos, options.heat, options.continued, inSelectivity, segStart);
  const explanation = explainRun(runs, index - 1, details, checks, {
    choice: options.choice,
    heat: options.heat,
    continuePastEfficiency: flags.continuePast,
    continueToLook: flags.continueToLook,
    ligands: options.ligands,
  });
  const named = explanation ? decisionTabLabel(explanation, runs[index]) : null;
  return `Run ${index + 1}: ${named ?? openedRunFallback(index, runs, details)}`;
}

function decisionTabLabel(explanation: Explanation, run: RunState | undefined): string | null {
  if (explanation.kind === "retention") {
    const decision = explanation.decision;
    if (decision.reason === "choose-percent") {
      const percent = run?.percentB?.trim();
      const temp = run?.temperature?.trim();
      if (percent) {
        return temp === "40" ? `40°C at ${percentWords(percent)}` : percentWords(percent);
      }
      return "choose %B";
    }
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
  const prevIndex = isBlankRun(index, runs, details)
    ? index - 1
    : (lastNonBlankBefore(index, runs, details) ?? index - 1);
  const prev = runs[prevIndex];
  const prevTemp = (prevIndex <= 0 ? details.temperature : prev?.temperature || details.temperature).trim();
  const prevSolvent = (prevIndex <= 0 ? details.solvent : prev?.solvent || details.solvent).trim();
  const prevLigand = (prevIndex <= 0 ? details.ligand : prev?.ligand || details.ligand).trim();
  const changes: string[] = [];
  if (run.ligand.trim() && run.ligand.trim() !== prevLigand) changes.push(run.ligand.trim());
  if (run.solvent.trim() && run.solvent.trim() !== prevSolvent) changes.push(run.solvent.trim());
  if (run.temperature.trim() && run.temperature.trim() !== prevTemp) changes.push(degreeWords(run.temperature));
  if (changes.length) return [percentWords(run.percentB), ...changes].join(" · ");
  if (run.percentB.trim()) return percentWords(run.percentB);
  return "%B";
}

function runTabStyle(selected: boolean, hovered: boolean): CSSProperties {
  if (selected && hovered) {
    return { backgroundColor: "var(--hp-soft-3)", borderColor: "var(--hp-brand-strong)", color: "var(--hp-ink)", fontWeight: 600 };
  }
  if (selected) {
    return { backgroundColor: "var(--hp-soft-2)", borderColor: "var(--hp-brand)", color: "var(--hp-ink)", fontWeight: 600 };
  }
  if (hovered) {
    return { backgroundColor: "var(--hp-gold-soft)", borderColor: "var(--hp-gold)", color: "var(--hp-gold-ink)", fontWeight: 600 };
  }
  return {
    backgroundColor: "var(--background)",
    borderColor: "var(--border)",
    color: "var(--foreground)",
    fontWeight: 500,
  };
}

export function HplcApp() {
  const [exampleStatus, setExampleStatus] = useState<"loading" | "loaded" | "fresh" | "error">("loading");
  const [exampleError, setExampleError] = useState<string | null>(null);
  const exampleAbort = useRef<AbortController | null>(null);
  const readGeneration = useRef(0);
  const uploadControllers = useRef(new Map<number, AbortController>());
  useEffect(() => {
    const controllers = uploadControllers.current;
    return () => { controllers.forEach((controller) => controller.abort()); controllers.clear(); };
  }, []);

  const [active, setActive] = useState(0);
  const [section, setSection] = useState<(typeof sections)[number]["id"]>("decision-engine");
  const [details, setDetails] = useState<RunDetails>(emptyRunDetails);
  const [rules, setRules] = useState<RuleInputs>(emptyRuleInputs);
  const [runs, setRuns] = useState<RunState[]>([emptyRun()]);
  const [declinedEfficiencyNow, setDeclinedEfficiencyNow] = useState(false);
  const [retentionContinuedAt, setRetentionContinuedAt] = useState<number | null>(null);
  const [efficiencyChosen, setEfficiencyChosen] = useState(false);
  const [continuedSelectivity, setContinuedSelectivity] = useState<Record<number, boolean>>({});
  const [heatChoice, setHeatChoice] = useState<HeatStart | null>(null);
  const [backwardsChoice, setBackwardsChoice] = useState<"continue" | "redo" | null>(null);
  const [leftSelectivity, setLeftSelectivity] = useState(false);
  const [tempPathByRun, setTempPathByRun] = useState<Record<number, TempPath>>({});
  const [hoveredRun, setHoveredRun] = useState<number | null>(null);
  // Each run owns a panel, so switching runs mounts a new copy of the list.
  // Keep its position at the session level and restore it before paint.
  const runListScroll = useRef({ top: 0, left: 0 });
  const restoreRunListVertical = useCallback((node: HTMLDivElement | null) => {
    if (node) node.scrollTop = runListScroll.current.top;
  }, []);
  const restoreRunListHorizontal = useCallback((node: HTMLDivElement | null) => {
    if (node) node.scrollLeft = runListScroll.current.left;
  }, []);
  const [linePercent, setLinePercent] = useState<number | null>(null);
  const [pickedPercent, setPickedPercent] = useState<number | null>(null);
  const [intermediateMode, setIntermediateMode] = useState<"yes" | "no" | null>(null);
  const reportLinePercent = useCallback((percent: number | null) => {
    setLinePercent((current) => (current === percent ? current : percent));
  }, []);
  const [columns, setColumns] = useState<ColumnSpec[]>(() => [...SHEET_COLUMNS]);
  const [solvents, setSolvents] = useState<string[]>(() => [...MENU_SOLVENTS]);
  const [fillFromFileName, setFillFromFileName] = useState(true);
  const [fileNameNotes, setFileNameNotes] = useState<Record<number, string | null>>({});
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  useEffect(() => {
    try {
      const savedCollapsed = localStorage.getItem("hplc-sidebar-collapsed");
      if (savedCollapsed === "true") {
        setIsSidebarCollapsed(true);
      }
    } catch {}
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("hplc-sidebar-collapsed", String(next));
      } catch {}
      return next;
    });
  }, []);
  const detailsRef = useRef(details);
  const runsRef = useRef(runs);
  detailsRef.current = details;
  runsRef.current = runs;
  const columnCoatings = useMemo(() => coatingsFromColumns(columns), [columns]);

  useEffect(() => {
    const controller = new AbortController();
    exampleAbort.current = controller;
    async function loadExample() {
      try {
        // These results are generated with readLabFile from the bundled originals.
        // Avoid parsing large Excel workbooks on the UI thread during startup.
        const response = await fetch("/decision-example/results.json", { signal: controller.signal });
        if (!response.ok) throw new Error("Could not load the example. Start fresh to upload your own files.");
        const results: { fileName: string; read: LabFileRead }[] = await response.json();
        const loaded = DECISION_EXAMPLE_FILES.map((fileName) => {
          const read = results.find((item) => item.fileName === fileName)?.read;
          if (!read) throw new Error(`Missing example results for ${fileName}.`);
          if (read.blockingMessage) throw new Error(`${fileName}: ${read.blockingMessage}`);
          const parsed = parseRunFileName(fileName);
          if (!parsed.ok) throw new Error(`Could not read conditions from ${fileName}.`);
          const info = { ...emptyRunDetails(), ...parsed.fields };
          return { info, run: {
            ...emptyRun(), percentB: info.percentB, temperature: info.temperature,
            solvent: info.solvent, ligand: info.ligand, rest: pickRest(info),
            percentEdited: true, temperatureEdited: true, solventEdited: true, ligandEdited: true,
            status: "ready" as const, fileName, read,
          } };
        });
        if (controller.signal.aborted) return;
        setDetails(loaded[0].info);
        setRules({ ...EXAMPLE_RULES });
        setRuns(loaded.map((item) => item.run));
        setFillFromFileName(true);
        setExampleStatus("loaded");
      } catch (error) {
        if (controller.signal.aborted) return;
        setExampleError(error instanceof Error ? error.message : "Could not load the example.");
        setExampleStatus("error");
      }
    }
    void loadExample();
    return () => controller.abort();
  }, []);

  function startFresh() {
    exampleAbort.current?.abort();
    readGeneration.current += 1;
    uploadControllers.current.forEach((controller) => controller.abort());
    uploadControllers.current.clear();
    setExampleStatus("fresh");
    setExampleError(null);
    setActive(0);
    setDetails(emptyRunDetails());
    setRules(emptyRuleInputs());
    setRuns([emptyRun()]);
    setDeclinedEfficiencyNow(false);
    setRetentionContinuedAt(null);
    setEfficiencyChosen(false);
    setContinuedSelectivity({});
    setHeatChoice(null);
    setBackwardsChoice(null);
    setLeftSelectivity(false);
    setTempPathByRun({});
    setHoveredRun(null);
    runListScroll.current = { top: 0, left: 0 };
    setLinePercent(null);
    setPickedPercent(null);
    setIntermediateMode(null);
    setFileNameNotes({});
    setFillFromFileName(true);
    setIsWindowDragging(false);
    dragCounter.current = 0;
  }

  const [isWindowDragging, setIsWindowDragging] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    function onGlobalDrop() {
      setIsWindowDragging(false);
      dragCounter.current = 0;
    }
    function onGlobalDragLeave(e: DragEvent) {
      if (
        e.clientX <= 0 ||
        e.clientY <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight ||
        !e.relatedTarget
      ) {
        setIsWindowDragging(false);
        dragCounter.current = 0;
      }
    }
    function onGlobalDragEnd() {
      setIsWindowDragging(false);
      dragCounter.current = 0;
    }

    window.addEventListener("drop", onGlobalDrop, true);
    window.addEventListener("dragleave", onGlobalDragLeave, true);
    window.addEventListener("dragend", onGlobalDragEnd, true);
    return () => {
      window.removeEventListener("drop", onGlobalDrop, true);
      window.removeEventListener("dragleave", onGlobalDragLeave, true);
      window.removeEventListener("dragend", onGlobalDragEnd, true);
    };
  }, []);

  function handleWindowDragEnter(event: React.DragEvent) {
    if (event.dataTransfer?.types?.includes("Files")) {
      event.preventDefault();
      dragCounter.current += 1;
      setIsWindowDragging(true);
    }
  }

  function handleWindowDragOver(event: React.DragEvent) {
    if (event.dataTransfer?.types?.includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function handleWindowDragLeave(event: React.DragEvent) {
    if (event.dataTransfer?.types?.includes("Files")) {
      event.preventDefault();
      const related = event.relatedTarget;
      if (!related || (related instanceof Node && !event.currentTarget.contains(related))) {
        dragCounter.current = 0;
        setIsWindowDragging(false);
        return;
      }
      dragCounter.current = Math.max(0, dragCounter.current - 1);
      if (dragCounter.current === 0) {
        setIsWindowDragging(false);
      }
    }
  }

  async function handleWindowDrop(event: React.DragEvent) {
    event.preventDefault();
    dragCounter.current = 0;
    setIsWindowDragging(false);
    const fileList = event.dataTransfer?.files;
    if (!fileList || fileList.length === 0) return;

    const validFiles: DroppedFile[] = [];
    for (const file of Array.from(fileList)) {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".csv") && !lower.endsWith(".txt") && !lower.endsWith(".xlsx")) continue;
      if (file.size === 0) continue;
      try {
        const buffer = await file.arrayBuffer();
        validFiles.push({ fileName: file.name, buffer });
      } catch {
        // ignore unreadable files
      }
    }

    if (validFiles.length > 0) {
      void acceptBatch(shown, validFiles);
    }
  }

  const checks = useMemo(() => toRuleNumbers(rules), [rules]);
  const backwards = useMemo(() => backwardsOnPage(runs, details), [runs, details]);
  const backwardsKey = backwards
    ? `${backwards.higherPercentB}|${backwards.higherLastMin}|${backwards.lowerPercentB}|${backwards.lowerLastMin}`
    : "";
  const [seenBackwards, setSeenBackwards] = useState(backwardsKey);
  if (seenBackwards !== backwardsKey) {
    setSeenBackwards(backwardsKey);
    setBackwardsChoice(null);
  }
  const choice = useMemo<RetentionChoice>(
    () => ({
      declinedEfficiencyNow,
    }),
    [declinedEfficiencyNow],
  );
  const readyCount = readyPrefix(runs);
  const activeCount = activeIndicesUpTo(runs, readyCount - 1, details).length;
  const latestActivePos = activeCount - 1;
  const [seenReady, setSeenReady] = useState(activeCount);
  if (seenReady !== activeCount) {
    setSeenReady(activeCount);
    setPickedPercent(null);
    setIntermediateMode(null);
  }
  const continueRetention = retentionContinuedAt != null && retentionContinuedAt === latestActivePos;
  const latestInSelectivity = isSelectivityAt(runs, readyCount - 1, details);
  const latestSegStart = segmentStartAt(runs, readyCount - 1, details);
  const latestFlags = selectivityFlags(latestActivePos, heatChoice, continuedSelectivity, latestInSelectivity, latestSegStart);
  const syncedRuns = syncNextRun(runs, details, checks, {
    leftSelectivity: leftSelectivity || efficiencyChosen,
    choice: { ...choice, continueToLook: latestFlags.continueToLook, continueRetention },
    heat: heatChoice,
    continuePastEfficiency: latestFlags.continuePast,
    linePercent,
    pickedPercent,
    intermediateMode,
    holdNext: backwards != null && backwardsChoice !== "continue",
    ligands: columnCoatings,
  });
  if (syncedRuns !== runs) {
    setRuns(syncedRuns);
  }
  const columnRuns = useMemo<ColumnRunTrace[]>(() => {
    return syncedRuns.flatMap((run, index) => {
      if (run.status !== "ready" || !run.read?.chromatogram || run.read.chromatogramMissingMessage) return [];
      const info = detailsForRun(index, syncedRuns, details);
      const parsed = fillFromFileName && run.fileName ? parseRunFileName(run.fileName) : null;
      const named = parsed?.ok ? parsed.fields : {};
      const lengthMm = parseUserNumber(info.lengthMm) ?? parseUserNumber(named.lengthMm ?? "") ?? 150;
      const widthMm = parseUserNumber(info.diameterMm) ?? parseUserNumber(named.diameterMm ?? "") ?? 4.6;
      return [
        {
          id: `run-${index}`,
          tabLabel: runTabLabel(index, syncedRuns, details, checks, {
            choice: { ...choice, continueRetention },
            heat: heatChoice,
            continued: continuedSelectivity,
            ligands: columnCoatings,
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
  }, [syncedRuns, details, checks, choice, continueRetention, heatChoice, continuedSelectivity, columnCoatings, fillFromFileName]);
  const shown = Math.min(active, Math.max(0, syncedRuns.length - 1));

  function onDetails(next: RunDetails) {
    next = withoutUltraColumn(next, columns);
    setDetails(next);
    setRuns((current) => {
      if (current[0].percentB === next.percentB) return current;
      const copy = current.slice();
      copy[0] = { ...copy[0], percentB: next.percentB, percentEdited: true };
      return copy;
    });
  }

  function onShownDetails(next: RunDetails) {
    next = withoutUltraColumn(next, columns);
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
      const slot = current[index]?.status === "empty" ? index : readyPrefix(current);
      if (!current[slot]) return current;
      const copy = current.slice();
      copy[slot] = { ...copy[slot], ligand: value, ligandEdited: true };
      return copy;
    });
  }

  function chooseTempPath(decisionIndex: number, path: TempPath) {
    const activePos = activePosAt(runsRef.current, decisionIndex, detailsRef.current);
    const key = activePos >= 0 ? activePos : decisionIndex;
    setTempPathByRun((current) => ({ ...current, [key]: path }));
    setRuns((current) => {
      const count = readyPrefix(current);
      const activeIdx = activeIndicesUpTo(current, count - 1, detailsRef.current);
      if (activeIdx.length === 0) return current;
      const firstActive = detailsForRun(activeIdx[0], current, detailsRef.current);
      const inSel = isSelectivityAt(current, count - 1, detailsRef.current);
      const segStart = segmentStartAt(current, count - 1, detailsRef.current);
      const history = planHistory(
        activeIdx.map((runIndex) => toSelectivityRun(current[runIndex], runIndex, detailsRef.current)),
        setupFrom(firstActive, checks),
        {
          heat: heatChoice,
          continuePastEfficiency: selectivityFlags(activeIdx.length - 1, heatChoice, continuedSelectivity, inSel, segStart).continuePast,
          ligands: columnCoatings,
        },
      );
      const choice = history.phase === "selectivity" ? history.plan.tempChoice : null;
      if (!choice) return current;
      const prefill = path === "heat" ? choice.heatPrefill : choice.solventPrefill;
      const copy = current.slice();
      const slot = copy[decisionIndex + 1]?.status === "empty" ? decisionIndex + 1 : count;
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

  function chooseNextSolvent(index: number, solventLabel: string) {
    setRuns((current) => {
      const count = readyPrefix(current);
      const activeIdx = activeIndicesUpTo(current, count - 1, details);
      if (activeIdx.length === 0) return current;
      const firstActive = detailsForRun(activeIdx[0], current, details);
      const inSel = isSelectivityAt(current, count - 1, details);
      const segStart = segmentStartAt(current, count - 1, details);
      const history = planHistory(
        activeIdx.map((runIndex) => toSelectivityRun(current[runIndex], runIndex, details)),
        setupFrom(firstActive, checks),
        {
          heat: heatChoice,
          continuePastEfficiency: selectivityFlags(activeIdx.length - 1, heatChoice, continuedSelectivity, inSel, segStart).continuePast,
          ligands: columnCoatings,
        },
      );
      const chart = findSolvent(solventLabel);
      const matched =
        chart && history.phase === "selectivity" && history.plan.anchorPercentB != null && history.plan.oldSolvent
          ? solventChoicePercent(history.plan.anchorPercentB, history.plan.oldSolvent, chart.id)
          : null;
      const copy = current.slice();
      const slot = copy[index]?.status === "empty" ? index : count;
      const run = copy[slot] ?? emptyRun();
      copy[slot] = {
        ...run,
        solvent: chart?.label ?? solventLabel,
        solventEdited: true,
        percentB: matched ? matched.percentText : "",
        percentEdited: true,
      };
      return copy;
    });
  }

  function addColumn(input: ColumnSpec | string): boolean | "invalid" {
    const parsed = typeof input === "string" ? parseColumnSpec(input) : input;
    if (!parsed) return "invalid";
    if (columns.some((item) => columnKey(item.label) === columnKey(parsed.label))) return false;
    setColumns((current) => [parsed, ...current]);
    return true;
  }

  function removeColumn(label: string) {
    const key = columnKey(label);
    const removed = columns.find((item) => columnKey(item.label) === key);
    setColumns((current) => current.filter((item) => columnKey(item.label) !== key));
    if (!removed) return;
    setDetails((current) => (columnMatches(current, removed) ? clearColumn(current) : current));
    setRuns((current) =>
      current.map((run, index) => {
        const shownDetails = detailsForRun(index, current, detailsRef.current);
        if (!columnMatches(shownDetails, removed)) return run;
        if (index === 0) return { ...run, ligand: "", ligandEdited: true };
        return {
          ...run,
          ligand: "",
          ligandEdited: true,
          rest: { ...run.rest, lengthMm: "", diameterMm: "", particleSize: "", poreSize: "", coreShell: "", carbonLoad: "" },
        };
      }),
    );
  }

  function addSolvent(name: string) {
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (!trimmed || solvents.some((item) => solventKey(item) === solventKey(trimmed))) return false;
    setSolvents((current) => [trimmed, ...current]);
    return true;
  }

  function removeSolvent(name: string) {
    const key = solventKey(name);
    setSolvents((current) => current.filter((item) => solventKey(item) !== key));
    setDetails((current) => (solventKey(current.solvent) === key ? { ...current, solvent: "" } : current));
    setRuns((current) =>
      current.map((run) => (solventKey(run.solvent) === key ? { ...run, solvent: "" } : run)),
    );
  }

  function patchRun(index: number, patch: Partial<RunState>) {
    setRuns((current) => {
      const copy = current.slice();
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  }

  function applyAddedFile(index: number, fileName: string, enabled: boolean) {
    const base = index <= 0 ? detailsRef.current : detailsForRun(index, runsRef.current, detailsRef.current);
    const parsed = detailsFromFileNameIfEnabled(base, fileName, enabled);
    const next = parsed.apply ? { ...parsed, details: withoutUltraColumn(parsed.details, columns) } : parsed;
    if (!next.apply) {
      setFileNameNotes((current) => ({ ...current, [index]: next.note }));
      return;
    }
    setFileNameNotes((current) => ({ ...current, [index]: null }));
    if (index <= 0) {
      onDetails(next.details);
      setRuns((current) => {
        const run = current[0];
        if (!run) return current;
        const copy = current.slice();
        copy[0] = {
          ...run,
          percentB: next.details.percentB,
          percentEdited: true,
          temperature: next.details.temperature,
          temperatureEdited: next.details.temperature.trim() !== "",
          solvent: next.details.solvent,
          solventEdited: next.details.solvent.trim() !== "",
          ligand: next.details.ligand,
          ligandEdited: next.details.ligand.trim() !== "",
        };
        return copy;
      });
      return;
    }
    setRuns((current) => {
      const run = current[index];
      if (!run) return current;
      const rest: RestDetails = {
        coreShell: next.details.coreShell,
        poreSize: next.details.poreSize,
        carbonLoad: next.details.carbonLoad,
        lengthMm: next.details.lengthMm,
        diameterMm: next.details.diameterMm,
        particleSize: next.details.particleSize,
        ph: next.details.ph,
        method: next.details.method,
        flowRate: next.details.flowRate,
        injectionVolume: next.details.injectionVolume,
        sampleType: next.details.sampleType,
        sampleConcentration: next.details.sampleConcentration,
        wavelength: next.details.wavelength,
      };
      const copy = current.slice();
      copy[index] = {
        ...run,
        percentB: next.details.percentB,
        percentEdited: true,
        temperature: next.details.temperature,
        temperatureEdited: true,
        solvent: next.details.solvent,
        solventEdited: true,
        ligand: next.details.ligand,
        ligandEdited: true,
        rest,
      };
      return copy;
    });
  }

  function onToggleFillFromFileName(checked: boolean) {
    setFillFromFileName(checked);
    if (!checked) {
      setFileNameNotes({});
      return;
    }
    runs.forEach((run, index) => {
      if (run.fileName) applyAddedFile(index, run.fileName, true);
    });
  }

  function beginRead(index: number, fileName: string) {
    patchRun(index, { status: "reading", fileName, read: null, message: null });
  }

  function determineTargetStart(
    startIndex: number,
    sortedFiles: DroppedFile[],
    existingRuns: RunState[],
  ): number {
    if (startIndex <= 0 || existingRuns.length === 0 || sortedFiles.length <= 1) return startIndex;

    const firstDropInj = parseInjectionNumber(sortedFiles[0].fileName, sortedFiles[0].buffer);
    if (firstDropInj == null) return startIndex;

    const existingInjections = existingRuns.map((r) =>
      r.fileName ? parseInjectionNumber(r.fileName) : null,
    );

    // If an existing run already has this exact injection number, align with it:
    for (let i = 0; i < existingInjections.length; i++) {
      const exInj = existingInjections[i];
      if (exInj != null && firstDropInj === exInj) {
        return i;
      }
    }

    // If lowest dropped injection is <= the first existing run's injection, reset to 0:
    const firstExistingInj = existingInjections.find((inj): inj is number => inj != null);
    if (firstExistingInj != null && firstDropInj <= firstExistingInj) {
      return 0;
    }

    return startIndex;
  }

  async function acceptBatch(startIndex: number, rawFiles: DroppedFile[]) {
    if (rawFiles.length === 0) return;
    const sortedFiles = sortFilesByInjection(rawFiles);
    const targetStart = determineTargetStart(startIndex, sortedFiles, runsRef.current);

    // Abort existing uploads from targetStart onward
    for (const [runIndex, controller] of uploadControllers.current) {
      if (runIndex >= targetStart) {
        controller.abort();
        uploadControllers.current.delete(runIndex);
      }
    }

    const generation = readGeneration.current;
    const nextRuns = runsRef.current.slice(0, targetStart);
    let currentDetails = detailsRef.current;
    const updatedNotes: Record<number, string | null> = {};

    for (let i = 0; i < sortedFiles.length; i++) {
      const runIdx = targetStart + i;
      const file = sortedFiles[i];

      if (runIdx === 0) {
        if (fillFromFileName) {
          const parsed = detailsFromFileNameIfEnabled(currentDetails, file.fileName, true);
          const next = parsed.apply ? { ...parsed, details: withoutUltraColumn(parsed.details, columns) } : parsed;
          if (next.apply) {
            currentDetails = next.details;
            updatedNotes[0] = null;
            nextRuns[0] = {
              ...emptyRun(),
              status: "reading",
              fileName: file.fileName,
              percentB: next.details.percentB,
              percentEdited: true,
              temperature: next.details.temperature,
              temperatureEdited: next.details.temperature.trim() !== "",
              solvent: next.details.solvent,
              solventEdited: next.details.solvent.trim() !== "",
              ligand: next.details.ligand,
              ligandEdited: next.details.ligand.trim() !== "",
              rest: pickRest(next.details),
            };
          } else {
            updatedNotes[0] = next.note;
            nextRuns[0] = {
              ...emptyRun(),
              status: "reading",
              fileName: file.fileName,
            };
          }
        } else {
          nextRuns[0] = {
            ...emptyRun(),
            status: "reading",
            fileName: file.fileName,
          };
        }
      } else {
        if (fillFromFileName) {
          const inherited = inheritedRest(runIdx, nextRuns, currentDetails);
          const baseForRun: RunDetails = {
            ...currentDetails,
            ...inherited,
          };
          const parsed = detailsFromFileNameIfEnabled(baseForRun, file.fileName, true);
          const next = parsed.apply ? { ...parsed, details: withoutUltraColumn(parsed.details, columns) } : parsed;
          if (next.apply) {
            updatedNotes[runIdx] = null;
            const rest: RestDetails = {
              coreShell: next.details.coreShell,
              poreSize: next.details.poreSize,
              carbonLoad: next.details.carbonLoad,
              lengthMm: next.details.lengthMm,
              diameterMm: next.details.diameterMm,
              particleSize: next.details.particleSize,
              ph: next.details.ph,
              method: next.details.method,
              flowRate: next.details.flowRate,
              injectionVolume: next.details.injectionVolume,
              sampleType: next.details.sampleType,
              sampleConcentration: next.details.sampleConcentration,
              wavelength: next.details.wavelength,
            };
            nextRuns[runIdx] = {
              ...emptyRun(),
              status: "reading",
              fileName: file.fileName,
              percentB: next.details.percentB,
              percentEdited: true,
              temperature: next.details.temperature,
              temperatureEdited: true,
              solvent: next.details.solvent,
              solventEdited: true,
              ligand: next.details.ligand,
              ligandEdited: true,
              rest,
            };
          } else {
            updatedNotes[runIdx] = next.note;
            nextRuns[runIdx] = {
              ...emptyRun(),
              status: "reading",
              fileName: file.fileName,
            };
          }
        } else {
          nextRuns[runIdx] = {
            ...emptyRun(),
            status: "reading",
            fileName: file.fileName,
          };
        }
      }
    }

    if (targetStart === 0 && fillFromFileName) {
      onDetails(currentDetails);
    }
    setFileNameNotes((curr) => ({ ...curr, ...updatedNotes }));
    setRuns(nextRuns);
    setActive(targetStart + sortedFiles.length - 1);

    // Set up AbortControllers for each run in the batch
    sortedFiles.forEach((_, i) => {
      const runIdx = targetStart + i;
      const controller = new AbortController();
      uploadControllers.current.set(runIdx, controller);
    });

    // Start all workers in parallel
    const parsePromises = sortedFiles.map((file, i) => {
      const runIdx = targetStart + i;
      const controller = uploadControllers.current.get(runIdx)!;
      return readLabFileAsync(file.buffer, controller.signal)
        .then((read) => ({ runIdx, fileName: file.fileName, read, error: null }))
        .catch((error) => ({
          runIdx,
          fileName: file.fileName,
          read: null,
          error: error instanceof Error ? error.message : "This file could not be read.",
        }));
    });

    // Resolve in order to ensure monotonically increasing ready prefix
    for (let i = 0; i < parsePromises.length; i++) {
      const result = await parsePromises[i];
      if (generation !== readGeneration.current) return;
      const controller = uploadControllers.current.get(result.runIdx);
      if (controller?.signal.aborted) return;

      if (uploadControllers.current.get(result.runIdx) === controller) {
        uploadControllers.current.delete(result.runIdx);
      }

      if (result.error || result.read?.blockingMessage) {
        patchRun(result.runIdx, {
          status: "error",
          fileName: result.fileName,
          read: null,
          message: result.error ?? result.read?.blockingMessage ?? "This file could not be read.",
        });
        setActive(result.runIdx);
        for (let j = i + 1; j < parsePromises.length; j++) {
          const remIdx = targetStart + j;
          uploadControllers.current.get(remIdx)?.abort();
          uploadControllers.current.delete(remIdx);
        }
        break;
      } else {
        patchRun(result.runIdx, {
          status: "ready",
          fileName: result.fileName,
          read: result.read,
          message: null,
        });
      }
    }
  }

  async function acceptBuffer(index: number, fileName: string, buffer: ArrayBuffer) {
    await acceptBatch(index, [{ fileName, buffer }]);
  }

  function acceptProblem(index: number, fileName: string, message: string) {
    patchRun(index, { status: "error", fileName, read: null, message });
  }

  function removeFile(index: number) {
    for (const [runIndex, controller] of uploadControllers.current) {
      if (runIndex >= index) { controller.abort(); uploadControllers.current.delete(runIndex); }
    }
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

  const sessionStage = sessionMethodStage(syncedRuns, details, checks, {
    leftSelectivity: leftSelectivity || efficiencyChosen,
    choice: { ...choice, continueToLook: latestFlags.continueToLook, continueRetention },
    heat: heatChoice,
    continuePastEfficiency: latestFlags.continuePast,
    continueToLook: latestFlags.continueToLook,
    ligands: columnCoatings,
  });

  return (
    <div
      className="relative flex h-dvh max-h-dvh w-full flex-none flex-col overflow-hidden"
      onDragEnter={handleWindowDragEnter}
      onDragOver={handleWindowDragOver}
      onDragLeave={handleWindowDragLeave}
      onDrop={handleWindowDrop}
    >
      {isWindowDragging ? (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-xs border-4 border-dashed border-[var(--hp-brand)] p-8 text-center animate-in fade-in-0 duration-150"
          onDragOver={handleWindowDragOver}
          onDragLeave={handleWindowDragLeave}
          onDrop={handleWindowDrop}
        >
          <div className="pointer-events-none flex size-20 items-center justify-center rounded-full bg-[var(--hp-soft)] text-[var(--hp-brand)] ring-2 ring-[var(--hp-brand)]/40 mb-4 animate-bounce">
            <UploadCloud className="size-10" aria-hidden="true" />
          </div>
          <h2 className="pointer-events-none font-heading text-2xl font-bold text-foreground">
            Drop LabSolutions files here
          </h2>
          <p className="pointer-events-none max-w-md text-sm text-muted-foreground mt-2">
            Files are automatically ordered by injection number and loaded into your runs.
          </p>
        </div>
      ) : null}
      {/* Topmost Title Bar */}
      <div
        id="top-title-bar"
        className="flex h-8 sm:h-9 shrink-0 items-center justify-between border-b border-border bg-card/90 px-3 sm:px-4 select-none"
      >
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="font-heading text-xs sm:text-sm font-bold tracking-tight text-foreground truncate">
            HPLC run check <span className="font-semibold text-muted-foreground">(composite sample)</span>
          </h1>
          {section === "decision-engine" && (
            <span className="hidden md:inline text-[11px] text-muted-foreground">
              {exampleStatus === "loaded"
                ? `· ${readyCount} runs loaded`
                : exampleStatus === "error"
                  ? `· ${exampleError}`
                  : "· Ready for files"}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle variant="compact" />
          <div className="h-3.5 w-px bg-border/60" aria-hidden="true" />
          <Watermark variant="compact" />
        </div>
      </div>
      <SectionNav section={section} onSelect={setSection} />
      {section === "decision-engine" && exampleStatus === "loading" ? (
        <div className="flex shrink-0 items-center justify-center border-b border-border bg-[var(--hp-soft)] px-4 py-2">
          <p className="text-xs sm:text-sm text-muted-foreground" role="status">Loading 18 example runs…</p>
        </div>
      ) : null}
      {section === "about" || section === "equipment" || section === "settings" || section === "run-data" ? (
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-6 sm:px-6 sm:py-8">
      {section === "about" ? <AboutPanel /> : null}
      {section === "run-data" ? <RunDataPanel
        runs={syncedRuns.map((run, index) => ({ index, label: runTabLabel(index, syncedRuns, details, checks, { choice, heat: heatChoice, continued: continuedSelectivity, ligands: columnCoatings }), fileName: run.fileName, status: run.status, details: detailsForRun(index, syncedRuns, details), read: run.read, message: run.message }))}
        checks={checks}
        onOpen={(index) => { setActive(index); setSection("decision-engine"); }}
      /> : null}
      {section === "equipment" ? (
        <EquipmentPanel columnRuns={columnRuns} ligands={columnCoatings} />
      ) : null}
      {section === "settings" ? (
        <SettingsPanel
          columns={columns.map((column) => ({ ...column, locked: isUltraColumn(column) }))}
          solvents={solvents}
          onAddColumn={addColumn}
          onRemoveColumn={removeColumn}
          onAddSolvent={addSolvent}
          onRemoveSolvent={removeSolvent}
        />
      ) : null}
      </div>
      </div>
      ) : null}

      {section === "decision-engine" && exampleStatus !== "loading" ? (
      <Tabs
        value={String(shown)}
        onValueChange={(value) => {
          const index = Number(value);
          if (index >= 0 && index < syncedRuns.length) setActive(index);
        }}
        className="flex! h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden p-2 sm:p-2.5"
      >
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      <div id="decision-layout" className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden lg:flex-row lg:items-stretch lg:gap-3">
        {/* Minimized Sidebar Rail (Desktop only, when collapsed) */}
        {isSidebarCollapsed ? (
          <div className="hidden lg:flex flex-col items-center border border-border/80 bg-card/60 py-2.5 px-1.5 shrink-0 rounded-xl select-none">
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className="flex size-7 items-center justify-center rounded-md border border-border bg-card text-foreground transition-all hover:border-[var(--hp-brand)] hover:bg-[var(--hp-soft)] hover:text-[var(--hp-brand)] cursor-pointer shadow-2xs"
              title="Expand run specifications & rules"
              aria-label="Expand specifications sidebar"
            >
              <PanelLeftOpen className="size-4" />
            </button>
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className="mt-6 [writing-mode:vertical-lr] rotate-180 flex items-center gap-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase hover:text-foreground cursor-pointer"
            >
              <Sliders className="size-3 text-[var(--hp-brand)]" />
              Specifications & Rules
            </button>
          </div>
        ) : null}

        {/* Left Specifications & Rules Sidebar */}
        <aside
          id="setup-column"
          className={cn(
            "order-3 flex min-h-0 shrink-0 flex-col overflow-y-auto overscroll-y-contain max-lg:max-h-[40vh] max-lg:w-full lg:order-1 lg:w-[21rem] lg:self-stretch",
            isSidebarCollapsed ? "lg:hidden" : "lg:flex"
          )}
        >
          <div className="flex flex-col gap-1.5 w-full">
            <div className="hidden lg:flex items-center justify-between pb-1 px-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 font-bold text-foreground text-[11px] tracking-wide uppercase">
                <Sliders className="size-3.5 text-[var(--hp-brand)]" />
                Specifications & Rules
              </span>
              <button
                type="button"
                onClick={toggleSidebarCollapsed}
                className="flex size-6 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors shadow-2xs"
                title="Minimize sidebar (give more room to analysis)"
                aria-label="Minimize sidebar"
              >
                <PanelLeftClose className="size-3.5" />
              </button>
            </div>
            <RunForm
              title={runTabLabel(shown, syncedRuns, details, checks, {
                choice,
                heat: heatChoice,
                continued: continuedSelectivity,
                ligands: columnCoatings,
              })}
              details={detailsForRun(shown, syncedRuns, details)}
              rules={rules}
              columns={columns}
              solvents={solvents}
              onDetails={onShownDetails}
              onRules={(nextRules) => {
                setRules(nextRules);
                if (activeCount <= 1 && heatChoice?.seriesLength === 1) {
                  setHeatChoice(null);
                }
              }}
              fileNameFill={
                shown === 0
                  ? {
                      checked: fillFromFileName,
                      onToggle: onToggleFillFromFileName,
                    }
                  : null
              }
              fileNote={fileNameNotes[shown] ?? null}
            />
            <div className="py-2.5 text-center text-[11px] text-muted-foreground/60 select-none">
              Built by Logan Klat
            </div>
          </div>
        </aside>

        {/* Main Run Analysis Area (RunPane, Chromatograms, Decisions) */}
        <div className="order-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:order-2">
          {syncedRuns.map((run, index) => {
            const runActivePos = activePosAt(syncedRuns, index, details);
            const onLatestDecision =
              index === readyCount - 1 || (runActivePos >= 0 && runActivePos === latestActivePos);
            return (
            <TabsContent key={index} value={String(index)} className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <RunPane
                index={index}
                stage={sessionStage}
                run={run}
                runs={syncedRuns}
                details={details}
                rules={rules}
                checks={checks}
                onChooseSolvent={(solventId) => chooseNextSolvent(index + 1, solventId)}
                onChooseLigand={(value) => setRunLigand(index + 1, value)}
                tempPath={(runActivePos >= 0 ? tempPathByRun[runActivePos] : undefined) ?? tempPathByRun[index] ?? null}
                onTempPath={(path) => chooseTempPath(index, path)}
                onBatch={acceptBatch}
                onBegin={beginRead}
                onBuffer={acceptBuffer}
                onProblem={acceptProblem}
                onRemove={removeFile}
                onOpen={(next) => setActive(next)}
                leftSelectivity={(leftSelectivity || efficiencyChosen) && onLatestDecision}
                efficiencyContinued={
                  (runActivePos >= 0 && continuedSelectivity[runActivePos] === true) ||
                  continuedSelectivity[index] === true
                }
                onContinueRetention={
                  onLatestDecision && latestActivePos >= 0
                    ? () => setRetentionContinuedAt(latestActivePos)
                    : undefined
                }
                onContinueSelectivity={() => {
                  const pos = activePosAt(syncedRuns, index, details);
                  if (pos < 0) return;
                  const inSelectivity = isSelectivityAt(syncedRuns, index, details);
                  const segStart = segmentStartAt(syncedRuns, index, details);
                  const flags = selectivityFlags(pos, heatChoice, continuedSelectivity, inSelectivity, segStart);
                  const explanation = explainRun(syncedRuns, index, details, checks, {
                    choice,
                    heat: heatChoice,
                    continuePastEfficiency: flags.continuePast,
                    continueToLook: flags.continueToLook,
                    ligands: columnCoatings,
                  });
                  const showsLook =
                    !inSelectivity &&
                    explanation?.kind === "retention" &&
                    explanation.decision.continueShowsLook === true;
                  setContinuedSelectivity((current) => ({ ...current, [pos]: true }));
                  if (!showsLook && !inSelectivity) {
                    setHeatChoice({ carryIndex: pos, seriesLength: pos + 1 });
                  }
                }}
                onLeave={() => setEfficiencyChosen(true)}
                onUndoLeave={() => {
                  setEfficiencyChosen(false);
                  setLeftSelectivity(false);
                }}
                onDeclineEfficiency={() => setDeclinedEfficiencyNow(true)}
                onPickRun={(pickIndex) => {
                  const count = readyPrefix(syncedRuns);
                  const actIndices = activeIndicesUpTo(syncedRuns, count - 1, details);
                  const segStart = segmentStartAt(syncedRuns, count - 1, details);
                  setHeatChoice({ carryIndex: segStart + pickIndex, seriesLength: actIndices.length });
                }}
                onClearHeat={
                  onLatestDecision && heatChoice != null && heatChoice.seriesLength === activeCount
                    ? () => setHeatChoice(null)
                    : undefined
                }
                choice={{ ...choice, continueRetention }}
                heat={heatChoice}
                onLinePercent={onLatestDecision ? reportLinePercent : undefined}
                onPickPercent={onLatestDecision ? setPickedPercent : undefined}
                pickedPercent={onLatestDecision ? pickedPercent : null}
                linePercent={onLatestDecision ? linePercent : null}
                intermediateMode={onLatestDecision ? intermediateMode : null}
                onIntermediateModeChange={onLatestDecision ? setIntermediateMode : undefined}
                backwards={index === readyCount - 1 ? backwards : null}
                backwardsChoice={backwardsChoice}
                onBackwardsContinue={() => setBackwardsChoice("continue")}
                onBackwardsRedo={() => setBackwardsChoice("redo")}
                ligands={columnCoatings}
                solvents={solvents}
                runTabs={
                  index === shown ? (
                    <div className="flex h-9 shrink-0 items-stretch justify-between border-b border-foreground/10 bg-card/60">
                      <div
                        id="run-tabs"
                        ref={restoreRunListHorizontal}
                        onScroll={(event) => { runListScroll.current.left = event.currentTarget.scrollLeft; }}
                        onWheel={(event) => {
                          if (event.deltaY !== 0) {
                            event.currentTarget.scrollLeft += event.deltaY;
                          }
                        }}
                        className="flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-contain select-none [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-border/60"
                      >
                        <TabsList className="flex! h-full w-max flex-row! items-stretch justify-start gap-0! rounded-none bg-transparent p-0!">
                          {syncedRuns.map((_, tabIndex) => (
                            <TabsTrigger
                              key={tabIndex}
                              value={String(tabIndex)}
                              className="h-full w-auto max-w-[16rem] flex-none! whitespace-nowrap! rounded-none! border-y-0! border-l-0! border-r! border-solid border-r-border/80 px-3.5 text-xs font-medium shadow-none! transition-all duration-150 outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-ring/50 hover:bg-accent/40 active:translate-y-px"
                              style={runTabStyle(tabIndex === shown, hoveredRun === tabIndex)}
                              onMouseEnter={() => setHoveredRun(tabIndex)}
                              onMouseLeave={() => setHoveredRun((current) => (current === tabIndex ? null : current))}
                            >
                              {runTabLabel(tabIndex, syncedRuns, details, checks, {
                                choice,
                                heat: heatChoice,
                                continued: continuedSelectivity,
                                ligands: columnCoatings,
                              })}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </div>
                      <div className="flex shrink-0 items-center border-l border-border/80 px-2 bg-card">
                        <button
                          type="button"
                          onClick={startFresh}
                          title="Delete all runs and reset to a fresh state"
                          className="flex cursor-pointer select-none items-center gap-1.5 rounded-md border border-red-600/30 bg-red-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs transition-all duration-150 hover:bg-red-700 hover:shadow active:translate-y-px active:scale-[0.98] dark:border-red-500/40 dark:bg-red-700 dark:hover:bg-red-600"
                        >
                          <Trash2 className="size-3.5 shrink-0" aria-hidden="true" />
                          <span>Delete runs</span>
                        </button>
                      </div>
                    </div>
                  ) : null
                }
              />
            </TabsContent>
            );
          })}
        </div>
      </div>
      </div>
      </Tabs>
      ) : null}
    </div>
  );
}

function Watermark({
  className = "",
  variant = "compact",
}: {
  className?: string;
  variant?: "floating" | "tab" | "compact";
}) {
  if (variant === "compact") {
    return (
      <div
        id="watermark"
        className={`flex shrink-0 select-none items-center gap-1.5 px-1 py-0.5 text-foreground/85 ${className}`}
      >
        <svg viewBox="0 0 64 28" className="h-3 w-7 shrink-0 text-[var(--hp-brand)]" aria-hidden="true">
          <path
            d="M2 22 H8 C11 22 12 14 15 14 C18 14 19 22 22 22 H26 C29 22 30 6 35 6 C40 6 41 22 44 22 H48 C51 22 52 16 55 16 C58 16 59 22 62 22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="font-heading text-xs font-semibold tracking-wide text-foreground">
          Logan Klat
        </span>
      </div>
    );
  }

  if (variant === "tab") {
    return (
      <div
        id="watermark"
        className={`flex min-h-10 shrink-0 select-none items-center justify-center gap-1.5 bg-background px-3 py-2 text-foreground/85 sm:gap-2 sm:px-4 ${className}`}
      >
        <svg viewBox="0 0 64 28" className="h-3.5 w-8 shrink-0 text-[var(--hp-brand)] sm:h-4 sm:w-9" aria-hidden="true">
          <path
            d="M2 22 H8 C11 22 12 14 15 14 C18 14 19 22 22 22 H26 C29 22 30 6 35 6 C40 6 41 22 44 22 H48 C51 22 52 16 55 16 C58 16 59 22 62 22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="font-heading text-xs font-semibold tracking-wide text-foreground sm:text-sm">
          Logan Klat
        </span>
      </div>
    );
  }

  return (
    <div id="watermark" className={`pointer-events-none flex shrink-0 justify-end ${className}`}>
      <div className="flex items-center gap-1.5 text-[var(--hp-ink)]/40">
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
    return { backgroundColor: "var(--hp-soft-4)", borderColor: "var(--hp-brand-strong)", color: "var(--hp-brand)", fontWeight: 600 };
  }
  if (selected) {
    return { backgroundColor: "var(--hp-soft)", borderColor: "var(--hp-brand)", color: "var(--hp-brand)", fontWeight: 600 };
  }
  if (hovered) {
    return { backgroundColor: "var(--hp-gold-soft)", borderColor: "var(--hp-gold)", color: "var(--hp-gold-ink)", fontWeight: 600 };
  }
  return {
    backgroundColor: "var(--background)",
    borderColor: "var(--border)",
    color: "var(--foreground)",
    fontWeight: 500,
  };
}

function SectionNav({
  section,
  onSelect,
}: {
  section: (typeof sections)[number]["id"];
  onSelect: (id: (typeof sections)[number]["id"]) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <nav aria-label="Sections" className="sticky top-0 z-40 flex w-full shrink-0 items-stretch border-b border-border bg-background">
      <div className="grid min-w-0 flex-1 grid-cols-5">
        {sections.map((item) => {
          const selected = item.id === section;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={selected ? "page" : undefined}
              className="flex min-h-10 cursor-pointer select-none items-center justify-center gap-1 border-r border-border border-solid px-1 py-2 text-center text-xs leading-tight outline-none transition-all duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px sm:gap-2 sm:px-2 sm:text-sm"
              style={sectionTabStyle(selected, hovered === item.id)}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered((current) => (current === item.id ? null : current))}
              onClick={() => onSelect(item.id)}
            >
              <item.icon className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
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
  onBatch,
  onBegin,
  onBuffer,
  onProblem,
  onRemove,
  onOpen,
  leftSelectivity,
  efficiencyContinued,
  onContinueSelectivity,
  onContinueRetention,
  onLeave,
  onUndoLeave,
  onDeclineEfficiency,
  onPickRun,
  onClearHeat,
  choice,
  heat,
  onLinePercent,
  onPickPercent,
  pickedPercent,
  linePercent,
  intermediateMode,
  onIntermediateModeChange,
  backwards,
  backwardsChoice,
  onBackwardsContinue,
  onBackwardsRedo,
  ligands,
  solvents,
  runTabs,
  stage,
}: {
  index: number;
  stage: MethodStage;
  run: RunState;
  runs: RunState[];
  details: RunDetails;
  rules: RuleInputs;
  checks: RuleNumbers;
  onChooseSolvent: (solventId: string) => void;
  onChooseLigand: (value: string) => void;
  tempPath: TempPath | null;
  onTempPath: (path: TempPath) => void;
  onBatch?: (startIndex: number, files: DroppedFile[]) => void;
  onBegin: (index: number, fileName: string) => void;
  onBuffer: (index: number, fileName: string, buffer: ArrayBuffer) => void;
  onProblem: (index: number, fileName: string, message: string) => void;
  onRemove: (index: number) => void;
  onOpen: (index: number) => void;
  leftSelectivity: boolean;
  efficiencyContinued: boolean;
  onContinueSelectivity: () => void;
  onContinueRetention?: () => void;
  onLeave: () => void;
  onUndoLeave?: () => void;
  onDeclineEfficiency: () => void;
  onPickRun: (index: number) => void;
  onClearHeat?: () => void;
  choice: RetentionChoice;
  heat: HeatStart | null;
  onLinePercent?: (percent: number | null) => void;
  onPickPercent?: (percent: number | null) => void;
  pickedPercent?: number | null;
  linePercent?: number | null;
  intermediateMode?: "yes" | "no" | null;
  onIntermediateModeChange?: (mode: "yes" | "no" | null) => void;
  backwards: BackwardsPair | null;
  backwardsChoice: "continue" | "redo" | null;
  onBackwardsContinue: () => void;
  onBackwardsRedo: () => void;
  ligands: readonly string[];
  solvents: readonly string[];
  runTabs?: ReactNode;
}) {
  if (run.afterRetention) {
    const prior = index > 0 ? explainRun(runs, index - 1, details, checks, { choice, heat, ligands }) : null;
    const decision = prior?.kind === "retention" ? prior.decision : null;
    const nextLabel = decision
      ? retentionChangeLabel(decision)
      : "Retention is finished. The next kind of change is not built yet.";
    return (
      <>
        <div id="decision-bar" className="shrink-0 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 shadow-xs">
          <MethodProgress stage={stage} />
          {runTabs}
          <RunSummary index={index} runs={runs} details={details} nextLabel={nextLabel} />
        </div>
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border-2 border-solid border-border bg-card">
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3.5 sm:p-4" data-chromatogram-scroll="">
            <LaterChangeNote decision={decision} />
          </div>
        </section>
      </>
    );
  }

  const currentIsBlank = isBlankRun(index, runs, details);
  const activePos = activePosAt(runs, index, details);
  const inSelectivity = isSelectivityAt(runs, index, details);
  const segStart = segmentStartAt(runs, index, details);
  const flags = selectivityFlags(
    activePos,
    heat,
    efficiencyContinued && activePos >= 0 ? { [activePos]: true } : {},
    inSelectivity,
    segStart,
  );
  const explanation = explainRun(runs, index, details, checks, {
    choice: { ...choice, continueToLook: flags.continueToLook },
    heat,
    continuePastEfficiency: flags.continuePast,
    continueToLook: flags.continueToLook,
    ligands,
  });
  const rows = run.read ? evaluateRun(run.read, checks) : null;
  const next = runs[index + 1];
  const selectivity = explanation?.kind === "selectivity" ? explanation.plan : null;
  const retention = explanation?.kind === "retention" ? explanation.decision : null;
  const ask =
    !leftSelectivity && retention?.status === "ask" && retention.efficiencyNow
      ? retention.efficiencyNow
      : null;
  const choosingEfficiency = retention?.status === "efficiency" && retention.efficiencyChoice && !efficiencyContinued;
  const heatForHere =
    heat != null && activePos >= 0 && heat.carryIndex >= segStart && heat.seriesLength <= activePos + 1
      ? heat
      : null;
  const looking = retention?.status === "look" && retention.look && !heatForHere;
  const holdingBack = Boolean(backwards && backwardsChoice !== "continue");
  const recommendedNextLabel = describeNextChange({
    ready: run.status === "ready",
    holdingBack,
    backwardsChoice,
    leftSelectivity,
    duringRetention: explanation?.kind === "retention" && !inSelectivity,
    asking: ask != null,
    choosingEfficiency: Boolean(choosingEfficiency),
    looking: Boolean(looking),
    retention,
    selectivity,
    tempPath,
    solventName: findSolvent(next?.solvent || "")?.label ?? (next?.solvent || ""),
    ligand: next?.ligand || selectivity?.recommendedLigand || "",
    linePercent: linePercent ?? null,
    pickedPercent: pickedPercent ?? null,
    intermediateMode: intermediateMode ?? null,
  });
  const nextLabel = next?.status === "ready"
    ? `Review Run ${index + 2}${isBlankRun(index + 1, runs, details) ? " (Blank)" : ""}: ${runSettingLine(next)}`
    : recommendedNextLabel;
  const canOpenNext = Boolean(next) && !ask && !leftSelectivity;
  const decisionIndex = activeIndicesUpTo(runs, index, details).at(-1) ?? index;
  const currentLigand = (
    decisionIndex === 0 ? details.ligand : (runs[decisionIndex]?.ligand ?? "").trim() || details.ligand
  ).trim();
  const nextLocked =
    canOpenNext &&
    (nextRunLockedForSolvent(selectivity, next ? { solvent: next.solvent, percentB: next.percentB } : null) ||
      nextRunLockedForLigand(selectivity, {
        tempPath,
        nextLigand: next?.ligand ?? "",
        currentLigand,
      }));
  const showSelectivityChoices = Boolean(
    selectivity &&
      selectivityShowsChoices(selectivity, tempPath) &&
      !holdingBack &&
      !leftSelectivity &&
      !ask &&
      !choosingEfficiency &&
      !looking,
  );
  const actionChoices = holdingBack ? (
    <BackwardsChoiceButtons onContinue={onBackwardsContinue} onRedo={onBackwardsRedo} />
  ) : ask ? (
    <LeaveSelectivityButtons onYes={onLeave} onNo={() => onDeclineEfficiency()} />
  ) : choosingEfficiency && retention?.efficiencyChoice ? (
    <EfficiencyChoiceButtons
      onEfficiency={onLeave}
      onContinue={onContinueSelectivity}
      onContinueRetention={onContinueRetention}
      inSelectivity={inSelectivity}
    />
  ) : looking && retention?.look ? (
    <PickRunToHeatControls look={retention.look} onPickRun={onPickRun} startIndex={segStart} />
  ) : null;
  const percentChoices =
    !actionChoices && retention?.bChoices && retention.bChoices.length > 1 && onPickPercent ? (
      <PercentChoiceButtons
        choices={retention.bChoices}
        recommended={retention.nextPercentB}
        onPick={onPickPercent}
      />
    ) : null;
  const singleRunCloseChoice =
    !actionChoices &&
    !inSelectivity &&
    !heatForHere &&
    activePos - segStart === 0 &&
    retention?.reason === "drop-5" ? (
      <SingleRunCloseToSpecChoices
        currentPercentB={parseUserNumber(runs[decisionIndex]?.percentB ?? run.percentB)}
        nextPercentB={retention.nextPercentB}
        onMoveToSelectivity={() => onPickRun(0)}
      />
    ) : null;
  const secondMin =
    retention?.choosePercent && retention.nextPercentB != null && onPickPercent
      ? { recommended: retention.nextPercentB, picked: pickedPercent ?? null, onPick: onPickPercent }
      : null;
  const ownPercent =
    retention?.pickOwnPercent && onPickPercent
      ? {
          picked: pickedPercent ?? null,
          minimum: parseUserNumber(runs[decisionIndex]?.percentB ?? run.percentB),
          onPick: onPickPercent,
          mode: intermediateMode ?? null,
          onModeChange: onIntermediateModeChange,
          onCompareRuns: activePos - segStart >= 1 ? onContinueSelectivity : undefined,
        }
      : null;

  const selectivityChoices =
    showSelectivityChoices && selectivity ? (
      <SelectivityNextControls
        plan={selectivity}
        solventId={next?.solvent || ""}
        ligand={next?.ligand || ""}
        solvents={solvents}
        ligands={ligands}
        onSolvent={onChooseSolvent}
        onLigand={onChooseLigand}
        tempPath={tempPath}
        onTempPath={onTempPath}
      />
    ) : null;
  const repickHeatButton =
    !inSelectivity && heatForHere && onClearHeat && activePos - segStart >= 0 ? (
      <button
        type="button"
        id="repick-heat-run"
        className="w-fit cursor-pointer rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-[var(--hp-brand)] hover:bg-[var(--hp-soft)] hover:text-[var(--hp-brand)]"
        onClick={onClearHeat}
      >
        {activePos - segStart === 0 ? "Back to retention (-5% B)" : "Pick a different run to heat"}
      </button>
    ) : null;
  const nextChoices =
    actionChoices || percentChoices || singleRunCloseChoice || selectivityChoices || repickHeatButton ? (
      <>
        {actionChoices}
        {percentChoices}
        {singleRunCloseChoice}
        {selectivityChoices}
        {repickHeatButton}
      </>
    ) : null;
  const alignedTraces = run.status === "ready" ? buildAlignedTraces(runs, index, details, checks) : [];
  const hasActiveControls = Boolean(nextChoices || secondMin || ownPercent);
  const isDecisionReady = Boolean(
    run.status === "ready" &&
      run.read != null &&
      !run.afterRetention &&
      !leftSelectivity &&
      (nextLabel !== NO_CHANGE_YET || hasActiveControls) &&
      retention?.status !== "investigate" &&
      retention?.status !== "specs-met" &&
      (next?.status !== "ready" || hasActiveControls),
  );

  return (
    <>
      <div id="decision-bar" className="shrink-0 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 shadow-xs">
        <MethodProgress stage={stage} />
        {runTabs}
        <RunSummary
          index={index}
          runs={runs}
          details={details}
          nextLabel={nextLabel}
          onNext={canOpenNext ? () => onOpen(index + 1) : undefined}
          nextLocked={nextLocked}
          secondMin={secondMin}
          ownPercent={ownPercent}
          choices={nextChoices}
          isDecisionReady={isDecisionReady}
        />
      </div>

      <section
        className={
          "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-card transition-colors " +
          (run.status === "ready"
            ? "border-2 border-solid border-border"
            : "border-4 border-dashed border-[var(--hp-brand)]/40 dark:border-[var(--hp-brand)]/50 hover:border-[var(--hp-brand)]/80")
        }
      >
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto p-3.5 sm:p-4"
          data-chromatogram-scroll=""
        >
        {index === 0 && run.status === "empty" ? (
          <div className="shrink-0">
            <StartHighBNote />
          </div>
        ) : null}
        {run.status === "ready" && run.read && rows && run.fileName ? (
          <>
            <ResultsPanel
              fileName={run.fileName}
              onRemove={() => onRemove(index)}
              read={run.read}
              rows={rows}
              isBlank={currentIsBlank}
              aside={
                backwards && backwardsChoice !== "continue" ? (
                  <BackwardsRetentionView
                    pair={backwards}
                    choice={backwardsChoice === "redo" ? "redo" : null}
                  />
                ) : leftSelectivity ? (
                  <LeaveSelectivityDone
                    duringRetention={explanation?.kind === "retention" && !inSelectivity}
                    onUndo={onUndoLeave}
                  />
                ) : ask ? (
                  <LeaveSelectivityAsk ask={ask} />
                ) : retention?.status === "efficiency" && retention.efficiencyChoice && !efficiencyContinued ? (
                  <EfficiencyChoiceView why={retention.why} />
                ) : retention?.status === "look" && retention.look && !heatForHere ? (
                  <LookAtRuns
                    look={retention.look}
                    startIndex={segStart}
                    traces={alignedTraces}
                    specTimeMin={checks.lastPeakTimeMin}
                    onPickRun={onPickRun}
                    note={
                      currentIsBlank
                        ? `This is a blank run (sample type BLANK), used as preparation for the next run. Blank runs do not need to be uploaded. Repeating the last decision point from Run ${decisionIndex + 1}.`
                        : undefined
                    }
                  />
                ) : (
                  <>
                    {retention ? (
                      <RetentionDecisionView
                        decision={retention}
                        onLinePercent={onLinePercent}
                        onPickPercent={onPickPercent}
                        traces={alignedTraces}
                        specTimeMin={checks.lastPeakTimeMin}
                      />
                    ) : null}
                    {selectivity ? <SelectivityDecisionView plan={selectivity} tempPath={tempPath} /> : null}
                  </>
                )
              }
            />
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
              onBatch={onBatch ? (files) => void onBatch(index, files) : undefined}
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
                className="rounded-xl bg-orange-50 dark:bg-orange-950/40 px-4 py-3 text-sm text-orange-950 dark:text-orange-100 ring-1 ring-orange-200 dark:ring-orange-800"
                role="alert"
              >
                {run.fileName ? <span className="mb-1 block font-medium">{run.fileName}</span> : null}
                {run.message}
              </div>
            ) : null}
          </div>
        )}
        </div>
      </section>
    </>
  );
}

function buildAlignedTraces(
  runs: RunState[],
  upToIndex: number,
  details: RunDetails,
  checks: RuleNumbers,
): AlignedRunTrace[] {
  const activeIndices = activeIndicesUpTo(runs, upToIndex, details);
  const segStart = segmentStartAt(runs, upToIndex, details);
  const segmentIndices = activeIndices.slice(segStart);
  return segmentIndices.map((idx, localIdx) => {
    const run = runs[idx];
    const info = detailsForRun(idx, runs, details);
    const shortMatch = run.fileName?.match(/^([A-Za-z]+\d*-\d+)/);
    const shortCode = shortMatch ? shortMatch[1] : null;
    const solventChart = findSolvent(info.solvent);
    const solventShort = solventChart?.id ?? (info.solvent.trim() || "ACN");
    const peakCount = run.read?.peakCount ?? null;
    const peaksMet =
      checks.requiredPeaks != null && peakCount != null
        ? peakCount >= checks.requiredPeaks
        : false;
    const rawResValues = (run.read?.peaks ?? [])
      .slice(1)
      .map((p) => p.resolution)
      .filter((r): r is number => r != null && Number.isFinite(r) && r > 0);
    const rawResolution =
      run.read?.minResolutionExcludingFirst ?? (rawResValues.length > 0 ? Math.min(...rawResValues) : null);
    return {
      index: localIdx,
      runNumber: idx + 1,
      shortCode,
      fileName: run.fileName,
      solvent: solventShort,
      percentB: parseUserNumber(info.percentB),
      temperature: info.temperature,
      ligand: info.ligand.trim(),
      peakCount,
      lastPeakTimeMin: run.read?.lastPeakTimeMin ?? null,
      rawResolution,
      decisionResolution: run.read?.minResolutionExcludingFirst ?? null,
      peaksMet,
      chromatogram: run.read?.chromatogram ?? null,
      yLabel: run.read?.chromatogramYAxis || "mAU",
    };
  });
}

function RunSummary({
  index,
  runs,
  details,
  nextLabel,
  onNext,
  nextLocked = false,
  secondMin = null,
  ownPercent = null,
  choices = null,
  isDecisionReady = false,
}: {
  index: number;
  runs: RunState[];
  details: RunDetails;
  nextLabel: string;
  onNext?: () => void;
  nextLocked?: boolean;
  secondMin?: {
    recommended: number;
    picked: number | null;
    onPick: (percent: number | null) => void;
  } | null;
  ownPercent?: {
    picked: number | null;
    minimum: number | null;
    onPick: (percent: number | null) => void;
    mode?: "yes" | "no" | null;
    onModeChange?: (mode: "yes" | "no" | null) => void;
    onCompareRuns?: () => void;
  } | null;
  choices?: ReactNode;
  isDecisionReady?: boolean;
}) {
  const lines = index > 0 ? decisionChangeLines(index, runs, details) : [];
  const withPicker = Boolean(secondMin || ownPercent || choices);
  return (
    <section
      id="run-context"
      className="grid grid-cols-1 gap-1 overflow-hidden bg-card p-1 sm:grid-cols-2 text-xs"
    >
      <div id="this-run-change" className="flex flex-col rounded-lg border border-border/80 bg-card px-3 py-1.5 sm:px-3.5 sm:py-2">
        <h2 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">This run&apos;s change</h2>
        <div className="mt-0.5 flex flex-col gap-0.5">
          {index === 0 ? (
            <p className="text-xs sm:text-sm font-medium text-foreground">
              {isBlankRun(0, runs, details)
                ? "Blank run (preparation for the next run)."
                : "This is the first run."}
            </p>
          ) : lines.length === 0 ? (
            <p className="text-xs sm:text-sm font-medium text-foreground">No change from the previous run.</p>
          ) : (
            lines.map((line) => (
              <p key={line} className="text-xs sm:text-sm font-medium text-foreground">
                {line}
              </p>
            ))
          )}
        </div>
      </div>
      <div
        id="next-run-box"
        className={cn(
          "flex flex-col overflow-hidden rounded-lg shadow-xs transition-all",
          isDecisionReady
            ? "border-2 border-green-500 dark:border-green-400 ring-2 ring-green-500/25"
            : "border border-border/80 bg-card",
          !withPicker && "h-full",
        )}
      >
        {onNext ? (
          <button
            type="button"
            id="next-run-change"
            disabled={nextLocked}
            className={
              "group flex w-full items-center gap-2.5 border-0 bg-[var(--hp-brand)] px-3 py-1.5 text-left text-[var(--hp-on-brand)] transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3.5 sm:py-2 " +
              (withPicker ? "" : "min-h-full flex-1 ") +
              (nextLocked ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-[var(--hp-brand-hover)] active:translate-y-px")
            }
            onClick={() => {
              if (nextLocked) return;
              onNext();
            }}
          >
            <span className="flex min-w-0 flex-1 flex-col items-start">
              <span className="text-[10px] font-semibold tracking-wider uppercase opacity-90">Next run</span>
              <span className="text-sm sm:text-base font-extrabold leading-snug">
                {nextLabel === "Move on to efficiency" ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex items-center rounded bg-white/25 px-2 py-0.5 font-mono text-xs font-black tracking-wider text-white shadow-2xs">
                      → N
                    </span>
                    <span>(Move on to efficiency)</span>
                  </span>
                ) : nextLabel.includes("Efficiency is next") ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex items-center rounded bg-white/25 px-2 py-0.5 font-mono text-xs font-black tracking-wider text-white shadow-2xs">
                      → N
                    </span>
                    <span>{nextLabel}</span>
                  </span>
                ) : nextLabel.startsWith("MET") ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex items-center rounded bg-emerald-500/35 px-2 py-0.5 font-mono text-xs font-black tracking-wider text-white shadow-2xs">
                      MET
                    </span>
                    <span>(Method complete)</span>
                  </span>
                ) : nextLabel.includes("Change selectivity") ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex items-center rounded bg-amber-500/35 px-2 py-0.5 font-mono text-xs font-black tracking-wider text-white shadow-2xs">
                      SELECTIVITY
                    </span>
                    <span>Run at 40°C</span>
                  </span>
                ) : (
                  nextLabel
                )}
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
        ) : (
          <div id="next-run-change" className="px-3 py-1.5 sm:px-3.5 sm:py-2">
            <h2 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Next run&apos;s change</h2>
            {nextLabel === "Move on to efficiency" ? (
              <p className="mt-0.5 flex items-center gap-2 text-sm sm:text-base font-extrabold text-foreground">
                <span className="inline-flex items-center rounded bg-[var(--hp-brand)]/15 text-[var(--hp-brand)] px-2 py-0.5 font-mono text-xs font-black">
                  → N
                </span>
                <span>(Move on to efficiency)</span>
              </p>
            ) : nextLabel.includes("Efficiency is next") ? (
              <p className="mt-0.5 flex items-center gap-2 text-sm sm:text-base font-extrabold text-foreground">
                <span className="inline-flex items-center rounded bg-[var(--hp-brand)]/15 text-[var(--hp-brand)] px-2 py-0.5 font-mono text-xs font-black">
                  → N
                </span>
                <span>{nextLabel}</span>
              </p>
            ) : nextLabel.startsWith("MET") ? (
              <p className="mt-0.5 flex items-center gap-2 text-sm sm:text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                <span className="inline-flex items-center rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 font-mono text-xs font-black">
                  MET
                </span>
                <span>(Method complete)</span>
              </p>
            ) : nextLabel.includes("Change selectivity") ? (
              <p className="mt-0.5 flex items-center gap-2 text-sm sm:text-base font-extrabold text-amber-600 dark:text-amber-400">
                <span className="inline-flex items-center rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 font-mono text-xs font-black">
                  SELECTIVITY
                </span>
                <span>Run at 40°C</span>
              </p>
            ) : (
              <p className="mt-0.5 text-sm sm:text-base font-bold text-foreground">{nextLabel}</p>
            )}
          </div>
        )}
        {secondMin || ownPercent || choices ? (
          <div className="flex flex-col gap-1.5 border-t border-foreground/10 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-muted/10">
            {secondMin ? (
              <SecondPercentChoice recommended={secondMin.recommended} picked={secondMin.picked} onPick={secondMin.onPick} />
            ) : null}
            {ownPercent ? (
              <PickOwnPercent
                picked={ownPercent.picked}
                minimum={ownPercent.minimum}
                onPick={ownPercent.onPick}
                mode={ownPercent.mode}
                onModeChange={ownPercent.onModeChange}
                onCompareRuns={ownPercent.onCompareRuns}
              />
            ) : null}
            {choices}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function describeNextChange(input: {
  ready: boolean;
  holdingBack: boolean;
  backwardsChoice: "continue" | "redo" | null;
  leftSelectivity: boolean;
  duringRetention: boolean;
  asking: boolean;
  choosingEfficiency: boolean;
  looking: boolean;
  retention: RetentionDecision | null;
  selectivity: SelectivityPlan | null;
  tempPath: TempPath | null;
  solventName: string;
  ligand: string;
  linePercent: number | null;
  pickedPercent: number | null;
  intermediateMode?: "yes" | "no" | null;
}): string {
  if (!input.ready) return NO_CHANGE_YET;
  if (input.holdingBack) return input.backwardsChoice === "redo" ? "Re-do the runs" : NO_CHANGE_YET;
  if (input.leftSelectivity) {
    return input.duringRetention
      ? "Retention and selectivity are finished. Efficiency is next. That stage is not built yet."
      : "Selectivity is finished. Efficiency is next. That stage is not built yet.";
  }
  if (input.asking) return NO_CHANGE_YET;
  if (input.choosingEfficiency && input.retention) {
    return retentionChangeLabel(input.retention);
  }
  if (input.looking && input.retention) return input.retention.nextChange;
  if (input.retention) {
    const pct = retentionPercent(input.retention, input.linePercent, input.pickedPercent);
    if (input.retention.reason === "choose-percent" && input.intermediateMode === "yes") {
      return pct == null ? "Select an intermediate %B" : `Run at ${formatPercentB(pct)}% B`;
    }
    return retentionChangeLabel(input.retention, pct);
  }
  if (input.selectivity) {
    return selectivityChangeLabel(input.selectivity, {
      tempPath: input.tempPath,
      solvent: input.solventName,
      ligand: input.ligand,
    });
  }
  return NO_CHANGE_YET;
}

function retentionPercent(
  decision: RetentionDecision,
  linePercent: number | null,
  pickedPercent: number | null,
): number | null {
  if (decision.reason === "choose-percent") {
    if (pickedPercent != null && Number.isFinite(pickedPercent) && pickedPercent >= 0 && pickedPercent <= 100) {
      return pickedPercent;
    }
    return null;
  }
  if (
    decision.reason === "second-minimum" &&
    pickedPercent != null &&
    Number.isFinite(pickedPercent) &&
    pickedPercent >= 0 &&
    pickedPercent <= 100
  ) {
    return pickedPercent;
  }
  if (pickedPercent != null && decision.bChoices?.some((item) => item.percentB === pickedPercent)) {
    return pickedPercent;
  }
  if (decision.move === "calculated" && linePercent != null) return linePercent;
  return decision.nextPercentB;
}

export function decisionChangeLines(index: number, runs: RunState[], details: RunDetails): string[] {
  if (index <= 0) return [];
  const blank = isBlankRun(index, runs, details);
  const prevNonBlank = lastNonBlankBefore(index, runs, details);
  const compareIndex = blank ? index - 1 : prevNonBlank != null ? prevNonBlank : index - 1;
  const before = runConditions(compareIndex, runs, details);
  const after = runConditions(index, runs, details);
  const lines: string[] = [];
  if (blank) {
    lines.push("Blank run (preparation for the next run).");
  } else if (prevNonBlank == null) {
    lines.push("First composite sample (CP) run after blank preparation.");
  }
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

function backwardsOnPage(_runs: RunState[], _details: RunDetails): BackwardsPair | null {
  // Lowering %B not increasing retention time (e.g. 90% vs 80% B) can occur in real student
  // data due to co-eluting peaks or experimental variance. We do not block the user with an
  // error; the retention fit algorithm automatically excludes or handles poor points.
  return null;
}

export type Explanation =
  | { kind: "retention"; decision: RetentionDecision }
  | { kind: "selectivity"; plan: SelectivityPlan };

function sessionMethodStage(
  runs: RunState[],
  details: RunDetails,
  checks: RuleNumbers,
  options: {
    leftSelectivity: boolean;
    choice: RetentionChoice;
    heat: HeatStart | null;
    continuePastEfficiency?: boolean;
    continueToLook?: boolean;
    ligands?: readonly string[];
  },
): MethodStage {
  const index = readyPrefix(runs) - 1;
  const explanation =
    index >= 0
      ? explainRun(runs, index, details, checks, {
          choice: options.choice,
          heat: options.heat,
          continuePastEfficiency: options.continuePastEfficiency,
          continueToLook: options.continueToLook,
          ligands: options.ligands,
        })
      : null;
  if (!explanation) {
    return methodStageFromLatest({ leftSelectivity: options.leftSelectivity, phase: null });
  }
  if (explanation.kind === "selectivity") {
    return methodStageFromLatest({ leftSelectivity: options.leftSelectivity, phase: "selectivity" });
  }
  const inSelectivity = index >= 0 && isSelectivityAt(runs, index, details);
  if (inSelectivity) {
    return methodStageFromLatest({ leftSelectivity: options.leftSelectivity, phase: "selectivity" });
  }
  return methodStageFromLatest({
    leftSelectivity: options.leftSelectivity,
    phase: "retention",
    retentionStatus: explanation.decision.status,
    retentionReason: explanation.decision.reason,
  });
}

function isAfterInBetween(samples: RetentionSample[], checks: RuleNumbers): boolean {
  if (samples.length < 2) return false;
  const prevSamples = samples.slice(0, -1);
  const rawPrior = decideRetention(prevSamples, checks);
  const prior =
    rawPrior.status === "efficiency"
      ? decideRetention(prevSamples, checks, { continueRetention: true })
      : rawPrior;
  return prior.reason === "choose-percent";
}

function decorateBlankExplanation(
  explanation: Explanation,
  effectiveIndex: number,
): Explanation {
  const prefix = `This is a blank run (sample type BLANK), used as preparation for the next run. Blank runs do not need to be uploaded. Blank injections equilibrate the column to new mobile phase conditions, stabilize baseline absorbance, and confirm the absence of carryover or ghost peaks before running the sample. Repeating the last decision point from Run ${effectiveIndex + 1}:`;
  if (explanation.kind === "retention") {
    return {
      kind: "retention",
      decision: {
        ...explanation.decision,
        why: `${prefix}\n\n${explanation.decision.why}`,
      },
    };
  }
  return {
    kind: "selectivity",
    plan: {
      ...explanation.plan,
      why: `${prefix}\n\n${explanation.plan.why}`,
    },
  };
}

export function explainRun(
  runs: RunState[],
  index: number,
  details: RunDetails,
  checks: RuleNumbers,
  options: {
    choice: RetentionChoice;
    heat: HeatStart | null;
    continuePastEfficiency?: boolean;
    continueToLook?: boolean;
    ligands?: readonly string[];
  },
): Explanation | null {
  const run = runs[index];
  if (!run || run.status !== "ready" || !run.read) return null;
  for (let i = 0; i < index; i++) {
    if (runs[i].status !== "ready" || !runs[i].read) return null;
  }

  const activeIndices = activeIndicesUpTo(runs, index, details);
  if (activeIndices.length === 0) {
    const cond = runConditions(index, runs, details);
    const pct = parseUserNumber(cond.percentB);
    const pctText = pct != null ? formatPercentB(pct) : cond.percentB || "90";
    return {
      kind: "retention",
      decision: {
        status: "recommend",
        reason: "drop-10",
        move: null,
        nextPercentB: pct ?? 90,
        nextTemperature: cond.temperature || null,
        why: [
          `This is a blank run (sample type BLANK), used as preparation for the next run at ${pctText}% B. Blank runs do not need to be uploaded. Upload the composite sample (CP) run at these conditions to evaluate retention and separation.`,
          "Blank injections equilibrate the column to new mobile phase conditions, stabilize baseline absorbance, and confirm the absence of carryover or ghost peaks before running the sample.",
        ].join("\n\n"),
        nextChange: `Run the composite sample (CP) at ${pctText}% B.`,
        fit: null,
      },
    };
  }

  const currentIsBlank = isBlankRun(index, runs, details);
  const effectiveIndex = activeIndices[activeIndices.length - 1];
  const effectiveRun = runs[effectiveIndex];
  const selectRuns = activeIndices.map((idx) => toSelectivityRun(runs[idx], idx, details));
  const inSelectivity = isRunInSelectivity(selectRuns);

  const finalize = (exp: Explanation): Explanation =>
    currentIsBlank ? decorateBlankExplanation(exp, effectiveIndex) : exp;

  if (
    checks.requiredPeaks != null &&
    effectiveRun.read?.peakCount != null &&
    effectiveRun.read.peakCount > checks.requiredPeaks
  ) {
    return finalize({
      kind: "retention",
      decision: decideRetention([toSample(effectiveRun, detailsForRun(effectiveIndex, runs, details))], checks),
    });
  }

  let nextActiveIdx = -1;
  for (let k = index + 1; k < runs.length; k++) {
    if (runs[k]?.status !== "ready" || !runs[k]?.read) break;
    if (!isBlankRun(k, runs, details)) {
      nextActiveIdx = k;
      break;
    }
  }
  const hasNextReady = nextActiveIdx >= 0;
  const nextSelectRuns = hasNextReady
    ? [...selectRuns, toSelectivityRun(runs[nextActiveIdx], nextActiveIdx, details)]
    : null;
  const sameCoatingNext =
    nextSelectRuns != null &&
    (!isRunInSelectivity(nextSelectRuns) ||
      coatingSegmentStart(selectRuns) === coatingSegmentStart(nextSelectRuns));
  const nextStayedInRetention =
    nextSelectRuns != null &&
    sameCoatingNext &&
    !inSelectivity &&
    !isRunInSelectivity(nextSelectRuns);

  const startedDirectlyInSelectivity = selectRuns.length === 1 && inSelectivity;

  if (
    checks.requiredPeaks != null &&
    effectiveRun.read?.peakCount != null &&
    effectiveRun.read.peakCount === checks.requiredPeaks
  ) {
    const single = decideRetention([toSample(effectiveRun, detailsForRun(effectiveIndex, runs, details))], checks);
    if (single.status === "specs-met") {
      return finalize({ kind: "retention", decision: single });
    }
    if (
      inSelectivity &&
      !startedDirectlyInSelectivity &&
      single.status === "efficiency" &&
      !options.continuePastEfficiency &&
      !hasNextReady
    ) {
      const selectivityIfContinued = planHistory(
        selectRuns,
        setupFrom(details, checks, runs),
        {
          heat: options.heat,
          continuePastEfficiency: true,
          ligands: options.ligands,
        },
      );
      const leadParagraph = single.why.split("\n\n")[0] ?? single.why;
      const decisionForSelectivity: RetentionDecision =
        selectivityIfContinued.phase === "selectivity"
          ? {
              ...single,
              why: `${leadParagraph}\n\nIf you stay in selectivity: ${selectivityIfContinued.plan.why}`,
            }
          : single;
      return finalize({ kind: "retention", decision: decisionForSelectivity });
    }
  }

  const nextAdvancedSelectivity =
    nextSelectRuns != null &&
    !nextStayedInRetention &&
    (sameCoatingNext || inSelectivity);

  const history = planHistory(
    selectRuns,
    setupFrom(details, checks, runs),
    {
      heat: options.heat,
      continuePastEfficiency: options.continuePastEfficiency || nextAdvancedSelectivity,
      ligands: options.ligands,
    },
  );
  if (history.phase === "selectivity") return finalize({ kind: "selectivity", plan: history.plan });
  if (inSelectivity) {
    return finalize({
      kind: "retention",
      decision: decideRetention([toSample(effectiveRun, detailsForRun(effectiveIndex, runs, details))], checks),
    });
  }
  const hasBlanksBefore = activeIndices.length <= index;
  const segmentIndices = activeIndices.slice(history.segmentStart);
  const samples = segmentIndices.map((idx) =>
    toSample(runs[idx], detailsForRun(idx, runs, details), hasBlanksBefore ? idx + 1 : undefined),
  );
  const onLatest = !hasNextReady;
  const effectiveChoice: RetentionChoice = {
    ...options.choice,
    continueRetention: options.choice.continueRetention || nextStayedInRetention,
    continueToLook: onLatest ? options.continueToLook : false,
    afterInBetween: options.choice.afterInBetween || isAfterInBetween(samples, checks),
  };
  return finalize({
    kind: "retention",
    decision: decideRetention(samples, checks, effectiveChoice),
  });
}

export function syncNextRun(
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
    intermediateMode?: "yes" | "no" | null;
    holdNext?: boolean;
    ligands?: readonly string[];
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
  if (options.holdNext) {
    return seriesWhileHeld(runs, count, (run) => run.status === "empty" && !runWasEdited(run)) as RunState[];
  }
  const activeIndices = activeIndicesUpTo(runs, count - 1, details);
  const next = runs[count];
  let prefill: SelectivityPrefill | null = null;

  if (activeIndices.length === 0) {
    const lastBlankIdx = count - 1;
    const cond = runConditions(lastBlankIdx, runs, details);
    prefill = {
      percentB: cond.percentB || "90",
      temperature: cond.temperature,
      solvent: cond.solvent,
      ligand: cond.ligand,
    };
  } else {
    const activeReady = activeIndices.map((idx) => runs[idx]);
    const history = planHistory(
      activeIndices.map((idx) => toSelectivityRun(runs[idx], idx, details)),
      setupFrom(details, checks, runs),
      { heat: options.heat, continuePastEfficiency: options.continuePastEfficiency, ligands: options.ligands },
    );
    prefill = prefillFor(
      activeReady,
      activeIndices,
      runs,
      history,
      details,
      checks,
      options.choice,
      options.linePercent,
      options.pickedPercent,
      options.intermediateMode ?? null,
      options.continuePastEfficiency,
    );
    if (prefill && isBlankRun(count - 1, runs, details)) {
      const blankCond = runConditions(count - 1, runs, details);
      prefill = {
        percentB: prefill.percentB || blankCond.percentB,
        temperature: prefill.temperature || blankCond.temperature,
        solvent: prefill.solvent || blankCond.solvent,
        ligand: prefill.ligand || blankCond.ligand,
      };
    }
  }

  if (!prefill) {
    if (!next || next.status !== "empty" || runWasEdited(next)) return runs;
    if (runs.length !== count + 1) return runs;
    return runs.slice(0, count);
  }

  if (!next) {
    if (runs.length !== count) return runs;
    const restFromLast = inheritedRest(count, runs, details);
    return [...runs, { ...emptyRun(), rest: restFromLast, ...prefill }];
  }
  if (next.status !== "empty") return runs;
  const merged = mergePrefill(next, prefill);
  if (merged === next) return runs;
  const copy = runs.slice();
  copy[count] = merged;
  return copy;
}

function prefillFor(
  activeReady: RunState[],
  activeIndices: number[],
  allRuns: RunState[],
  history: ReturnType<typeof planHistory>,
  details: RunDetails,
  checks: RuleNumbers,
  choice: RetentionChoice,
  linePercent: number | null,
  pickedPercent: number | null,
  intermediateMode: "yes" | "no" | null = null,
  continuePastEfficiency = false,
): SelectivityPrefill | null {
  const latestRun = activeReady[activeReady.length - 1];
  const latestRealIndex = activeIndices[activeIndices.length - 1];
  if (
    checks.requiredPeaks != null &&
    latestRun?.read?.peakCount != null &&
    latestRun.read.peakCount > checks.requiredPeaks
  ) {
    return null;
  }
  const selectRuns = activeIndices.map((idx) => toSelectivityRun(allRuns[idx], idx, details));
  const inSelectivity = isRunInSelectivity(selectRuns);
  const startedDirectlyInSelectivity = selectRuns.length === 1 && inSelectivity;
  if (
    checks.requiredPeaks != null &&
    latestRun?.read?.peakCount != null &&
    latestRun.read.peakCount === checks.requiredPeaks
  ) {
    const single = decideRetention([toSample(latestRun, detailsForRun(latestRealIndex, allRuns, details))], checks);
    if (single.status === "specs-met") return null;
    if (inSelectivity && !startedDirectlyInSelectivity && single.status === "efficiency" && !continuePastEfficiency) {
      return null;
    }
  }
  if (history.phase === "selectivity") {
    return history.plan.status === "recommend" ? history.plan.prefill : null;
  }
  if (inSelectivity) {
    return null;
  }
  const segmentIndices = activeIndices.slice(history.segmentStart);
  const samples = segmentIndices.map((idx) => toSample(allRuns[idx], detailsForRun(idx, allRuns, details)));
  const effectiveChoice: RetentionChoice = {
    ...choice,
    afterInBetween: choice.afterInBetween || isAfterInBetween(samples, checks),
  };
  const decision = decideRetention(samples, checks, effectiveChoice);
  if (decision.reason === "choose-percent") {
    if (pickedPercent == null || !Number.isFinite(pickedPercent) || pickedPercent < 0 || pickedPercent > 100) {
      return null;
    }
    const inherited = inheritedConditions(latestRun, latestRealIndex, details);
    return {
      percentB: formatPercentB(pickedPercent),
      temperature: intermediateMode === "yes" ? inherited.temperature : "40",
      solvent: inherited.solvent,
      ligand: inherited.ligand,
    };
  }
  if (decision.status !== "recommend" || decision.nextPercentB == null) return null;
  const typedSecond =
    decision.reason === "second-minimum" &&
    pickedPercent != null &&
    Number.isFinite(pickedPercent) &&
    pickedPercent >= 0 &&
    pickedPercent <= 100
      ? pickedPercent
      : null;
  const picked =
    typedSecond ??
    (pickedPercent != null && decision.bChoices?.some((item) => item.percentB === pickedPercent)
      ? pickedPercent
      : null);
  const percent =
    picked ??
    (decision.move === "calculated" && linePercent != null ? linePercent : decision.nextPercentB);
  const inherited = inheritedConditions(latestRun, latestRealIndex, details);
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

function setupFrom(details: RunDetails, checks: RuleNumbers, runs?: RunState[]) {
  const firstActive = runs ? activeIndicesUpTo(runs, runs.length - 1, details)[0] : undefined;
  const baseDetails =
    runs && firstActive != null && firstActive > 0 ? detailsForRun(firstActive, runs, details) : details;
  return {
    requiredPeaks: checks.requiredPeaks,
    lastPeakTimeMin: checks.lastPeakTimeMin,
    minResolution: checks.minResolution,
    maxBackPressurePsi: checks.maxBackPressurePsi,
    ambientTemperatureC: parseUserNumber(baseDetails.temperature),
    originalSolvent: baseDetails.solvent.trim(),
    originalLigand: baseDetails.ligand.trim(),
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

function shownTemperature(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return degreeWords(trimmed);
}

function runSettingLine(run: RunState): string {
  return [
    shownTemperature(run.temperature),
    run.percentB.trim() ? `${run.percentB}% B` : "",
    run.solvent.trim(),
    run.ligand.trim(),
  ]
    .filter(Boolean)
    .join(", ");
}

function segmentStartAt(runs: RunState[], index: number, details: RunDetails): number {
  if (index <= 0) return 0;
  const activeIndices = activeIndicesUpTo(runs, index, details);
  if (activeIndices.length <= 1) return 0;
  const prefix = activeIndices.map((idx) => toSelectivityRun(runs[idx], idx, details));
  return coatingSegmentStart(prefix);
}

function isSelectivityAt(runs: RunState[], index: number, details: RunDetails): boolean {
  if (index < 0) return false;
  const activeIndices = activeIndicesUpTo(runs, index, details);
  if (activeIndices.length === 0) return false;
  const prefix = activeIndices.map((idx) => toSelectivityRun(runs[idx], idx, details));
  return isRunInSelectivity(prefix);
}

function selectivityFlags(
  runIndex: number,
  heat: HeatStart | null,
  continued: Record<number, boolean>,
  inSelectivity = false,
  segmentStart = 0,
): { continueToLook: boolean; continuePast: boolean } {
  const heatApplies =
    heat != null &&
    runIndex >= 0 &&
    heat.carryIndex >= segmentStart &&
    heat.carryIndex <= runIndex &&
    heat.seriesLength > heat.carryIndex &&
    heat.seriesLength <= runIndex + 1;
  const continuedHere = continued[runIndex] === true;
  return {
    continueToLook: continuedHere && !heatApplies && !inSelectivity,
    continuePast: continuedHere && (heatApplies || inSelectivity),
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

function toSample(run: RunState, runDetails?: RunDetails, displayRunNumber?: number): RetentionSample {
  return {
    percentB: parseUserNumber(run.percentB || runDetails?.percentB || ""),
    peakCount: run.read?.peakCount ?? null,
    lastPeakTimeMin: run.read?.lastPeakTimeMin ?? null,
    firstPeakTimeMin: run.read?.firstPeakTimeMin ?? null,
    minResolutionExcludingFirst: run.read?.minResolutionExcludingFirst ?? null,
    maxBackPressurePsi: run.read?.maxBackPressurePsi ?? null,
    peaks: run.read?.peaks ?? [],
    displayRunNumber,
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

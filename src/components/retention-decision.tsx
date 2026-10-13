"use client";

import { useEffect, useState } from "react";
import { KnowMoreToggle } from "@/components/know-more";
import { StackedRetentionChromatograms, type AlignedRunTrace } from "@/components/look-at-runs";
import { NO_CHANGE_YET } from "@/lib/change-label";
import {
  formatPercentB,
  formatRSquared,
  lineEquation,
  MINIMUM_PERCENT_SENTENCE,
  minimumPercentHeading,
  minimumPercentNote,
  refitMinimumPercent,
  type MinimumFit,
  type RetentionDecision,
  type RetentionFit,
} from "@/lib/retention";
import { PERCENT_B_SENTENCE, SELECTIVITY_ORDER } from "@/lib/setting-kind";
import { cn } from "@/lib/utils";

export function RetentionDecisionView({
  decision,
  onLinePercent,
  onPickPercent,
  traces = [],
  specTimeMin = null,
}: {
  decision: RetentionDecision;
  onLinePercent?: (percent: number | null) => void;
  onPickPercent?: (percent: number | null) => void;
  traces?: AlignedRunTrace[];
  specTimeMin?: number | null;
}) {
  const fit = decision.fit;
  const initial = fit?.catalog.filter((run) => run.included).map((run) => run.runNumber) ?? [];
  const signature = fit
    ? `${fit.rawPercentB}|${fit.catalog.map((run) => `${run.runNumber}${run.included ? "i" : "o"}`).join(",")}`
    : "";
  const [tracked, setTracked] = useState(signature);
  const [selected, setSelected] = useState<number[]>(initial);
  if (tracked !== signature) {
    setTracked(signature);
    setSelected(initial);
  }
  const overridden = fit != null && !sameRunSet(selected, initial);
  const solved = fit ? refitMinimumPercent(fit.catalog, selected, fit.specifiedTimeMin, fit.usedPercentB) : null;
  const reported = overridden && solved ? solved.nextPercentB : null;
  useEffect(() => {
    onLinePercent?.(reported);
  }, [onLinePercent, reported]);

  const paragraphs = fit ? [] : whyParagraphs(decision.why);
  const isInvestigate = decision.status === "investigate";
  const leadParagraphs = isInvestigate
    ? paragraphs.slice(0, 2)
    : paragraphs.length > 1
      ? [paragraphs[paragraphs.length - 1]]
      : paragraphs;
  const detailParagraphs = isInvestigate
    ? paragraphs.slice(2)
    : paragraphs.length > 1
      ? paragraphs.slice(0, -1)
      : [];

  return (
    <div className="contents" id="retention-decision">
      <section
        id="min-b-note"
        className={cn("rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10", fit && "xl:col-span-2")}
      >
        {fit ? (
          <MinimumPercentFit
            fit={fit}
            brief={decision.brief ?? []}
            selected={selected}
            solved={solved}
            onToggle={(runNumber) =>
              setSelected((current) =>
                current.includes(runNumber) ? current.filter((item) => item !== runNumber) : [...current, runNumber],
              )
            }
          />
        ) : (
          <>
            <h2 className="font-heading text-base">Why</h2>
            <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
              {leadParagraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              {decision.bChoices && decision.bChoices.length > 1
                ? decision.bChoices.map((choice) => <p key={choice.id}>{choice.sentence}</p>)
                : null}
              {detailParagraphs.length > 0 ? (
                <KnowMoreToggle>
                  {detailParagraphs.map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </KnowMoreToggle>
              ) : null}
            </div>
          </>
        )}
      </section>
      {decision.pickOwnPercent && traces.length > 1 ? (
        <div className="xl:col-span-2">
          <StackedRetentionChromatograms traces={traces} specTimeMin={specTimeMin} />
        </div>
      ) : null}
    </div>
  );
}

export function SingleRunCloseToSpecChoices({
  currentPercentB,
  nextPercentB,
  onMoveToSelectivity,
}: {
  currentPercentB: number | null;
  nextPercentB: number | null;
  onMoveToSelectivity: () => void;
}) {
  if (nextPercentB == null) return null;
  const nextText = formatPercentB(nextPercentB);
  const currText = currentPercentB != null ? formatPercentB(currentPercentB) : nextText;
  return (
    <div id="single-run-close-choices" className="flex flex-col gap-1">
      <p className="text-[11px] font-semibold text-foreground">
        Minimum %B: N/A (needs ≥ 2 runs). Lower %B by 5% for a 2nd point, or move to selectivity:
      </p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <div className="flex h-8 select-none items-center justify-between gap-1.5 rounded-lg border border-[var(--hp-brand)] bg-[var(--hp-soft-2)] px-2.5 text-xs font-semibold text-foreground ring-2 ring-[var(--hp-brand)]/25">
          <span>{`Run at ${nextText}% B (-5% B)`}</span>
          <RecommendedMark />
        </div>
        <button
          type="button"
          id="single-run-heat-40"
          onClick={onMoveToSelectivity}
          className="flex h-8 cursor-pointer select-none items-center justify-center rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-foreground shadow-xs transition-all duration-150 hover:border-[var(--hp-brand)] hover:bg-[var(--hp-soft)] hover:text-[var(--hp-brand)] active:translate-y-0.5 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {`Move to selectivity (40°C at ${currText}% B)`}
        </button>
      </div>
    </div>
  );
}

export function StartHighBNote() {
  return (
    <section
      id="start-high-b"
      className="scroll-mt-16 rounded-xl border border-[var(--hp-brand)]/20 bg-[var(--hp-soft)] p-3 sm:p-3.5 text-[var(--hp-ink)] shadow-xs"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--hp-brand)] text-[10px] font-bold text-[var(--hp-on-brand)]">
          i
        </span>
        <h2 className="font-heading text-sm font-bold text-foreground">Getting started with HPLC method development</h2>
      </div>
      <div className="mt-2.5 grid grid-cols-1 gap-2 text-xs leading-relaxed sm:grid-cols-3">
        <div className="rounded-lg border border-border/50 bg-background/60 p-2.5">
          <p className="mb-0.5 font-semibold text-foreground">1. Retention (%B)</p>
          <p className="text-muted-foreground">
            Start at ~90–100% B. Tune %B so the last peak elutes before your time limit.
          </p>
        </div>
        <div className="rounded-lg border border-border/50 bg-background/60 p-2.5">
          <p className="mb-0.5 font-semibold text-foreground">2. Selectivity</p>
          <p className="text-muted-foreground">
            Adjust temperature (40°C, 60°C), organic solvent, or column coating until all peaks separate.
          </p>
        </div>
        <div className="rounded-lg border border-border/50 bg-background/60 p-2.5">
          <p className="mb-0.5 font-semibold text-foreground">3. Next Stages</p>
          <p className="text-muted-foreground">
            Sharpen peak widths with efficiency tuning and optimize gradient profile.
          </p>
        </div>
      </div>
    </section>
  );
}

export function LaterChangeNote({ decision }: { decision: RetentionDecision | null }) {
  const explanation =
    decision?.nextChange ?? "Retention is finished. The next kind of change is not built yet.";
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base">Why</h2>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          {(decision?.why?.trim() ? whyParagraphs(decision.why) : [explanation]).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </section>
    </div>
  );
}

export function PercentChoiceButtons({
  choices,
  recommended,
  onPick,
}: {
  choices: { id: string; percentB: number }[];
  recommended: number | null;
  onPick?: (percent: number | null) => void;
}) {
  if (choices.length < 2) return null;
  return (
    <div id="percent-choices" className="grid grid-cols-2 gap-1.5">
      {choices.map((choice) => {
        const preferred = recommended != null && Math.abs(choice.percentB - recommended) < 1e-6;
        return (
          <button
            key={choice.id}
            type="button"
            className={cn(
              "flex cursor-pointer select-none items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs font-semibold shadow-xs transition-all duration-150 active:translate-y-0.5 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              preferred
                ? "border-[var(--hp-brand)] bg-[var(--hp-soft-2)] text-foreground ring-2 ring-[var(--hp-brand)]/25 hover:bg-[var(--hp-soft-3)] hover:shadow-xs"
                : "border-border bg-card text-foreground hover:border-[var(--hp-brand)] hover:bg-[var(--hp-soft)] hover:text-[var(--hp-brand)] hover:shadow-xs",
            )}
            onClick={() => onPick?.(choice.percentB)}
          >
            <span>{`%B ${formatPercentB(choice.percentB)}`}</span>
            {preferred ? <RecommendedMark /> : null}
          </button>
        );
      })}
    </div>
  );
}

function RecommendedMark() {
  return <span className="rounded bg-[var(--hp-brand)]/15 px-1 py-0.5 text-[9px] font-bold tracking-wider text-[var(--hp-brand)] uppercase">Rec</span>;
}

function whyParagraphs(why: string): string[] {
  const parts = why
    .split("\n\n")
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !isOtherStage(paragraph));
  return parts.length > 0 ? parts : [NO_CHANGE_YET];
}

/** The pump range and the later selectivity sequence stay off this step. */
function isOtherStage(paragraph: string): boolean {
  if (paragraph.includes(SELECTIVITY_ORDER)) return true;
  if (paragraph.includes(PERCENT_B_SENTENCE)) return true;
  if (paragraph.startsWith("The order is")) return true;
  if (paragraph.startsWith("After 40°C") || paragraph.startsWith("After 60°C") || paragraph.startsWith("After the solvent")) {
    return true;
  }
  return false;
}

function wholePercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function PickOwnPercent({
  picked,
  minimum,
  onPick,
  mode,
  onModeChange,
  onCompareRuns,
}: {
  picked: number | null;
  /** %B on the minimum run that was just uploaded. No keeps this and goes to 40°C. */
  minimum: number | null;
  onPick: (percent: number | null) => void;
  mode?: "yes" | "no" | null;
  onModeChange?: (mode: "yes" | "no" | null) => void;
  onCompareRuns?: () => void;
}) {
  const minimumWhole = minimum != null && Number.isFinite(minimum) ? wholePercent(minimum) : null;
  const pickedWhole = picked != null && Number.isFinite(picked) ? wholePercent(picked) : null;
  const [localAsking, setLocalAsking] = useState<"yes" | "no" | null>(pickedWhole != null ? "yes" : null);
  const asking = mode !== undefined ? mode : localAsking;
  const setAsking = (next: "yes" | "no" | null) => {
    setLocalAsking(next);
    onModeChange?.(next);
  };
  const [value, setValue] = useState(pickedWhole ?? minimumWhole ?? 50);
  const choiceClass = (selected: boolean) =>
    "group flex h-8 cursor-pointer select-none items-center justify-center gap-1.5 rounded-lg border px-3 text-center text-xs font-bold shadow-xs transition-all duration-150 active:translate-y-0.5 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 " +
    (selected
      ? "border-[var(--hp-brand)] bg-[var(--hp-brand)] text-[var(--hp-on-brand)] shadow-xs ring-2 ring-[var(--hp-brand)]/25 hover:bg-[var(--hp-brand-hover)]"
      : "border-border bg-card text-foreground hover:border-[var(--hp-brand)] hover:bg-[var(--hp-soft)] hover:text-[var(--hp-brand)]");
  return (
    <div id="own-percent-choice" className="mt-1 flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-foreground">Would you like to use an intermediate %B?</p>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          id="choose-own-yes"
          aria-pressed={asking === "yes"}
          className={choiceClass(asking === "yes")}
          onClick={() => {
            const next = pickedWhole ?? minimumWhole ?? value;
            setValue(next);
            setAsking("yes");
            onPick(next);
          }}
        >
          {asking === "yes" ? (
            <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5 shrink-0" aria-hidden="true">
              <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
            </svg>
          ) : null}
          <span>Yes</span>
        </button>
        <button
          type="button"
          id="choose-own-no"
          aria-pressed={asking === "no"}
          className={choiceClass(asking === "no")}
          onClick={() => {
            setAsking("no");
            if (minimum != null && Number.isFinite(minimum)) onPick(minimum);
          }}
        >
          {asking === "no" ? (
            <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5 shrink-0" aria-hidden="true">
              <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
            </svg>
          ) : null}
          <span>No</span>
        </button>
      </div>
      {asking === "no" && minimum != null && Number.isFinite(minimum) ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Using {formatPercentB(minimum)}% B from this run, at 40°C.
          </p>
          {onCompareRuns ? (
            <button
              type="button"
              onClick={onCompareRuns}
              className="cursor-pointer text-xs font-semibold text-[var(--hp-brand)] underline-offset-2 hover:underline"
            >
              Pick a different run to heat
            </button>
          ) : null}
        </div>
      ) : null}
      {asking === "yes" ? (
        <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-muted/20 p-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-foreground" htmlFor="own-percent-b">
              Intermediate %B (ambient):
            </label>
            <span id="own-percent-value" className="font-heading text-sm font-bold text-foreground">
              {formatPercentB(value)}% B
            </span>
          </div>
          <input
            id="own-percent-b"
            type="range"
            min={0}
            max={100}
            step={1}
            value={value}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
            aria-valuetext={`${formatPercentB(value)}% B`}
            className="h-1.5 w-full cursor-pointer accent-[var(--hp-brand)]"
            onChange={(event) => {
              const next = wholePercent(Number(event.target.value));
              setValue(next);
              onPick(next);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function SecondPercentChoice({
  recommended,
  picked,
  onPick,
}: {
  recommended: number;
  picked: number | null;
  onPick: (percent: number | null) => void;
}) {
  const typed = picked != null && Number.isFinite(picked) && Math.abs(picked - recommended) > 1e-6;
  const [mode, setMode] = useState<"recommended" | "typed">(typed ? "typed" : "recommended");
  const [draft, setDraft] = useState(typed ? String(picked) : "");
  return (
    <div id="second-min-choice" className="mt-1 flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          id="use-recommended-b"
          className={cn(
            "flex h-8 cursor-pointer select-none items-center justify-between gap-1.5 rounded-lg border px-2.5 text-xs font-semibold shadow-xs transition-all duration-150 active:translate-y-0.5 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            mode === "recommended"
              ? "border-[var(--hp-brand)] bg-[var(--hp-soft-2)] text-foreground ring-2 ring-[var(--hp-brand)]/25 hover:bg-[var(--hp-soft-3)]"
              : "border-border bg-card text-muted-foreground hover:border-[var(--hp-brand)] hover:bg-[var(--hp-soft)] hover:text-foreground",
          )}
          onClick={() => {
            setMode("recommended");
            setDraft("");
            onPick(null);
          }}
        >
          <span>{`${formatPercentB(recommended)}% B`}</span>
          <RecommendedMark />
        </button>
        <button
          type="button"
          id="choose-other-b"
          className={cn(
            "flex h-8 cursor-pointer select-none items-center justify-center rounded-lg border px-2.5 text-xs font-semibold shadow-xs transition-all duration-150 active:translate-y-0.5 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            mode === "typed"
              ? "border-[var(--hp-brand)] bg-[var(--hp-soft-2)] text-foreground ring-2 ring-[var(--hp-brand)]/25 hover:bg-[var(--hp-soft-3)]"
              : "border-border bg-card text-muted-foreground hover:border-[var(--hp-brand)] hover:bg-[var(--hp-soft)] hover:text-foreground",
          )}
          onClick={() => setMode("typed")}
        >
          Other %B
        </button>
      </div>
      {mode === "typed" ? (
        <label className="flex items-center gap-2 text-xs font-medium text-foreground" htmlFor="typed-percent-b">
          <span>%B for 40°C:</span>
          <input
            id="typed-percent-b"
            type="number"
            min={0}
            max={100}
            step="any"
            inputMode="decimal"
            value={draft}
            className="h-7 w-20 rounded-md border border-input bg-[var(--hp-paper)] px-2 text-xs font-semibold text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            onChange={(event) => {
              const text = event.target.value;
              setDraft(text);
              const value = Number(text);
              if (Number.isFinite(value) && value >= 0 && value <= 100) onPick(value);
            }}
          />
        </label>
      ) : null}
    </div>
  );
}

function MinimumPercentFit({
  fit,
  brief,
  selected,
  solved,
  onToggle,
}: {
  fit: RetentionFit;
  brief: string[];
  selected: number[];
  solved: MinimumFit | null;
  onToggle: (runNumber: number) => void;
}) {
  const chosen = new Set(selected);
  const percent = solved?.nextPercentB ?? fit.nextPercentB;
  const r2Met = solved != null && solved.rSquared >= 0.99;
  return (
    <div id="min-b-fit" className="flex flex-col gap-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-base">{minimumPercentHeading(percent)}</h2>
          {solved ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                r2Met
                  ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
                  : "bg-orange-100 text-orange-950 dark:bg-orange-900/40 dark:text-orange-100",
              )}
            >
              {`${formatRSquared(solved.rSquared)} ${r2Met ? "(≥ 0.99)" : "(< 0.99)"}`}
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          <p>{MINIMUM_PERCENT_SENTENCE}</p>
          {!solved ? (
            <p className="text-orange-800 dark:text-orange-200">
              {selected.length < 2
                ? "Fewer than two runs are selected, so the line cannot be drawn yet."
                : "The line cannot be drawn yet. At least two selected runs need a %B and a last peak after the t0 peak."}
            </p>
          ) : null}
          <KnowMoreToggle>
            {brief.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {solved ? (
              <>
                <h3 className="mt-1 font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Calculation details
                </h3>
                {minimumPercentNote(solved, fit.specifiedTimeMin, fit.qtestSentence).map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </>
            ) : null}
          </KnowMoreToggle>
        </div>
      </div>
      {solved ? <LogKGraph fit={solved} /> : null}
      <div className="overflow-x-auto">
        <table id="min-b-runs" className="w-full min-w-[44rem] border-collapse text-left text-sm">
          <caption className="pb-2 text-left font-medium text-foreground">
            Every uploaded run. A check puts that run on the line. The checks start from the runs the Q-test and the
            separation rules kept.
          </caption>
          <thead>
            <tr className="border-t border-border text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-2 py-2 font-medium">On the line</th>
              <th className="px-2 py-2 font-medium">Run</th>
              <th className="px-2 py-2 font-medium">%B</th>
              <th className="px-2 py-2 font-medium">t0 (min)</th>
              <th className="px-2 py-2 font-medium">Last peak (min)</th>
              <th className="px-2 py-2 font-medium">Line</th>
            </tr>
          </thead>
          <tbody>
            {fit.catalog.map((run) => {
              const onLine = chosen.has(run.runNumber);
              return (
                <tr key={run.runNumber} className="border-t border-border" data-run={run.runNumber}>
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--hp-brand)]"
                      checked={onLine}
                      aria-label={`Run ${run.runNumber} on the line`}
                      onChange={() => onToggle(run.runNumber)}
                    />
                  </td>
                  <th className="px-2 py-2 font-medium" scope="row">
                    Run {run.runNumber}
                  </th>
                  <td className="px-2 py-2">{run.percentB == null ? "—" : formatPercentB(run.percentB)}</td>
                  <td className="px-2 py-2">{showMinutes(run.t0)}</td>
                  <td className="px-2 py-2">{showMinutes(run.tR)}</td>
                  <td className="px-2 py-2">{onLine ? "Included" : "Left out"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LogKGraph({ fit }: { fit: MinimumFit }) {
  const points = fit.rows.map((row) => ({ x: row.percentB, y: row.logK, run: row.runNumber }));
  const mark = { x: fit.rawPercentB, y: fit.logKTarget };
  const xs = [...points.map((point) => point.x), mark.x];
  const ys = [...points.map((point) => point.y), mark.y];
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(0.05, maxY - minY);
  minX -= spanX * 0.18;
  maxX += spanX * 0.12;
  minY -= spanY * 0.22;
  maxY += spanY * 0.28;
  const width = 640;
  const height = 300;
  const left = 52;
  const right = 16;
  const top = 48;
  const bottom = 36;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const sx = (value: number) => left + ((value - minX) / (maxX - minX)) * plotW;
  const sy = (value: number) => top + ((maxY - value) / (maxY - minY)) * plotH;
  const yOnLine = (percent: number) => fit.m * percent + fit.c;
  const lineStart = sx(minX);
  const lineEnd = sx(maxX);
  const equation = lineEquation(fit.m, fit.c);
  const r2 = formatRSquared(fit.rSquared);
  return (
    <figure id="min-b-graph">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${equation}. ${r2}. The unrounded %B is marked where the target logK meets the line.`}
      >
        <line x1={left} y1={top} x2={left} y2={top + plotH} stroke="var(--hp-ink)" strokeWidth="1" />
        <line x1={left} y1={top + plotH} x2={left + plotW} y2={top + plotH} stroke="var(--hp-ink)" strokeWidth="1" />
        <text x={left + plotW / 2} y={height - 8} textAnchor="middle" fill="var(--hp-ink)" fontSize="12">
          %B
        </text>
        <text x="14" y={top + plotH / 2} textAnchor="middle" fill="var(--hp-ink)" fontSize="12" transform={`rotate(-90 14 ${top + plotH / 2})`}>
          logK
        </text>
        <line
          x1={lineStart}
          y1={sy(yOnLine(minX))}
          x2={lineEnd}
          y2={sy(yOnLine(maxX))}
          stroke="var(--hp-brand)"
          strokeWidth="2"
        />
        <line
          x1={left}
          y1={sy(mark.y)}
          x2={sx(mark.x)}
          y2={sy(mark.y)}
          stroke="var(--hp-warn)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <line
          x1={sx(mark.x)}
          y1={sy(mark.y)}
          x2={sx(mark.x)}
          y2={top + plotH}
          stroke="var(--hp-warn)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        {points.map((point) => (
          <circle key={point.run} cx={sx(point.x)} cy={sy(point.y)} r="4.5" fill="var(--hp-ink)" />
        ))}
        <circle id="min-b-mark" cx={sx(mark.x)} cy={sy(mark.y)} r="5.5" fill="var(--hp-warn)" />
        <text x={sx(mark.x)} y={sy(mark.y) - 10} textAnchor="middle" fill="var(--hp-warn)" fontSize="12">
          {formatPercentB(mark.x)}% B
        </text>
        <text id="min-b-equation" x={left + plotW} y={16} textAnchor="end" fill="var(--hp-ink)" fontSize="13">
          {equation}
        </text>
        <text id="min-b-r2" x={left + plotW} y={34} textAnchor="end" fill="var(--hp-ink)" fontSize="13">
          {r2}
        </text>
      </svg>
    </figure>
  );
}

function sameRunSet(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  const chosen = new Set(left);
  return right.every((run) => chosen.has(run));
}

function showMinutes(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(3);
}


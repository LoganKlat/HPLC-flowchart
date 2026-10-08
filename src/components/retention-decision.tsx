"use client";

import { useEffect, useState } from "react";
import { axisTicks, formatAxisTick } from "@/components/chromatogram-chart";
import {
  formatPercentB,
  formatRSquared,
  lineEquation,
  minimumPercentNote,
  refitMinimumPercent,
  type FitCatalogRun,
  type MinimumFit,
  type RetentionDecision,
  type RetentionFit,
} from "@/lib/retention";

export function RetentionDecisionView({
  decision,
  onLinePercent,
  onPickPercent,
}: {
  decision: RetentionDecision;
  onLinePercent?: (percent: number | null) => void;
  onPickPercent?: (percent: number) => void;
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
  const nextChange = fit && overridden ? nextChangeForSelection(fit, solved) : decision.nextChange;

  return (
    <div className="flex flex-col gap-4" id="retention-decision">
      <section
        id="next-change"
        className="scroll-mt-16 rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10"
      >
        <h2 className="font-heading text-base">Next change</h2>
        <p className="mt-1 text-sm leading-relaxed text-foreground">{nextChange}</p>
        {decision.bChoices && decision.bChoices.length > 1 ? (
          <div id="percent-choices" className="mt-3 flex flex-col gap-2">
            {decision.bChoices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                className="rounded-lg border border-[#0f6b56] bg-white px-3 py-2 text-left text-sm leading-relaxed text-[#144237]"
                onClick={() => onPickPercent?.(choice.percentB)}
              >
                {choice.sentence}
              </button>
            ))}
          </div>
        ) : null}
        {decision.following ? (
          <p id="following-step" className="mt-3 text-sm leading-relaxed text-foreground">
            {decision.following}
          </p>
        ) : null}
      </section>
      <section id="min-b-note" className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base">Why</h2>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          {decision.why.split("\n\n").map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
        {fit ? (
          <MinimumPercentFit
            fit={fit}
            selected={selected}
            overridden={overridden}
            solved={solved}
            onToggle={(runNumber) =>
              setSelected((current) =>
                current.includes(runNumber) ? current.filter((item) => item !== runNumber) : [...current, runNumber],
              )
            }
          />
        ) : null}
      </section>
    </div>
  );
}

export function StartHighBNote() {
  return (
    <section
      id="start-high-b"
      className="scroll-mt-16 rounded-xl bg-[#e7f3ee] px-4 py-4 text-[#144237]"
    >
      <h2 className="font-heading text-base">What we’re doing</h2>
      <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed">
        <p>
          The main goal is to separate the compounds in a composite sample, so each compound shows
          up as its own peak.
        </p>
        <p>
          First, find a %B where the peak count meets the specification and the last peak comes out
          by the time that was set. Next, change the conditions — temperature, then the solvent,
          then the column coating — so peaks that still sit together pull apart. After that, make
          the peaks narrower. Last, change %B while the run is going. Those last two stages are not
          built yet.
        </p>
        <p>Start the first run around 90–100% B. A higher %B lets the decision engine work better.</p>
        <p>Enter the initial run details. They update automatically after each decision.</p>
      </div>
    </section>
  );
}

export function LaterChangeNote({ decision }: { decision: RetentionDecision | null }) {
  return (
    <div className="flex flex-col gap-4">
      <section
        id="next-change"
        className="scroll-mt-16 rounded-xl bg-[#e7f3ee] px-4 py-4 text-[#144237]"
      >
        <h2 className="font-heading text-base">Next change</h2>
        <p className="mt-1 text-sm leading-relaxed">
          {decision?.nextChange ??
            "Retention is finished. The next kind of change is not built yet."}
        </p>
      </section>
      <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base">Why</h2>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          {(
            decision?.why ??
            "Retention is finished. The next kind of change is not built yet."
          )
            .split("\n\n")
            .map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
        </div>
      </section>
    </div>
  );
}

function MinimumPercentFit({
  fit,
  selected,
  overridden,
  solved,
  onToggle,
}: {
  fit: RetentionFit;
  selected: number[];
  overridden: boolean;
  solved: MinimumFit | null;
  onToggle: (runNumber: number) => void;
}) {
  const chosen = new Set(selected);
  return (
    <div id="min-b-fit" className="mt-4 flex flex-col gap-4">
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-foreground">
        {overridden ? <p>{selectedLine(fit.catalog, selected)}</p> : null}
        {solved ? (
          minimumPercentNote(solved, fit.specifiedTimeMin).map((paragraph, index) => <p key={index}>{paragraph}</p>)
        ) : (
          <p>
            {selected.length < 2
              ? "Fewer than two runs are selected, so the line cannot be drawn yet."
              : "The line cannot be drawn yet. At least two selected runs need a %B and a last peak after the t0 peak."}
          </p>
        )}
      </div>
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
              <th className="px-2 py-2 font-medium">k</th>
              <th className="px-2 py-2 font-medium">logK</th>
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
                      className="size-4 accent-[#0f6b56]"
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
                  <td className="px-2 py-2">{showCalc(run.k)}</td>
                  <td className="px-2 py-2">{showCalc(run.logK)}</td>
                  <td className="px-2 py-2">{onLine ? "Included" : "Left out"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {solved ? <LogKGraph fit={solved} /> : null}
    </div>
  );
}

function LogKGraph({ fit }: { fit: MinimumFit }) {
  const width = 720;
  const plotLeft = 72;
  const plotRight = 28;
  const plotTop = 36;
  const plotBottom = 72;
  const innerWidth = width - plotLeft - plotRight;
  const innerHeight = 280;
  const height = plotTop + innerHeight + plotBottom;
  const xs = [...fit.rows.map((row) => row.percentB), fit.rawPercentB];
  const ys = [...fit.rows.map((row) => row.logK), fit.logKTarget];
  const xDomain = padded(xs);
  const yDomain = padded(ys);
  const xOf = (value: number) => plotLeft + ((value - xDomain.min) / (xDomain.max - xDomain.min)) * innerWidth;
  const yOf = (value: number) => plotTop + ((yDomain.max - value) / (yDomain.max - yDomain.min)) * innerHeight;
  const axisY = plotTop + innerHeight;
  const xTicks = axisTicks(xDomain.min, xDomain.max);
  const yTicks = axisTicks(yDomain.min, yDomain.max);
  const meetX = xOf(fit.rawPercentB);
  const meetY = yOf(fit.logKTarget);
  const percentLabel = `${formatCalcLabel(fit.rawPercentB)}% B`;
  const crowded = xTicks.some((tick) => Math.abs(xOf(tick) - meetX) < 36);
  const lineMin = Math.min(...fit.rows.map((row) => row.percentB), fit.rawPercentB);
  const lineMax = Math.max(...fit.rows.map((row) => row.percentB), fit.rawPercentB);
  const yAt = (percent: number) => fit.m * percent + fit.c;

  return (
    <figure id="min-b-graph" className="rounded-xl bg-[#f7fbf8] ring-1 ring-foreground/10">
      <figcaption className="px-4 pt-3 font-heading text-base text-foreground">logK against %B</figcaption>
      <div className="px-4 pt-1 pb-2 text-sm leading-snug text-foreground">
        <p data-min-b-equation>{lineEquation(fit.m, fit.c)}</p>
        <p data-min-b-r2>{formatRSquared(fit.rSquared)}</p>
      </div>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`logK against %B. The line meets logK ${formatCalcLabel(fit.logKTarget)} at ${percentLabel}.`}
        className="block w-full"
        style={{ height: "auto", aspectRatio: `${width} / ${height}` }}
      >
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={plotLeft}
              x2={width - plotRight}
              y1={yOf(tick)}
              y2={yOf(tick)}
              stroke="currentColor"
              className="text-foreground/10"
            />
            <text
              x={plotLeft - 8}
              y={yOf(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {formatAxisTick(tick)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <g key={`x-${tick}`}>
            <line
              x1={xOf(tick)}
              x2={xOf(tick)}
              y1={axisY}
              y2={axisY + 5}
              stroke="currentColor"
              className="text-foreground/50"
            />
            <text x={xOf(tick)} y={axisY + 18} textAnchor="middle" className="fill-muted-foreground text-[11px]">
              {formatAxisTick(tick)}
            </text>
          </g>
        ))}
        <text
          x={plotLeft + innerWidth / 2}
          y={height - 16}
          textAnchor="middle"
          className="fill-foreground text-[12px]"
        >
          %B
        </text>
        <text
          x={18}
          y={plotTop + innerHeight / 2}
          transform={`rotate(-90 18 ${plotTop + innerHeight / 2})`}
          textAnchor="middle"
          className="fill-foreground text-[12px]"
        >
          logK
        </text>
        <line x1={plotLeft} x2={plotLeft} y1={plotTop} y2={axisY} stroke="currentColor" className="text-foreground/30" />
        <line
          x1={plotLeft}
          x2={width - plotRight}
          y1={axisY}
          y2={axisY}
          stroke="currentColor"
          className="text-foreground/30"
        />
        <line
          x1={xOf(lineMin)}
          x2={xOf(lineMax)}
          y1={yOf(yAt(lineMin))}
          y2={yOf(yAt(lineMax))}
          stroke="#0f6b56"
          strokeWidth="2.2"
        />
        <line x1={plotLeft} x2={meetX} y1={meetY} y2={meetY} stroke="#9a7b3c" strokeDasharray="4 3" strokeWidth="1.4" />
        <line x1={meetX} x2={meetX} y1={meetY} y2={axisY} stroke="#9a7b3c" strokeDasharray="4 3" strokeWidth="1.4" />
        {fit.rows.map((row) => (
          <g key={row.runNumber}>
            <circle cx={xOf(row.percentB)} cy={yOf(row.logK)} r="4" fill="#144237" />
            <text
              x={xOf(row.percentB)}
              y={yOf(row.logK) - 10}
              textAnchor="middle"
              className="fill-foreground text-[11px]"
            >
              Run {row.runNumber}
            </text>
          </g>
        ))}
        <text
          x={meetX}
          y={crowded ? axisY + 40 : axisY + 18}
          textAnchor="middle"
          className="fill-[#0f6b56] text-[12px] font-medium"
        >
          {percentLabel}
        </text>
      </svg>
    </figure>
  );
}

function nextChangeForSelection(fit: RetentionFit, solved: MinimumFit | null): string {
  if (!solved) return "The line cannot be drawn yet. A %B is not recommended from the runs selected now.";
  let next = `Run the next chromatogram at ${formatPercentB(solved.nextPercentB)}% B. That is the %B calculated to put the last peak at ${fit.specifiedTimeMin.toFixed(3)} min.`;
  if (solved.clamped === "high") next += " The calculated value was above 100, so it is held at 100.";
  else if (solved.clamped === "low") next += " The calculated value was below 0, so it is held at 0.";
  return next;
}

function selectedLine(catalog: readonly FitCatalogRun[], selected: readonly number[]): string {
  const chosen = new Set(selected);
  const labels = catalog
    .filter((run) => chosen.has(run.runNumber))
    .map((run) =>
      run.percentB == null ? `Run ${run.runNumber}` : `Run ${run.runNumber} at ${formatPercentB(run.percentB)}% B`,
    );
  if (labels.length === 0) return "The line is using the runs you selected. None are selected.";
  if (labels.length === 1) return `The line is using the runs you selected: ${labels[0]}.`;
  const last = labels[labels.length - 1];
  return `The line is using the runs you selected: ${labels.slice(0, -1).join(", ")} and ${last}.`;
}

function sameRunSet(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  const chosen = new Set(left);
  return right.every((run) => chosen.has(run));
}

function padded(values: number[]): { min: number; max: number } {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!(max > min)) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.12;
  return { min: min - pad, max: max + pad };
}

function showMinutes(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(3);
}

function showCalc(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(3);
}

function formatCalcLabel(value: number): string {
  const whole = Math.round(value);
  if (Math.abs(value - whole) < 1e-6) return String(whole);
  return value.toFixed(2);
}

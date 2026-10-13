"use client";

import { axisTicks, formatAxisTick } from "@/components/chromatogram-chart";
import { KnowMoreToggle } from "@/components/know-more";
import type { ChromatogramPoint } from "@/lib/lab-file";
import { formatPercentB, type LookRun, type LookStep } from "@/lib/retention";
import { cn } from "@/lib/utils";

export type AlignedRunTrace = {
  index: number;
  runNumber: number;
  shortCode: string | null;
  fileName: string | null;
  solvent: string;
  percentB: number | null;
  temperature: string;
  ligand: string;
  peakCount: number | null;
  lastPeakTimeMin: number | null;
  rawResolution: number | null;
  decisionResolution: number | null;
  peaksMet: boolean;
  chromatogram: ChromatogramPoint[] | null;
  yLabel: string;
};

function markWord(mark: LookRun["peaks"]): string {
  if (mark === "met") return "Met";
  if (mark === "not-met") return "Not met";
  return "Blank";
}

function niceYMax(maxIntensity: number): number {
  if (!(maxIntensity > 0) || !Number.isFinite(maxIntensity)) return 1000;
  const padded = maxIntensity * 1.08;
  const power = 10 ** Math.floor(Math.log10(padded));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  for (const factor of steps) {
    const candidate = factor * power;
    if (candidate >= padded) return Math.round(candidate);
  }
  return Math.round(10 * power);
}

function formatTempShort(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || /^(amb|ambient|25)$/i.test(trimmed)) return "amb";
  const cleaned = trimmed.replace(/°\s*c$/i, "");
  return `${cleaned}°C`;
}

export function StackedRetentionChromatograms({
  traces,
  specTimeMin,
  onPickRun,
}: {
  traces: AlignedRunTrace[];
  specTimeMin: number | null;
  onPickRun?: (index: number) => void;
}) {
  const withPoints = traces.filter((t) => t.chromatogram && t.chromatogram.length > 1);
  if (withPoints.length === 0) return null;

  let maxDataTime = 0;
  for (const trace of withPoints) {
    for (const pt of trace.chromatogram!) {
      if (Number.isFinite(pt.timeMin) && pt.timeMin > maxDataTime) {
        maxDataTime = pt.timeMin;
      }
    }
  }
  const specValid = specTimeMin != null && Number.isFinite(specTimeMin) && specTimeMin > 0 ? specTimeMin : null;
  const minTime = 0;
  const maxTime = Math.max(1, maxDataTime, specValid != null ? specValid * 1.15 : 0);

  const svgWidth = 680;
  const plotLeft = 44;
  const plotRight = 14;
  const innerWidth = svgWidth - plotLeft - plotRight;
  const xOf = (time: number) =>
    plotLeft + ((Math.max(minTime, Math.min(maxTime, time)) - minTime) / (maxTime - minTime)) * innerWidth;

  const xTicks = axisTicks(minTime, maxTime);
  const specX = specValid != null ? xOf(specValid) : null;
  const topUnit = withPoints[0]?.yLabel || "mAU";

  return (
    <section
      id="stacked-retention-chromatograms"
      className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10"
      aria-label="Aligned retention chromatograms"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-base">Retention runs comparison (aligned time axis)</h2>
        <span className="text-xs text-muted-foreground">
          All chromatograms share the same horizontal time scale to show how peaks shift with %B
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[38rem]">
          {/* Header row for mAU and run-time spec label */}
          <div className="grid grid-cols-[11.5rem_minmax(0,1fr)] items-end gap-3">
            <div />
            <svg viewBox={`0 0 ${svgWidth} 24`} className="block h-auto w-full overflow-visible" aria-hidden="true">
              <text
                x={plotLeft - 6}
                y={18}
                textAnchor="end"
                className="fill-muted-foreground text-[11px] font-medium"
              >
                {topUnit}
              </text>
              {specX != null && specValid != null ? (
                <text
                  x={Math.min(svgWidth - plotRight - 4, Math.max(plotLeft + 40, specX - 6))}
                  y={16}
                  textAnchor="end"
                  className="fill-red-700 dark:fill-red-400 text-[11px] font-bold"
                >
                  {`run-time spec ${specValid} min`}
                </text>
              ) : null}
            </svg>
          </div>

          {/* Stacked chromatogram rows */}
          <div className="flex flex-col">
            {traces.map((trace) => {
              const points = trace.chromatogram ?? [];
              let maxIntensity = 0;
              for (const pt of points) {
                if (Number.isFinite(pt.intensity) && pt.intensity > maxIntensity) {
                  maxIntensity = pt.intensity;
                }
              }
              const yMax = niceYMax(maxIntensity);
              const rowHeight = 64;
              const traceTop = 8;
              const traceBottom = 54;
              const traceH = traceBottom - traceTop;
              const yOf = (intensity: number) => {
                const clamped = Math.max(0, Math.min(yMax, intensity));
                return traceBottom - (clamped / yMax) * traceH;
              };
              const path = points
                .map((pt, idx) => `${idx === 0 ? "M" : "L"}${xOf(pt.timeMin).toFixed(1)},${yOf(pt.intensity).toFixed(1)}`)
                .join(" ");

              const pctText = trace.percentB != null ? `${formatPercentB(trace.percentB)}%` : "—";
              const tempText = formatTempShort(trace.temperature);
              const pkText = trace.peakCount != null ? `${trace.peakCount} pk` : "— pk";
              const trText = trace.lastPeakTimeMin != null ? `tR ${trace.lastPeakTimeMin.toFixed(1)}` : "tR —";
              const rsValue = trace.rawResolution;
              const rsText = rsValue != null && Number.isFinite(rsValue) ? `Rs ${rsValue.toFixed(2)}` : "Rs —";

              return (
                <div
                  key={trace.runNumber}
                  onClick={onPickRun ? () => onPickRun(trace.index) : undefined}
                  className={cn(
                    "grid grid-cols-[11.5rem_minmax(0,1fr)] items-center gap-3 rounded-lg px-1 py-0.5 transition-colors",
                    onPickRun && "cursor-pointer hover:bg-[var(--hp-soft-wash)]/70",
                  )}
                  title={
                    onPickRun
                      ? `Click to heat Run ${trace.runNumber} (${pctText} B) to 40°C`
                      : trace.fileName ?? `Run ${trace.runNumber}`
                  }
                >
                  <div className="flex min-w-0 flex-col leading-snug">
                    <div className="truncate text-xs">
                      <span className="font-bold text-foreground">
                        {trace.shortCode ? trace.shortCode : `Run ${trace.runNumber}`}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {[trace.solvent || "ACN", pctText].filter(Boolean).join(" ")} · {tempText}
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {trace.ligand || "—"}
                      {trace.shortCode ? ` · Run ${trace.runNumber}` : ""}
                    </div>
                    <div
                      className={cn(
                        "truncate text-[11px] font-bold tabular-nums",
                        trace.peaksMet
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-red-700 dark:text-red-400",
                      )}
                    >
                      {`${pkText} · ${trText} · ${rsText}`}
                    </div>
                  </div>

                  <svg
                    viewBox={`0 0 ${svgWidth} ${rowHeight}`}
                    className="block h-auto w-full overflow-visible"
                    role="img"
                    aria-label={`Run ${trace.runNumber} (${pctText} B): ${pkText}, ${trText}, ${rsText}`}
                  >
                    {/* Vertical grid lines */}
                    {xTicks.map((tick) => (
                      <line
                        key={`grid-${tick}`}
                        x1={xOf(tick)}
                        x2={xOf(tick)}
                        y1={0}
                        y2={rowHeight}
                        stroke="currentColor"
                        className="text-foreground/7"
                        strokeWidth="1"
                      />
                    ))}

                    {/* Y axis */}
                    <line
                      x1={plotLeft}
                      x2={plotLeft}
                      y1={traceTop}
                      y2={traceBottom}
                      stroke="currentColor"
                      className="text-foreground/35"
                      strokeWidth="1"
                    />
                    {/* Top Y tick */}
                    <line
                      x1={plotLeft - 4}
                      x2={plotLeft}
                      y1={traceTop}
                      y2={traceTop}
                      stroke="currentColor"
                      className="text-foreground/40"
                      strokeWidth="1"
                    />
                    <text
                      x={plotLeft - 6}
                      y={traceTop + 3}
                      textAnchor="end"
                      className="fill-muted-foreground text-[9px] tabular-nums"
                    >
                      {yMax}
                    </text>
                    {/* Bottom Y tick (0) */}
                    <line
                      x1={plotLeft - 4}
                      x2={plotLeft}
                      y1={traceBottom}
                      y2={traceBottom}
                      stroke="currentColor"
                      className="text-foreground/40"
                      strokeWidth="1"
                    />
                    <text
                      x={plotLeft - 6}
                      y={traceBottom + 3}
                      textAnchor="end"
                      className="fill-muted-foreground text-[9px] tabular-nums"
                    >
                      0
                    </text>

                    {/* Full-width baseline */}
                    <line
                      x1={plotLeft}
                      x2={svgWidth - plotRight}
                      y1={traceBottom}
                      y2={traceBottom}
                      stroke="currentColor"
                      className="text-foreground/25"
                      strokeWidth="1"
                    />

                    {/* Chromatogram path */}
                    {path ? (
                      <path
                        d={path}
                        fill="none"
                        stroke="var(--hp-ink)"
                        strokeWidth="1.35"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    ) : null}

                    {/* Red dashed specification line */}
                    {specX != null ? (
                      <line
                        x1={specX}
                        x2={specX}
                        y1={0}
                        y2={rowHeight}
                        stroke="#c04b3e"
                        strokeWidth="1.5"
                        strokeDasharray="4 3"
                      />
                    ) : null}
                  </svg>
                </div>
              );
            })}
          </div>

          {/* Shared bottom time axis */}
          <div className="grid grid-cols-[11.5rem_minmax(0,1fr)] items-start gap-3">
            <div />
            <svg viewBox={`0 0 ${svgWidth} 28`} className="block h-auto w-full overflow-visible" aria-hidden="true">
              <line
                x1={plotLeft}
                x2={svgWidth - plotRight}
                y1={2}
                y2={2}
                stroke="currentColor"
                className="text-foreground/30"
                strokeWidth="1"
              />
              {xTicks.map((tick) => (
                <g key={`xtick-${tick}`}>
                  <line
                    x1={xOf(tick)}
                    x2={xOf(tick)}
                    y1={2}
                    y2={6}
                    stroke="currentColor"
                    className="text-foreground/45"
                    strokeWidth="1"
                  />
                  <text
                    x={xOf(tick)}
                    y={16}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[9px] tabular-nums"
                  >
                    {formatAxisTick(tick)}
                  </text>
                </g>
              ))}
              <text
                x={plotLeft + innerWidth / 2}
                y={26}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px] font-medium"
              >
                Time (min)
              </text>
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PickRunToHeatControls({
  look,
  onPickRun,
  startIndex = 0,
}: {
  look: LookStep;
  onPickRun: (index: number) => void;
  startIndex?: number;
}) {
  const showPicker = look.mode === "picker" || look.mode === "between-then-heat";
  if (!showPicker) return null;

  return (
    <div id="pick-run" className="flex flex-col gap-1">
      <p className="text-[11px] font-semibold text-foreground">
        Which run to heat (to 40°C at that run&apos;s %B):
      </p>
      <div className="grid max-h-32 grid-cols-2 gap-1.5 overflow-y-auto pr-0.5 sm:grid-cols-3">
        {look.runs.map((run) => {
          const runNumber = run.displayRunNumber ?? startIndex + run.index + 1;
          return (
            <button
              key={run.index}
              type="button"
              className="flex cursor-pointer select-none flex-col items-start gap-0.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left shadow-2xs transition-all duration-150 hover:border-[var(--hp-brand)] hover:bg-[var(--hp-soft)] hover:text-[var(--hp-brand)] active:translate-y-0.5 active:scale-[0.99] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => onPickRun(run.index)}
            >
              <span className="text-xs font-bold leading-tight text-foreground">
                Heat run {runNumber}
                {run.percentB == null ? "" : ` at ${formatPercentB(run.percentB)}% B`}
              </span>
              <span className="text-[10px] leading-tight text-muted-foreground">
                Peaks {markWord(run.peaks)} · Res {markWord(run.resolutionMark)} · Time {markWord(run.time)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LookAtRuns({
  look,
  startIndex = 0,
  note = null,
  traces = [],
  specTimeMin = null,
  onPickRun,
}: {
  look: LookStep;
  startIndex?: number;
  note?: string | null;
  traces?: AlignedRunTrace[];
  specTimeMin?: number | null;
  onPickRun?: (index: number) => void;
}) {
  const showPicker = look.mode === "picker" || look.mode === "between-then-heat";

  return (
    <div className="contents" id="look-at-runs">
      <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base">Why</h2>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          {note ? <p>{note}</p> : null}
          <p>
            {showPicker
              ? "Compare your retention runs below and pick which run to heat to 40°C in the Next run box above."
              : "Compare the peak count, worst resolution, last peak time, and back-pressure across your retention runs before choosing the next change."}
          </p>
          <KnowMoreToggle>
            <p>
              Stacked chromatograms and run comparison: Each row summarizes one completed retention run against your specifications.
              Comparing peak spacing and peak counts across the %B ladder reveals how individual analyte retention factors (k) respond to
              decreasing solvent strength.
            </p>
            {showPicker ? (
              <p>
                Pick one uploaded run in the Next run&apos;s change box above. The next change is heat, to 40°C, at that run&apos;s %B.
                Elevating column temperature introduces thermal selectivity by altering standard enthalpies of transfer (ΔH°) differently for
                each compound, helping overlapping peaks separate without increasing overall run time. Even a run that eluted later than the
                time specification can be chosen because heating accelerates elution and shortens total analysis time.
              </p>
            ) : null}
          </KnowMoreToggle>
        </div>
      </section>
      {traces.length > 0 ? (
        <div className="xl:col-span-2">
          <StackedRetentionChromatograms
            traces={traces}
            specTimeMin={specTimeMin}
            onPickRun={showPicker ? onPickRun : undefined}
          />
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10 xl:col-span-2">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-3 py-2 font-medium">Run</th>
              <th className="px-3 py-2 font-medium">%B</th>
              <th className="px-3 py-2 font-medium">Peaks</th>
              <th className="px-3 py-2 font-medium">Worst resolution</th>
              <th className="px-3 py-2 font-medium">Last peak</th>
              <th className="px-3 py-2 font-medium">Peaks</th>
              <th className="px-3 py-2 font-medium">Resolution</th>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Pressure</th>
            </tr>
          </thead>
          <tbody>
            {look.runs.map((run) => {
              const runNumber = run.displayRunNumber ?? startIndex + run.index + 1;
              return (
                <tr key={run.index} className="border-b border-border">
                  <th className="px-3 py-2 font-medium" scope="row">
                    Run {runNumber}
                  </th>
                  <td className="px-3 py-2">{run.percentB == null ? "—" : formatPercentB(run.percentB)}</td>
                  <td className="px-3 py-2">{run.peakCount ?? "—"}</td>
                  <td className="px-3 py-2">{run.resolution == null ? "—" : run.resolution.toFixed(3)}</td>
                  <td className="px-3 py-2">
                    {run.lastPeakTimeMin == null ? "—" : `${run.lastPeakTimeMin.toFixed(3)} min`}
                  </td>
                  <td className="px-3 py-2">{markWord(run.peaks)}</td>
                  <td className="px-3 py-2">{markWord(run.resolutionMark)}</td>
                  <td className="px-3 py-2">{markWord(run.time)}</td>
                  <td className="px-3 py-2">{markWord(run.pressure)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

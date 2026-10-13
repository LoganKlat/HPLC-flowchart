"use client";

import { useState, type CSSProperties } from "react";
import { ArrowUpDown, ArrowLeftRight, Activity, Gauge, Split, Scale, Info, Sliders } from "lucide-react";
import { ChromatogramChart } from "@/components/chromatogram-chart";
import { FunctionNoteView, type FunctionNote } from "@/components/function-note";
import { columnExampleTrace } from "@/lib/column-example";
import {
  columnScale,
  formatColumnMultiple,
  scaleChromatogram,
  scalePressureTrace,
  scaledPeakTimes,
} from "@/lib/column-shape";
import type { ChromatogramPoint, PressurePoint } from "@/lib/lab-file";
import { cn } from "@/lib/utils";

const LENGTH_MIN = 50;
const LENGTH_MAX = 250;
const WIDTH_MIN = 2.1;
const WIDTH_MAX = 4.6;

export const COLUMN_EXAMPLE_NAME =
  "GR09-10-3-ACN-3-ISO-40-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx";

const EXAMPLE_ID = "example";

export type ColumnRunTrace = {
  id: string;
  tabLabel: string;
  fileName: string;
  points: ChromatogramPoint[];
  peakTimesMin: number[];
  yLabel: string;
  pressurePoints: PressurePoint[];
  pressureUnit: string | null;
  baselineLengthMm: number;
  baselineWidthMm: number;
};

type NoteId = "length" | "width";

const notes: Record<NoteId, { label: string; note: FunctionNote }> = {
  length: {
    label: "Column Length (L)",
    note: {
      does: "Length is the physical tube length packed with stationary phase. A longer column increases the solute migration path through the stationary phase bed.",
      sets: "The physical column tube. The length slider controls the SVG drawing and dynamically scales the retention times, peak widths, and system pressure of the selected chromatogram.",
      range: "50–250 mm standard HPLC range. Defaults to the baseline length of the selected run (typically 150 mm).",
      changes:
        "Longer column: retention time and back-pressure increase proportionally with length (L). Chromatographic efficiency (plate count N) and resolution (Rs) improve with the square root of length (√L). Peak width expands, reducing peak height. Selectivity remains unchanged.",
    },
  },
  width: {
    label: "Internal Diameter (dc)",
    note: {
      does: "Internal diameter is the inside bore width of the column hardware tube.",
      sets: "The physical column tube hardware. The diameter slider scales the column volume, back-pressure, and volumetric flow velocity.",
      range: "2.1–4.6 mm standard bore range. Defaults to the baseline internal diameter of the selected run (typically 4.6 mm).",
      changes:
        "Wider column: at fixed flow rate, mobile phase linear velocity slows by (dc)², causing retention time to increase with the square of diameter. Back-pressure falls with 1/(dc)². Chemical selectivity and intrinsic resolution do not change from diameter alone. Narrower bore columns (e.g. 2.1 mm) save mobile phase solvent and enhance electrospray/mass-spectrometric sensitivity.",
    },
  },
};

function columnGeometry(lengthMm: number, widthMm: number) {
  const lengthT = (lengthMm - LENGTH_MIN) / (LENGTH_MAX - LENGTH_MIN);
  const widthT = (widthMm - WIDTH_MIN) / (WIDTH_MAX - WIDTH_MIN);
  const body = 132 + lengthT * 312;
  const thick = 16 + widthT * 62;
  const nutW = 16;
  const fitW = 22;
  const side = nutW + fitW;
  const gutter = 108;
  const vbW = 640 + gutter;
  const vbH = 148;
  const assembly = body + side * 2;
  const x = gutter + (vbW - gutter - assembly) / 2;
  return { body, thick, nutW, fitW, side, x, cy: 72, vbW, vbH };
}

function ColumnDrawing({ lengthMm, widthMm }: { lengthMm: number; widthMm: number }) {
  const { body, thick, nutW, fitW, side, x, cy, vbW, vbH } = columnGeometry(lengthMm, widthMm);
  const bodyX = x + side;
  const bodyY = cy - thick / 2;
  const fitH = thick + 14;
  const nutH = thick + 28;
  const leftNutX = x;
  const leftFitX = x + nutW;
  const rightFitX = bodyX + body;
  const rightNutX = rightFitX + fitW;

  return (
    <svg
      id="column-drawing"
      viewBox={`0 0 ${vbW} ${vbH}`}
      className="block h-auto w-full max-h-[160px]"
      role="img"
      aria-label="Column, drawn to the length and internal diameter"
      data-body={body.toFixed(1)}
      data-thick={thick.toFixed(1)}
      data-body-x={(x + side).toFixed(1)}
      data-left={x.toFixed(1)}
    >
      <defs>
        <linearGradient id="column-tube" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--hp-surface)" />
          <stop offset="42%" stopColor="var(--hp-soft-6)" />
          <stop offset="100%" stopColor="var(--hp-mint)" />
        </linearGradient>
        <linearGradient id="column-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--hp-grey-3)" />
          <stop offset="40%" stopColor="var(--hp-grey-2)" />
          <stop offset="100%" stopColor="var(--hp-grey-1)" />
        </linearGradient>
      </defs>
      <rect x={x} y="118" width={body + side * 2} height="8" rx="4" fill="var(--hp-soft)" />
      <rect
        x={leftNutX}
        y={cy - nutH / 2}
        width={nutW}
        height={nutH}
        rx="2"
        fill="url(#column-metal)"
        stroke="var(--hp-ink)"
        strokeWidth="1.5"
      />
      <rect
        x={leftFitX}
        y={cy - fitH / 2}
        width={fitW}
        height={fitH}
        rx="2"
        fill="url(#column-metal)"
        stroke="var(--hp-ink)"
        strokeWidth="1.5"
      />
      <rect
        x={bodyX}
        y={bodyY}
        width={body}
        height={thick}
        rx="3"
        fill="url(#column-tube)"
        stroke="var(--hp-brand)"
        strokeWidth="2"
      />
      <rect
        x={bodyX + 8}
        y={bodyY + thick * 0.22}
        width={Math.max(12, body - 16)}
        height={Math.max(3, thick * 0.16)}
        rx="2"
        fill="var(--hp-paper)"
        opacity="0.55"
      />
      <rect
        x={rightFitX}
        y={cy - fitH / 2}
        width={fitW}
        height={fitH}
        rx="2"
        fill="url(#column-metal)"
        stroke="var(--hp-ink)"
        strokeWidth="1.5"
      />
      <rect
        x={rightNutX}
        y={cy - nutH / 2}
        width={nutW}
        height={nutH}
        rx="2"
        fill="url(#column-metal)"
        stroke="var(--hp-ink)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

type SliderEvents = {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
};

function ColumnWithSliders({
  lengthMm,
  widthMm,
  onLength,
  onWidth,
  lengthEvents,
  widthEvents,
}: {
  lengthMm: number;
  widthMm: number;
  onLength: (value: number) => void;
  onWidth: (value: number) => void;
  lengthEvents: SliderEvents;
  widthEvents: SliderEvents;
}) {
  const { body, x, side, vbW } = columnGeometry(lengthMm, widthMm);
  const lengthLeft = ((x + side) / vbW) * 100;
  const lengthSpan = (body / vbW) * 100;
  const widthAnchor = (x / vbW) * 100;

  const presets = [
    { label: "150 × 4.6 mm", l: 150, w: 4.6, tag: "Standard Analytical" },
    { label: "100 × 2.1 mm", l: 100, w: 2.1, tag: "UHPLC / Core-Shell" },
    { label: "250 × 4.6 mm", l: 250, w: 4.6, tag: "High Resolution" },
    { label: "50 × 2.1 mm", l: 50, w: 2.1, tag: "Fast Screening" },
  ];

  return (
    <figure className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h3 className="font-heading text-base font-bold text-foreground">Interactive Tube Geometry</h3>
          <p className="text-xs text-muted-foreground">Adjust dimensions to stretch retention, resolution, and pressure.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground mr-1">Presets:</span>
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs font-mono font-medium transition-all cursor-pointer",
                lengthMm === preset.l && Math.abs(widthMm - preset.w) < 0.05
                  ? "border-[var(--hp-brand)] bg-[var(--hp-brand)]/15 text-[var(--hp-brand)] font-bold shadow-2xs"
                  : "border-border/70 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
              onClick={() => {
                onLength(preset.l);
                onWidth(preset.w);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative rounded-xl border border-border/60 bg-muted/20 p-2 sm:p-3 dark:bg-muted/10">
        <ColumnDrawing lengthMm={lengthMm} widthMm={widthMm} />
        {/* Width overlay slider */}
        <div
          className="absolute inset-y-1 z-10 flex -translate-x-full flex-col items-center gap-1 pr-2"
          style={{ left: `${widthAnchor}%` }}
          {...widthEvents}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">ID</p>
          <p className="rounded-md bg-card px-1.5 font-mono text-xs font-bold whitespace-nowrap text-[var(--hp-ink)] shadow-2xs ring-1 ring-foreground/10">
            {widthMm.toFixed(1)} mm
          </p>
          <input
            id="column-width"
            className="column-slider-y mt-1 h-auto! min-h-0 w-7 flex-1 cursor-ns-resize"
            type="range"
            min={WIDTH_MIN}
            max={WIDTH_MAX}
            step={0.1}
            value={widthMm}
            aria-label="Width"
            aria-valuetext={`${widthMm.toFixed(1)} mm internal diameter`}
            onChange={(event) => onWidth(Number(event.target.value))}
          />
        </div>
      </div>

      {/* Length control bar under tube */}
      <div className="relative mt-1 h-[4.75rem]" {...lengthEvents}>
        <div className="absolute top-0" style={{ left: `${lengthLeft}%`, width: `${lengthSpan}%` }}>
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Length (L)</span>
            <span className="font-mono text-xs font-bold text-foreground tabular-nums bg-muted px-1.5 py-0.5 rounded">
              {Math.round(lengthMm)} mm
            </span>
          </div>
          <input
            id="column-length"
            className="column-slider mt-1.5 w-full cursor-ew-resize"
            type="range"
            min={LENGTH_MIN}
            max={LENGTH_MAX}
            step={1}
            value={lengthMm}
            aria-label="Length"
            aria-valuetext={`${Math.round(lengthMm)} mm`}
            onChange={(event) => onLength(Number(event.target.value))}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground/75 font-mono">
            <span>50 mm</span>
            <span>150 mm</span>
            <span>250 mm</span>
          </div>
        </div>
      </div>
    </figure>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function traceFrame(points: readonly ChromatogramPoint[]) {
  let minTime = Infinity;
  let maxTime = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.timeMin < minTime) minTime = point.timeMin;
    if (point.timeMin > maxTime) maxTime = point.timeMin;
    if (point.intensity < minY) minY = point.intensity;
    if (point.intensity > maxY) maxY = point.intensity;
  }
  return { minTime, maxTime, minY, maxY };
}

const EXAMPLE_TRACE: ColumnRunTrace = {
  id: EXAMPLE_ID,
  tabLabel: "Example",
  fileName: COLUMN_EXAMPLE_NAME,
  baselineLengthMm: 150,
  baselineWidthMm: 4.6,
  ...columnExampleTrace(),
};

export function ColumnDiagram({ runs }: { runs: ColumnRunTrace[] }) {
  const [selectedId, setSelectedId] = useState(EXAMPLE_ID);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [lengthMm, setLengthMm] = useState(150);
  const [widthMm, setWidthMm] = useState(4.6);
  const [openId, setOpenId] = useState<NoteId | null>(null);
  const [pinnedId, setPinnedId] = useState<NoteId | null>(null);

  const tabs: ColumnRunTrace[] = [EXAMPLE_TRACE, ...runs];
  const selected = tabs.find((tab) => tab.id === selectedId) ?? tabs[0];
  const sliderKey = `${selected.id}|${selected.baselineLengthMm}|${selected.baselineWidthMm}`;
  const [trackedKey, setTrackedKey] = useState(sliderKey);
  if (trackedKey !== sliderKey) {
    setTrackedKey(sliderKey);
    setLengthMm(clamp(selected.baselineLengthMm, LENGTH_MIN, LENGTH_MAX));
    setWidthMm(clamp(selected.baselineWidthMm, WIDTH_MIN, WIDTH_MAX));
  }

  const scale = columnScale(lengthMm, widthMm, selected.baselineLengthMm, selected.baselineWidthMm);
  const scaled = selected.points.length > 0 ? scaleChromatogram(selected.points, selected.peakTimesMin, scale) : [];
  const scaledPressure = scalePressureTrace(selected.pressurePoints, selected.peakTimesMin, scale);
  const frame = selected.points.length > 0 ? traceFrame(selected.points) : undefined;
  const open = openId ? notes[openId] : null;

  const multipliers = [
    { label: "Resolution", value: formatColumnMultiple(scale.resolution), formula: "∝ √L", icon: Split },
    { label: "Retention Time", value: formatColumnMultiple(scale.retentionTime), formula: "∝ L · dc²", icon: ArrowLeftRight },
    { label: "Back-Pressure", value: formatColumnMultiple(scale.pressure), formula: "∝ L / dc²", icon: Gauge },
    { label: "Peak Width", value: formatColumnMultiple(scale.peakWidth), formula: "∝ √L · dc²", icon: ArrowUpDown },
  ];

  function bind(id: NoteId) {
    return {
      onMouseEnter: () => setOpenId(id),
      onMouseLeave: () => setOpenId((current) => (current === id && pinnedId !== id ? null : current)),
      onClick: () => {
        setPinnedId((current) => {
          const next = current === id ? null : id;
          setOpenId(next);
          return next;
        });
      },
    };
  }

  return (
    <section id="column-diagram" className="grid items-start gap-6 lg:grid-cols-12">
      {/* Main Column Workspace (8 Cols) */}
      <div className="flex flex-col gap-5 lg:col-span-8">
        <header>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hp-brand)]/30 bg-[var(--hp-brand)]/10 px-2.5 py-0.5 text-xs font-semibold tracking-wider text-[var(--hp-brand)] uppercase">
              <Scale className="size-3.5" />
              Physical Column Scaling
            </span>
          </div>
          <h2 className="mt-1.5 font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Column Dimensions & Scaling Dynamics
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Adjust column length and internal diameter to observe how column tube geometry physically transforms
            peak resolution, retention time, back-pressure, and peak width relative to your baseline method.
          </p>
        </header>

        {/* Tube and interactive sliders */}
        <ColumnWithSliders
          lengthMm={lengthMm}
          widthMm={widthMm}
          onLength={setLengthMm}
          onWidth={setWidthMm}
          lengthEvents={bind("length")}
          widthEvents={bind("width")}
        />

        {/* 4 Multiplier Metric Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {multipliers.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.label}
                className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-3 shadow-2xs"
              >
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[11px] font-semibold tracking-wider uppercase">{m.label}</span>
                  <Icon className="size-3.5 text-[var(--hp-brand)]" />
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="font-mono text-xl font-bold tracking-tight text-foreground tabular-nums">
                    {m.value}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground font-semibold bg-muted px-1.5 py-0.5 rounded">
                    {m.formula}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Chromatogram trace response */}
        <section
          id="column-chromatogram"
          className="flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-3 sm:px-4">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-[var(--hp-brand)]" />
              <h3 className="font-heading text-sm font-bold text-foreground">
                Scaled Chromatogram Response
              </h3>
            </div>
            {/* Run Selection Tabs */}
            <div
              id="column-run-tabs"
              className="flex shrink-0 overflow-x-auto rounded-lg border border-border/70 bg-muted/40 p-0.5"
            >
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={tab.id === selected.id}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer",
                    tab.id === selected.id
                      ? "bg-card text-foreground shadow-2xs border border-border/60"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setSelectedId(tab.id)}
                >
                  {tab.tabLabel}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 sm:p-4">
            {scaled.length > 0 && frame ? (
              <ChromatogramChart
                points={scaled}
                yLabel={selected.yLabel}
                peakTimesMin={scaledPeakTimes(selected.peakTimesMin, scale.retentionTime)}
                fileName={selected.fileName}
                frame={frame}
                multipliers={multipliers.map((m) => ({ label: m.label, value: m.value }))}
                pressure={
                  scaledPressure.length > 0
                    ? { points: scaledPressure, unit: selected.pressureUnit }
                    : null
                }
              />
            ) : (
              <div className="rounded-xl bg-muted/30 px-4 py-8 text-center text-sm" role="status">
                <p className="font-medium text-foreground">{selected.fileName}</p>
                <p className="mt-1 text-xs text-muted-foreground">This run has no chromatogram to draw.</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Inspector / Dimensional Physics Panel (4 Cols) */}
      <aside
        id="column-note"
        className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs lg:sticky lg:top-4 lg:col-span-4"
      >
        {open ? (
          <div className="flex flex-col gap-3">
            <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[var(--hp-brand)]/30 bg-[var(--hp-brand)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--hp-brand)] uppercase">
              Parameter Inspector
            </span>
            <FunctionNoteView title={open.label} note={open.note} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-border/60 pb-3">
              <Sliders className="size-4 text-[var(--hp-brand)]" />
              <h3 className="font-heading text-sm font-bold text-foreground">Dimensional Scaling Rules</h3>
            </div>

            <div className="flex flex-col gap-3 text-xs leading-relaxed text-muted-foreground">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3 dark:bg-muted/10">
                <h4 className="font-bold text-foreground flex items-center gap-1.5 mb-1">
                  <span className="size-2 rounded-full bg-[var(--hp-brand)]" />
                  Column Length (L)
                </h4>
                <p>
                  Increasing column length raises theoretical plate count <strong>(N ∝ L)</strong>, improving resolution by <strong>√L</strong>. However, runtime and back-pressure also scale directly with <strong>L</strong>.
                </p>
              </div>

              <div className="rounded-xl border border-border/60 bg-muted/20 p-3 dark:bg-muted/10">
                <h4 className="font-bold text-foreground flex items-center gap-1.5 mb-1">
                  <span className="size-2 rounded-full bg-amber-500" />
                  Internal Diameter (dc)
                </h4>
                <p>
                  At constant volumetric pump flow, linear velocity drops by <strong>(dc)²</strong>. A 2.1 mm column generates roughly <strong>4.8× higher velocity and pressure</strong> than a 4.6 mm column at identical flow rate.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--hp-brand)]/30 bg-[var(--hp-soft)]/20 p-3 dark:bg-[var(--hp-soft)]/10 text-foreground">
                <h4 className="font-bold text-[var(--hp-brand)] mb-1">Interactive Hint</h4>
                <p className="text-[11px] text-muted-foreground">
                  Hover or tap either slider to inspect its specific mechanical and chromatographic effects.
                </p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </section>
  );
}

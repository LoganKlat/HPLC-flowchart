"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { ChromatogramChart } from "@/components/chromatogram-chart";
import { FunctionNoteView, type FunctionNote } from "@/components/function-note";
import { KindMark } from "@/components/setting-legend";
import {
  columnScale,
  formatColumnMultiple,
  scaleChromatogram,
  scalePressureTrace,
  scaledPeakTimes,
} from "@/lib/column-shape";
import { readLabFile, type ChromatogramPoint, type PressurePoint } from "@/lib/lab-file";

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
    label: "Length",
    note: {
      does: "Length is how long the column tube is. A longer tube gives the compounds more packing to travel through.",
      sets: "The column. The length slider on this tab sets the drawing and the chromatogram. The oven does not change the length.",
      range: "50–250 mm on this slider. It starts at the length of the column that produced the selected run.",
      changes:
        "A longer column: retention time and back-pressure rise in line with length. Resolution and peak width rise with the square root of length. Peak height falls. Selectivity does not change. A shorter column does the opposite.",
    },
  },
  width: {
    label: "Width",
    note: {
      does: "Width is the internal diameter of the column, the width of the tube inside.",
      sets: "The column. The width slider on this tab sets the drawing and the chromatogram. The pump flow is chosen to suit that width.",
      range: "2.1–4.6 mm internal diameter on this slider. It starts at the width of the column that produced the selected run.",
      changes:
        "A wider column: retention time and peak width rise with the square of the width, and back-pressure falls with 1 over the square of the width. Resolution does not change with width. Selectivity does not change. A narrower column does the opposite.",
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
  const vbW = 640;
  const vbH = 148;
  const x = (vbW - (body + side * 2)) / 2;
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
      className="block h-auto w-full"
      role="img"
      aria-label="Column, drawn to the length and internal diameter"
      data-body={body.toFixed(1)}
      data-thick={thick.toFixed(1)}
    >
      <defs>
        <linearGradient id="column-tube" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7fffb" />
          <stop offset="42%" stopColor="#d5efe4" />
          <stop offset="100%" stopColor="#7eb9a4" />
        </linearGradient>
        <linearGradient id="column-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d5dbd7" />
          <stop offset="40%" stopColor="#8e9893" />
          <stop offset="100%" stopColor="#5c6661" />
        </linearGradient>
      </defs>
      <rect x="48" y="118" width="544" height="8" rx="4" fill="#e7f3ee" />
      <rect
        x={leftNutX}
        y={cy - nutH / 2}
        width={nutW}
        height={nutH}
        rx="2"
        fill="url(#column-metal)"
        stroke="#144237"
        strokeWidth="1.5"
      />
      <rect
        x={leftFitX}
        y={cy - fitH / 2}
        width={fitW}
        height={fitH}
        rx="2"
        fill="url(#column-metal)"
        stroke="#144237"
        strokeWidth="1.5"
      />
      <rect
        x={bodyX}
        y={bodyY}
        width={body}
        height={thick}
        rx="3"
        fill="url(#column-tube)"
        stroke="#0f6b56"
        strokeWidth="2"
      />
      <rect
        x={bodyX + 8}
        y={bodyY + thick * 0.22}
        width={Math.max(12, body - 16)}
        height={Math.max(3, thick * 0.16)}
        rx="2"
        fill="#ffffff"
        opacity="0.55"
      />
      <rect
        x={rightFitX}
        y={cy - fitH / 2}
        width={fitW}
        height={fitH}
        rx="2"
        fill="url(#column-metal)"
        stroke="#144237"
        strokeWidth="1.5"
      />
      <rect
        x={rightNutX}
        y={cy - nutH / 2}
        width={nutW}
        height={nutH}
        rx="2"
        fill="url(#column-metal)"
        stroke="#144237"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function sliderRowClass(active: boolean) {
  return active ? "rounded-lg bg-[#e7f3ee] px-3 py-2" : "rounded-lg px-3 py-2";
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

export function ColumnDiagram({ runs }: { runs: ColumnRunTrace[] }) {
  const [example, setExample] = useState<ColumnRunTrace | null>(null);
  const [exampleError, setExampleError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(EXAMPLE_ID);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [lengthMm, setLengthMm] = useState(150);
  const [widthMm, setWidthMm] = useState(4.6);
  const [openId, setOpenId] = useState<NoteId | null>(null);
  const [pinnedId, setPinnedId] = useState<NoteId | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch(`/examples/${COLUMN_EXAMPLE_NAME}`)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (cancel) return;
        const read = readLabFile(buffer);
        if (read.blockingMessage || !read.chromatogram) {
          setExampleError(read.blockingMessage ?? read.chromatogramMissingMessage ?? "The example chromatogram could not be read.");
          return;
        }
        setExample({
          id: EXAMPLE_ID,
          tabLabel: "Example",
          fileName: COLUMN_EXAMPLE_NAME,
          points: read.chromatogram,
          peakTimesMin: read.peakTimesMin,
          yLabel: read.chromatogramYAxis,
          pressurePoints: read.pressureTrace ?? [],
          pressureUnit: read.pressureUnits,
          baselineLengthMm: 150,
          baselineWidthMm: 4.6,
        });
      })
      .catch(() => {
        if (!cancel) setExampleError("The example chromatogram could not be read.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  const tabs: ColumnRunTrace[] = [
    example ?? {
      id: EXAMPLE_ID,
      tabLabel: "Example",
      fileName: COLUMN_EXAMPLE_NAME,
      points: [],
      peakTimesMin: [],
      yLabel: "mAU",
      pressurePoints: [],
      pressureUnit: null,
      baselineLengthMm: 150,
      baselineWidthMm: 4.6,
    },
    ...runs,
  ];
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
    { label: "Resolution", value: formatColumnMultiple(scale.resolution) },
    { label: "Retention time", value: formatColumnMultiple(scale.retentionTime) },
    { label: "Pressure", value: formatColumnMultiple(scale.pressure) },
    { label: "Peak width", value: formatColumnMultiple(scale.peakWidth) },
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
    <section id="column-diagram" className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <header className="min-w-0 lg:col-start-1">
        <p className="text-xs tracking-[0.16em] text-[#0f6b56] uppercase">Column</p>
        <h2 className="mt-1 font-heading text-2xl text-[#144237]">Length and width</h2>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          Drag the length and the width. The drawing changes shape, and the chromatogram is the
          selected run stretched by those two sizes. Each multiplier starts at 1 for the column that
          produced that run.
        </p>
      </header>
      <figure className="min-w-0 rounded-xl bg-card px-3 py-3 ring-1 ring-foreground/10 sm:px-4 lg:col-start-1">
        <ColumnDrawing lengthMm={lengthMm} widthMm={widthMm} />
      </figure>
      <div className="flex min-w-0 flex-col gap-4 lg:col-start-1">
        <div className="flex flex-col gap-1">
          <div className={sliderRowClass(openId === "length")} {...bind("length")}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium">Length <KindMark kind="mechanical" /></p>
              <p className="font-heading text-lg text-[#144237] tabular-nums">{Math.round(lengthMm)} mm</p>
            </div>
            <input
              id="column-length"
              className="column-slider mt-1"
              type="range"
              min={LENGTH_MIN}
              max={LENGTH_MAX}
              step={1}
              value={lengthMm}
              aria-valuetext={`${Math.round(lengthMm)} mm`}
              onChange={(event) => setLengthMm(Number(event.target.value))}
            />
          </div>
          <div className={sliderRowClass(openId === "width")} {...bind("width")}>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Width <KindMark kind="mechanical" /></p>
                <p className="text-xs text-muted-foreground">Internal diameter</p>
              </div>
              <p className="font-heading text-lg text-[#144237] tabular-nums">{widthMm.toFixed(1)} mm</p>
            </div>
            <input
              id="column-width"
              className="column-slider mt-1"
              type="range"
              min={WIDTH_MIN}
              max={WIDTH_MAX}
              step={0.1}
              value={widthMm}
              aria-valuetext={`${widthMm.toFixed(1)} mm internal diameter`}
              onChange={(event) => setWidthMm(Number(event.target.value))}
            />
          </div>
        </div>
        <section
          id="column-chromatogram"
          className="flex flex-col overflow-hidden rounded-xl border-2 border-solid border-border bg-card lg:flex-row lg:items-stretch"
        >
          <div className="order-2 min-w-0 flex-1 p-4 lg:order-1">
            {scaled.length > 0 && frame ? (
              <ChromatogramChart
                points={scaled}
                yLabel={selected.yLabel}
                peakTimesMin={scaledPeakTimes(selected.peakTimesMin, scale.retentionTime)}
                fileName={selected.fileName}
                frame={frame}
                multipliers={multipliers}
                pressure={
                  scaledPressure.length > 0
                    ? { points: scaledPressure, unit: selected.pressureUnit }
                    : null
                }
              />
            ) : (
              <div className="rounded-xl bg-[#f7fbf8] px-4 py-6 text-sm ring-1 ring-foreground/10" role="status">
                <p className="font-medium text-foreground">{selected.fileName}</p>
                <p className="mt-2 text-muted-foreground">
                  {exampleError ?? "Reading the example chromatogram."}
                </p>
              </div>
            )}
          </div>
          <div
            id="column-run-tabs"
            className="order-1 flex shrink-0 overflow-x-auto border-b border-border bg-card lg:order-2 lg:w-max lg:flex-col lg:self-stretch lg:overflow-y-auto lg:border-b-0 lg:border-l"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={tab.id === selected.id}
                className="h-10 flex-none rounded-none border-0 border-r border-solid border-border px-3 text-left text-sm last:border-r-0 lg:w-full lg:border-r-0 lg:border-b lg:px-2 lg:last:border-b-0"
                style={columnTabStyle(tab.id === selected.id, hoveredTab === tab.id)}
                onMouseEnter={() => setHoveredTab(tab.id)}
                onMouseLeave={() => setHoveredTab((current) => (current === tab.id ? null : current))}
                onClick={() => setSelectedId(tab.id)}
              >
                {tab.tabLabel}
              </button>
            ))}
          </div>
        </section>
      </div>
      <aside
        id="column-note"
        className="rounded-xl bg-card px-4 py-4 text-sm leading-relaxed text-foreground ring-1 ring-foreground/10 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-3 lg:row-start-1"
      >
        {open ? (
          <FunctionNoteView title={open.label} note={open.note} />
        ) : (
          <p className="text-muted-foreground">Hover or tap a slider.</p>
        )}
      </aside>
    </section>
  );
}

function columnTabStyle(selected: boolean, hovered: boolean): CSSProperties {
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

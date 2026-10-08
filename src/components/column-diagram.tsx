"use client";

import { useState } from "react";
import { FunctionNoteView, type FunctionNote } from "@/components/function-note";
import { KindMark } from "@/components/setting-legend";
import { columnMultiples } from "@/lib/column-shape";

const LENGTH_MIN = 50;
const LENGTH_MAX = 250;
const WIDTH_MIN = 2.1;
const WIDTH_MAX = 4.6;

type NoteId = "length" | "width" | "resolution" | "retention" | "pressure";

const notes: Record<NoteId, { label: string; note: FunctionNote }> = {
  length: {
    label: "Length",
    note: {
      does: "Length is how long the column tube is. A longer tube gives the compounds more packing to travel through.",
      sets: "The column. The length slider on this tab sets the drawing. The oven does not change the length.",
      range: "50–250 mm on this slider. It starts at 150 mm.",
      changes:
        "A longer column: retention and back-pressure rise in line with length, and resolution rises about with the square root of length. Selectivity does not change. A shorter column does the opposite.",
    },
  },
  width: {
    label: "Width",
    note: {
      does: "Width is the internal diameter of the column, the width of the tube inside.",
      sets: "The column. The width slider on this tab sets the drawing. The pump flow is chosen to suit that width.",
      range: "2.1–4.6 mm internal diameter on this slider. It starts at 4.6 mm.",
      changes:
        "A wider column: retention time rises with the square of the width, resolution drops a lot, and back-pressure falls with 1 over the square of the width. Selectivity does not change. A narrower column does the opposite, until system peaks, when the instrument itself widens the peaks. The source table also lists 1/ID to the fourth for some pressure comparisons.",
    },
  },
  resolution: {
    label: "Resolution",
    note: {
      does: "Resolution is how far apart the peaks are compared with how wide they are. This slider shows that result. It is not a setting to drag.",
      sets: "Column length and column width set it. Those are the sliders above. This result slider does not set them.",
      range:
        "Shown as a multiple of a 150 mm × 4.6 mm column, written as ×. It moves only when length or width changes. It is not a number that is typed.",
      changes:
        "Resolution here follows length and width. It rises about with the square root of length. Width changes it strongly: a narrower column raises it, and a wider column drops it a lot. Selectivity does not change when only length or width changes. Dragging this result does nothing. Efficiency is part of resolution, because narrower peaks raise it, but this slider does not set efficiency on its own.",
    },
  },
  retention: {
    label: "Retention time",
    note: {
      does: "Retention time is how long a compound stays on the column. This slider shows that result for length and width. It is not a setting to drag.",
      sets: "Column length and column width set this result. On a real run, %B, temperature, solvent, and ligand also change retention. Those are not on this slider.",
      range:
        "Shown as a multiple of a 150 mm × 4.6 mm column, written as ×. It moves only when length or width changes.",
      changes:
        "Retention time rises in line with length, and with the square of the width. That is retention (k, how long compounds stay), scaled for this drawing. Selectivity does not change from length or width alone. Efficiency, how narrow the peaks are, is a separate result. This slider does not show it.",
    },
  },
  pressure: {
    label: "Back-pressure",
    note: {
      does: "Back-pressure is how hard the pump has to push. This slider shows that result for length and width. It is not a setting to drag.",
      sets: "Column length and column width set this result. Particle size also changes back-pressure on the Beads tab. The pump feels the pressure. It is not typed as a method setting.",
      range:
        "Shown as a multiple of a 150 mm × 4.6 mm column, written as ×. A real run compares the pressure, in psi, with the max back-pressure in the specification. This slider is not that psi limit.",
      changes:
        "Back-pressure rises in line with length, and falls with 1 over the square of the width. It does not itself change retention (k), selectivity, or efficiency. It is the cost of a longer or narrower column. If the pressure is already at the specification, %B is not lowered, because a lower %B usually raises the pressure further while it raises retention.",
    },
  },
};

function extent(pick: (lengthMm: number, widthMm: number) => number) {
  let min = Infinity;
  let max = -Infinity;
  for (const lengthMm of [LENGTH_MIN, LENGTH_MAX]) {
    for (const widthMm of [WIDTH_MIN, WIDTH_MAX]) {
      const value = pick(lengthMm, widthMm);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  return { min, max };
}

const bounds = {
  resolution: extent((lengthMm, widthMm) => columnMultiples(lengthMm, widthMm).resolution),
  retentionTime: extent((lengthMm, widthMm) => columnMultiples(lengthMm, widthMm).retentionTime),
  backPressure: extent((lengthMm, widthMm) => columnMultiples(lengthMm, widthMm).backPressure),
};

function formatMultiple(value: number) {
  return `${value.toFixed(1)}×`;
}

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

export function ColumnDiagram() {
  const [lengthMm, setLengthMm] = useState(150);
  const [widthMm, setWidthMm] = useState(4.6);
  const [openId, setOpenId] = useState<NoteId | null>(null);
  const [pinnedId, setPinnedId] = useState<NoteId | null>(null);
  const multiples = columnMultiples(lengthMm, widthMm);
  const open = openId ? notes[openId] : null;

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
          Drag the length and the width. The column drawing changes shape, and resolution, retention
          time, and back-pressure move with it. The numbers are compared with a 150 mm × 4.6 mm
          column. They are not a measured run.
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
        <div className="flex flex-col gap-1">
          <p className="px-3 text-xs tracking-[0.14em] text-[#0f6b56] uppercase">
            Compared with 150 mm × 4.6 mm
          </p>
          <ResultSlider
            id="column-resolution"
            label="Resolution"
            value={multiples.resolution}
            min={bounds.resolution.min}
            max={bounds.resolution.max}
            active={openId === "resolution"}
            bind={bind("resolution")}
          />
          <ResultSlider
            id="column-retention"
            label="Retention time"
            value={multiples.retentionTime}
            min={bounds.retentionTime.min}
            max={bounds.retentionTime.max}
            active={openId === "retention"}
            bind={bind("retention")}
          />
          <ResultSlider
            id="column-back-pressure"
            label="Back-pressure"
            value={multiples.backPressure}
            min={bounds.backPressure.min}
            max={bounds.backPressure.max}
            active={openId === "pressure"}
            bind={bind("pressure")}
          />
        </div>
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

function ResultSlider({
  id,
  label,
  value,
  min,
  max,
  active,
  bind,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  active: boolean;
  bind: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onClick: () => void;
  };
}) {
  return (
    <div className={sliderRowClass(active)} {...bind}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <p className="font-heading text-lg text-[#144237] tabular-nums">{formatMultiple(value)}</p>
      </div>
      <input
        id={id}
        className="column-slider pointer-events-none mt-1"
        type="range"
        min={min}
        max={max}
        step="any"
        value={value}
        tabIndex={-1}
        aria-disabled="true"
        aria-valuetext={formatMultiple(value)}
        onChange={() => {}}
      />
    </div>
  );
}

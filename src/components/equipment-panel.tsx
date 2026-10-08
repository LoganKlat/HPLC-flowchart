"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { BeadDiagram } from "@/components/bead-diagram";
import { ColumnDiagram, type ColumnRunTrace } from "@/components/column-diagram";
import { ColumnRetentionAnimation } from "@/components/column-retention-animation";
import { FunctionNoteView, type FunctionNote } from "@/components/function-note";
import { HplcSketch } from "@/components/hplc-drawing";
import { KindMark } from "@/components/setting-legend";
import { Button } from "@/components/ui/button";
import type { SettingKind } from "@/lib/setting-kind";

type Box = { left: number; top: number; width: number; height: number };

type Part = {
  id: string;
  label: string;
  note: FunctionNote;
  box: Box;
};

type Setup = {
  id: string;
  label: string;
  src: string;
  width: number;
  height: number;
  parts: Part[];
};

const solvents: FunctionNote = {
  does: "Bottles of the liquids that carry the sample. One is usually water, sometimes with a set pH. The other is the organic solvent, such as acetonitrile or methanol. The mix of organic solvent is the %B.",
  sets: "The solvent bottles hold the liquids. The pump blends them into %B. In this class the organic solvent is ACN, MeOH, or THF.",
  range: "%B is a percent of organic solvent, from 0% to 100%. The bottles themselves have no number to type.",
  changes:
    "A higher %B lowers retention (k), so compounds come off sooner. A lower %B raises retention, quickly. Changing which organic solvent is in the bottle is a selectivity change: peaks can pull apart or change order. The bottles do not change efficiency (how narrow the peaks are) by themselves.",
};
const degasser: FunctionNote = {
  does: "Takes dissolved air out of the solvents before the pump. Bubbles would upset the flow and the detector.",
  sets: "The degasser. It sits between the solvent bottles and the pump. There is no setting to type.",
  range: "No range and no units. It runs with the instrument. This page does not ask for a degasser number.",
  changes:
    "It does not change retention (k), selectivity, or efficiency. It keeps bubbles out so the flow and the chromatogram stay steady.",
};
const pumpChanges =
  "The pump sets flow and %B. A higher %B lowers retention (k). A lower %B raises retention, quickly. Flow changes the clock time of the run and the back-pressure. It does not change k, because the unretained peak and the retained peaks speed up together. It does not change selectivity. Efficiency (how narrow the peaks are) does change with flow: far from a usual flow for that column width, peaks get wider.";
const pumpRange =
  "Flow is in mL/min. A usual range for these columns is about 0.2–2 mL/min on a 4.6 mm column, and lower on a 2.1 mm column. %B is 0–100%. This diagram does not enforce a pump maximum.";
const pumpQuaternary: FunctionNote = {
  does: "Pushes the liquid through the column and blends the solvents. That blend is the %B.",
  sets: "The pump, through its quaternary valve. The valve can blend up to four solvents. Flow rate and %B are the settings.",
  range: pumpRange,
  changes: pumpChanges,
};
const pumps12: FunctionNote = {
  does: "Two pumps. Each pushes its own solvent, and they mix after the pumps. Together they set the flow rate and the %B.",
  sets: "Pump 1 and Pump 2. Each pump has its own flow. The mix of the two flows is the %B.",
  range: pumpRange,
  changes: pumpChanges,
};
const detectorChanges =
  "Detector wavelength does not change retention (k), selectivity, or efficiency. It changes whether the peak is visible.";
const detectorRange =
  "Wavelength is in nm. The page does not enforce a detector maximum. The wavelength box on Run 1 accepts what is typed.";
const uvDetector: FunctionNote = {
  does: "Shines UV light through the liquid leaving the column. The chromatogram is how much light the sample absorbs, over time.",
  sets: "The UV detector. The setting is the wavelength.",
  range: detectorRange,
  changes: detectorChanges,
};
const uvOrPda: FunctionNote = {
  does: "A UV detector reads one wavelength. A PDA reads many wavelengths at once, so a spectrum can be kept.",
  sets: "The UV or PDA detector. The setting is the wavelength.",
  range: detectorRange,
  changes: detectorChanges,
};
const ovenAndColumn: FunctionNote = {
  does: "The column is where the peaks separate. The oven holds that column at a temperature.",
  sets: "The oven sets the temperature. The column carries the ligand, the length, the internal diameter, and the particle size. Those column parts are chosen with the column, not with the oven knob.",
  range:
    "Temperature is in °C. This class uses about 25°C, then 40°C and 60°C. The temperature box on Run 1 accepts what is typed. The page does not enforce an oven maximum. Length on the Column tab is 50–250 mm. Width there is 2.1–4.6 mm internal diameter.",
  changes:
    "Temperature changes selectivity (peaks can pull apart or change order) and usually shortens retention. The same %B is kept after a temperature change. Length, width, and particle size change retention and efficiency, as on the Column and Beads tabs. The ligand is the coating and is the last selectivity change. The oven does not change efficiency by itself.",
};
const injectionChanges =
  "Injection volume does not change retention (k) or selectivity. A small injection does not change efficiency. A very large injection can widen peaks, which lowers efficiency.";
const injectionRange =
  "Injection volume is in µL. The page does not enforce a maximum. The injection-volume box on Run 1 accepts what is typed.";
const manualInjector: FunctionNote = {
  does: "The sample is loaded by hand with a syringe into the flow.",
  sets: "The manual injector. The amount loaded is the injection volume.",
  range: injectionRange,
  changes: injectionChanges,
};
const autosampler: FunctionNote = {
  does: "Injects the sample from a vial, without a hand syringe.",
  sets: "The autosampler. The setting is the injection volume.",
  range: injectionRange,
  changes: injectionChanges,
};
const controller: FunctionNote = {
  does: "A controller can start runs and store methods on some instruments. The controller is not used in this class.",
  sets: "The controller on the instrument. This class does not set anything there.",
  range: "No range and no units in this class. Nothing is typed on the controller.",
  changes: "It does not change retention (k), selectivity, or efficiency. The controller is not used in this class.",
};

function box(x: number, y: number, w: number, h: number, imgW: number, imgH: number, pad = 2): Box {
  const left = Math.max(0, x - pad);
  const top = Math.max(0, y - pad);
  const right = Math.min(imgW, x + w + pad);
  const bottom = Math.min(imgH, y + h + pad);
  return {
    left: (left / imgW) * 100,
    top: (top / imgH) * 100,
    width: ((right - left) / imgW) * 100,
    height: ((bottom - top) / imgH) * 100,
  };
}

const setups: Setup[] = [
  {
    id: "hplc-1-2-5",
    label: "HPLC 1, 2, and 5",
    src: "/equipment/hplc-1-2-5.png",
    width: 387,
    height: 422,
    parts: [
      { id: "solvents", label: "Solvents", note: solvents, box: box(21, 20, 171, 111, 387, 422) },
      { id: "degasser", label: "Degasser", note: degasser, box: box(29, 141, 161, 47, 387, 422) },
      { id: "uv", label: "UV detector", note: uvDetector, box: box(30, 201, 162, 89, 387, 422) },
      {
        id: "pump",
        label: "Pump with quaternary valve",
        note: pumpQuaternary,
        box: box(20, 307, 169, 93, 387, 422),
      },
      {
        id: "controller",
        label: "Controller or fluorescence detector",
        note: controller,
        box: box(205, 127, 162, 92, 387, 422),
      },
      {
        id: "oven",
        label: "Oven and column",
        note: ovenAndColumn,
        box: box(205, 219, 162, 118, 387, 422),
      },
      {
        id: "injector",
        label: "Manual injector",
        note: manualInjector,
        box: box(205, 337, 162, 65, 387, 422),
      },
    ],
  },
  {
    id: "hplc-3",
    label: "HPLC 3",
    src: "/equipment/hplc-3.png",
    width: 399,
    height: 655,
    parts: [
      { id: "solvents", label: "Solvents", note: solvents, box: box(20, 20, 164, 114, 399, 655) },
      { id: "degasser", label: "Degasser", note: degasser, box: box(20, 134, 164, 49, 399, 655) },
      { id: "pump-1", label: "Pump 1", note: pumps12, box: box(23, 183, 158, 89, 399, 655) },
      { id: "pump-2", label: "Pump 2", note: pumps12, box: box(23, 277, 158, 89, 399, 655) },
      {
        id: "controller",
        label: "Controller or fluorescence detector",
        note: controller,
        box: box(221, 187, 158, 87, 399, 655),
      },
      {
        id: "detector",
        label: "UV or PDA detector",
        note: uvOrPda,
        box: box(221, 277, 158, 93, 399, 655),
      },
      {
        id: "oven",
        label: "Oven and column",
        note: ovenAndColumn,
        box: box(221, 370, 158, 269, 399, 655),
      },
      { id: "autosampler", label: "Autosampler", note: autosampler, box: box(23, 369, 163, 270, 399, 655) },
    ],
  },
  {
    id: "hplc-6",
    label: "HPLC 6",
    src: "/equipment/hplc-6.png",
    width: 400,
    height: 565,
    parts: [
      { id: "solvents", label: "Solvents", note: solvents, box: box(21, 20, 164, 116, 400, 565) },
      { id: "degasser", label: "Degasser", note: degasser, box: box(21, 137, 164, 47, 400, 565) },
      {
        id: "pump",
        label: "Pump with quaternary valve",
        note: pumpQuaternary,
        box: box(20, 184, 168, 90, 400, 565),
      },
      {
        id: "controller",
        label: "Controller or fluorescence detector",
        note: controller,
        box: box(222, 93, 158, 88, 400, 565),
      },
      {
        id: "detector",
        label: "UV or PDA detector",
        note: uvOrPda,
        box: box(222, 183, 158, 93, 400, 565),
      },
      {
        id: "oven",
        label: "Oven and column",
        note: ovenAndColumn,
        box: box(222, 276, 158, 268, 400, 565),
      },
      { id: "autosampler", label: "Autosampler", note: autosampler, box: box(24, 275, 164, 271, 400, 565) },
    ],
  },
];

function partKind(id: string): SettingKind | null {
  if (id === "solvents") return "chemical";
  if (id === "pump" || id.startsWith("pump") || id === "oven") return "both";
  if (id === "uv" || id === "detector" || id === "injector" || id === "autosampler") return "mechanical";
  return null;
}

function annotationName(part: Part): string {
  if (part.id === "controller") return "Controller";
  if (part.id === "pump") return "Pump";
  return part.label;
}

function partSide(part: Part): "left" | "right" {
  return part.box.left + part.box.width / 2 < 50 ? "left" : "right";
}

function choiceStyle(selected: boolean, hovered: boolean): CSSProperties {
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

const equipmentTabs = [
  { id: "hplc", label: "HPLC" },
  { id: "column", label: "Column" },
  { id: "beads", label: "Beads" },
] as const;

function NameColumn({
  parts,
  side,
  setLabel,
}: {
  parts: Part[];
  side: "left" | "right";
  setLabel: (id: string, node: HTMLParagraphElement | null) => void;
}) {
  return (
    <div className={"flex h-full flex-col justify-evenly " + (side === "left" ? "items-end" : "items-start")}>
      {parts.map((part) => (
        <p
          key={part.id}
          ref={(node) => setLabel(part.id, node)}
          data-hplc-label={annotationName(part)}
          className="whitespace-nowrap text-xs leading-none font-medium text-[#144237]"
        >
          {annotationName(part)}
        </p>
      ))}
    </div>
  );
}

function HplcDiagram({
  setup,
  openId,
  onEnter,
  onLeave,
  onPick,
}: {
  setup: Setup;
  openId: string | null;
  onEnter: (id: string) => void;
  onLeave: (id: string) => void;
  onPick: (id: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const labels = useRef(new Map<string, HTMLParagraphElement>());
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [callouts, setCallouts] = useState<{ id: string; points: string }[]>([]);
  const left = setup.parts.filter((part) => partSide(part) === "left");
  const right = setup.parts.filter((part) => partSide(part) === "right");

  useLayoutEffect(() => {
    const frameEl = frameRef.current;
    const imageEl = imageRef.current;
    if (!frameEl || !imageEl) return;

    const measure = () => {
      const root = frameEl.getBoundingClientRect();
      const img = imageEl.getBoundingClientRect();
      if (root.width < 2 || img.width < 2) return;
      const next: { id: string; points: string }[] = [];
      for (const part of setup.parts) {
        const node = labels.current.get(part.id);
        if (!node) continue;
        const label = node.getBoundingClientRect();
        const side = partSide(part);
        const yPart = img.top - root.top + ((part.box.top + part.box.height / 2) / 100) * img.height;
        const xPart =
          side === "left"
            ? img.left - root.left + (part.box.left / 100) * img.width
            : img.left - root.left + ((part.box.left + part.box.width) / 100) * img.width;
        const yStart = label.top - root.top + label.height / 2;
        const xStart = side === "left" ? label.right - root.left + 4 : label.left - root.left - 4;
        const xBend = side === "left" ? img.left - root.left - 1 : img.right - root.left + 1;
        const round = (value: number) => Math.round(value * 10) / 10;
        next.push({
          id: part.id,
          points: `${round(xStart)},${round(yStart)} ${round(xBend)},${round(yPart)} ${round(xPart)},${round(yPart)}`,
        });
      }
      setFrame({ w: root.width, h: root.height });
      setCallouts(next);
    };

    measure();
    const img = imageEl.querySelector("img");
    img?.addEventListener("load", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(frameEl);
    observer.observe(imageEl);
    return () => {
      observer.disconnect();
      img?.removeEventListener("load", measure);
    };
  }, [setup]);

  return (
    <figure id="hplc-diagram" className="overflow-x-auto rounded-xl bg-card p-2 ring-1 ring-foreground/10 sm:p-3">
      <div
        ref={frameRef}
        className="relative grid min-w-[20rem] grid-cols-[max-content_minmax(8rem,1fr)_max-content] items-stretch gap-x-3 sm:gap-x-5"
      >
          <NameColumn
            parts={left}
            side="left"
            setLabel={(id, node) => {
              if (node) labels.current.set(id, node);
              else labels.current.delete(id);
            }}
          />
          <div ref={imageRef} className="relative min-w-0">
            <HplcSketch id={setup.id} width={setup.width} height={setup.height} />
            {setup.parts.map((part) => {
              const active = openId === part.id;
              return (
                <button
                  key={part.id}
                  type="button"
                  aria-label={part.label}
                  aria-expanded={active}
                  className="absolute rounded-sm transition-none"
                  style={{
                    left: `${part.box.left}%`,
                    top: `${part.box.top}%`,
                    width: `${part.box.width}%`,
                    height: `${part.box.height}%`,
                    backgroundColor: active ? "rgba(207, 232, 223, 0.55)" : "transparent",
                    outline: active ? "2px solid #0f6b56" : "2px solid transparent",
                  }}
                  onMouseEnter={() => onEnter(part.id)}
                  onMouseLeave={() => onLeave(part.id)}
                  onClick={() => onPick(part.id)}
                />
              );
            })}
          </div>
          <NameColumn
            parts={right}
            side="right"
            setLabel={(id, node) => {
              if (node) labels.current.set(id, node);
              else labels.current.delete(id);
            }}
          />
        {frame.w > 0 ? (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${frame.w} ${frame.h}`}
            aria-hidden="true"
          >
            <defs>
              <marker
                id="hplc-arrow"
                markerWidth="6"
                markerHeight="6"
                refX="5.5"
                refY="3"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="#0f6b56" />
              </marker>
            </defs>
            {callouts.map((callout) => (
              <polyline
                key={callout.id}
                points={callout.points}
                fill="none"
                stroke="#0f6b56"
                strokeWidth="1.5"
                strokeLinejoin="round"
                markerEnd="url(#hplc-arrow)"
              />
            ))}
          </svg>
        ) : null}
      </div>
    </figure>
  );
}

export function EquipmentPanel({
  onOpenNav,
  columnRuns,
}: {
  onOpenNav: () => void;
  columnRuns: ColumnRunTrace[];
}) {
  const [view, setView] = useState<(typeof equipmentTabs)[number]["id"]>("hplc");
  const [hoveredView, setHoveredView] = useState<string | null>(null);
  const [setupId, setSetupId] = useState(setups[0].id);
  const [hoveredChoice, setHoveredChoice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const setup = setups.find((item) => item.id === setupId) ?? setups[0];
  const open = setup.parts.find((part) => part.id === openId) ?? null;

  return (
    <div id="equipment" className="flex flex-col gap-5">
      <div className="md:hidden">
        <Button type="button" variant="outline" className="h-10 px-3" onClick={onOpenNav}>
          Sections
        </Button>
      </div>
      <header>
        <p className="text-xs tracking-[0.16em] text-[#0f6b56] uppercase">Lab setups</p>
        <h1 className="mt-1 font-heading text-3xl text-foreground sm:text-4xl">Equipment</h1>
      </header>
      <div id="equipment-tabs" className="flex flex-wrap gap-2">
        {equipmentTabs.map((tab) => {
          const selected = tab.id === view;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={selected}
              className="h-10 rounded-md border border-solid px-4 text-sm transition-none"
              style={choiceStyle(selected, hoveredView === tab.id)}
              onMouseEnter={() => setHoveredView(tab.id)}
              onMouseLeave={() => setHoveredView((current) => (current === tab.id ? null : current))}
              onClick={() => setView(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {view === "column" ? (
        <>
          <ColumnDiagram runs={columnRuns} />
          <ColumnRetentionAnimation />
        </>
      ) : null}
      {view === "beads" ? <BeadDiagram /> : null}
      {view === "hplc" ? (
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-5">
      <header>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          Pick the HPLC in the lab.           Hover or tap a part. The note gives what it does, the part that sets it, the range
          and units, and what it changes.
        </p>
      </header>
      <div id="equipment-choices" className="flex flex-wrap gap-2">
        {setups.map((item) => {
          const selected = item.id === setup.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              className="h-10 rounded-md border border-solid px-4 text-sm transition-none"
              style={choiceStyle(selected, hoveredChoice === item.id)}
              onMouseEnter={() => setHoveredChoice(item.id)}
              onMouseLeave={() => setHoveredChoice((current) => (current === item.id ? null : current))}
              onClick={() => {
                setSetupId(item.id);
                setOpenId(null);
                setPinnedId(null);
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <HplcDiagram
        setup={setup}
        openId={open?.id ?? null}
        onEnter={(id) => setOpenId(id)}
        onLeave={(id) => setOpenId((current) => (current === id && pinnedId !== id ? null : current))}
        onPick={(id) => {
          setPinnedId((current) => {
            const next = current === id ? null : id;
            setOpenId(next);
            return next;
          });
        }}
      />
      </div>
      <aside
        id="equipment-note"
        className="rounded-xl bg-card px-4 py-4 text-sm leading-relaxed text-foreground ring-1 ring-foreground/10 lg:sticky lg:top-4"
      >
        {open ? (
          <div className="flex flex-col gap-3">
            {partKind(open.id) ? <KindMark kind={partKind(open.id) as SettingKind} /> : null}
            <FunctionNoteView title={open.label} note={open.note} />
          </div>
        ) : (
          <p className="text-muted-foreground">Hover or tap a part of the instrument.</p>
        )}
      </aside>
      </div>
      ) : null}
    </div>
  );
}
